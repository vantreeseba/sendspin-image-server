"""Tests for SendspinImageServer, driven through a real aiosendspin client."""

from __future__ import annotations

import asyncio
import io
import json
import socket
from unittest.mock import MagicMock

import aiohttp
import pytest
from aiohttp import web
from aiosendspin.client.client import SendspinClient
from aiosendspin.models.artwork import ArtworkChannel
from aiosendspin.models.types import ArtworkSource, PictureFormat, Roles
from aiosendspin.noise.keys import Identity
from aiosendspin.noise.trust_store import InMemoryClientPairingStore
from aiosendspin.server import SendspinServer
from PIL import Image

from sendspin_image_server.server import IDENTITY_FILE, SendspinImageServer

TIMEOUT = 10


# What a client on the pre-1.0 wire opens with, in cleartext.
LEGACY_HELLO = {
    "type": "client/hello",
    "payload": {
        "client_id": "old-frame",
        "name": "Old Frame",
        "version": 1,
        "supported_roles": ["artwork@v1"],
        "artwork@v1_support": {
            "channels": [
                {"source": "album", "format": "jpeg", "media_width": 40, "media_height": 30}
            ]
        },
    },
}


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _image(color: str, size: tuple[int, int] = (200, 100)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return buf.getvalue()


def _registry() -> MagicMock:
    """Return a registry that serves no client from an endpoint."""
    registry = MagicMock()
    registry.effective_endpoint_id.return_value = None
    return registry


class Frame:
    """A picture frame: an encrypted aiosendspin client with one artwork channel."""

    def __init__(self, *, unpaired_access: bool = True) -> None:
        self.images: asyncio.Queue[tuple[int, bytes]] = asyncio.Queue()
        self._unpaired_access = unpaired_access
        self.client = SendspinClient(
            Identity.generate(),
            "Frame",
            [Roles.ARTWORK, Roles.METADATA],
            pairing_store=InMemoryClientPairingStore(),
            artwork_channels=[
                ArtworkChannel(
                    source=ArtworkSource.ALBUM, format=PictureFormat.PNG, width=40, height=30
                )
            ],
        )
        self.client.add_artwork_listener(
            lambda channel, data: self.images.put_nowait((channel, data))
        )

    async def connect(self, url: str) -> None:
        await self.client.set_unpaired_access(enabled=self._unpaired_access)
        await self.client.connect(url)

    async def next_image(self) -> Image.Image:
        """Return the next non-empty image the server sent."""
        while True:
            _channel, data = await asyncio.wait_for(self.images.get(), TIMEOUT)
            if data:
                image = Image.open(io.BytesIO(data))
                image.load()
                return image


@pytest.fixture(autouse=True)
def no_mdns(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep the tests off the network: do not advertise the server."""

    async def _skip(*_args, **_kwargs) -> None:
        return None

    monkeypatch.setattr(SendspinServer, "_start_mdns_advertising", _skip)


@pytest.fixture
async def running(tmp_path):
    """Start a server and yield it with the URL clients reach it on."""
    server = SendspinImageServer("Test Server", tmp_path)
    server.registry = _registry()
    port = _free_port()
    await server.start(host="127.0.0.1", port=port)
    try:
        yield server, f"ws://127.0.0.1:{port}/sendspin"
    finally:
        await server.stop()


@pytest.fixture
async def dialled_frame():
    """Yield the URL of a frame the server can dial, and the reasons it was dialled with."""
    reasons: asyncio.Queue[str] = asyncio.Queue()
    sockets: list[web.WebSocketResponse] = []

    async def _sendspin(request: web.Request) -> web.WebSocketResponse:
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        sockets.append(ws)
        await ws.send_json(LEGACY_HELLO)
        async for message in ws:
            hello = json.loads(message.data) if message.type == aiohttp.WSMsgType.TEXT else {}
            if hello.get("type") == "server/hello":
                reasons.put_nowait(hello["payload"]["connection_reason"])
        return ws

    app = web.Application()
    app.router.add_get("/sendspin", _sendspin)
    runner = web.AppRunner(app)
    await runner.setup()
    port = _free_port()
    await web.TCPSite(runner, "127.0.0.1", port).start()
    try:
        yield f"ws://127.0.0.1:{port}/sendspin", reasons
    finally:
        for ws in sockets:
            await ws.close()
        await runner.cleanup()


async def _until(predicate) -> None:
    async with asyncio.timeout(TIMEOUT):
        while not predicate():  # noqa: ASYNC110 - polls server state
            await asyncio.sleep(0.01)


async def _next_stream_start(ws: aiohttp.ClientWebSocketResponse) -> None:
    async with asyncio.timeout(TIMEOUT):
        async for message in ws:
            is_text = message.type == aiohttp.WSMsgType.TEXT
            if is_text and json.loads(message.data)["type"] == "stream/start":
                return


async def _messages_until_quiet(ws: aiohttp.ClientWebSocketResponse) -> list[str]:
    """Return what the server sends next: message types, with "image" for a binary one."""
    seen: list[str] = []
    while True:
        try:
            message = await ws.receive(timeout=0.5)
        except TimeoutError:
            return seen
        if message.type == aiohttp.WSMsgType.BINARY:
            seen.append("image")
        elif message.type == aiohttp.WSMsgType.TEXT:
            seen.append(json.loads(message.data)["type"])
        else:
            return seen


class TestArtworkDelivery:
    async def test_connecting_client_gets_the_cached_image_at_its_size(self, running):
        server, url = running
        await server.broadcast_image(_image("red"))
        frame = Frame()
        try:
            await frame.connect(url)
            image = await frame.next_image()
        finally:
            await frame.client.disconnect()

        assert image.format == "PNG"
        assert image.size == (40, 30)
        assert image.convert("RGB").getpixel((20, 15)) == (255, 0, 0)

    async def test_client_never_sees_a_clear_before_its_first_image(self, running):
        server, url = running
        await server.broadcast_image(_image("red"))
        frame = Frame()
        try:
            await frame.connect(url)
            _channel, first = await asyncio.wait_for(frame.images.get(), TIMEOUT)
        finally:
            await frame.client.disconnect()

        assert first, "the stock 'no artwork' clear must not blank the frame"

    async def test_broadcast_reaches_a_connected_client(self, running):
        server, url = running
        frame = Frame()
        try:
            await frame.connect(url)
            client_id = frame.client._client_id
            await _until(lambda: client_id in server.clients)
            await _until(lambda: server.clients[client_id].stream_started)

            await server.broadcast_image(_image("blue"))
            image = await frame.next_image()
        finally:
            await frame.client.disconnect()

        assert image.convert("RGB").getpixel((20, 15)) == (0, 0, 255)
        assert server.last_image_for(client_id) is not None

    async def test_client_fed_by_an_endpoint_is_left_to_its_feed_loop(self, running):
        server, url = running
        server.registry.effective_endpoint_id.return_value = "ep1"
        await server.broadcast_image(_image("red"))
        frame = Frame()
        try:
            await frame.connect(url)
            client_id = frame.client._client_id
            await _until(lambda: client_id in server.clients)
            await _until(lambda: server.clients[client_id].stream_started)
            await asyncio.sleep(0.2)
        finally:
            await frame.client.disconnect()

        assert frame.images.empty()


class TestLegacyClients:
    """Clients on the pre-1.0 wire: cleartext, channels declared in the hello."""

    async def test_cleartext_client_gets_the_cached_image(self, running):
        server, url = running
        await server.broadcast_image(_image("red"))

        async with aiohttp.ClientSession() as session, session.ws_connect(url) as ws:
            await ws.send_str(json.dumps(LEGACY_HELLO))
            await ws.send_str(json.dumps({"type": "client/state", "payload": {}}))
            async with asyncio.timeout(TIMEOUT):
                async for message in ws:
                    if message.type == aiohttp.WSMsgType.BINARY:
                        frame = message.data
                        break

        # One message per image: type 8 (channel 0), an 8-byte timestamp, the image.
        assert frame[0] == 8
        image = Image.open(io.BytesIO(frame[9:]))
        assert image.format == "JPEG"
        assert image.size == (40, 30)
        server.registry.client_connected.assert_called_once_with("old-frame")

    async def test_stream_starts_again_once_the_client_reports_its_state(self, running):
        # sendspin-cpp forgets a stream/start that reaches it before it has
        # dropped the server it was on, and only then sends its client/state.
        server, url = running
        await server.broadcast_image(_image("red"))

        async with aiohttp.ClientSession() as session, session.ws_connect(url) as ws:
            await ws.send_str(json.dumps(LEGACY_HELLO))
            await _next_stream_start(ws)
            await ws.send_str(json.dumps({"type": "client/state", "payload": {}}))
            after_state = await _messages_until_quiet(ws)

            await ws.send_str(json.dumps({"type": "client/state", "payload": {}}))
            after_second_state = await _messages_until_quiet(ws)

        assert "stream/start" in after_state
        assert "image" in after_state[after_state.index("stream/start") :]
        # Only the first state restarts the stream: each restart repaints the display.
        assert "stream/start" not in after_second_state

    async def test_cleartext_client_is_refused_when_not_allowed(self, tmp_path):
        server = SendspinImageServer("Test Server", tmp_path, allow_unencrypted=False)
        port = _free_port()
        await server.start(host="127.0.0.1", port=port)
        try:
            async with (
                aiohttp.ClientSession() as session,
                session.ws_connect(f"ws://127.0.0.1:{port}/sendspin") as ws,
            ):
                await ws.send_str(json.dumps(LEGACY_HELLO))
                # The socket is closed without a server/hello.
                async with asyncio.timeout(TIMEOUT):
                    replies = [json.loads(message.data)["type"] async for message in ws]
            assert "server/hello" not in replies
            assert server.clients == {}
        finally:
            await server.stop()


class TestClientTracking:
    async def test_registry_hears_about_connect_and_disconnect(self, running):
        server, url = running
        registry = server.registry
        frame = Frame()
        await frame.connect(url)
        client_id = frame.client._client_id
        try:
            await _until(lambda: registry.client_connected.called)
            state = server.clients[client_id]
            assert state.name == "Frame"
            assert state.has_artwork
            assert state.has_metadata
            assert [(c.format, c.width, c.height) for c in state.artwork_channels] == [
                ("png", 40, 30)
            ]
        finally:
            await frame.client.disconnect()
        await _until(lambda: client_id not in server.clients)

        registry.ensure_client.assert_called_once_with(client_id, name="Frame", url=None)
        registry.client_connected.assert_called_once_with(client_id)
        registry.client_disconnected.assert_called_once_with(client_id)

    async def test_reconnecting_client_gets_a_new_state_object(self, running):
        server, url = running
        frame = Frame()
        await frame.connect(url)
        client_id = frame.client._client_id
        await _until(lambda: client_id in server.clients)
        await _until(lambda: server.clients[client_id].stream_started)
        first = server.clients[client_id]
        await frame.client.disconnect()
        await _until(lambda: client_id not in server.clients)

        # The feed loops compare state objects to spot a client that came back.
        await frame.client.connect(url)
        try:
            await _until(lambda: client_id in server.clients)
            await _until(lambda: server.clients[client_id].stream_started)
            assert server.clients[client_id] is not first
        finally:
            await frame.client.disconnect()

    async def test_client_requiring_pairing_gets_no_images(self, running):
        server, url = running
        await server.broadcast_image(_image("red"))
        frame = Frame(unpaired_access=False)
        try:
            await frame.connect(url)
            client_id = frame.client._client_id
            await _until(lambda: client_id in server.clients)
            await asyncio.sleep(0.2)
            assert not server.clients[client_id].stream_started
        finally:
            await frame.client.disconnect()

        assert frame.images.empty()

    async def test_unpaired_client_is_not_served_when_trust_is_off(self, tmp_path):
        server = SendspinImageServer("Test Server", tmp_path, trust_unpaired=False)
        server.registry = _registry()
        port = _free_port()
        await server.start(host="127.0.0.1", port=port)
        await server.broadcast_image(_image("red"))
        frame = Frame()
        try:
            await frame.connect(f"ws://127.0.0.1:{port}/sendspin")
            client_id = frame.client._client_id
            await _until(lambda: client_id in server.clients)
            await asyncio.sleep(0.2)
            assert not server.clients[client_id].stream_started
        finally:
            await frame.client.disconnect()
            await server.stop()

        assert frame.images.empty()


class TestIdentity:
    async def test_server_id_survives_a_restart(self, tmp_path):
        ids = []
        for _ in range(2):
            server = SendspinImageServer("Test Server", tmp_path)
            await server.start(host="127.0.0.1", port=_free_port())
            ids.append(server.server_id)
            await server.stop()

        assert ids[0] is not None
        assert ids[0] == ids[1]
        assert (tmp_path / IDENTITY_FILE).stat().st_mode & 0o777 == 0o600


class TestOutboundConnections:
    async def test_seeing_a_client_again_retries_without_waiting_out_backoff(
        self, running, monkeypatch
    ):
        server, _url = running
        url = "ws://127.0.0.1:1/sendspin"
        attempts: asyncio.Queue[str] = asyncio.Queue()
        session = server._sendspin._client_session
        real_connect = session.ws_connect

        def _counting_connect(target, *args, **kwargs):
            attempts.put_nowait(str(target))
            return real_connect(target, *args, **kwargs)

        monkeypatch.setattr(session, "ws_connect", _counting_connect)
        try:
            server.connect_to_client(url, mdns_name="frame")
            await asyncio.wait_for(attempts.get(), 2)

            # The first backoff is a full second; a re-announce must not wait for it.
            server.connect_to_client(url)
            await asyncio.wait_for(attempts.get(), 0.5)

            assert server.get_discovered_urls() == [
                {"url": url, "client_id": None, "mdns_name": "frame"}
            ]
        finally:
            server.disconnect_from_client(url)
        assert server.get_discovered_urls() == []

    async def test_locked_client_is_dialled_to_take_it_from_another_server(
        self, running, dialled_frame
    ):
        server, _url = running
        url, reasons = dialled_frame
        server.registry.locked_clients_with_urls.return_value = [("old-frame", url)]
        try:
            server.connect_to_client(url, mdns_name="frame")

            assert await asyncio.wait_for(reasons.get(), TIMEOUT) == "playback"
        finally:
            server.disconnect_from_client(url)

    async def test_unlocked_client_is_left_to_the_server_it_is_on(self, running, dialled_frame):
        server, _url = running
        url, reasons = dialled_frame
        server.registry.locked_clients_with_urls.return_value = [("other-frame", "ws://other")]
        try:
            server.connect_to_client(url, mdns_name="frame")

            assert await asyncio.wait_for(reasons.get(), TIMEOUT) == "discovery"
        finally:
            server.disconnect_from_client(url)
