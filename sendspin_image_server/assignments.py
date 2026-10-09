"""Client assignment tracking and image feed management."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from typing import TYPE_CHECKING, Any

from sendspin_image_server.dither import DitheringAlgo, DitheringPalette
from sendspin_image_server.endpoints import ImageEndpoint
from sendspin_image_server.tasks import spawn

if TYPE_CHECKING:
    from sendspin_image_server.db import Database
    from sendspin_image_server.registry import DevicePreset
    from sendspin_image_server.server import SendspinImageServer

# Sentinel for "no dither" detection
_NO_DITHER_SENTINEL: DitheringAlgo = "none"

logger = logging.getLogger(__name__)

# How late a sleeping client may be, on top of twice its last cycle, before it counts as offline.
_SLEEP_GRACE = 60.0


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
        self._client_locked: dict[str, bool] = {}
        self._tasks: dict[str, asyncio.Task[None]] = {}
        # endpoint_id → event that makes its feed loop look at the clients right away
        self._feed_wake: dict[str, asyncio.Event] = {}
        # client_id → name from its last hello, so an offline client keeps its name
        self._client_names: dict[str, str] = {}
        # client_id → wall-clock time it last disconnected (not kept across restarts)
        self._last_seen: dict[str, float] = {}
        # client_id → how long it was last away before coming back, in seconds
        self._wake_interval: dict[str, float] = {}
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
        """Point a client at an endpoint, optionally assigning a preset.

        Returns False if the endpoint is not found.
        """
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
            spawn(
                self._db.save_assignment(
                    client_id, endpoint_id, algo, palette, interval, preset_id
                ),
                f"save_assignment({client_id})",
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
            spawn(
                self._db.save_assignment(
                    client_id, endpoint_id, algo, palette, interval, preset_id
                ),
                f"save_assignment({client_id})",
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
            spawn(
                self._db.save_assignment(
                    client_id, endpoint_id, algo, palette, interval, preset_id
                ),
                f"save_assignment({client_id})",
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
            spawn(
                self._db.save_assignment(
                    client_id, endpoint_id, algo, palette, interval, preset_id
                ),
                f"save_assignment({client_id})",
            )
        logger.info(
            "Client %s interval set to %ss", client_id, interval if interval > 0 else "default"
        )

    def assign_preset_to_client(self, client_id: str, preset_id: str | None) -> None:
        """Assign or unassign a device preset for a client."""
        if preset_id is not None and (
            self._device_presets is None or preset_id not in self._device_presets
        ):
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
            spawn(
                self._db.save_assignment(
                    client_id,
                    endpoint_id,
                    self._dither_algo,
                    self._dither_palette,
                    0,
                    preset_id,
                ),
                f"save_assignment({client_id})",
            )
        logger.info("Client %s preset assignment updated: %s", client_id, preset_id)

    def client_dither_algo(self, client_id: str) -> DitheringAlgo:
        """Return the effective dither algorithm for a client."""
        if client_id in self._client_dither:
            return self._client_dither[client_id]
        preset_id = self._preset_assignments.get(client_id)
        if preset_id and self._device_presets is not None and preset_id in self._device_presets:
            return self._device_presets[preset_id].dither_algo
        return self._dither_algo

    def client_dither_palette(self, client_id: str) -> DitheringPalette:
        """Return the effective dither palette for a client."""
        if client_id in self._client_palette:
            return self._client_palette[client_id]
        preset_id = self._preset_assignments.get(client_id)
        if preset_id and self._device_presets is not None and preset_id in self._device_presets:
            return self._device_presets[preset_id].dither_palette
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
        self._client_names[client_id] = name
        # Only track URL if one was provided.
        if url is not None:
            self._client_last_url[client_id] = url
            if self._db is not None:
                spawn(
                    self._db.upsert_client_url(client_id, name, url),
                    f"upsert_client_url({client_id})",
                )
            logger.debug("Recorded last-known URL for client %s (%s): %s", client_id, name, url)
        else:
            logger.debug("Recorded client %s (%s) without URL", client_id, name)

    def client_connected(self, client_id: str) -> None:
        """Note that a client finished its handshake and let the feed loops serve it now."""
        last_seen = self._last_seen.get(client_id)
        if last_seen is not None:
            self._wake_interval[client_id] = time.time() - last_seen
        for wake in self._feed_wake.values():
            wake.set()

    def client_disconnected(self, client_id: str) -> None:
        """Note when a client's last connection closed."""
        self._last_seen[client_id] = time.time()

    def _presence(self, client_id: str, *, connected: bool) -> dict[str, Any]:
        """Describe when a client was last seen and whether it looks asleep rather than gone.

        A client that has gone away and come back before is taken to be a
        battery device on a sleep cycle, for as long as it is not much later
        than its last cycle.
        """
        last_seen = self._last_seen.get(client_id)
        wake_interval = self._wake_interval.get(client_id)
        sleeping = (
            not connected
            and last_seen is not None
            and wake_interval is not None
            and time.time() - last_seen <= wake_interval * 2 + _SLEEP_GRACE
        )
        return {
            "last_seen": None if connected else last_seen,
            "wake_interval": wake_interval,
            "sleeping": sleeping,
        }

    def unassign(self, client_id: str) -> None:
        """Remove explicit assignment; client falls back to default."""
        self._assignments.pop(client_id, None)
        self._preset_assignments.pop(client_id, None)
        if self._db is not None:
            spawn(self._db.delete_assignment(client_id), f"delete_assignment({client_id})")

    def set_client_locked(self, client_id: str, *, locked: bool) -> None:
        """Lock or unlock a client. Locked clients are auto-reconnected on discovery."""
        self._client_locked[client_id] = locked
        if self._db is not None:
            spawn(
                self._db.set_client_locked(client_id, locked=locked),
                f"set_client_locked({client_id})",
            )
        logger.info("Client %s locked=%s", client_id, locked)

    def is_client_locked(self, client_id: str) -> bool:
        return self._client_locked.get(client_id, False)

    def locked_clients_with_urls(self) -> list[tuple[str, str]]:
        """Return [(client_id, url)] for all locked clients that have a known URL."""
        return [
            (cid, url)
            for cid, url in self._client_last_url.items()
            if self._client_locked.get(cid, False)
        ]

    def delete_client(self, client_id: str) -> None:
        """Forget a client entirely — removes DB record and in-memory state."""
        if self._db is not None:
            spawn(self._db.delete_client(client_id), f"delete_client({client_id})")
        self._assignments.pop(client_id, None)
        self._preset_assignments.pop(client_id, None)
        self._client_last_url.pop(client_id, None)
        self._client_locked.pop(client_id, None)
        self._client_names.pop(client_id, None)
        self._last_seen.pop(client_id, None)
        self._wake_interval.pop(client_id, None)

    def effective_endpoint_id(self, client_id: str) -> str | None:
        return self._assignments.get(client_id, self._default_endpoint_id)

    # ---- Default endpoint (delegated from EndpointRegistry) ----

    def set_default_endpoint_id(self, value: str | None) -> None:
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
                    "width": ch.width,
                    "height": ch.height,
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
                    "mdns_name": None,
                    "locked": self.is_client_locked(client.client_id),
                }
            )

        # --- Tier 2: mDNS-discovered URLs (may or may not have a known client_id) ---
        mdns_client_ids: set[str] = set()
        for discovered in self._server.get_discovered_urls():
            raw_url = discovered["url"]
            if raw_url is None:
                continue  # malformed entry — guard clause
            url: str = raw_url
            known_client_id: str | None = discovered["client_id"]
            mdns_name: str | None = discovered.get("mdns_name")

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
                "mdns_name": mdns_name,
                "locked": self.is_client_locked(entry_id),
            }
            if has_db_record:
                offline_db.append(entry_dict)
            else:
                discovered_only.append(entry_dict)

        # --- Tier 3: clients we know but cannot see (not currently connected or in mDNS) ---
        # Those with a stored assignment, plus any seen since startup: a sleeping
        # frame on the default endpoint has no assignment and drops out of mDNS.
        seen_only = [cid for cid in self._last_seen if cid not in self._assignments]
        for db_client_id in [*self._assignments, *seen_only]:
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
                    "explicit_assignment": db_client_id in self._assignments,
                    "dither_algo": self.client_dither_algo(db_client_id),
                    "dither_palette": self.client_dither_palette(db_client_id),
                    "interval": self.client_interval(db_client_id),
                    "discovered_url": last_url,
                    "discovered_only": False,
                    "mdns_name": None,
                    "locked": self.is_client_locked(db_client_id),
                }
            )

        for entry in connected:
            entry.update(self._presence(entry["id"], connected=True))
        for entry in offline_db + discovered_only:
            entry.update(self._presence(entry["id"], connected=False))
            entry["name"] = self._client_names.get(entry["id"], entry["name"])
        return connected + offline_db + discovered_only

    # ---- Lifecycle ----

    def stop_all(self) -> None:
        for eid in list(self._tasks):
            self.stop_task(eid)

    async def wait_stopped(self) -> None:
        if self._tasks:
            await asyncio.gather(*self._tasks.values(), return_exceptions=True)

    # ---- Restore from persistence ----
    #
    # EndpointRegistry.restore_from_db() drives these at startup. They seed
    # state directly without re-persisting it, which the public setters would.

    def restore_client_url(self, client_id: str, url: str) -> None:
        """Seed a client's last-known URL from persisted state."""
        self._client_last_url[client_id] = url

    def restore_client_locked(self, client_id: str) -> None:
        """Mark a client as locked from persisted state."""
        self._client_locked[client_id] = True

    def restore_device_preset(self, preset_id: str, preset: DevicePreset) -> None:
        """Seed a device preset from persisted state."""
        if self._device_presets is None:
            return
        self._device_presets[preset_id] = preset

    def restore_preset_assignment(self, client_id: str, preset_id: str) -> None:
        """Seed a client's preset assignment from persisted state."""
        self._preset_assignments[client_id] = preset_id

    def restore_assignment(
        self,
        client_id: str,
        endpoint_id: str,
        algo: DitheringAlgo,
        palette: DitheringPalette,
        interval: float,
    ) -> None:
        """Seed a client's endpoint assignment and dither overrides from persisted state."""
        self._assignments[client_id] = endpoint_id
        self._client_dither[client_id] = algo
        self._client_palette[client_id] = palette
        self._client_interval[client_id] = interval

    # ---- Feed loop infrastructure ----

    @property
    def db(self) -> Database | None:
        """The database this manager persists through, if any."""
        return self._db

    def start_task(self, endpoint: ImageEndpoint) -> None:
        task = asyncio.create_task(
            self._feed_loop(endpoint),
            name=f"endpoint-{endpoint.endpoint_id}",
        )
        self._tasks[endpoint.endpoint_id] = task

    def stop_task(self, endpoint_id: str) -> None:
        task = self._tasks.pop(endpoint_id, None)
        if task is not None:
            task.cancel()

    async def _feed_loop(self, endpoint: ImageEndpoint) -> None:
        logger.info("Feed loop started: %s (%s)", endpoint.name, endpoint.kind)
        # client_id → (connection it was pushed to, when). Keeping the connection
        # makes a client that reconnects due at once, so a frame waking from deep
        # sleep gets its image inside its short awake window.
        last_push: dict[str, tuple[Any, float]] = {}
        # The image for the next push, fetched ahead of time so a waking frame
        # does not spend its awake window waiting on the endpoint.
        next_image: asyncio.Task[bytes] | None = None
        wake = asyncio.Event()
        self._feed_wake[endpoint.endpoint_id] = wake
        try:
            while True:
                wake.clear()
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
                        if self._is_due(c, last_push.get(c.client_id), now)
                    ]
                    if due_clients:
                        fetch = next_image or asyncio.create_task(endpoint.fetch_next())
                        next_image = None
                        data = await fetch
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
                                logger.error(
                                    "Failed to push to client %s", c.client_id, exc_info=result
                                )
                            else:
                                last_push[c.client_id] = (c, push_time)
                        next_image = asyncio.create_task(endpoint.fetch_next())
                    elif all_clients:
                        logger.debug(
                            "Endpoint %r: no clients due yet, skipping fetch", endpoint.name
                        )
                    else:
                        logger.debug(
                            "Endpoint %r: no clients assigned, skipping fetch", endpoint.name
                        )
                except asyncio.CancelledError:
                    raise
                except Exception:
                    logger.exception(
                        "Endpoint %r: error in feed loop, retrying in 1s",
                        endpoint.name,
                    )
                # Look again in a second, or as soon as a client connects.
                with contextlib.suppress(TimeoutError):
                    await asyncio.wait_for(wake.wait(), 1)
        finally:
            if next_image is not None:
                next_image.cancel()
            if self._feed_wake.get(endpoint.endpoint_id) is wake:
                del self._feed_wake[endpoint.endpoint_id]

    def _is_due(self, client: Any, last: tuple[Any, float] | None, now: float) -> bool:
        """Return True if `client` is new on this connection or its interval is up."""
        if last is None:
            return True
        pushed_to, pushed_at = last
        if pushed_to is not client:
            return True
        return now - pushed_at >= self._effective_interval(client.client_id)

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
    sent_bytes = await push_image_to_client(
        client,
        data,
        0,
        force_e6_dither=force_dither,
        dither_algo=dither_algo if force_dither else "none",
        dither_palette=dither_palette if force_dither else "e6",
    )
    # Track per-client image for debug endpoints
    if sent_bytes is not None:
        server.record_last_image(client.client_id, sent_bytes)
