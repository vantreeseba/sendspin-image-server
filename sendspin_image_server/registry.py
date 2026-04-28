"""Device preset and endpoint registry — thin orchestrator over ClientAssignmentManager."""

from __future__ import annotations

import asyncio
import logging
import pathlib
from typing import TYPE_CHECKING, Any

from sendspin_image_server.assignments import ClientAssignmentManager
from sendspin_image_server.dither import DitheringAlgo, DitheringPalette
from sendspin_image_server.endpoints import (
    CalibrationEndpoint,
    HomeAssistantEndpoint,
    ImmichEndpoint,
    ImageEndpoint,
    LocalFolderEndpoint,
)

if TYPE_CHECKING:
    from sendspin_image_server.db import Database
    from sendspin_image_server.server import SendspinImageServer

logger = logging.getLogger(__name__)


class DevicePreset:
    """A reusable configuration preset for device settings."""

    def __init__(
        self,
        preset_id: str,
        name: str,
        dither_algo: DitheringAlgo = "none",
        dither_palette: DitheringPalette = "e6",
        interval: float = 0,
    ) -> None:
        self.preset_id = preset_id
        self.name = name
        self.dither_algo = dither_algo
        self.dither_palette = dither_palette
        self.interval = interval

    def __repr__(self) -> str:
        return f"DevicePreset(id={self.preset_id!r}, name={self.name!r}, algo={self.dither_algo!r}, palette={self.dither_palette!r}, interval={self.interval}s)"

    def to_dict(self) -> dict[str, Any]:
        """Serialise to a JSON-safe dict for the REST API."""
        return {
            "id": self.preset_id,
            "name": self.name,
            "dither_algo": self.dither_algo,
            "dither_palette": self.dither_palette,
            "interval": self.interval,
        }


class EndpointRegistry:
    """Thin orchestrator: endpoint/preset CRUD via _assignments (ClientAssignmentManager)."""

    def __init__(
        self,
        server: "SendspinImageServer",
        interval: float,
        dither_algo: DitheringAlgo,
        dither_palette: DitheringPalette = "e6",
        db: "Database | None" = None,
    ) -> None:
        self._server = server
        self._endpoints: dict[str, ImageEndpoint] = {}
        self._device_presets: dict[str, DevicePreset] = {}
        self._default_endpoint_id: str | None = None
        self._registry: Any = None  # server back-reference
        self._assignments = ClientAssignmentManager(
            server=server,
            interval=interval,
            dither_algo=dither_algo,
            dither_palette=dither_palette,
            db=db,
            _default_endpoint_id=None,
            _endpoints=self._endpoints,
            _device_presets=self._device_presets,
        )

    # -- properties --

    @property
    def default_endpoint_id(self) -> str | None:
        return self._default_endpoint_id

    @default_endpoint_id.setter
    def default_endpoint_id(self, value: str) -> None:
        if value not in self._endpoints:
            raise ValueError(f"Unknown endpoint: {value!r}")
        self._default_endpoint_id = value
        self._assignments.set_default_endpoint_id(value)

    @property
    def registry(self) -> Any:
        return self._registry

    @registry.setter
    def registry(self, value: Any) -> None:
        self._registry = value

    # -- endpoint CRUD --

    async def add_endpoint(
        self,
        endpoint: ImageEndpoint,
        *,
        make_default: bool = False,
        _persist: bool = True,
    ) -> None:
        if endpoint.endpoint_id in self._endpoints:
            raise ValueError(f"Endpoint {endpoint.endpoint_id!r} already registered")
        self._endpoints[endpoint.endpoint_id] = endpoint
        if make_default or self._default_endpoint_id is None:
            if endpoint.endpoint_id not in ("builtin-local", "builtin-remote"):
                self._default_endpoint_id = endpoint.endpoint_id
        self._assignments.set_default_endpoint_id(self._default_endpoint_id)
        if _persist and self._assignments._db is not None:
            asyncio.create_task(
                self._assignments._db.save_endpoint(
                    endpoint.endpoint_id,
                    endpoint.kind,
                    endpoint.name,
                    endpoint_to_config(endpoint),
                )
            )
        self._assignments._start_task(endpoint)

    async def remove_endpoint(self, endpoint_id: str) -> bool:
        if endpoint_id not in self._endpoints:
            return False
        self._assignments._stop_task(endpoint_id)
        del self._endpoints[endpoint_id]
        if self._default_endpoint_id == endpoint_id:
            self._default_endpoint_id = next(
                (k for k, e in self._endpoints.items()), None
            )
            self._assignments.set_default_endpoint_id(self._default_endpoint_id)
        if self._assignments._db is not None:
            asyncio.create_task(self._assignments._db.delete_endpoint(endpoint_id))
        return True

    def get_endpoint(self, endpoint_id: str) -> ImageEndpoint | None:
        return self._endpoints.get(endpoint_id)

    def list_endpoints(self) -> list[ImageEndpoint]:
        return list(self._endpoints.values())

    # -- preset CRUD --

    async def add_device_preset(self, preset: DevicePreset, *, _persist: bool = True) -> None:
        self._device_presets[preset.preset_id] = preset
        if _persist and self._assignments._db is not None:
            asyncio.create_task(
                self._assignments._db.save_device_preset(
                    preset.preset_id, preset.name, preset.dither_algo, preset.dither_palette, preset.interval,
                )
            )
        logger.info("Device preset added: %s id=%s", preset.name, preset.preset_id)

    async def remove_device_preset(self, preset_id: str) -> bool:
        found = self._device_presets.pop(preset_id, None) is not None
        if found and self._assignments._db is not None:
            asyncio.create_task(self._assignments._db.delete_device_preset(preset_id))
        return found

    def get_device_preset(self, preset_id: str) -> DevicePreset | None:
        return self._device_presets.get(preset_id)

    def list_device_presets(self) -> list[DevicePreset]:
        return list(self._device_presets.values())

    def update_device_preset(
        self,
        preset_id: str,
        name: str | None = None,
        dither_algo: DitheringAlgo | None = None,
        dither_palette: DitheringPalette | None = None,
        interval: float | None = None,
    ) -> bool:
        preset = self._device_presets.get(preset_id)
        if not preset:
            return False
        changed = False
        if name is not None and name != preset.name:
            preset.name = str(name).strip()
            changed = True
        if dither_algo is not None and dither_algo != preset.dither_algo:
            preset.dither_algo = dither_algo
            changed = True
        if dither_palette is not None and dither_palette != preset.dither_palette:
            preset.dither_palette = dither_palette
            changed = True
        if interval is not None and interval != preset.interval:
            if isinstance(interval, str):
                try:
                    interval = float(interval)
                except (TypeError, ValueError):
                    pass
                else:
                    if interval < 0:
                        raise ValueError("interval must be >= 0")
            if interval != preset.interval:
                preset.interval = float(interval)
                changed = True
        if changed and self._assignments._db is not None:
            asyncio.create_task(
                self._assignments._db.save_device_preset(
                    preset.preset_id, preset.name, preset.dither_algo, preset.dither_palette, preset.interval,
                )
            )
        return changed

    # -- client state delegation --

    def assign(self, client_id: str, endpoint_id: str, *, preset_id: str | None = None) -> bool:
        if endpoint_id not in self._endpoints:
            return False
        if preset_id and preset_id not in self._device_presets:
            return False
        self._assignments.assign(client_id, endpoint_id, preset_id=preset_id)
        return True

    def set_client_dither(self, client_id: str, algo: DitheringAlgo) -> None:
        self._assignments.set_client_dither(client_id, algo)

    def set_client_palette(self, client_id: str, palette: DitheringPalette) -> None:
        self._assignments.set_client_palette(client_id, palette)

    def set_client_interval(self, client_id: str, interval: float) -> None:
        self._assignments.set_client_interval(client_id, interval)

    def assign_preset_to_client(self, client_id: str, preset_id: str | None) -> None:
        if preset_id is not None and self._device_presets.get(preset_id) is None:
            raise ValueError(f"Preset {preset_id} not found")
        self._assignments.assign_preset_to_client(client_id, preset_id)

    def client_dither_algo(self, client_id: str) -> DitheringAlgo:
        return self._assignments.client_dither_algo(client_id)

    def client_dither_palette(self, client_id: str) -> DitheringPalette:
        return self._assignments.client_dither_palette(client_id)

    def client_interval(self, client_id: str) -> float:
        return self._assignments.client_interval(client_id)

    def unassign(self, client_id: str) -> None:
        self._assignments.unassign(client_id)

    def delete_client(self, client_id: str) -> None:
        self._assignments.delete_client(client_id)

    def ensure_client(self, client_id: str, name: str, url: str | None = None) -> None:
        self._assignments.ensure_client(client_id, name, url)

    # -- effective values --

    def effective_endpoint_id(self, client_id: str) -> str | None:
        return self._assignments.effective_endpoint_id(client_id)

    # -- lifecycle --

    def stop_all(self) -> None:
        self._assignments.stop_all()

    async def wait_stopped(self) -> None:
        await self._assignments.wait_stopped()

    # -- restore --

    async def restore_from_db(self, builtin_endpoint_id: str) -> None:
        if self._assignments._db is None:
            return
        db = self._assignments._db

        # Restore client last-known URLs
        client_urls = await db.load_client_urls()
        for cid, data in client_urls.items():
            url = data.get("last_known_url")
            if url:
                self._assignments._client_last_url[cid] = url

        # Restore endpoints (same logic as old registry.py)
        rows = await db.load_endpoints()
        for row in rows:
            eid = row["id"]
            if eid == builtin_endpoint_id or eid in self._endpoints:
                continue
            kind = row["kind"]
            name = row["name"]
            cfg = row.get("config", {})
            ep: ImageEndpoint | None
            if kind == "local":
                ep = LocalFolderEndpoint(
                    name=name,
                    path=pathlib.Path(cfg["path"]),
                    endpoint_id=eid,
                )
            elif kind == "immich":
                ep = ImmichEndpoint(
                    name=name,
                    base_url=cfg["base_url"],
                    album_id=cfg["album_id"],
                    api_key=cfg["api_key"],
                    endpoint_id=eid,
                )
            elif kind == "homeassistant":
                ep = HomeAssistantEndpoint(
                    name=name,
                    base_url=cfg["base_url"],
                    token=cfg["token"],
                    media_content_id=cfg.get("media_content_id", "media-source://media_source"),
                    endpoint_id=eid,
                )
            elif kind == "calibration":
                ep = CalibrationEndpoint(name=name, endpoint_id=eid)
            else:
                logger.warning("Unknown endpoint kind %r in DB, skipping id=%s", kind, eid)
                continue
            if ep is not None:
                self._endpoints[ep.endpoint_id] = ep
                self._assignments._start_task(ep)
                if self._default_endpoint_id is None:
                    self._default_endpoint_id = ep.endpoint_id
                    self._assignments.set_default_endpoint_id(self._default_endpoint_id)
                logger.info("Restored endpoint from DB: %s (%s) id=%s", name, kind, eid)
            else:
                logger.warning("Failed to restore endpoint id=%s", eid)

        # Restore presets
        presets = await db.load_device_presets()
        for preset_data in presets:
            pid = preset_data["id"]
            if pid in self._device_presets:
                continue
            preset = DevicePreset(
                preset_id=pid,
                name=preset_data["name"],
                dither_algo=preset_data["dither_algo"],
                dither_palette=preset_data["dither_palette"],
                interval=preset_data["interval"],
            )
            self._device_presets[pid] = preset
            self._assignments._device_presets[pid] = preset
            logger.info("Restored device preset from DB: %s id=%s", preset.name, pid)

        # Restore assignments
        assignments = await db.load_assignments()
        for client_id, row in assignments.items():
            endpoint_id = row["endpoint_id"]
            preset_id = row.get("preset_id")
            dither_algo = row.get("dither_algo", "none")
            dither_palette = row.get("dither_palette", "e6")
            interval = float(row.get("interval", 0))
            if preset_id and preset_id in self._device_presets:
                self._assignments._preset_assignments[client_id] = preset_id
                logger.info("Restored preset assignment: client %s → preset %s", client_id, preset_id)
            elif endpoint_id in self._endpoints:
                self._assignments._assignments[client_id] = endpoint_id
                self._assignments._client_dither[client_id] = dither_algo  # type: ignore[assignment]
                self._assignments._client_palette[client_id] = dither_palette  # type: ignore[assignment]
                self._assignments._client_interval[client_id] = interval
                logger.info(
                    "Restored assignment: client %s → endpoint %s (dither=%s, palette=%s, interval=%ss)",
                    client_id, endpoint_id, dither_algo, dither_palette,
                    interval if interval > 0 else "default",
                )
            else:
                logger.warning(
                    "Skipping stale assignment: client %s → endpoint %s (endpoint not loaded)",
                    client_id, endpoint_id,
                )

    # -- client info --

    def client_info(self) -> list[dict[str, Any]]:
        """Return a list of client info dicts for the REST API."""
        return self._assignments.client_info()


def endpoint_to_config(ep: ImageEndpoint) -> dict[str, Any]:
    """Convert an endpoint to a DB-serialisable config dict."""
    if ep.kind == "local" and hasattr(ep, "path"):
        return {"path": str(ep.path)}
    if ep.kind == "immich" and hasattr(ep, "base_url"):
        return {"base_url": ep.base_url, "album_id": ep.album_id, "api_key": ep.api_key}
    if ep.kind == "homeassistant" and hasattr(ep, "base_url"):
        return {
            "base_url": ep.base_url,
            "token": ep.token,
            "media_content_id": ep.media_content_id,
        }
    if ep.kind == "calibration":
        return {}
    d = ep.to_dict()
    return {k: v for k, v in d.items() if k not in ("id", "kind", "name")}
