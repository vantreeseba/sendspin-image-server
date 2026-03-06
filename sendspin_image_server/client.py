"""Per-client connection state and message handling."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import websockets

logger = logging.getLogger(__name__)

ROLE_ARTWORK = "artwork@v1"
ROLE_METADATA = "metadata@v1"

SUPPORTED_ROLES = {ROLE_ARTWORK, ROLE_METADATA}


@dataclass
class ArtworkChannel:
    """Artwork channel configuration from client hello.

    Supported format values (in addition to the standard 'jpeg', 'png', 'bmp'):
      'e6-dithered' — server applies Floyd-Steinberg dithering to the six-color
                      ACeP e-Paper palette before sending the image.

    _raw_width/_raw_height store the dimensions as declared by the client;
    media_width/media_height store the effective dimensions after any server
    overrides are applied.  _channel_index is the position in the channels array.
    """

    source: str = "album"
    format: str = "jpeg"
    media_width: int | None = None
    media_height: int | None = None
    _channel_index: int = field(default=0, repr=False)

    @property
    def wants_e6_dither(self) -> bool:
        """Return True if this channel has requested e6-dithered output."""
        return self.format == "e6-dithered"


@dataclass
class ClientState:
    """Mutable state for a connected Sendspin client."""

    client_id: str
    name: str
    websocket: websockets.ServerConnection
    active_roles: list[str] = field(default_factory=list)
    artwork_channels: list[ArtworkChannel] = field(default_factory=list)
    stream_started: bool = False

    @property
    def has_artwork(self) -> bool:
        """Return True if this client has the artwork role active."""
        return ROLE_ARTWORK in self.active_roles

    @property
    def has_metadata(self) -> bool:
        """Return True if this client has the metadata role active."""
        return ROLE_METADATA in self.active_roles


def server_time_us() -> int:
    """Return current server monotonic time in microseconds."""
    return int(time.monotonic() * 1_000_000)
