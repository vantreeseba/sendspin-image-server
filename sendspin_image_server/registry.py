"""Endpoint registry and per-endpoint broadcast loops."""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING, Any

from sendspin_image_server.endpoints import ImageEndpoint

if TYPE_CHECKING:
    from sendspin_image_server.db import Database
    from sendspin_image_server.dither import DitheringAlgo
    from sendspin_image_server.server import SendspinImageServer

logger = logging.getLogger(__name__)

_FORCE_E6 = True


class EndpointRegistry:
    """Manages endpoints, client assignments, and per-endpoint feed loops."""

    def __init__(
        self,
        server: SendspinImageServer,
        interval: float,
        dither_algo: DitheringAlgo,
        db: Database | None = None,
    ) -> None:
        self._server = server
        self._interval = interval
        self._dither_algo = dither_algo
        self._db = db

        self._endpoints: dict[str, ImageEndpoint] = {}
        self._assignments: dict[str, str | None] = {}
        self._default_endpoint_id: str | None = None
        self._tasks: dict[str, asyncio.Task[None]] = {}

    # ------------------------------------------------------------------
    # Startup restore
    # ------------------------------------------------------------------

    async def restore_from_db(self, builtin_endpoint_id: str) -> None:
        """Reload persisted non-builtin endpoints and client assignments from DB."""
        if self._db is None:
            return

        from sendspin_image_server.endpoints import HomeAssistantEndpoint, ImmichEndpoint, LocalFolderEndpoint
        import pathlib

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

        assignments = await self._db.load_assignments()
        for client_id, endpoint_id in assignments.items():
            if endpoint_id in self._endpoints:
                self._assignments[client_id] = endpoint_id
                logger.info("Restored assignment: client %s → endpoint %s", client_id, endpoint_id)
            else:
                logger.warning(
                    "Skipping stale assignment: client %s → endpoint %s (endpoint not loaded)",
                    client_id, endpoint_id,
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
            asyncio.ensure_future(self._save_endpoint(endpoint))
        logger.info("Endpoint added: %s (%s) id=%s", endpoint.name, endpoint.kind, endpoint.endpoint_id)

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
            asyncio.ensure_future(self._db.delete_endpoint(endpoint_id))
        logger.info("Endpoint removed: id=%s", endpoint_id)
        return True

    def get_endpoint(self, endpoint_id: str) -> ImageEndpoint | None:
        return self._endpoints.get(endpoint_id)

    def list_endpoints(self) -> list[ImageEndpoint]:
        return list(self._endpoints.values())

    async def _save_endpoint(self, endpoint: ImageEndpoint) -> None:
        if self._db is None:
            return
        from sendspin_image_server.endpoints import HomeAssistantEndpoint, ImmichEndpoint, LocalFolderEndpoint
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
    # Client assignment
    # ------------------------------------------------------------------

    def assign(self, client_id: str, endpoint_id: str) -> bool:
        """Point a client at a specific endpoint. Returns False if endpoint not found."""
        if endpoint_id not in self._endpoints:
            return False
        self._assignments[client_id] = endpoint_id
        if self._db is not None:
            asyncio.ensure_future(self._db.save_assignment(client_id, endpoint_id))
        logger.info("Client %s assigned to endpoint %s", client_id, endpoint_id)
        return True

    def unassign(self, client_id: str) -> None:
        """Remove explicit assignment; client falls back to default."""
        self._assignments.pop(client_id, None)
        if self._db is not None:
            asyncio.ensure_future(self._db.delete_assignment(client_id))

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
        result = []
        for client in self._server.clients.values():
            eid = self.effective_endpoint_id(client.client_id)
            ep = self._endpoints.get(eid) if eid else None
            channels = []
            for ch in client.artwork_channels:
                channels.append({
                    "source": ch.source,
                    "format": ch.format,
                    "width": ch.media_width,
                    "height": ch.media_height,
                })
            result.append({
                "id": client.client_id,
                "name": client.name,
                "roles": client.active_roles,
                "stream_started": client.stream_started,
                "artwork_channels": channels,
                "endpoint_id": eid,
                "endpoint_name": ep.name if ep else None,
                "explicit_assignment": self._assignments.get(client.client_id) is not None,
            })
        return result

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
        while True:
            try:
                target_clients = [
                    c for c in self._server.clients.values()
                    if c.has_artwork
                    and c.stream_started
                    and self.effective_endpoint_id(c.client_id) == endpoint.endpoint_id
                ]
                if target_clients:
                    data = await endpoint.fetch_next()
                    logger.info(
                        "Endpoint %r: fetched %d bytes, pushing to %d client(s)",
                        endpoint.name, len(data), len(target_clients),
                    )
                    results = await asyncio.gather(
                        *(_push(self._server, c, data, self._dither_algo) for c in target_clients),
                        return_exceptions=True,
                    )
                    for client, result in zip(target_clients, results):
                        if isinstance(result, Exception):
                            logger.warning("Failed to push to client %s: %s", client.client_id, result)
                else:
                    logger.debug("Endpoint %r: no clients assigned, skipping fetch", endpoint.name)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception(
                    "Endpoint %r: error in feed loop, retrying after %.1fs",
                    endpoint.name, self._interval,
                )
            await asyncio.sleep(self._interval)


async def _push(
    server: SendspinImageServer,
    client: Any,
    data: bytes,
    dither_algo: DitheringAlgo,
) -> None:
    from sendspin_image_server.stream import push_image_to_client
    await push_image_to_client(
        client, data, 0,
        force_e6_dither=_FORCE_E6,
        dither_algo=dither_algo,
    )
