"""Core Sendspin server: WebSocket handler and protocol logic."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any

import websockets
import websockets.exceptions
from websockets.server import ServerConnection, WebSocketServer

from sendspin_image_server.client import (
    ArtworkChannel,
    ClientState,
    ROLE_ARTWORK,
    ROLE_CONTROLLER,
    ROLE_METADATA,
    ROLE_PLAYER,
    SUPPORTED_ROLES,
    server_time_us,
)
from sendspin_image_server.dither import DitheringAlgo
from sendspin_image_server.stream import (
    PCM_BIT_DEPTH,
    PCM_CHANNELS,
    PCM_SAMPLE_RATE,
    push_image_to_client,
    send_silence_frames,
)

logger = logging.getLogger(__name__)

SERVER_VERSION = 1
GROUP_ID = str(uuid.uuid4())
GROUP_NAME = "Image Server"


class SendspinImageServer:
    """Sendspin server that streams silence and pushes artwork to clients."""

    def __init__(self, server_id: str, server_name: str) -> None:
        self._server_id = server_id
        self._server_name = server_name
        self._clients: dict[str, ClientState] = {}
        self._ws_server: WebSocketServer | None = None
        self._last_image: bytes | None = None
        self._last_image_channel: int = 0
        # url → task for server-initiated outbound connections
        self._outbound_tasks: dict[str, asyncio.Task[None]] = {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @property
    def last_image(self) -> bytes | None:
        """The most recently broadcast image bytes, or None if none sent yet."""
        return self._last_image

    @property
    def clients(self) -> dict[str, ClientState]:
        """Read-only view of currently connected clients."""
        return self._clients

    async def start(self, host: str = "0.0.0.0", port: int = 8927) -> None:
        """Start the WebSocket server."""
        self._ws_server = await websockets.serve(
            self._handle_connection,
            host,
            port,
            subprotocols=None,
        )
        logger.info("Sendspin WebSocket server listening on ws://%s:%d/sendspin", host, port)

    async def stop(self) -> None:
        """Stop the WebSocket server and all outbound connections."""
        for task in list(self._outbound_tasks.values()):
            task.cancel()
        if self._outbound_tasks:
            await asyncio.gather(*self._outbound_tasks.values(), return_exceptions=True)
        self._outbound_tasks.clear()
        if self._ws_server is not None:
            self._ws_server.close()
            await self._ws_server.wait_closed()

    def connect_to_client(self, url: str) -> None:
        """Start a persistent server-initiated connection to a client URL.

        The connection is maintained automatically: if the client disconnects
        it will be retried with exponential backoff (up to 5 minutes), unless
        the client sent client/goodbye with reason 'another_server'.
        """
        if url in self._outbound_tasks:
            return  # already managing this URL
        task = asyncio.create_task(
            self._outbound_connection_loop(url),
            name=f"outbound-{url}",
        )
        self._outbound_tasks[url] = task
        logger.info("Initiating server-initiated connection to %s", url)

    def disconnect_from_client(self, url: str) -> None:
        """Cancel the outbound connection task for a URL (client disappeared from mDNS)."""
        task = self._outbound_tasks.pop(url, None)
        if task is not None:
            task.cancel()
            logger.info("Cancelled outbound connection to %s", url)

    async def _outbound_connection_loop(self, url: str) -> None:
        """Retry loop for a server-initiated outbound WebSocket connection."""
        backoff = 1.0
        max_backoff = 300.0
        try:
            while True:
                try:
                    async with websockets.connect(url) as websocket:
                        logger.info("Server-initiated connection established to %s", url)
                        backoff = 1.0  # reset on successful connect
                        goodbye_reason = await self._handle_connection(
                            websocket, connection_reason="discovery"
                        )
                    # Don't reconnect if client said goodbye with 'another_server'
                    if goodbye_reason == "another_server":
                        logger.debug(
                            "Client at %s switched servers, not reconnecting", url
                        )
                        break
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    logger.debug("Outbound connection to %s failed: %s", url, exc)

                logger.debug(
                    "Reconnecting to %s in %.1fs", url, backoff
                )
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, max_backoff)
        except asyncio.CancelledError:
            pass
        finally:
            self._outbound_tasks.pop(url, None)

    async def broadcast_image(
        self,
        image_bytes: bytes,
        channel: int = 0,
        *,
        force_e6_dither: bool = False,
        dither_algo: DitheringAlgo = "floyd-steinberg",
    ) -> None:
        """Push an image to all connected artwork clients.

        *force_e6_dither* applies dithering to every client regardless of what
        format they negotiated. *dither_algo* selects the algorithm used.
        Dithering always happens after per-client resizing.
        """
        self._last_image = image_bytes
        self._last_image_channel = channel
        artwork_clients = [c for c in self._clients.values() if c.has_artwork and c.stream_started]
        if not artwork_clients:
            logger.debug("No artwork clients connected, image not sent")
            return
        results = await asyncio.gather(
            *(
                push_image_to_client(
                    c, image_bytes, channel,
                    force_e6_dither=force_e6_dither,
                    dither_algo=dither_algo,
                )
                for c in artwork_clients
            ),
            return_exceptions=True,
        )
        for client, result in zip(artwork_clients, results):
            if isinstance(result, Exception):
                logger.warning("Failed to push image to %s: %s", client.client_id, result)

    # ------------------------------------------------------------------
    # WebSocket handler
    # ------------------------------------------------------------------

    async def _handle_connection(
        self,
        websocket: ServerConnection,
        connection_reason: str = "discovery",
    ) -> str | None:
        """Handle a WebSocket connection from a Sendspin client.

        Works for both inbound (client-initiated) and outbound (server-initiated)
        connections.  Returns the client/goodbye reason string if the client
        disconnected gracefully, otherwise None.
        """
        # For inbound connections the path is available on the request; for
        # outbound connections we already connected to the correct path.
        if hasattr(websocket, "request"):
            path = websocket.request.path
            if not path.rstrip("/").endswith("/sendspin"):
                logger.debug("Rejecting connection to unknown path: %s", path)
                await websocket.close(1008, "Unknown path")
                return None

        client: ClientState | None = None
        silence_task: asyncio.Task[None] | None = None
        goodbye_reason: str | None = None

        try:
            # Step 1: receive client/hello
            raw = await websocket.recv()
            if not isinstance(raw, str):
                logger.warning("Expected text message for client/hello, got binary")
                return None
            msg = json.loads(raw)
            if msg.get("type") != "client/hello":
                logger.warning("Expected client/hello, got %s", msg.get("type"))
                return None

            client = self._parse_client_hello(msg, websocket)
            self._clients[client.client_id] = client
            logger.info(
                "Client connected: %s (%s) roles=%s connection_reason=%s",
                client.name,
                client.client_id,
                client.active_roles,
                connection_reason,
            )

            # Step 2: send server/hello
            await self._send_server_hello(client, connection_reason=connection_reason)

            # Step 3: send stream/start (with player config so audio clients stay happy)
            await self._send_stream_start(client)
            client.stream_started = True

            # Step 3b: immediately send last known image to new artwork clients
            if client.has_artwork and self._last_image is not None:
                try:
                    await push_image_to_client(client, self._last_image, self._last_image_channel)
                except Exception as exc:
                    logger.warning(
                        "Failed to push cached image to new client %s: %s",
                        client.client_id,
                        exc,
                    )

            # Step 4: send group/update
            await self._send_group_update(client)

            # Step 5: send server/state for metadata/controller clients
            await self._send_server_state(client)

            # Step 6: start silence loop for player clients (background task)
            if client.has_player:
                silence_task = asyncio.create_task(
                    send_silence_frames(client), name=f"silence-{client.client_id}"
                )

            # Step 7: message loop
            async for raw_msg in websocket:
                if isinstance(raw_msg, str):
                    parsed = json.loads(raw_msg)
                    if parsed.get("type") == "client/goodbye":
                        goodbye_reason = parsed.get("payload", {}).get("reason")
                        logger.debug(
                            "Client %s said goodbye: %s",
                            client.client_id,
                            goodbye_reason,
                        )
                        break
                    await self._handle_text_message(client, parsed)
                # binary messages from clients are not expected; ignore

        except websockets.exceptions.ConnectionClosedOK:
            pass
        except websockets.exceptions.ConnectionClosedError as exc:
            logger.debug("Client connection closed with error: %s", exc)
        except Exception:
            logger.exception("Unhandled error in connection handler")
        finally:
            if silence_task is not None:
                silence_task.cancel()
            if client is not None:
                self._clients.pop(client.client_id, None)
                logger.info("Client disconnected: %s (%s)", client.name, client.client_id)

        return goodbye_reason

    # ------------------------------------------------------------------
    # Message parsing helpers
    # ------------------------------------------------------------------

    def _parse_client_hello(
        self, msg: dict[str, Any], websocket: ServerConnection
    ) -> ClientState:
        """Parse a client/hello message and return a ClientState."""
        payload = msg.get("payload", {})
        client_id: str = payload.get("client_id", str(uuid.uuid4()))
        name: str = payload.get("name", "Unknown Client")
        supported: list[str] = payload.get("supported_roles", [])
        logger.info("Client %s supported_roles=%s", client_id, supported)

        # Activate the first supported version of each role family we implement
        active_roles: list[str] = []
        seen_families: set[str] = set()
        for role in supported:
            family = role.split("@")[0]
            if role in SUPPORTED_ROLES and family not in seen_families:
                active_roles.append(role)
                seen_families.add(family)

        # Parse artwork channel preferences
        artwork_channels: list[ArtworkChannel] = []
        if ROLE_ARTWORK in active_roles:
            # Accept both the versioned key and the legacy key used by older clients
            aw_support = payload.get("artwork@v1_support") or payload.get("artwork_support", {})
            for idx, ch_cfg in enumerate(aw_support.get("channels", [])):
                media_width = ch_cfg.get("media_width")
                media_height = ch_cfg.get("media_height")
                artwork_channels.append(
                    ArtworkChannel(
                        source=ch_cfg.get("source", "album"),
                        format=ch_cfg.get("format", "jpeg"),
                        media_width=media_width,
                        media_height=media_height,
                        _channel_index=idx,
                    )
                )
            if not artwork_channels:
                artwork_channels = [ArtworkChannel()]
            for ch in artwork_channels:
                size_str = f"{ch.media_width}x{ch.media_height}" if ch.media_width and ch.media_height else "unspecified"
                logger.info(
                    "Client %s artwork channel %d: source=%s format=%s requested=%s",
                    client_id, ch._channel_index, ch.source, ch.format, size_str,
                )

        return ClientState(
            client_id=client_id,
            name=name,
            websocket=websocket,
            active_roles=active_roles,
            artwork_channels=artwork_channels,
        )

    # ------------------------------------------------------------------
    # Outbound messages
    # ------------------------------------------------------------------

    async def _send(self, client: ClientState, payload: dict[str, Any]) -> None:
        """Send a JSON text message to a client."""
        await client.websocket.send(json.dumps(payload))

    async def _send_server_hello(
        self, client: ClientState, connection_reason: str = "discovery"
    ) -> None:
        await self._send(
            client,
            {
                "type": "server/hello",
                "payload": {
                    "server_id": self._server_id,
                    "name": self._server_name,
                    "version": SERVER_VERSION,
                    "active_roles": client.active_roles,
                    "connection_reason": connection_reason,
                },
            },
        )

    async def _send_stream_start(self, client: ClientState) -> None:
        payload: dict[str, Any] = {}

        if client.has_player:
            payload["player"] = {
                "codec": "pcm",
                "sample_rate": PCM_SAMPLE_RATE,
                "channels": PCM_CHANNELS,
                "bit_depth": PCM_BIT_DEPTH,
            }

        if client.has_artwork and client.artwork_channels:
            channels = []
            for ch in client.artwork_channels:
                # Report the wire format: e6-dithered outputs jpeg
                wire_format = "jpeg" if ch.wants_e6_dither else ch.format
                ch_entry: dict[str, Any] = {
                    "source": ch.source,
                    "format": wire_format,
                }
                if ch.media_width is not None:
                    ch_entry["width"] = ch.media_width
                if ch.media_height is not None:
                    ch_entry["height"] = ch.media_height
                channels.append(ch_entry)
            payload["artwork"] = {"channels": channels}

        if payload:
            await self._send(client, {"type": "stream/start", "payload": payload})

    async def _send_group_update(self, client: ClientState) -> None:
        await self._send(
            client,
            {
                "type": "group/update",
                "payload": {
                    "playback_state": "playing",
                    "group_id": GROUP_ID,
                    "group_name": GROUP_NAME,
                },
            },
        )

    async def _send_server_state(self, client: ClientState) -> None:
        payload: dict[str, Any] = {}

        if client.has_metadata:
            payload["metadata"] = {
                "timestamp": server_time_us(),
                "title": "Image Server",
                "artist": None,
                "album": None,
                "progress": {
                    "track_progress": 0,
                    "track_duration": 0,
                    "playback_speed": 1000,
                },
            }

        if client.has_controller:
            payload["controller"] = {
                "supported_commands": ["play", "pause", "stop", "volume", "mute"],
                "volume": 100,
                "muted": False,
            }

        if payload:
            await self._send(client, {"type": "server/state", "payload": payload})

    # ------------------------------------------------------------------
    # Inbound message dispatch
    # ------------------------------------------------------------------

    async def _handle_text_message(
        self, client: ClientState, msg: dict[str, Any]
    ) -> None:
        msg_type: str = msg.get("type", "")
        payload: dict[str, Any] = msg.get("payload", {})

        if msg_type == "client/time":
            await self._handle_client_time(client, payload)
        elif msg_type == "client/state":
            self._handle_client_state(client, payload)
        elif msg_type == "client/command":
            await self._handle_client_command(client, payload)
        elif msg_type == "client/goodbye":
            logger.info("Client %s said goodbye: %s", client.client_id, payload.get("reason"))
        elif msg_type == "stream/request-format":
            await self._handle_stream_request_format(client, payload)
        else:
            logger.debug("Unhandled message type from %s: %s", client.client_id, msg_type)

    async def _handle_client_time(
        self, client: ClientState, payload: dict[str, Any]
    ) -> None:
        client_transmitted: int = payload.get("client_transmitted", 0)
        server_received = server_time_us()
        server_transmitted = server_time_us()
        await self._send(
            client,
            {
                "type": "server/time",
                "payload": {
                    "client_transmitted": client_transmitted,
                    "server_received": server_received,
                    "server_transmitted": server_transmitted,
                },
            },
        )

    def _handle_client_state(self, client: ClientState, payload: dict[str, Any]) -> None:
        player_state = payload.get("player")
        if player_state and client.has_player:
            if "volume" in player_state:
                client.volume = int(player_state["volume"])
            if "muted" in player_state:
                client.muted = bool(player_state["muted"])

    async def _handle_client_command(
        self, client: ClientState, payload: dict[str, Any]
    ) -> None:
        controller = payload.get("controller")
        if controller and client.has_controller:
            cmd = controller.get("command")
            logger.debug("Controller command from %s: %s", client.client_id, cmd)
            # For a silent-stream image server, most commands are no-ops
            # but we acknowledge volume/mute by updating state and echoing back
            if cmd == "volume":
                vol = int(controller.get("volume", 100))
                for c in self._clients.values():
                    if c.has_player:
                        c.volume = vol
            elif cmd == "mute":
                muted = bool(controller.get("mute", False))
                for c in self._clients.values():
                    if c.has_player:
                        c.muted = muted

    async def _handle_stream_request_format(
        self, client: ClientState, payload: dict[str, Any]
    ) -> None:
        # For player format requests we just re-send the same PCM config
        # For artwork format requests we update channel config
        aw_req = payload.get("artwork")
        if aw_req and client.has_artwork:
            ch_idx: int = int(aw_req.get("channel", 0))
            if 0 <= ch_idx < len(client.artwork_channels):
                ch = client.artwork_channels[ch_idx]
                if "source" in aw_req:
                    ch.source = aw_req["source"]
                if "format" in aw_req:
                    ch.format = aw_req["format"]
                if "media_width" in aw_req:
                    ch.media_width = int(aw_req["media_width"])
                if "media_height" in aw_req:
                     ch.media_height = int(aw_req["media_height"])

        await self._send_stream_start(client)

        # Per spec: after stream/start in response to stream/request-format, send immediate artwork update
        if client.has_artwork and self._last_image is not None:
            try:
                await push_image_to_client(client, self._last_image, self._last_image_channel)
            except Exception as exc:
                logger.warning(
                    "Failed to push cached image after format request for %s: %s",
                    client.client_id,
                    exc,
                )
