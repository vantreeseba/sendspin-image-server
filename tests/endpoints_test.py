"""Tests for HomeAssistantEndpoint against an in-process stand-in for Home Assistant.

The stand-in speaks the parts of the HA WebSocket API the endpoint uses, and
rejects messages the way HA's own command schemas do: ``media_player/browse_media``
needs an ``entity_id``, and ``media_source/browse_media`` accepts nothing but a
``media_content_id``.
"""

from __future__ import annotations

from typing import Any

import pytest
from aiohttp import web
from aiohttp.test_utils import TestServer

from sendspin_image_server.endpoints import HomeAssistantEndpoint

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

PHOTOS = "media-source://media_source/local/photos"
IMAGE_BYTES = b"not really a jpeg"


def _folder(cid: str, children: list[dict[str, Any]], content_type: str | None = "") -> dict:
    return {
        "media_content_id": cid,
        "media_content_type": content_type,
        "can_play": False,
        "can_expand": True,
        "children": children,
    }


def _image(cid: str, content_type: str = "image/jpeg") -> dict[str, Any]:
    return {
        "media_content_id": cid,
        "media_content_type": content_type,
        "can_play": True,
        "can_expand": False,
    }


def _invalid(msg: dict[str, Any], message: str) -> dict[str, Any]:
    error = {"code": "invalid_format", "message": message}
    return {"id": msg["id"], "type": "result", "success": False, "error": error}


def _result(msg: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    return {"id": msg["id"], "type": "result", "success": True, "result": result}


class FakeHomeAssistant:
    """Serves a media tree over the HA WebSocket API and records each command."""

    def __init__(self, tree: dict[str, dict[str, Any]]) -> None:
        self.tree = tree
        self.commands: list[dict[str, Any]] = []
        self.app = web.Application()
        self.app.router.add_get("/api/websocket", self._websocket)
        self.app.router.add_get("/media/{name}", self._media)

    def _answer(self, msg: dict[str, Any]) -> dict[str, Any]:
        if msg["type"] == "media_player/browse_media":
            if "entity_id" not in msg:
                return _invalid(msg, "required key not provided at 'entity_id'. Got None")
            return _invalid(msg, "Entity not found")
        if msg["type"] == "media_source/browse_media":
            extra = msg.keys() - {"id", "type", "media_content_id"}
            if extra:
                return _invalid(msg, f"extra keys not allowed @ data['{min(extra)}']")
            return _result(msg, self.tree[msg["media_content_id"]])
        if msg["type"] == "media_source/resolve_media":
            name = msg["media_content_id"].rsplit("/", 1)[-1]
            return _result(msg, {"url": f"/media/{name}", "mime_type": "image/jpeg"})
        return _invalid(msg, "Unknown command.")

    async def _websocket(self, request: web.Request) -> web.WebSocketResponse:
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        await ws.send_json({"type": "auth_required"})
        await ws.receive_json()
        await ws.send_json({"type": "auth_ok"})
        msg = await ws.receive_json()
        self.commands.append(msg)
        await ws.send_json(self._answer(msg))
        await ws.close()
        return ws

    async def _media(self, request: web.Request) -> web.Response:
        return web.Response(body=IMAGE_BYTES + request.match_info["name"].encode())


async def _serve(tree: dict[str, dict[str, Any]]):
    fake = FakeHomeAssistant(tree)
    server = TestServer(fake.app)
    await server.start_server()
    endpoint = HomeAssistantEndpoint(
        name="HA",
        base_url=str(server.make_url("")),
        token="token",  # noqa: S106 - the stand-in accepts any token
        media_content_id=PHOTOS,
    )
    return fake, server, endpoint


@pytest.fixture
async def nested_photos():
    """Yield a photos folder holding one image and a subfolder with a second image."""
    tree = {
        PHOTOS: _folder(PHOTOS, [_image(f"{PHOTOS}/a.jpg"), _folder(f"{PHOTOS}/trip", [])]),
        f"{PHOTOS}/trip": _folder(f"{PHOTOS}/trip", [_image(f"{PHOTOS}/trip/b.png", "image/png")]),
    }
    fake, server, endpoint = await _serve(tree)
    yield fake, endpoint
    await server.close()


# ---------------------------------------------------------------------------
# Browsing
# ---------------------------------------------------------------------------


async def test_browses_through_the_media_source_command(nested_photos):
    fake, endpoint = nested_photos

    await endpoint.fetch_next()

    browses = [c for c in fake.commands if c["type"].endswith("/browse_media")]
    assert browses[0] == {
        "id": 1,
        "type": "media_source/browse_media",
        "media_content_id": PHOTOS,
    }
    assert {c["type"] for c in browses} == {"media_source/browse_media"}


async def test_collects_images_from_subfolders_in_order(nested_photos):
    _, endpoint = nested_photos

    first = await endpoint.fetch_next()
    second = await endpoint.fetch_next()

    assert first == IMAGE_BYTES + b"a.jpg"
    assert second == IMAGE_BYTES + b"b.png"


async def test_browses_a_root_whose_content_type_is_null():
    tree = {PHOTOS: _folder(PHOTOS, [_image(f"{PHOTOS}/a.jpg")], content_type=None)}
    _, server, endpoint = await _serve(tree)
    try:
        assert await endpoint.fetch_next() == IMAGE_BYTES + b"a.jpg"
    finally:
        await server.close()
