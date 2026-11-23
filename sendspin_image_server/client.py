"""Per-client connection state."""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from sendspin_image_server.defaults import IMAGE_ENCODING_DEFAULTS

if TYPE_CHECKING:
    from aiosendspin.server.roles.artwork import ArtworkRoleProtocol

logger = logging.getLogger(__name__)

ROLE_ARTWORK = "artwork@v1"
ROLE_METADATA = "metadata@v1"


@dataclass
class ArtworkChannel:
    """One artwork channel a client is currently streaming.

    `width` and `height` are the exact size the client declared for the
    delivered image. channel_index is the channel number (0-3).
    """

    source: str = "album"
    format: str = "jpeg"
    width: int | None = None
    height: int | None = None
    channel_index: int = field(default=0, repr=False)


@dataclass(frozen=True)
class ImageDelivery:
    """The outcome of the last image encoded for a client."""

    # Encoded size in bytes: the image sent, or the smallest attempt if none fit.
    size_bytes: int
    delivered: bool


@dataclass(frozen=True)
class BlockedClient:
    """A client the server refuses to dial or keep connected."""

    client_id: str
    name: str
    url: str | None = None
    mdns_name: str | None = None

    def matches_address(self, url: str, mdns_name: str | None = None) -> bool:
        """Whether a discovered address is this client.

        The mDNS name wins when both sides have one, because a different
        device can later be given this client's IP address.
        """
        if self.mdns_name is not None and mdns_name is not None:
            return self.mdns_name == mdns_name
        return self.url == url


def server_time_us() -> int:
    """Return current server monotonic time in microseconds."""
    return int(time.monotonic() * 1_000_000)


@dataclass(eq=False)
class ClientState:
    """A connected Sendspin client, as the image pipeline sees it.

    One instance lives for one artwork stream: a client that reconnects, or
    whose stream is restarted with a new configuration, gets a fresh one, which
    is how the feed loops tell that it is due an image right away.
    """

    client_id: str
    name: str
    active_roles: list[str] = field(default_factory=list)
    # The client's artwork role, once aiosendspin has started its stream.
    artwork: ArtworkRoleProtocol | None = field(default=None, repr=False)
    # Server clock the artwork timestamps are taken from.
    clock: Callable[[], int] = field(default=server_time_us, repr=False)
    # Largest image this client is sent, in bytes.
    max_image_bytes: int = IMAGE_ENCODING_DEFAULTS.max_image_bytes
    last_delivery: ImageDelivery | None = None

    @property
    def artwork_channels(self) -> list[ArtworkChannel]:
        """The channels currently streamed to this client, by channel number."""
        if self.artwork is None:
            return []
        return [
            ArtworkChannel(
                source=config.source.value,
                format=config.format.value if config.format is not None else "jpeg",
                width=config.width,
                height=config.height,
                channel_index=channel,
            )
            for channel, config in sorted(self.artwork.get_channel_configs().items())
        ]

    @property
    def stream_started(self) -> bool:
        """Return True once the client streams at least one artwork channel."""
        return bool(self.artwork is not None and self.artwork.get_channel_configs())

    @property
    def has_artwork(self) -> bool:
        """Return True if this client has the artwork role active."""
        return ROLE_ARTWORK in self.active_roles

    @property
    def has_metadata(self) -> bool:
        """Return True if this client has the metadata role active."""
        return ROLE_METADATA in self.active_roles

    def send_artwork(self, channel: int, image_bytes: bytes) -> None:
        """Queue an encoded image for display on `channel` now."""
        if self.artwork is not None:
            self.artwork.send_artwork(channel, image_bytes, self.clock())
