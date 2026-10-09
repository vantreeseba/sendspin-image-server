"""Core Sendspin server: an aiosendspin server that only serves artwork."""

from __future__ import annotations

import asyncio
import logging
import os
import time
from collections.abc import Callable, Coroutine
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any

from aiosendspin.models.types import ConnectionReason
from aiosendspin.noise.keys import Identity
from aiosendspin.noise.trust_store import (
    FileServerPairingStore,
    InMemoryServerPairingStore,
    ServerPairingStore,
)
from aiosendspin.server import (
    ClientConnectedEvent,
    ClientDisconnectedEvent,
    ClientRemovedEvent,
    GroupEvent,
    GroupRoleEvent,
    SendspinClient,
    SendspinEvent,
    SendspinGroup,
    SendspinServer,
)
from aiosendspin.server.roles.artwork import (
    ArtworkGroupRole,
    ArtworkRoleProtocol,
    ArtworkV1Role,
)
from aiosendspin.server.roles.metadata import Metadata, MetadataGroupRole
from aiosendspin.server.roles.registry import register_group_role, register_role

from sendspin_image_server.client import ClientState
from sendspin_image_server.dither import DitheringAlgo, DitheringPalette
from sendspin_image_server.stream import (
    push_image_to_client,
)

if TYPE_CHECKING:
    from aiosendspin.models.core import ClientStatePayload

    from sendspin_image_server.registry import EndpointRegistry

logger = logging.getLogger(__name__)

# Files kept in the data directory so the server keeps its id, and the clients
# it has paired with or approved, across restarts.
IDENTITY_FILE = "sendspin_identity.key"
PAIRING_FILE = "sendspin_pairing.json"


@dataclass
class ArtworkStreamStartedEvent(GroupRoleEvent):
    """A client's artwork stream started, or restarted with new channels."""

    role: ArtworkRoleProtocol


class ImageArtworkGroupRole(ArtworkGroupRole):
    """Group artwork role that leaves the choice of image to this server.

    The stock role answers every stream start with the group's current artwork,
    or a clear when it has none. Images here are resized and dithered per
    client, so the group never holds one: report the stream start and let
    `SendspinImageServer` push instead of blanking the display.
    """

    def send_current_artwork(self, role: ArtworkRoleProtocol) -> None:
        """Report the stream instead of replaying group artwork."""
        self.emit_group_event(ArtworkStreamStartedEvent(role=role))


class ImageArtworkRole(ArtworkV1Role):
    """Artwork role that starts a hello-declared stream a second time.

    A client that declares its channels in its hello is sent stream/start
    straight after the server's hello. sendspin-cpp takes that in before it
    has let go of the server it was connected to, and letting go resets its
    artwork stream: every image after that is dropped. Its first client/state
    is sent once the switch is done, so start the stream again then.
    """

    def __init__(self, client: SendspinClient | None = None) -> None:
        """Initialize the role, with no client/state seen yet."""
        super().__init__(client)
        self._state_seen = False

    def on_disconnect(self) -> None:
        """Forget the client/state along with the stream."""
        super().on_disconnect()
        self._state_seen = False

    def on_client_state(self, payload: ClientStatePayload) -> None:
        """Restart a hello-declared stream on the connection's first client/state."""
        super().on_client_state(payload)
        first_state = not self._state_seen
        self._state_seen = True
        if first_state and self._stream_started and self._client.info.artwork_support is not None:
            self._start_stream()


register_group_role("artwork", ImageArtworkGroupRole)
register_role("artwork@v1", lambda client: ImageArtworkRole(client=client))


def _load_identity(data_dir: Path | None) -> Identity:
    """Return the server's identity, creating and saving one on first run."""
    if data_dir is None:
        logger.warning(
            "No data directory: the server id changes on every start, so clients "
            "that remember this server will not recognise it"
        )
        return Identity.generate()
    path = data_dir / IDENTITY_FILE
    if path.exists():
        return Identity.from_private_bytes(path.read_bytes())
    identity = Identity.generate()
    data_dir.mkdir(parents=True, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as fh:
        fh.write(identity.private_bytes)
    logger.info("Created server identity %s", path)
    return identity


class SendspinImageServer:
    """Sendspin server that pushes artwork to clients."""

    def __init__(
        self,
        server_name: str,
        data_dir: Path | None = None,
        *,
        allow_unencrypted: bool = True,
        trust_unpaired: bool = True,
    ) -> None:
        self._server_name = server_name
        self._data_dir = data_dir
        self._allow_unencrypted = allow_unencrypted
        self._trust_unpaired = trust_unpaired
        self._sendspin: SendspinServer | None = None
        self._unsubscribe: Callable[[], None] | None = None
        self._clients: dict[str, ClientState] = {}
        # client_id → the connection its ClientState was built for
        self._connections: dict[str, object] = {}
        # client_ids already reported to the registry for their current connection
        self._announced: set[str] = set()
        # client_id → (group, unsubscribe) for the group we listen to for stream starts
        self._group_listeners: dict[str, tuple[SendspinGroup, Callable[[], None]]] = {}
        self._tasks: set[asyncio.Task[None]] = set()
        self._last_image: dict[str | None, bytes | None] = {None: None}
        self._last_image_channel: int = 0
        # client_id → when its last image was sent (epoch seconds)
        self._last_image_at: dict[str, float] = {}
        # url → url: all URLs we are tracking (discovered via mDNS or connect_to_client)
        self._discovered_clients: dict[str, str] = {}
        # url → mDNS instance name (e.g. "photo-frame-2")
        self._discovered_client_names: dict[str, str] = {}
        # Optional back-reference to the registry — set by cli.py after both are created
        self._registry: EndpointRegistry | None = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @property
    def server_id(self) -> str | None:
        """The server's id (its public key), or None before `start()`."""
        return self._sendspin.id if self._sendspin is not None else None

    @property
    def last_image(self) -> bytes | None:
        """The most recently broadcast image bytes (global buffer), or None if none sent yet."""
        return self._last_image.get(None)

    def last_image_for(self, client_id: str) -> bytes | None:
        """Return the most recent image pushed to `client_id`, or None if none yet."""
        return self._last_image.get(client_id)

    def record_last_image(self, client_id: str, image_bytes: bytes) -> None:
        """Remember the last image pushed to `client_id` for the debug endpoints."""
        self._last_image[client_id] = image_bytes
        self._last_image_at[client_id] = time.time()

    def last_image_sent_at(self, client_id: str) -> float | None:
        """Return when the last image was pushed to `client_id` (epoch seconds), or None."""
        return self._last_image_at.get(client_id)

    def client_id_for_url(self, url: str) -> str | None:
        """Return the client_id learned for an outbound `url`, or None if not handshaked."""
        if self._sendspin is None:
            return None
        return self._sendspin.get_client_id_for_url(url)

    @property
    def clients(self) -> dict[str, ClientState]:
        """Read-only view of currently connected clients."""
        if self._sendspin is not None:
            # Roles are activated after the connection is reported, and again
            # once an unpaired client is approved.
            for client_id, state in self._clients.items():
                client = self._sendspin.get_client(client_id)
                if client is not None:
                    state.active_roles = client.active_role_ids
        return self._clients

    @property
    def registry(self) -> EndpointRegistry | None:
        """The endpoint registry, if wired up."""
        return self._registry

    @registry.setter
    def registry(self, value: EndpointRegistry) -> None:
        self._registry = value

    async def start(self, host: str = "0.0.0.0", port: int = 8927) -> None:
        """Start the Sendspin server and advertise it over mDNS."""
        identity = _load_identity(self._data_dir)
        pairing_store: ServerPairingStore
        if self._data_dir is not None:
            pairing_store = await FileServerPairingStore.open(self._data_dir / PAIRING_FILE)
        else:
            pairing_store = InMemoryServerPairingStore()
        self._sendspin = SendspinServer(
            asyncio.get_running_loop(),
            identity,
            self._server_name,
            pairing_store=pairing_store,
            allow_unencrypted=self._allow_unencrypted,
        )
        self._unsubscribe = self._sendspin.add_event_listener(self._on_server_event)
        # Clients are discovered by MDNSDiscovery, which also tells us when one
        # announces itself again or goes away.
        await self._sendspin.start_server(port=port, host=host, discover_clients=False)
        logger.info(
            "Sendspin server %s listening on ws://%s:%d/sendspin", self._sendspin.id, host, port
        )

    async def stop(self) -> None:
        """Stop the server and all outbound connections."""
        for task in list(self._tasks):
            task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)
        for _group, unsubscribe in self._group_listeners.values():
            unsubscribe()
        self._group_listeners.clear()
        if self._unsubscribe is not None:
            self._unsubscribe()
            self._unsubscribe = None
        if self._sendspin is not None:
            await self._sendspin.close()

    def connect_to_client(self, url: str, mdns_name: str | None = None) -> None:
        """Start a persistent server-initiated connection to a client URL.

        The connection is maintained automatically: if the client disconnects
        it is retried with exponential backoff, unless the client said goodbye
        for good (e.g. it moved to another server).

        Calling this again for a URL that is already managed retries it right
        away instead of waiting out the backoff, which is how a battery device
        announcing itself after deep sleep gets picked up inside its short
        awake window.

        A locked client is asked to switch to this server even if another one
        already has it.
        """
        reason = (
            ConnectionReason.PLAYBACK if self._is_locked_url(url) else ConnectionReason.DISCOVERY
        )
        self._dial(url, reason)
        if mdns_name:
            self._discovered_client_names[url] = mdns_name

    def _is_locked_url(self, url: str) -> bool:
        """Whether `url` is the last-known address of a locked client."""
        if self._registry is None:
            return False
        return any(url == locked for _, locked in self._registry.locked_clients_with_urls())

    def reconnect_to_client(self, url: str, connection_reason: str = "discovery") -> None:
        """Dial `url` now, also after it stopped retrying.

        Useful for forcing a retry after a permanent disconnect (e.g. an
        'another_server' goodbye). `connection_reason` "playback" asks the
        client to switch to this server even if it is busy with another one.
        """
        reason = (
            ConnectionReason.PLAYBACK
            if connection_reason == "playback"
            else ConnectionReason.DISCOVERY
        )
        self._dial(url, reason)

    def _dial(self, url: str, reason: ConnectionReason) -> None:
        self._discovered_clients[url] = url
        if self._sendspin is None:
            logger.warning("Cannot connect to %s: server not started", url)
            return
        self._sendspin.connect_to_client(
            url, connection_reason=reason, retry_initial_connection=True
        )
        logger.info("Connecting to %s (%s)", url, reason.value)

    def disconnect_from_client(self, url: str) -> None:
        """Stop the outbound connection for a URL (client disappeared from mDNS)."""
        if self._sendspin is not None:
            self._sendspin.disconnect_from_client(url)
        self._discovered_clients.pop(url, None)
        self._discovered_client_names.pop(url, None)

    def get_discovered_urls(self) -> list[dict[str, str | None]]:
        """Return all tracked URLs with their known client_id and mDNS name (if any)."""
        return [
            {
                "url": url,
                "client_id": self.client_id_for_url(url),
                "mdns_name": self._discovered_client_names.get(url),
            }
            for url in self._discovered_clients
        ]

    async def broadcast_image(
        self,
        image_bytes: bytes,
        channel: int = 0,
        *,
        force_e6_dither: bool = False,
        dither_algo: DitheringAlgo = "floyd-steinberg",
        dither_palette: DitheringPalette = "e6",
    ) -> None:
        """Push an image to all connected artwork clients.

        *force_e6_dither* applies dithering to every client. *dither_algo*
        selects the algorithm and *dither_palette* selects the colour palette
        used. Dithering always happens after per-client resizing.
        """
        self._last_image[None] = image_bytes
        self._last_image_channel = channel
        artwork_clients = [c for c in self.clients.values() if c.has_artwork and c.stream_started]
        if not artwork_clients:
            logger.debug("No artwork clients connected, image not sent")
            return
        results = await asyncio.gather(
            *(
                push_image_to_client(
                    c, image_bytes, channel,
                    force_e6_dither=force_e6_dither,
                    dither_algo=dither_algo,
                    dither_palette=dither_palette,
                )
                for c in artwork_clients
            ),
            return_exceptions=True,
        )
        # Track post-dither message bytes per client for debug endpoints
        for client, result in zip(artwork_clients, results, strict=False):
            if isinstance(result, BaseException):
                logger.warning("Failed to push image to %s: %s", client.client_id, result)
            elif result is not None:
                self.record_last_image(client.client_id, result)

    # ------------------------------------------------------------------
    # aiosendspin events
    # ------------------------------------------------------------------

    def _on_server_event(self, server: SendspinServer, event: SendspinEvent) -> None:
        if isinstance(event, ClientConnectedEvent):
            client = server.get_client(event.client_id)
            if client is not None:
                self._track_connection(client)
        elif isinstance(event, ClientDisconnectedEvent):
            self._forget_connection(event.client_id)
        elif isinstance(event, ClientRemovedEvent):
            listener = self._group_listeners.pop(event.client_id, None)
            if listener is not None:
                listener[1]()

    def _on_group_event(self, group: SendspinGroup, event: GroupEvent) -> None:
        if isinstance(event, ArtworkStreamStartedEvent):
            # A client that declares its channels in its hello starts its
            # stream while its roles are still being attached, so look at it
            # once that is done.
            asyncio.get_running_loop().call_soon(
                self._on_artwork_stream_started, group, event.role
            )

    def _track_connection(self, client: SendspinClient) -> None:
        """Set up state for a client's current connection, once per connection."""
        client_id = client.client_id
        connection = client.connection
        if connection is None:
            return
        self._listen_to_group(client)
        if self._connections.get(client_id) is connection:
            return
        self._connections[client_id] = connection
        self._announced.discard(client_id)
        self._clients[client_id] = self._new_state(client, None)
        logger.info(
            "Client connected: %s (%s)%s",
            client.name,
            client_id,
            "" if connection.is_encrypted else " [unencrypted]",
        )

        if self._registry is not None and self._sendspin is not None:
            self._registry.ensure_client(
                client_id, name=client.name, url=self._sendspin.get_client_url(client_id)
            )

        metadata = client.group.group_role("metadata")
        if isinstance(metadata, MetadataGroupRole) and metadata.metadata is None:
            metadata.set_metadata(
                Metadata(
                    title="Image Server", track_progress=0, track_duration=0, playback_speed=1000
                )
            )

        # Only encrypted clients have an identity worth approving; an
        # unencrypted one can claim any id.
        if connection.is_encrypted and not client.is_paired:
            if not client.info.unpaired_access.enabled:
                logger.warning(
                    "Client %s (%s) only accepts paired servers and this server cannot "
                    "pair yet; enable unpaired access on the device to send it images",
                    client.name,
                    client_id,
                )
            elif self._trust_unpaired:
                self._spawn(self._approve_unpaired(client_id))
            else:
                logger.warning(
                    "Client %s (%s) is not approved for unpaired access and "
                    "--no-trust-unpaired is set, so it gets no images",
                    client.name,
                    client_id,
                )

    async def _approve_unpaired(self, client_id: str) -> None:
        if self._sendspin is None:
            return
        if await self._sendspin.pairing_store.trusted_unpaired(client_id) is None:
            logger.info("Approving %s for unpaired access", client_id)
            await self._sendspin.trust_unpaired(client_id)

    def _listen_to_group(self, client: SendspinClient) -> None:
        group = client.group
        listener = self._group_listeners.get(client.client_id)
        if listener is not None:
            if listener[0] is group:
                return
            listener[1]()
        self._group_listeners[client.client_id] = (
            group,
            group.add_event_listener(self._on_group_event),
        )

    def _new_state(
        self, client: SendspinClient, artwork: ArtworkRoleProtocol | None
    ) -> ClientState:
        assert self._sendspin is not None
        return ClientState(
            client_id=client.client_id,
            name=client.name,
            active_roles=client.active_role_ids,
            artwork=artwork,
            clock=self._sendspin.clock.now_us,
        )

    def _on_artwork_stream_started(self, group: SendspinGroup, role: ArtworkRoleProtocol) -> None:
        if not role.get_channel_configs():
            # Joined the group before declaring any channels.
            return
        target: object = role
        client = next(
            (
                c
                for c in group.clients
                if any(r is target for r in c.roles_by_family("artwork"))
            ),
            None,
        )
        if client is None:
            return
        client_id = client.client_id
        self._track_connection(client)
        # A fresh state per stream: the feed loops serve a client they have not
        # seen before right away.
        state = self._new_state(client, role)
        self._clients[client_id] = state
        logger.info(
            "Artwork stream started for %s: %s",
            client_id,
            [(ch.format, ch.width, ch.height) for ch in state.artwork_channels],
        )

        if client_id not in self._announced:
            self._announced.add(client_id)
            if self._registry is not None:
                self._registry.client_connected(client_id)

        # Push the cached image so a newly connected client shows something
        # right away, unless an endpoint feeds it: the feed loop does that
        # with the client's own dither settings.
        last_image = self._last_image.get(None)
        if last_image is not None and not self._served_by_endpoint(client_id):
            self._spawn(self._push_cached(state, last_image))

    async def _push_cached(self, state: ClientState, image_bytes: bytes) -> None:
        try:
            await push_image_to_client(state, image_bytes, self._last_image_channel)
        except Exception:
            logger.exception("Failed to push cached image to %s", state.client_id)

    def _forget_connection(self, client_id: str) -> None:
        self._connections.pop(client_id, None)
        self._announced.discard(client_id)
        if self._clients.pop(client_id, None) is None:
            return
        logger.info("Client disconnected: %s", client_id)
        if self._registry is not None:
            self._registry.client_disconnected(client_id)

    def _served_by_endpoint(self, client_id: str) -> bool:
        """Return True if an endpoint's feed loop is responsible for this client."""
        return (
            self._registry is not None
            and self._registry.effective_endpoint_id(client_id) is not None
        )

    def _spawn(self, coro: Coroutine[Any, Any, None]) -> None:
        task = asyncio.get_running_loop().create_task(coro)
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
