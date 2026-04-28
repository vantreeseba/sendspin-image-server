"""CLI entry point for the Sendspin image server."""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import json
import logging
import os
import pathlib
import signal
import uuid
from typing import Any  # noqa: F401

from sendspin_image_server.db import Database
from sendspin_image_server.dither import (
    DITHER_ALGOS,
    DITHER_PALETTES,
    PALETTE_SETS,
    DitheringAlgo,
    DitheringPalette,
    dither_to_pil,
)
from sendspin_image_server.endpoints import (
    CalibrationEndpoint,
    HomeAssistantEndpoint,
    ImmichEndpoint,
    LocalFolderEndpoint,
)
from sendspin_image_server.mdns import MDNSAdvertiser, MDNSDiscovery
from sendspin_image_server.registry import DevicePreset, EndpointRegistry
from sendspin_image_server.server import SendspinImageServer
from sendspin_image_server.stream import _resize_for_channel

_VALID_DITHER_ALGOS = set(DITHER_ALGOS)
_VALID_DITHER_PALETTES = set(DITHER_PALETTES)

logger = logging.getLogger(__name__)

# Built-in local folder endpoint — always present, cannot be deleted via REST.
_BUILTIN_LOCAL_ENDPOINT_ID = "builtin-local"
_BUILTIN_LOCAL_PATH = pathlib.Path("/app/images")


async def run(
    host: str,
    port: int,
    name: str,
    server_id: str,
    http_port: int,
    interval: float,
    dither_algo: DitheringAlgo,
    dither_palette: DitheringPalette = "e6",
    data_dir: pathlib.Path | None = None,
) -> int:
    """Run the Sendspin image server and HTTP / REST endpoints."""
    from aiohttp import web

    server = SendspinImageServer(server_id=server_id, server_name=name)
    await server.start(host=host, port=port)

    mdns = MDNSAdvertiser(name=name, ws_port=port)
    await mdns.start()

    def _on_client_added(url: str, mdns_name: str | None = None) -> None:
        server.connect_to_client(url, mdns_name=mdns_name)

    def _on_client_removed(url: str) -> None:
        # Only cancel the outbound connection if the client is not locked.
        # Locked clients keep their outbound task alive so they reconnect
        # as soon as the device is reachable again.
        client_id = server._url_to_client_id.get(url)
        if client_id and registry_ref[0] and registry_ref[0].is_client_locked(client_id):
            logger.info("Locked client %s lost mDNS — keeping outbound task alive", client_id)
            return
        server.disconnect_from_client(url)

    registry_ref: list[Any] = [None]  # forward reference filled after registry is created

    discovery = MDNSDiscovery(
        on_client_added=_on_client_added,
        on_client_removed=_on_client_removed,
    )
    await discovery.start()

    # ------------------------------------------------------------------
    # Database
    # ------------------------------------------------------------------
    db: Database | None = None
    if data_dir is not None:
        db = Database(data_dir / "sendspin.db")
        await db.open()
        logger.info("Persistence enabled: %s", data_dir / "sendspin.db")
    else:
        logger.info("No DATA_DIR set — running without persistence")

    # ------------------------------------------------------------------
    # Endpoint registry
    # ------------------------------------------------------------------
    registry = EndpointRegistry(
        server=server,
        interval=interval,
        dither_algo=dither_algo,
        dither_palette=dither_palette,
        db=db,
    )

    # Built-in local folder endpoint (always first / default, never persisted)
    builtin = LocalFolderEndpoint(
        name="Local Images",
        path=_BUILTIN_LOCAL_PATH,
        endpoint_id=_BUILTIN_LOCAL_ENDPOINT_ID,
    )
    await registry.add_endpoint(builtin, make_default=True, _persist=False)

    # Restore previously saved endpoints + assignments from DB
    await registry.restore_from_db(builtin_endpoint_id=_BUILTIN_LOCAL_ENDPOINT_ID)

    # Wire the registry forward reference used by the mDNS removed callback.
    registry_ref[0] = registry

    # Auto-connect any locked clients whose last-known URL was restored.
    for _cid, _url in registry.locked_clients_with_urls():
        logger.info("Auto-connecting locked client %s → %s", _cid, _url)
        server.connect_to_client(_url)

    # Give the server a back-reference to the registry so it can persist
    # each client's last-known WebSocket URL on successful hello handshake.
    server.registry = registry

    # ------------------------------------------------------------------
    # HTTP handlers
    # ------------------------------------------------------------------

    async def handle_image_post(request: web.Request) -> web.Response:
        """POST /image — push raw image bytes to all connected clients."""
        data = await request.read()
        if not data:
            return web.Response(status=400, text="Empty body")
        channel = int(request.query.get("channel", "0"))
        # Per-client dithering is handled by the registry feed loop.
        # The manual /image push falls back to the server-wide default algo + palette.
        force_dither = dither_algo != "none" and dither_palette != "none"
        await server.broadcast_image(
            data,
            channel=channel,
            force_e6_dither=force_dither,
            dither_algo=dither_algo,
            dither_palette=dither_palette,
        )
        logger.info("Pushed image (%d bytes) to artwork clients on channel %d", len(data), channel)
        return web.Response(status=200, text="OK")

    async def handle_debug_current_image(request: web.Request) -> web.Response:
        """GET /debug/current-image — return last-broadcast image as PNG."""
        raw = server.last_image
        if raw is None:
            return web.Response(status=404, text="No image available yet")

        loop = asyncio.get_event_loop()

        width, height = 480, 800
        for client in server.clients.values():
            if client.has_artwork and client.artwork_channels:
                ch = client.artwork_channels[0]
                if ch.media_width and ch.media_height:
                    width, height = ch.media_width, ch.media_height
                    break

        resized = await loop.run_in_executor(None, _resize_for_channel, raw, width, height)

        palette_set = PALETTE_SETS.get(dither_palette)

        def _dither_verify_encode(data: bytes) -> tuple[bytes, int, int]:
            import io as _io

            pil_img = dither_to_pil(data, algo=dither_algo, palette=dither_palette)
            if palette_set is not None:
                bad = sum(1 for px in pil_img.getdata() if px not in palette_set)
            else:
                bad = 0
            png_buf = _io.BytesIO()
            pil_img.save(png_buf, format="PNG")
            return png_buf.getvalue(), bad, len(list(pil_img.getdata()))

        applying_dither = dither_algo != "none" and dither_palette != "none"
        if applying_dither:
            png_bytes, bad_count, total = await loop.run_in_executor(
                None, _dither_verify_encode, resized
            )
            if bad_count:
                logger.warning(
                    "Debug image palette check FAILED — %d/%d off-palette pixel(s)",
                    bad_count,
                    total,
                )
            else:
                logger.info("Debug image palette check passed — all %d pixels on palette", total)
        else:
            import io as _io

            from PIL import Image as _PILImage

            pil_img = _PILImage.open(_io.BytesIO(resized)).convert("RGB")
            png_buf = _io.BytesIO()
            pil_img.save(png_buf, format="PNG")
            png_bytes = png_buf.getvalue()

        out_path = pathlib.Path("/tmp/debug_current.png")
        out_path.write_bytes(png_bytes)
        logger.info(
            "Debug image saved to %s (%d bytes, %dx%d)", out_path, len(png_bytes), width, height
        )
        return web.Response(body=png_bytes, content_type="image/png")

    # ------------------------------------------------------------------
    # REST API
    # ------------------------------------------------------------------

    async def api_get_clients(request: web.Request) -> web.Response:
        """GET /api/clients."""
        return web.Response(
            content_type="application/json",
            text=json.dumps(registry.client_info()),
        )

    async def api_get_endpoints(request: web.Request) -> web.Response:
        """GET /api/endpoints."""
        data = []
        for ep in registry.list_endpoints():
            d = ep.to_dict()
            d["builtin"] = ep.endpoint_id == _BUILTIN_LOCAL_ENDPOINT_ID
            d["is_default"] = ep.endpoint_id == registry.default_endpoint_id
            data.append(d)
        return web.Response(content_type="application/json", text=json.dumps(data))

    async def api_add_endpoint(request: web.Request) -> web.Response:
        """POST /api/endpoints  body: {kind, name, ...}."""
        try:
            body = await request.json()
        except Exception:
            return web.Response(status=400, text="Invalid JSON")

        kind = body.get("kind")
        ep_name = body.get("name", "").strip()
        if not ep_name:
            return web.Response(status=400, text="'name' is required")

        if kind == "local":
            path_str = body.get("path", "").strip()
            if not path_str:
                return web.Response(status=400, text="'path' is required for kind=local")
            path = pathlib.Path(path_str)
            if not path.is_dir():
                return web.Response(status=400, text=f"Directory not found: {path_str}")
            ep = LocalFolderEndpoint(name=ep_name, path=path)
        elif kind == "immich":
            base_url = body.get("base_url", "").strip()
            album_id = body.get("album_id", "").strip()
            api_key = body.get("api_key", "").strip()
            if not (base_url and album_id and api_key):
                return web.Response(
                    status=400,
                    text="'base_url', 'album_id', 'api_key' are required for kind=immich",
                )
            ep = ImmichEndpoint(name=ep_name, base_url=base_url, album_id=album_id, api_key=api_key)
        elif kind == "homeassistant":
            base_url = body.get("base_url", "").strip()
            token = body.get("token", "").strip()
            media_content_id = body.get("media_content_id", "media-source://media_source").strip()
            if not (base_url and token):
                return web.Response(
                    status=400, text="'base_url' and 'token' are required for kind=homeassistant"
                )
            ep = HomeAssistantEndpoint(
                name=ep_name,
                base_url=base_url,
                token=token,
                media_content_id=media_content_id,
            )
        elif kind == "calibration":
            ep = CalibrationEndpoint(name=ep_name)
        else:
            return web.Response(
                status=400,
                text=f"Unknown kind: {kind!r}. Must be 'local', 'immich', 'homeassistant', or 'calibration'",
            )

        await registry.add_endpoint(ep)
        d = ep.to_dict()
        d["builtin"] = False
        d["is_default"] = ep.endpoint_id == registry.default_endpoint_id
        return web.Response(status=201, content_type="application/json", text=json.dumps(d))

    async def api_delete_endpoint(request: web.Request) -> web.Response:
        """DELETE /api/endpoints/{id}."""
        endpoint_id = request.match_info["id"]
        if endpoint_id == _BUILTIN_LOCAL_ENDPOINT_ID:
            return web.Response(status=403, text="Cannot delete built-in endpoint")
        removed = await registry.remove_endpoint(endpoint_id)
        if not removed:
            return web.Response(status=404, text=f"Endpoint {endpoint_id!r} not found")
        return web.Response(status=204)

    async def api_get_device_presets(request: web.Request) -> web.Response:
        """GET /api/device-presets."""
        data = []
        for preset in registry.list_device_presets():
            data.append(preset.to_dict())
        return web.Response(content_type="application/json", text=json.dumps(data))

    async def api_add_device_preset(request: web.Request) -> web.Response:
        """POST /api/device-presets  body: {name, dither_algo, dither_palette, interval}."""
        try:
            body = await request.json()
        except Exception:
            return web.Response(status=400, text="Invalid JSON")

        name = body.get("name", "").strip()
        if not name:
            return web.Response(status=400, text="'name' is required")

        dither_algo = body.get("dither_algo", "none").strip()
        if dither_algo not in _VALID_DITHER_ALGOS:
            return web.Response(
                status=400,
                text=f"Invalid dither_algo {dither_algo!r}. Choose from: {', '.join(sorted(_VALID_DITHER_ALGOS))}",
            )
        dither_palette = body.get("dither_palette", "e6").strip()
        if dither_palette not in _VALID_DITHER_PALETTES:
            return web.Response(
                status=400,
                text=f"Invalid dither_palette {dither_palette!r}. Choose from: {', '.join(sorted(_VALID_DITHER_PALETTES))}",
            )
        raw_interval = body.get("interval")
        if raw_interval is None:
            interval = 0
        else:
            try:
                interval = float(raw_interval)
            except (TypeError, ValueError):
                return web.Response(status=400, text="'interval' must be a number")
        if interval < 0:
            return web.Response(status=400, text="'interval' must be >= 0")

        preset = DevicePreset(
            preset_id=uuid.uuid4().hex,
            name=name,
            dither_algo=dither_algo,
            dither_palette=dither_palette,
            interval=interval,
        )
        await registry.add_device_preset(preset)
        return web.Response(
            status=201, content_type="application/json", text=json.dumps(preset.to_dict())
        )

    async def api_delete_device_preset(request: web.Request) -> web.Response:
        """DELETE /api/device-presets/{id}."""
        preset_id = request.match_info["id"]
        removed = await registry.remove_device_preset(preset_id)
        if not removed:
            return web.Response(status=404, text=f"Preset {preset_id!r} not found")
        return web.Response(status=204)

    async def api_update_device_preset(request: web.Request) -> web.Response:
        """PUT /api/device-presets/{id}  body: {name, dither_algo, dither_palette, interval}."""
        preset_id = request.match_info["id"]
        preset = registry.get_device_preset(preset_id)
        if preset is None:
            return web.Response(status=404, text=f"Preset {preset_id!r} not found")

        try:
            body = await request.json()
        except Exception:
            return web.Response(status=400, text="Invalid JSON")

        kwargs: dict[str, Any] = {}
        if "name" in body:
            name = body["name"]
            if not name or not str(name).strip():
                return web.Response(status=400, text="'name' is required")
            kwargs["name"] = str(name).strip()
        if "dither_algo" in body:
            algo = body["dither_algo"]
            if algo not in _VALID_DITHER_ALGOS:
                return web.Response(
                    status=400,
                    text=f"Invalid dither_algo {algo!r}. Choose from: {', '.join(sorted(_VALID_DITHER_ALGOS))}",
                )
            kwargs["dither_algo"] = algo
        if "dither_palette" in body:
            palette = body["dither_palette"]
            if palette not in _VALID_DITHER_PALETTES:
                return web.Response(
                    status=400,
                    text=f"Invalid dither_palette {palette!r}. Choose from: {', '.join(sorted(_VALID_DITHER_PALETTES))}",
                )
            kwargs["dither_palette"] = palette
        if "interval" in body:
            raw_interval = body["interval"]
            if raw_interval is None:
                return web.Response(status=400, text="'interval' must be >= 0")
            try:
                interval = float(raw_interval)
            except (TypeError, ValueError):
                return web.Response(status=400, text="'interval' must be a number")
            if interval < 0:
                return web.Response(status=400, text="'interval' must be >= 0")
            kwargs["interval"] = interval

        registry.update_device_preset(preset_id, **kwargs)
        return web.Response(
            status=200, content_type="application/json", text=json.dumps(preset.to_dict())
        )

    async def api_assign_client(request: web.Request) -> web.Response:
        """POST /api/clients/{id}/endpoint  body: {endpoint_id, [preset_id]}."""
        client_id = request.match_info["id"]
        try:
            body = await request.json()
        except Exception:
            return web.Response(status=400, text="Invalid JSON")
        endpoint_id = body.get("endpoint_id", "").strip()
        if not endpoint_id:
            return web.Response(status=400, text="'endpoint_id' is required")
        preset_id = body.get("preset_id")
        if preset_id is not None:
            preset_id = str(preset_id).strip()
            if preset_id == "":
                preset_id = None
        ok = registry.assign(client_id, endpoint_id, preset_id=preset_id)
        if not ok:
            return web.Response(status=404, text=f"Endpoint {endpoint_id!r} not found")
        return web.Response(status=204)

    async def api_assign_preset_to_client(request: web.Request) -> web.Response:
        """POST /api/clients/{id}/preset  body: {preset_id}."""
        client_id = request.match_info["id"]
        try:
            body = await request.json()
        except Exception:
            return web.Response(status=400, text="Invalid JSON")
        preset_id = body.get("preset_id")
        if preset_id is not None:
            preset_id = str(preset_id).strip()
            if preset_id == "":
                preset_id = None
        try:
            registry.assign_preset_to_client(client_id, preset_id)
        except ValueError as e:
            return web.Response(status=404, text=str(e))
        return web.Response(status=204)

    async def api_set_client_dither(request: web.Request) -> web.Response:
        """POST /api/clients/{id}/dither  body: {dither_algo}."""
        client_id = request.match_info["id"]
        try:
            body = await request.json()
        except Exception:
            return web.Response(status=400, text="Invalid JSON")
        algo = body.get("dither_algo", "").strip()
        if algo not in _VALID_DITHER_ALGOS:
            return web.Response(
                status=400,
                text=f"Invalid dither_algo {algo!r}. Choose from: {', '.join(sorted(_VALID_DITHER_ALGOS))}",
            )
        registry.set_client_dither(client_id, algo)  # type: ignore[arg-type]
        return web.Response(status=204)

    async def api_set_client_palette(request: web.Request) -> web.Response:
        """POST /api/clients/{id}/palette  body: {dither_palette}."""
        client_id = request.match_info["id"]
        try:
            body = await request.json()
        except Exception:
            return web.Response(status=400, text="Invalid JSON")
        palette = body.get("dither_palette", "").strip()
        if palette not in _VALID_DITHER_PALETTES:
            return web.Response(
                status=400,
                text=f"Invalid dither_palette {palette!r}. Choose from: {', '.join(sorted(_VALID_DITHER_PALETTES))}",
            )
        registry.set_client_palette(client_id, palette)  # type: ignore[arg-type]
        return web.Response(status=204)

    async def api_set_client_interval(request: web.Request) -> web.Response:
        """POST /api/clients/{id}/interval  body: {interval}."""
        client_id = request.match_info["id"]
        try:
            body = await request.json()
        except Exception:
            return web.Response(status=400, text="Invalid JSON")
        raw = body.get("interval")
        if raw is None:
            return web.Response(status=400, text="'interval' is required")
        try:
            interval = float(raw)
        except (TypeError, ValueError):
            return web.Response(status=400, text="'interval' must be a number")
        if interval < 0:
            return web.Response(status=400, text="'interval' must be >= 0 (0 = server default)")
        registry.set_client_interval(client_id, interval)
        return web.Response(status=204)

    async def api_get_client_debug_image(request: web.Request) -> web.Response:
        """GET /api/clients/{id}/debug-image — return the last image pushed to this client."""
        client_id = request.match_info["id"]
        image_bytes: bytes | None = server._last_image.get(client_id)

        if not image_bytes:
            return web.Response(
                status=404,
                text=f"No image sent to client {client_id!r} yet",
            )

        # Detect actual format from magic bytes rather than assuming PNG.
        if image_bytes[:4] == b"\x89PNG":
            ct = "image/png"
        elif image_bytes[:2] == b"\xff\xd8":
            ct = "image/jpeg"
        elif image_bytes[:2] == b"BM":
            ct = "image/bmp"
        else:
            ct = "application/octet-stream"

        return web.Response(body=image_bytes, content_type=ct)

    async def api_push_client_image(request: web.Request) -> web.Response:
        """POST /api/clients/{id}/push — immediately push next image to a connected client."""
        from sendspin_image_server.stream import push_image_to_client

        client_id = request.match_info["id"]
        client = server.clients.get(client_id)
        if client is None:
            return web.Response(status=404, text="Client not connected")

        endpoint_id = registry.effective_endpoint_id(client_id)
        endpoint = registry.get_endpoint(endpoint_id) if endpoint_id else None
        if endpoint is None:
            return web.Response(status=409, text="No endpoint assigned to this client")

        try:
            data = await endpoint.fetch_next()
        except Exception as exc:
            return web.Response(status=500, text=f"Endpoint fetch failed: {exc}")

        if not data:
            return web.Response(status=409, text="No image available from endpoint")

        client_algo = registry.client_dither_algo(client_id)
        client_palette = registry.client_dither_palette(client_id)
        force_dither = client_algo != "none" and client_palette != "none"

        try:
            sent = await push_image_to_client(
                client,
                data,
                0,
                force_e6_dither=force_dither,
                dither_algo=client_algo if force_dither else "none",
                dither_palette=client_palette if force_dither else "e6",
            )
            if sent is not None:
                server._last_image[client_id] = sent
        except Exception as exc:
            return web.Response(status=500, text=f"Push failed: {exc}")

        return web.Response(status=204)

    async def api_connect_client(request: web.Request) -> web.Response:
        """POST /api/clients/{id}/connect — force (re)connect to a discovered client."""
        client_id = request.match_info["id"]
        clients = registry.client_info()
        entry = next((c for c in clients if c["id"] == client_id), None)
        if entry is None:
            return web.Response(status=404, text="Client not found")
        discovered_url = entry.get("discovered_url")
        if not discovered_url:
            return web.Response(
                status=409, text="Client has no discovered URL (already connected or unknown)"
            )
        server.reconnect_to_client(discovered_url, connection_reason="playback")
        return web.Response(status=204)

    async def api_lock_client(request: web.Request) -> web.Response:
        """POST /api/clients/{id}/lock  body: {locked: bool}."""
        client_id = request.match_info["id"]
        try:
            body = await request.json()
        except Exception:
            return web.Response(status=400, text="Invalid JSON")
        locked = body.get("locked")
        if not isinstance(locked, bool):
            return web.Response(status=400, text="'locked' must be a boolean")
        registry.set_client_locked(client_id, locked)
        if locked:
            # If we know the URL and the client isn't already connected, auto-connect now.
            clients = registry.client_info()
            entry = next((c for c in clients if c["id"] == client_id), None)
            if entry and entry.get("status") != "connected":
                url = entry.get("discovered_url")
                if url:
                    server.reconnect_to_client(url, connection_reason="lock")
        return web.Response(status=204)

    async def api_delete_client(request: web.Request) -> web.Response:
        """DELETE /api/clients/{id} — forget a client entirely."""
        client_id = request.match_info["id"]
        clients = registry.client_info()
        entry = next((c for c in clients if c["id"] == client_id), None)
        if entry is None:
            return web.Response(status=404, text="Client not found")
        discovered_url = entry.get("discovered_url")
        if discovered_url:
            server.disconnect_from_client(discovered_url)
        registry.delete_client(client_id)
        return web.Response(status=204)

    # ------------------------------------------------------------------
    # Web UI — served from the Vite dist/ directory
    # ------------------------------------------------------------------
    _UI_DIST = pathlib.Path(__file__).parent / "ui_dist"
    _UI_INDEX = _UI_DIST / "index.html"

    async def handle_ui(request: web.Request) -> web.Response:
        """GET / — serve the React SPA index.html."""
        if not _UI_INDEX.exists():
            return web.Response(status=503, text="UI not built — ui_dist/index.html missing")
        return web.Response(
            content_type="text/html",
            text=_UI_INDEX.read_text(encoding="utf-8"),
        )

    # ------------------------------------------------------------------
    # App wiring
    # ------------------------------------------------------------------
    app = web.Application(client_max_size=20 * 1024 * 1024)
    app.router.add_get("/", handle_ui)
    # Serve Vite assets (JS/CSS chunks) from ui_dist/assets/
    if _UI_DIST.exists():
        app.router.add_static("/assets", _UI_DIST / "assets", name="ui_assets")
    app.router.add_post("/image", handle_image_post)
    app.router.add_get("/debug/current-image", handle_debug_current_image)
    app.router.add_get("/api/clients", api_get_clients)
    app.router.add_get("/api/endpoints", api_get_endpoints)
    app.router.add_post("/api/endpoints", api_add_endpoint)
    app.router.add_delete("/api/endpoints/{id}", api_delete_endpoint)
    app.router.add_get("/api/device-presets", api_get_device_presets)
    app.router.add_post("/api/device-presets", api_add_device_preset)
    app.router.add_delete("/api/device-presets/{id}", api_delete_device_preset)
    app.router.add_put("/api/device-presets/{id}", api_update_device_preset)
    app.router.add_post("/api/clients/{id}/endpoint", api_assign_client)
    app.router.add_post("/api/clients/{id}/preset", api_assign_preset_to_client)
    app.router.add_post("/api/clients/{id}/dither", api_set_client_dither)
    app.router.add_post("/api/clients/{id}/palette", api_set_client_palette)
    app.router.add_post("/api/clients/{id}/interval", api_set_client_interval)
    app.router.add_post("/api/clients/{id}/push", api_push_client_image)
    app.router.add_post("/api/clients/{id}/lock", api_lock_client)
    app.router.add_post("/api/clients/{id}/connect", api_connect_client)
    app.router.add_get("/api/clients/{id}/debug-image", api_get_client_debug_image)
    app.router.add_delete("/api/clients/{id}", api_delete_client)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, None, http_port)
    await site.start()

    logger.info("HTTP endpoint: http://%s:%d/", host, http_port)
    logger.info("Dithering algorithm: %s  palette: %s", dither_algo, dither_palette)
    logger.info("Server running. Press Ctrl+C to quit.")

    loop = asyncio.get_event_loop()
    stop_event = asyncio.Event()

    def _handle_signal() -> None:
        stop_event.set()

    with_signal = True
    try:
        loop.add_signal_handler(signal.SIGINT, _handle_signal)
        loop.add_signal_handler(signal.SIGTERM, _handle_signal)
    except NotImplementedError:
        with_signal = False

    if with_signal:
        await stop_event.wait()
    else:
        with contextlib.suppress(KeyboardInterrupt, asyncio.CancelledError):
            await asyncio.Event().wait()

    logger.info("Shutting down...")
    registry.stop_all()
    await registry.wait_stopped()
    await discovery.stop()
    await mdns.stop()
    await server.stop()
    await runner.cleanup()
    if db is not None:
        await db.close()
    return 0


def main() -> None:
    """Parse arguments and run the server."""
    parser = argparse.ArgumentParser(
        description="Sendspin image server — silent audio stream with artwork push"
    )
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("WS_PORT", "8927")),
        help="WebSocket port (env: WS_PORT)",
    )
    parser.add_argument(
        "--http-port",
        type=int,
        default=int(os.environ.get("HTTP_PORT", "8928")),
        help="HTTP / UI port (env: HTTP_PORT)",
    )
    parser.add_argument("--name", default="Sendspin Image Server")
    parser.add_argument(
        "--server-id",
        default=f"sendspin-image-{uuid.uuid4().hex[:8]}",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=120,
        metavar="SECONDS",
    )
    parser.add_argument(
        "--dither-algo",
        default="none",
        choices=list(DITHER_ALGOS),
        help="Default dithering algorithm for clients without an explicit override",
    )
    parser.add_argument(
        "--dither-palette",
        default="e6",
        choices=list(DITHER_PALETTES),
        help="Default dithering palette for clients without an explicit override (none=full color, bw=black&white, e6=6-color e-Paper)",
    )
    _data_dir_default = os.environ.get("DATA_DIR")
    parser.add_argument(
        "--data-dir",
        type=pathlib.Path,
        default=pathlib.Path(_data_dir_default) if _data_dir_default else None,
        metavar="DIR",
        help="Directory for persistent DB (env: DATA_DIR). Omit to run without persistence.",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    raise SystemExit(
        asyncio.run(
            run(
                host=args.host,
                port=args.port,
                name=args.name,
                server_id=args.server_id,
                http_port=args.http_port,
                interval=args.interval,
                dither_algo=args.dither_algo,
                dither_palette=args.dither_palette,
                data_dir=args.data_dir,
            )
        )
    )
