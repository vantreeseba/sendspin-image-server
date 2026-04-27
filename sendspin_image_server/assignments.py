"""Client assignment tracking and image feed management."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import TYPE_CHECKING, Any, cast

from sendspin_image_server.dither import DitheringAlgo, DitheringPalette
from sendspin_image_server.endpoints import ImageEndpoint

if TYPE_CHECKING:
    from sendspin_image_server.db import Database
    from sendspin_image_server.registry import DevicePreset
    from sendspin_image_server.server import SendspinImageServer

# Sentinel for "no dither" detection
_NO_DITHER_SENTINEL: DitheringAlgo = "none"

logger = logging.getLogger(__name__)


class ClientAssignmentManager:
    """Manages client state, assignments, presets, dither/interval overrides, and image feed loops.

    Delegated from EndpointRegistry so registry.py stays small and focused
    on endpoint/preset CRUD while this module handles all per-client logic.
    """

    def __init__(
        self,
        server: SendspinImageServer,
        interval: float,
        dither_algo: DitheringAlgo,
        dither_palette: DitheringPalette = "e6",
        db: Database | None = None,
        _default_endpoint_id: str | None = None,
        _endpoints: dict[str, ImageEndpoint] | None = None,
        _device_presets: dict[str, DevicePreset] | None = None,
    ) -> None:
        self._server = server
        self._interval = interval
        self._dither_algo = dither_algo
        self._dither_palette = dither_palette
        self._db = db
        self._assignments: dict[str, str | None] = {}
        self._preset_assignments: dict[str, str | None] = {}
        self._client_dither: dict[str, DitheringAlgo] = {}
        self._client_palette: dict[str, DitheringPalette] = {}
        self._client_interval: dict[str, float] = {}
        self._client_last_url: dict[str, str] = {}
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._default_endpoint_id: str | None = _default_endpoint_id
        # Mutable references to registry-owned dicts (set before this is constructed)
        self._endpoints = _endpoints
        self._device_presets = _device_presets

    # ---- Client CRUD & assignment ----

    def assign(
        self,
        client_id: str,
        endpoint_id: str,
        *,
        preset_id: str | None = None,
    ) -> bool:
        """Point a client at a specific endpoint, optionally assigning a preset. Returns False if endpoint not found."""
        if self._endpoints is None or endpoint_id not in self._endpoints:
            return False
        if preset_id and (self._device_presets is None or preset_id not in self._device_presets):
            return False
        self._assignments[client_id] = endpoint_id
        if preset_id:
            self._preset_assignments[client_id] = preset_id
            # Clear per-client overrides when using a preset
            self._client_dither.pop(client_id, None)
            self._client_palette.pop(client_id, None)
            self._client_interval.pop(client_id, None)
        else:
            self._preset_assignments.pop(client_id, None)
        algo = self._client_dither.get(client_id, self._dither_algo)
        palette = self._client_palette.get(client_id, self._dither_palette)
        interval = self._client_interval.get(client_id, 0)
        if self._db is not None:
            asyncio.create_task(
                self._db.save_assignment(client_id, endpoint_id, algo, palette, interval, preset_id)
            )
        logger.info("Client %s assigned to endpoint %s", client_id, endpoint_id)
        return True

    def set_client_dither(self, client_id: str, algo: DitheringAlgo) -> None:
        """Set the dithering algorithm for a specific client and persist it."""
        self._client_dither[client_id] = algo
        endpoint_id = self._assignments.get(client_id)
        palette = self._client_palette.get(client_id, self._dither_palette)
        interval = self._client_interval.get(client_id, 0)
        preset_id = self._preset_assignments.get(client_id)
        if self._db is not None and endpoint_id:
            asyncio.create_task(
                self._db.save_assignment(client_id, endpoint_id, algo, palette, interval, preset_id)
            )
        logger.info("Client %s dither algo set to %s", client_id, algo)

    def set_client_palette(self, client_id: str, palette: DitheringPalette) -> None:
        """Set the dithering palette for a specific client and persist it."""
        self._client_palette[client_id] = palette
        endpoint_id = self._assignments.get(client_id)
        algo = self._client_dither.get(client_id, self._dither_algo)
        interval = self._client_interval.get(client_id, 0)
        preset_id = self._preset_assignments.get(client_id)
        if self._db is not None and endpoint_id:
            asyncio.create_task(
                self._db.save_assignment(client_id, endpoint_id, algo, palette, interval, preset_id)
            )
        logger.info("Client %s dither palette set to %s", client_id, palette)

    def set_client_interval(self, client_id: str, interval: float) -> None:
        """Set the slideshow interval for a specific client and persist it.

        Pass 0 to revert to the server-wide default.
        """
        self._client_interval[client_id] = interval
        endpoint_id = self._assignments.get(client_id)
        algo = self._client_dither.get(client_id, self._dither_algo)
        palette = self._client_palette.get(client_id, self._dither_palette)
        preset_id = self._preset_assignments.get(client_id)
        if self._db is not None and endpoint_id:
            asyncio.create_task(
                self._db.save_assignment(client_id, endpoint_id, algo, palette, interval, preset_id)
            )
        logger.info(
            "Client %s interval set to %ss", client_id, interval if interval > 0 else "default"
        )

    def assign_preset_to_client(self, client_id: str, preset_id: str | None) -> None:
        """Assign or unassign a device preset for a client."""
        if preset_id is not None:
            if self._device_presets is None or preset_id not in self._device_presets:
                msg = f"Preset {preset_id} not found"
                raise ValueError(msg)
        self._preset_assignments[client_id] = preset_id
        # Clear per-client overrides when using a preset (they will be re-applied if set later)
        if preset_id:
            self._client_dither.pop(client_id, None)
            self._client_palette.pop(client_id, None)
            self._client_interval.pop(client_id, None)
        if self._db is not None:
            # Always use the default endpoint when persisting preset assignments
            endpoint_id = self._default_endpoint_id or ""
            asyncio.create_task(
                self._db.save_assignment(
                    client_id,
                    endpoint_id,
                    self._dither_algo,
                    self._dither_palette,
                    0,
                    preset_id,
                )
            )
        logger.info("Client %s preset assignment updated: %s", client_id, preset_id)

    def client_dither_algo(self, client_id: str) -> DitheringAlgo:
        """Return the effective dither algorithm for a client."""
        if client_id in self._client_dither:
            return cast("DitheringAlgo", self._client_dither[client_id])
        preset_id = self._preset_assignments.get(client_id)
        if preset_id and self._device_presets is not None and preset_id in self._device_presets:
            return cast("DitheringAlgo", self._device_presets[preset_id].dither_algo)
        return self._dither_algo

    def client_dither_palette(self, client_id: str) -> DitheringPalette:
        """Return the effective dither palette for a client."""
        if client_id in self._client_palette:
            return cast("DitheringPalette", self._client_palette[client_id])
        preset_id = self._preset_assignments.get(client_id)
        if preset_id and self._device_presets is not None and preset_id in self._device_presets:
            return cast("DitheringPalette", self._device_presets[preset_id].dither_palette)
        return self._dither_palette

    def client_interval(self, client_id: str) -> float:
        """Return the effective interval for a client (0 = server default)."""
        if client_id in self._client_interval:
            return self._client_interval[client_id]
        preset_id = self._preset_assignments.get(client_id)
        if preset_id and self._device_presets is not None and preset_id in self._device_presets:
            preset_interval = self._device_presets[preset_id].interval
            if preset_interval > 0:
                return preset_interval
        return 0

    def ensure_client(self, client_id: str, name: str, url: str | None = None) -> None:
        """Persist a client's identity and last-known URL.

        Called after a successful hello handshake so that offline clients
        can later be force-reconnected using their stored URL.
        """
        # Only track URL if one was provided.
        if url is not None:
            self._client_last_url[client_id] = url
            if self._db is not None:
                asyncio.create_task(self._db.upsert_client_url(client_id, name, url))
            logger.debug("Recorded last-known URL for client %s (%s): %s", client_id, name, url)
        else:
            logger.debug("Recorded client %s (%s) without URL", client_id, name)

    def unassign(self, client_id: str) -> None:
        """Remove explicit assignment; client falls back to default."""
        self._assignments.pop(client_id, None)
        self._preset_assignments.pop(client_id, None)
        if self._db is not None:
            asyncio.create_task(self._db.delete_assignment(client_id))

    def delete_client(self, client_id: str) -> None:
        """Forget a client entirely — removes DB record and in-memory state."""
        if self._db is not None:
            asyncio.create_task(self._db.delete_client(client_id))
        self._assignments.pop(client_id, None)
        self._preset_assignments.pop(client_id, None)
        self._client_last_url.pop(client_id, None)

    def effective_endpoint_id(self, client_id: str) -> str | None:
        return self._assignments.get(client_id, self._default_endpoint_id)

    # ---- Default endpoint (delegated from EndpointRegistry) ----

    def set_default_endpoint_id(self, value: str) -> None:
        self._default_endpoint_id = value

    # ---- Serialization ----

    def client_info(self) -> list[dict[str, Any]]:
        connected: list[dict[str, Any]] = []
        offline_db: list[dict[str, Any]] = []
        discovered_only: list[dict[str, Any]] = []

        # --- Tier 1: currently-connected WebSocket clients ---
        connected_ids: set[str] = set()
        for client in self._server.clients.values():
            connected_ids.add(client.client_id)
            eid = self.effective_endpoint_id(client.client_id)
            ep = (self._endpoints or {}).get(eid) if eid else None
            channels = [
                {
                    "source": ch.source,
                    "format": ch.format,
                    "width": ch.media_width,
                    "height": ch.media_height,
                }
                for ch in client.artwork_channels
            ]
            connected.append(
                {
                    "id": client.client_id,
                    "name": client.name,
                    "status": "connected",
                    "roles": client.active_roles,
                    "stream_started": client.stream_started,
                    "artwork_channels": channels,
                    "endpoint_id": eid,
                    "endpoint_name": ep.name if ep else None,
                    "preset_id": self._preset_assignments.get(client.client_id),
                    "explicit_assignment": self._assignments.get(client.client_id) is not None,
                    "dither_algo": self.client_dither_algo(client.client_id),
                    "dither_palette": self.client_dither_palette(client.client_id),
                    "interval": self.client_interval(client.client_id),
                    "discovered_url": None,
                    "discovered_only": False,
                }
            )

        # --- Tier 2: mDNS-discovered URLs (may or may not have a known client_id) ---
        mdns_client_ids: set[str] = set()
        for entry in self._server.get_discovered_urls():
            raw_url = entry["url"]
            if raw_url is None:
                continue  # malformed entry — guard clause
            url: str = raw_url
            known_client_id: str | None = entry["client_id"]

            # Already connected — skip (tier 1 owns it).
            if known_client_id is not None and known_client_id in connected_ids:
                continue

            # Use the real client_id as a stable id when we have it; fall back
            # to the raw URL so the entry always has a unique, stable id.
            entry_id = known_client_id if known_client_id is not None else url
            if known_client_id is not None:
                mdns_client_ids.add(known_client_id)

            # A client that has ever explicitly connected (and thus has a DB
            # assignment) is "offline but known", not purely discovered.
            has_db_record = entry_id in self._assignments
            eid = self.effective_endpoint_id(entry_id) if known_client_id else None
            ep = (self._endpoints or {}).get(eid) if eid else None
            entry_dict = {
                "id": entry_id,
                "name": entry_id,
                "status": "discovered",
                "roles": [],
                "stream_started": False,
                "artwork_channels": [],
                "endpoint_id": eid,
                "endpoint_name": ep.name if ep else None,
                "preset_id": self._preset_assignments.get(entry_id),
                "explicit_assignment": self._assignments.get(entry_id) is not None,
                "dither_algo": self.client_dither_algo(entry_id),
                "dither_palette": self.client_dither_palette(entry_id),
                "interval": self.client_interval(entry_id),
                "discovered_url": url,
                "discovered_only": not has_db_record,
            }
            if has_db_record:
                offline_db.append(entry_dict)
            else:
                discovered_only.append(entry_dict)

        # --- Tier 3: DB-only clients (had an assignment, not currently connected or in mDNS) ---
        for db_client_id in self._assignments:
            if db_client_id in connected_ids or db_client_id in mdns_client_ids:
                continue  # already represented in tier 1 or 2
            eid = self.effective_endpoint_id(db_client_id)
            ep = (self._endpoints or {}).get(eid) if eid else None
            # Surface the last-known URL so the UI can offer Force Connect
            last_url: str | None = self._client_last_url.get(db_client_id)
            offline_db.append(
                {
                    "id": db_client_id,
                    "name": db_client_id,
                    "status": "disconnected",
                    "roles": [],
                    "stream_started": False,
                    "artwork_channels": [],
                    "endpoint_id": eid,
                    "endpoint_name": ep.name if ep else None,
                    "preset_id": self._preset_assignments.get(db_client_id),
                    "explicit_assignment": True,
                    "dither_algo": self.client_dither_algo(db_client_id),
                    "dither_palette": self.client_dither_palette(db_client_id),
                    "interval": self.client_interval(db_client_id),
                    "discovered_url": last_url,
                    "discovered_only": False,
                }
            )

        return connected + offline_db + discovered_only

    # ---- Lifecycle ----

    def stop_all(self) -> None:
        for eid in list(self._tasks):
            self._stop_task(eid)

    async def wait_stopped(self) -> None:
        if self._tasks:
            await asyncio.gather(*self._tasks.values(), return_exceptions=True)

    # ---- Feed loop infrastructure ----

    def _start_task(self, endpoint: ImageEndpoint) -> None:
        task = asyncio.create_task(
            self._feed_loop(endpoint),
            name=f"endpoint-{endpoint.endpoint_id}",
        )
        self._tasks[endpoint.endpoint_id] = task

    def _stop_task(self, endpoint_id: str) -> None:
        task = self._tasks.pop(endpoint_id, None)
        if task is not None:
            task.cancel()

    async def _feed_loop(self, endpoint: ImageEndpoint) -> None:
        logger.info("Feed loop started: %s (%s)", endpoint.name, endpoint.kind)
        last_push: dict[str, float] = {}
        while True:
            try:
                now = time.monotonic()
                all_clients = [
                    c
                    for c in self._server.clients.values()
                    if c.has_artwork
                    and c.stream_started
                    and self.effective_endpoint_id(c.client_id) == endpoint.endpoint_id
                ]
                # Determine which clients are due for a push.
                due_clients = [
                    c
                    for c in all_clients
                    if now - last_push.get(c.client_id, 0) >= self._effective_interval(c.client_id)
                ]
                if due_clients:
                    data = await endpoint.fetch_next()
                    if not data:
                        await asyncio.sleep(1)
                        continue
                    logger.info(
                        "Endpoint %r: fetched %d bytes, pushing to %d client(s)",
                        endpoint.name,
                        len(data),
                        len(due_clients),
                    )
                    results = await asyncio.gather(
                        *(
                            _push(
                                self._server,
                                c,
                                data,
                                self.client_dither_algo(c.client_id),
                                self.client_dither_palette(c.client_id),
                            )
                            for c in due_clients
                        ),
                        return_exceptions=True,
                    )
                    push_time = time.monotonic()
                    for c, result in zip(due_clients, results, strict=False):
                        if isinstance(result, Exception):
                            logger.warning("Failed to push to client %s: %s", c.client_id, result)
                        else:
                            last_push[c.client_id] = push_time
                elif all_clients:
                    logger.debug("Endpoint %r: no clients due yet, skipping fetch", endpoint.name)
                else:
                    logger.debug("Endpoint %r: no clients assigned, skipping fetch", endpoint.name)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception(
                    "Endpoint %r: error in feed loop, retrying in 1s",
                    endpoint.name,
                )
            await asyncio.sleep(1)

    def _effective_interval(self, client_id: str) -> float:
        """Return the interval to use for a client, falling back to server default."""
        override = self._client_interval.get(client_id, 0)
        return override if override > 0 else self._interval


# ---- Module-level helpers ----

async def _push(
    server: SendspinImageServer,
    client: Any,
    data: bytes,
    dither_algo: DitheringAlgo,
    dither_palette: DitheringPalette = "e6",
) -> None:
    from sendspin_image_server.stream import push_image_to_client

    force_dither = dither_algo != _NO_DITHER_SENTINEL and dither_palette != "none"
    sent_bytes = push_image_to_client(
        client,
        data,
        0,
        force_e6_dither=force_dither,
        dither_algo=dither_algo if force_dither else "none",
        dither_palette=dither_palette if force_dither else "e6",
    )
    # Track per-client image for debug endpoints
    if sent_bytes is not None:
        server._last_image[client.client_id] = sent_bytes
