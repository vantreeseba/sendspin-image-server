"""Audio stream (silence) and artwork push logic."""

from __future__ import annotations

import asyncio
import io
import logging
import struct
from typing import TYPE_CHECKING

from PIL import Image

from sendspin_image_server.client import ClientState, server_time_us
from sendspin_image_server.dither import floyd_steinberg_e6

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

# Binary message type bytes
MSG_TYPE_AUDIO = 0x04
MSG_TYPE_ARTWORK_CH0 = 0x08
MSG_TYPE_ARTWORK_CH1 = 0x09
MSG_TYPE_ARTWORK_CH2 = 0x0A
MSG_TYPE_ARTWORK_CH3 = 0x0B

# Silence frame interval in microseconds (20ms = typical opus frame)
SILENCE_INTERVAL_US = 20_000
# PCM silence: 20ms at 44100Hz stereo 16-bit = 20ms * 44100 * 2ch * 2bytes = 3528 bytes
PCM_SAMPLE_RATE = 44100
PCM_CHANNELS = 2
PCM_BIT_DEPTH = 16
PCM_FRAME_SAMPLES = int(PCM_SAMPLE_RATE * SILENCE_INTERVAL_US / 1_000_000)
PCM_SILENCE_FRAME = bytes(PCM_FRAME_SAMPLES * PCM_CHANNELS * (PCM_BIT_DEPTH // 8))


def build_audio_message(timestamp_us: int, audio_bytes: bytes = b"") -> bytes:
    """Build a binary audio message (type 4).

    Format: [0x04][8-byte big-endian int64 timestamp µs][audio bytes]
    """
    header = struct.pack(">Bq", MSG_TYPE_AUDIO, timestamp_us)
    return header + audio_bytes


def build_artwork_message(channel: int, timestamp_us: int, image_bytes: bytes) -> bytes:
    """Build a binary artwork message for the given channel (0-3).

    Format: [type][8-byte big-endian int64 timestamp µs][image bytes]
    Channel 0 = type 8, channel 1 = type 9, etc.
    """
    if channel < 0 or channel > 3:
        msg = f"Artwork channel must be 0-3, got {channel}"
        raise ValueError(msg)
    msg_type = MSG_TYPE_ARTWORK_CH0 + channel
    header = struct.pack(">Bq", msg_type, timestamp_us)
    return header + image_bytes


async def send_silence_frames(client: ClientState) -> None:
    """Continuously send silent PCM audio frames to a player client."""
    interval_s = SILENCE_INTERVAL_US / 1_000_000
    while True:
        ts = server_time_us()
        msg = build_audio_message(ts, PCM_SILENCE_FRAME)
        try:
            await client.websocket.send(msg)
        except Exception:
            logger.debug("Failed to send silence frame to %s", client.client_id)
            break
        await asyncio.sleep(interval_s)


def _resize_for_channel(
    image_bytes: bytes, max_width: int, max_height: int
) -> bytes:
    """Resize image to exactly max_width × max_height, centered with black bars.

    The source image is scaled as large as possible while preserving aspect
    ratio, then centered on a black canvas of exactly max_width × max_height.
    """
    src = Image.open(io.BytesIO(image_bytes))
    src.load()
    orig_w, orig_h = src.size
    orig_format = src.format or "JPEG"

    # Scale to fit inside target box (expand or shrink), preserving aspect ratio
    scale = min(max_width / orig_w, max_height / orig_h)
    scaled_w = round(orig_w * scale)
    scaled_h = round(orig_h * scale)

    src_rgb = src.convert("RGB")
    scaled = src_rgb.resize((scaled_w, scaled_h), Image.LANCZOS)

    # Center on black canvas — add 1 before // 2 so odd remainders round to
    # nearest rather than always flooring, keeping both sides as equal as possible
    canvas = Image.new("RGB", (max_width, max_height), (255, 255, 255))
    offset_x = (max_width - scaled_w) // 2
    offset_y = (max_height - scaled_h) // 2
    canvas.paste(scaled, (offset_x, offset_y))

    logger.info(
        "Resized %dx%d → %dx%d centered on %dx%d canvas (offsets %d,%d)",
        orig_w, orig_h, scaled_w, scaled_h, max_width, max_height, offset_x, offset_y,
    )

    out = io.BytesIO()
    save_kwargs: dict[str, object] = {}
    if orig_format.upper() == "JPEG":
        save_kwargs["quality"] = 95
        save_kwargs["subsampling"] = 0
    canvas.save(out, format=orig_format, **save_kwargs)
    return out.getvalue()


async def push_image_to_client(
    client: ClientState,
    image_bytes: bytes,
    channel: int = 0,
    *,
    force_e6_dither: bool = False,
) -> None:
    """Send an artwork binary message to a single client.

    Per the Sendspin spec, the image is resized to fit within the dimensions
    the client declared in client/hello (or updated via stream/request-format).

    If the client's artwork channel has format 'e6-dithered', or if
    *force_e6_dither* is True, Floyd-Steinberg dithering to the six-color ACeP
    palette is applied after resizing (always post-resize, never before).
    """
    loop = asyncio.get_event_loop()

    if 0 <= channel < len(client.artwork_channels):
        ch = client.artwork_channels[channel]

        # Resize to the client's requested dimensions (only if declared)
        if ch.media_width is not None and ch.media_height is not None:
            image_bytes = await loop.run_in_executor(
                None, _resize_for_channel, image_bytes, ch.media_width, ch.media_height
            )

        # Apply e6 dithering if requested by client or forced by caller
        if ch.wants_e6_dither or force_e6_dither:
            logger.debug("Applying e6 dithering for client %s channel %d", client.client_id, channel)
            image_bytes = await loop.run_in_executor(None, floyd_steinberg_e6, image_bytes)

    ts = server_time_us()
    msg = build_artwork_message(channel, ts, image_bytes)
    await client.websocket.send(msg)
