"""Image source endpoint abstractions.

An *endpoint* is a named, typed image source that yields one image at a time
via ``fetch_next()``.  The registry assigns each connected client to an
endpoint; a background loop per endpoint fans out images to all clients
currently assigned to it.

Concrete implementations
------------------------
- ``LocalFolderEndpoint``       — iterates sorted files from a local directory
- ``ImmichEndpoint``            — fetches in-order from an Immich album via REST
- ``HomeAssistantEndpoint``     — browses the HA Media Browser at a given path
                                  and downloads images via the REST API
"""

from __future__ import annotations

import json
import logging
import pathlib
import uuid
from abc import ABC, abstractmethod
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Base class
# ---------------------------------------------------------------------------

class ImageEndpoint(ABC):
    """Abstract image source.  Subclasses implement ``fetch_next()``."""

    def __init__(self, endpoint_id: str, name: str) -> None:
        self.endpoint_id = endpoint_id
        self.name = name

    @property
    @abstractmethod
    def kind(self) -> str:
        """Short type string: ``"local"``, ``"immich"``."""

    @abstractmethod
    async def fetch_next(self) -> bytes:
        """Return raw image bytes for the next image in this source."""

    def to_dict(self) -> dict[str, Any]:
        """Serialise to a JSON-safe dict for the REST API."""
        return {
            "id": self.endpoint_id,
            "name": self.name,
            "kind": self.kind,
        }


# ---------------------------------------------------------------------------
# Local folder
# ---------------------------------------------------------------------------

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


class LocalFolderEndpoint(ImageEndpoint):
    """Iterates image files in a local directory in sorted order."""

    def __init__(
        self,
        name: str,
        path: pathlib.Path,
        endpoint_id: str | None = None,
    ) -> None:
        super().__init__(endpoint_id or str(uuid.uuid4()), name)
        self.path = path
        self._index = 0
        self._files: list[pathlib.Path] = []

    @property
    def kind(self) -> str:
        return "local"

    def _refresh(self) -> None:
        self._files = sorted(
            p for p in self.path.iterdir()
            if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
        )

    async def fetch_next(self) -> bytes:
        if self._index == 0:
            self._refresh()
        if not self._files:
            msg = f"No images found in {self.path}"
            raise FileNotFoundError(msg)
        self._index = self._index % len(self._files)
        data = self._files[self._index].read_bytes()
        self._index = (self._index + 1) % len(self._files)
        return data

    def to_dict(self) -> dict[str, Any]:
        return {**super().to_dict(), "path": str(self.path)}


# ---------------------------------------------------------------------------
# Immich
# ---------------------------------------------------------------------------

class ImmichEndpoint(ImageEndpoint):
    """Fetches images in album order from an Immich server."""

    def __init__(
        self,
        name: str,
        base_url: str,
        album_id: str,
        api_key: str,
        endpoint_id: str | None = None,
    ) -> None:
        super().__init__(endpoint_id or str(uuid.uuid4()), name)
        self.base_url = base_url.rstrip("/")
        self.album_id = album_id
        self.api_key = api_key
        self._index = 0
        self._assets: list[dict[str, Any]] = []

    @property
    def kind(self) -> str:
        return "immich"

    def _headers(self) -> dict[str, str]:
        return {"x-api-key": self.api_key, "Accept": "application/json"}

    async def _refresh_assets(self) -> None:
        import aiohttp
        url = f"{self.base_url}/api/albums/{self.album_id}"
        async with aiohttp.ClientSession(headers=self._headers()) as session:
            async with session.get(url) as resp:
                resp.raise_for_status()
                album = await resp.json()
        all_assets: list[dict[str, Any]] = album.get("assets", [])
        self._assets = [a for a in all_assets if a.get("type") == "IMAGE"]

    async def fetch_next(self) -> bytes:
        import aiohttp
        if self._index == 0:
            await self._refresh_assets()
        if not self._assets:
            msg = f"Immich album {self.album_id!r} contains no images"
            raise ValueError(msg)
        self._index = self._index % len(self._assets)
        asset = self._assets[self._index]
        asset_id = asset["id"]
        url = f"{self.base_url}/api/assets/{asset_id}/original"
        async with aiohttp.ClientSession(headers=self._headers()) as session:
            async with session.get(
                url,
                headers={**self._headers(), "Accept": "application/octet-stream"},
            ) as resp:
                resp.raise_for_status()
                data = await resp.read()
        self._index = (self._index + 1) % len(self._assets)
        return data

    def to_dict(self) -> dict[str, Any]:
        return {
            **super().to_dict(),
            "base_url": self.base_url,
            "album_id": self.album_id,
        }


# ---------------------------------------------------------------------------
# Home Assistant Media Browser
# ---------------------------------------------------------------------------

class HomeAssistantEndpoint(ImageEndpoint):
    """Browses the Home Assistant Media Browser at a given path and downloads
    images in order via the REST API.

    Authentication uses a Long-Lived Access Token (LLAT).

    The endpoint walks the tree rooted at *media_content_id* (e.g.
    ``"media-source://media_source/local/photos"``), collects all leaf items
    whose ``media_content_type`` starts with ``"image/"`` or equals
    ``"image"``, and cycles through them in order.

    The HA WebSocket API is used to browse; image bytes are downloaded over
    HTTP using the ``/api/media_source/local_source/<path>`` proxy or by
    resolving the media source URL to a real URL via
    ``media_source/resolve_media``.
    """

    def __init__(
        self,
        name: str,
        base_url: str,
        token: str,
        media_content_id: str = "media-source://media_source",
        endpoint_id: str | None = None,
    ) -> None:
        super().__init__(endpoint_id or str(uuid.uuid4()), name)
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.media_content_id = media_content_id
        self._index = 0
        self._items: list[dict[str, Any]] = []  # flat list of image leaf nodes

    @property
    def kind(self) -> str:
        return "homeassistant"

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }

    # ------------------------------------------------------------------
    # WebSocket helpers
    # ------------------------------------------------------------------

    async def _ws_browse(
        self,
        media_content_id: str,
        media_content_type: str = "media-source",
    ) -> dict[str, Any]:
        """Open a short-lived WebSocket to HA, authenticate, and browse media."""
        import aiohttp

        ws_url = self.base_url.replace("https://", "wss://").replace("http://", "ws://")
        ws_url = f"{ws_url}/api/websocket"
        msg_id = 1

        async with aiohttp.ClientSession() as session:
            async with session.ws_connect(ws_url) as ws:
                # auth_required
                auth_req = await ws.receive_json()
                if auth_req.get("type") != "auth_required":
                    raise RuntimeError(f"Expected auth_required, got: {auth_req}")

                # send auth
                await ws.send_json({"type": "auth", "access_token": self.token})
                auth_resp = await ws.receive_json()
                if auth_resp.get("type") != "auth_ok":
                    raise RuntimeError(f"HA auth failed: {auth_resp.get('message', auth_resp)}")

                # browse_media
                await ws.send_json({
                    "id": msg_id,
                    "type": "media_player/browse_media",
                    "media_content_id": media_content_id,
                    "media_content_type": media_content_type,
                })
                result = await ws.receive_json()
                if not result.get("success"):
                    raise RuntimeError(f"HA browse failed: {result}")
                return result["result"]  # type: ignore[return-value]

    async def _ws_resolve(self, media_content_id: str) -> str:
        """Resolve a media-source URI to a playable URL via WebSocket."""
        import aiohttp

        ws_url = self.base_url.replace("https://", "wss://").replace("http://", "ws://")
        ws_url = f"{ws_url}/api/websocket"

        async with aiohttp.ClientSession() as session:
            async with session.ws_connect(ws_url) as ws:
                await ws.receive_json()  # auth_required
                await ws.send_json({"type": "auth", "access_token": self.token})
                auth_resp = await ws.receive_json()
                if auth_resp.get("type") != "auth_ok":
                    raise RuntimeError(f"HA auth failed: {auth_resp.get('message', auth_resp)}")

                await ws.send_json({
                    "id": 1,
                    "type": "media_source/resolve_media",
                    "media_content_id": media_content_id,
                })
                result = await ws.receive_json()
                if not result.get("success"):
                    raise RuntimeError(f"HA resolve failed: {result}")
                return result["result"]["url"]  # type: ignore[return-value]

    # ------------------------------------------------------------------
    # Image collection
    # ------------------------------------------------------------------

    async def _collect_images(self, node: dict[str, Any], depth: int = 0) -> list[dict[str, Any]]:
        """Recursively walk the browse tree and collect image leaf nodes."""
        images: list[dict[str, Any]] = []
        content_type: str = node.get("media_content_type", "")
        can_expand: bool = bool(node.get("can_expand", False))
        can_play: bool = bool(node.get("can_play", False))
        cid: str = node.get("media_content_id", "")

        is_image = (
            content_type == "image"
            or content_type.startswith("image/")
        )

        if can_play and is_image:
            images.append(node)
            return images

        if can_expand and depth < 6:
            try:
                child_node = await self._ws_browse(cid, content_type)
                for child in child_node.get("children", []):
                    images.extend(await self._collect_images(child, depth + 1))
            except Exception:
                logger.exception("HA: failed to expand node %r", cid)

        return images

    async def _refresh(self) -> None:
        logger.info("HA endpoint %r: refreshing media tree from %r", self.name, self.media_content_id)
        root = await self._ws_browse(self.media_content_id)
        self._items = await self._collect_images(root)
        logger.info("HA endpoint %r: found %d image(s)", self.name, len(self._items))

    # ------------------------------------------------------------------
    # fetch_next
    # ------------------------------------------------------------------

    async def fetch_next(self) -> bytes:
        import aiohttp

        if self._index == 0:
            await self._refresh()
        if not self._items:
            msg = f"HA Media Browser at {self.media_content_id!r} contains no images"
            raise ValueError(msg)

        self._index = self._index % len(self._items)
        item = self._items[self._index]
        self._index = (self._index + 1) % len(self._items)

        cid: str = item.get("media_content_id", "")

        # Resolve media-source URI to a URL
        url: str
        if cid.startswith("media-source://"):
            resolved = await self._ws_resolve(cid)
            # Relative URLs need the base_url prepended
            if resolved.startswith("/"):
                url = f"{self.base_url}{resolved}"
            else:
                url = resolved
        else:
            url = cid  # already a URL

        async with aiohttp.ClientSession(headers=self._headers()) as session:
            async with session.get(url) as resp:
                resp.raise_for_status()
                return await resp.read()

    def to_dict(self) -> dict[str, Any]:
        return {
            **super().to_dict(),
            "base_url": self.base_url,
            "media_content_id": self.media_content_id,
        }
