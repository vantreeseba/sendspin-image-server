"""Endpoint registry and per-endpoint broadcast loops."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import TYPE_CHECKING, Any, cast

from sendspin_image_server.dither import DitheringAlgo, DitheringPalette
from sendspin_image_server.endpoints import ImageEndpoint

if TYPE_CHECKING:
    from sendspin_image_server.db import Database
    from sendspin_image_server.server import SendspinImageServer

logger = logging.getLogger(__name__)

_NO_DITHER_SENTINEL: DitheringAlgo = "none"
_DEFAULT_PALETTE: DitheringPalette = "e6"


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
    """Manages endpoints, client assignments, and per-endpoint feed loops."""

    def __init__(
        self,
        server: SendspinImageServer,
        interval: float,
        dither_algo: DitheringAlgo,
        dither_palette: DitheringPalette = "e6",
        db: Database | None = None,
    ) -> None:
        self._server = server
        self._interval = interval
        self._dither_algo = dither_algo
        self._dither_palette = dither_palette
        self._db = db

        self._endpoints: dict[str, ImageEndpoint] = {}
        self._device_presets: dict[str, DevicePreset] = {}
        self._assignments: dict[str, str | None] = {}  # client_id -> endpoint_id
        self._preset_assignments: dict[str, str | None] = {}  # client_id -> preset_id
        self._client_dither: dict[str, DitheringAlgo] = {}  # per-client override
        self._client_palette: dict[str, DitheringPalette] = {}  # per-client palette override
        self._client_interval: dict[str, float] = {}  # per-client override; 0 = use server default
        self._client_last_url: dict[str, str] = {}  # client_id → last successfully connected URL
        self._default_endpoint_id: str | None = None
        self._tasks: dict[str, asyncio.Task[None]] = {}

    # ------------------------------------------------------------------
    # Startup restore
    # ------------------------------------------------------------------

    async def restore_from_db(self, builtin_endpoint_id: str) -> None:
        """Reload persisted non-builtin endpoints, client assignments, and last-known URLs from DB."""
        if self._db is None:
            return

        client_url_rows = await self._db.load_client_urls()
        for client_id, row in client_url_rows.items():
            url = row.get("last_known_url")
            if url:
                self._client_last_url[client_id] = url
                logger.debug("Restored last-known URL for client %s: %s", client_id, url)

        import pathlib

        from sendspin_image_server.endpoints import (
            HomeAssistantEndpoint,
            ImmichEndpoint,
            LocalFolderEndpoint,
        )

        rows = await self._db.load_endpoints()
        for row in rows:
            eid = row["id"]
            if eid == builtin_endpoint_id or eid in self._endpoints:
                # builtin already registered; skip duplicates
                continue
            kind = row["kind"]
            name = row["name"]
            cfg = row["config"]
            try:
                if kind == "local":
                    ep: ImageEndpoint = LocalFolderEndpoint(
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
                else:
                    logger.warning("Unknown endpoint kind %r in DB, skipping id=%s", kind, eid)
                    continue
                self.add_endpoint(ep, _persist=False)
                logger.info("Restored endpoint from DB: %s (%s) id=%s", name, kind, eid)
            except Exception:
                logger.exception("Failed to restore endpoint id=%s", eid)

        presets = await self._db.load_device_presets()
        for preset_data in presets:
            pid = preset_data["id"]
            if pid in self._device_presets:
                continue  # already loaded (shouldn't happen but be safe)
            preset = DevicePreset(
                preset_id=pid,
                name=preset_data["name"],
                dither_algo=preset_data["dither_algo"],
                dither_palette=preset_data["dither_palette"],
                interval=preset_data["interval"],
            )
            self._device_presets[pid] = preset
            logger.info("Restored device preset from DB: %s id=%s", preset.name, pid)

        assignments = await self._db.load_assignments()
        for client_id, row in assignments.items():
            endpoint_id = row["endpoint_id"]
            preset_id = row.get("preset_id")
            dither_algo = row.get("dither_algo", self._dither_algo)
            dither_palette = row.get("dither_palette", self._dither_palette)
            interval = float(row.get("interval", 0))
            if preset_id:
                # Restore preset assignment
                if preset_id in self._device_presets:
                    self._preset_assignments[client_id] = preset_id
                    logger.info(
                        "Restored preset assignment: client %s → preset %s",
                        client_id,
                        preset_id,
                    )
                else:
                    logger.warning(
                        "Skipping stale preset assignment: client %s → preset %s (preset not loaded)",
                        client_id,
                        preset_id,
                    )
            elif endpoint_id in self._endpoints:
                # Legacy assignment without preset
                self._assignments[client_id] = endpoint_id
                self._client_dither[client_id] = dither_algo  # type: ignore[assignment]
                self._client_palette[client_id] = dither_palette  # type: ignore[assignment]
                self._client_interval[client_id] = interval
                logger.info(
                    "Restored assignment: client %s → endpoint %s (dither=%s, palette=%s, interval=%ss)",
                    client_id,
                    endpoint_id,
                    dither_algo,
                    dither_palette,
                    interval if interval > 0 else "default",
                )
            else:
                logger.warning(
                    "Skipping stale assignment: client %s → endpoint %s (endpoint not loaded)",
                    client_id,
                    endpoint_id,
                )

    # ------------------------------------------------------------------
    # Endpoint CRUD
    # ------------------------------------------------------------------

    def add_endpoint(
        self,
        endpoint: ImageEndpoint,
        *,
        make_default: bool = False,
        _persist: bool = True,
    ) -> None:
        """Register an endpoint and start its feed loop."""
        self._endpoints[endpoint.endpoint_id] = endpoint
        if make_default or self._default_endpoint_id is None:
            self._default_endpoint_id = endpoint.endpoint_id
        self._start_task(endpoint)
        if _persist and self._db is not None:
            asyncio.create_task(self._save_endpoint(endpoint))
        logger.info(
            "Endpoint added: %s (%s) id=%s", endpoint.name, endpoint.kind, endpoint.endpoint_id
        )

    def remove_endpoint(self, endpoint_id: str) -> bool:
        """Remove an endpoint and cancel its loop. Returns True if found."""
        if endpoint_id not in self._endpoints:
            return False
        self._stop_task(endpoint_id)
        del self._endpoints[endpoint_id]
        for cid, eid in list(self._assignments.items()):
            if eid == endpoint_id:
                self._assignments[cid] = None
        if self._default_endpoint_id == endpoint_id:
            self._default_endpoint_id = next(iter(self._endpoints), None)
        if self._db is not None:
            asyncio.create_task(self._db.delete_endpoint(endpoint_id))
        logger.info("Endpoint removed: id=%s", endpoint_id)
        return True

    def get_endpoint(self, endpoint_id: str) -> ImageEndpoint | None:
        return self._endpoints.get(endpoint_id)

    def list_endpoints(self) -> list[ImageEndpoint]:
        return list(self._endpoints.values())

    async def _save_endpoint(self, endpoint: ImageEndpoint) -> None:
        if self._db is None:
            return
        from sendspin_image_server.endpoints import (
            HomeAssistantEndpoint,
            ImmichEndpoint,
            LocalFolderEndpoint,
        )

        if isinstance(endpoint, ImmichEndpoint):
            config: dict[str, Any] = {
                "base_url": endpoint.base_url,
                "album_id": endpoint.album_id,
                "api_key": endpoint.api_key,
            }
        elif isinstance(endpoint, LocalFolderEndpoint):
            config = {"path": str(endpoint.path)}
        elif isinstance(endpoint, HomeAssistantEndpoint):
            config = {
                "base_url": endpoint.base_url,
                "token": endpoint.token,
                "media_content_id": endpoint.media_content_id,
            }
        else:
            d = endpoint.to_dict()
            config = {k: v for k, v in d.items() if k not in {"id", "kind", "name"}}
        await self._db.save_endpoint(endpoint.endpoint_id, endpoint.kind, endpoint.name, config)

    # ------------------------------------------------------------------
    # Device Preset CRUD
    # ------------------------------------------------------------------

    def add_device_preset(self, preset: DevicePreset, *, _persist: bool = True) -> None:
        """Register a device preset."""
        self._device_presets[preset.preset_id] = preset
        if _persist and self._db is not None:
            asyncio.create_task(self._save_device_preset(preset))
        logger.info("Device preset added: %s id=%s", preset.name, preset.preset_id)

    def remove_device_preset(self, preset_id: str) -> bool:
        """Remove a device preset. Returns True if found."""
        if preset_id not in self._device_presets:
            return False
        del self._device_presets[preset_id]
        # Unassign any clients using this preset
        for cid, pid in list(self._preset_assignments.items()):
            if pid == preset_id:
                self._preset_assignments[cid] = None
        if self._db is not None:
            asyncio.create_task(self._db.delete_device_preset(preset_id))
        logger.info("Device preset removed: id=%s", preset_id)
        return True

    def get_device_preset(self, preset_id: str) -> DevicePreset | None:
        """Get a device preset by ID."""
        return self._device_presets.get(preset_id)

    def list_device_presets(self) -> list[DevicePreset]:
        """List all device presets."""
        return list(self._device_presets.values())

    def update_device_preset(
        self,
        preset_id: str,
        name: str | None = None,
        dither_algo: DitheringAlgo | None = None,
        dither_palette: DitheringPalette | None = None,
        interval: float | None = None,
    ) -> bool:
        """Update a device preset. Returns True if preset was found and updated."""
        if preset_id not in self._device_presets:
            return False
        preset = self._device_presets[preset_id]
        if name is not None:
            preset.name = name
        if dither_algo is not None:
            preset.dither_algo = dither_algo
        if dither_palette is not None:
            preset.dither_palette = dither_palette
        if interval is not None:
            preset.interval = interval
        if self._db is not None:
            asyncio.create_task(self._save_device_preset(preset))
        logger.info("Device preset updated: id=%s", preset_id)
        return True

    async def _save_device_preset(self, preset: DevicePreset) -> None:
        """Persist a device preset to the database."""
        if self._db is None:
            return
        await self._db.save_device_preset(
            preset_id=preset.preset_id,
            name=preset.name,
            dither_algo=preset.dither_algo,
            dither_palette=preset.dither_palette,
            interval=preset.interval,
        )

    # ------------------------------------------------------------------
    # Client assignment
    # ------------------------------------------------------------------

    def assign(self, client_id: str, endpoint_id: str, *, preset_id: str | None = None) -> bool:
        """Point a client at a specific endpoint, optionally assigning a preset. Returns False if endpoint not found."""
        if endpoint_id not in self._endpoints:
            return False
        if preset_id and preset_id not in self._device_presets:
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
        if preset_id is not None and preset_id not in self._device_presets:
            msg = f"Preset {preset_id} not found"
            raise ValueError(msg)
        self._preset_assignments[client_id] = preset_id
        # Clear per-client overrides when using a preset (they will be re-applied if set later)
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
        # Per-client override takes precedence
        if client_id in self._client_dither:
            return cast("DitheringAlgo", self._client_dither[client_id])
        # Check preset assignment
        preset_id = self._preset_assignments.get(client_id)
        if preset_id and preset_id in self._device_presets:
            return cast("DitheringAlgo", self._device_presets[preset_id].dither_algo)
        # Fall back to server default
        return self._dither_algo

    def client_dither_palette(self, client_id: str) -> DitheringPalette:
        """Return the effective dither palette for a client."""
        # Per-client override takes precedence
        if client_id in self._client_palette:
            return cast("DitheringPalette", self._client_palette[client_id])
        # Check preset assignment
        preset_id = self._preset_assignments.get(client_id)
        if preset_id and preset_id in self._device_presets:
            return cast("DitheringPalette", self._device_presets[preset_id].dither_palette)
        # Fall back to server default
        return self._dither_palette

    def client_interval(self, client_id: str) -> float:
        """Return the effective interval for a client (0 = server default)."""
        # Per-client override takes precedence
        if client_id in self._client_interval:
            return self._client_interval[client_id]
        # Check preset assignment
        preset_id = self._preset_assignments.get(client_id)
        if preset_id and preset_id in self._device_presets:
            preset_interval = self._device_presets[preset_id].interval
            if preset_interval > 0:
                return preset_interval
        # Fall back to server default
        return 0

    def ensure_client(self, client_id: str, name: str, url: str | None = None) -> None:
        """Persist a client's identity and last-known URL.

        Called after a successful hello handshake so that offline clients
        can later be force-reconnected using their stored URL.
        """
        if url is None:
            return
        self._client_last_url[client_id] = url
        if self._db is not None:
            asyncio.create_task(self._db.upsert_client_url(client_id, name, url))
        logger.debug("Recorded last-known URL for client %s (%s): %s", client_id, name, url)

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

    @property
    def default_endpoint_id(self) -> str | None:
        return self._default_endpoint_id

    @default_endpoint_id.setter
    def default_endpoint_id(self, value: str) -> None:
        if value not in self._endpoints:
            msg = f"Unknown endpoint: {value!r}"
            raise ValueError(msg)
        self._default_endpoint_id = value

    # ------------------------------------------------------------------
    # Serialisation
    # ------------------------------------------------------------------

    def client_info(self) -> list[dict[str, Any]]:
        connected: list[dict[str, Any]] = []
        offline_db: list[dict[str, Any]] = []
        discovered_only: list[dict[str, Any]] = []

        # --- Tier 1: currently-connected WebSocket clients ---
        connected_ids: set[str] = set()
        for client in self._server.clients.values():
            connected_ids.add(client.client_id)
            eid = self.effective_endpoint_id(client.client_id)
            ep = self._endpoints.get(eid) if eid else None
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
        # Build a set of client_ids that are visible via mDNS so we can avoid
        # showing the same client twice in the DB-offline tier below.
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
            ep = self._endpoints.get(eid) if eid else None
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
            ep = self._endpoints.get(eid) if eid else None
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

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def stop_all(self) -> None:
        for eid in list(self._tasks):
            self._stop_task(eid)

    async def wait_stopped(self) -> None:
        if self._tasks:
            await asyncio.gather(*self._tasks.values(), return_exceptions=True)

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

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
        # Track when each client last received an image (monotonic seconds).
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
