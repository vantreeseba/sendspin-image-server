"""Artwork push logic."""

from __future__ import annotations

import asyncio
import io
import logging
import struct

from PIL import Image

from sendspin_image_server.client import ClientState, server_time_us
from sendspin_image_server.dither import DitheringAlgo, encode_pil, floyd_steinberg_e6

logger = logging.getLogger(__name__)

# Binary message type bytes
MSG_TYPE_ARTWORK_CH0 = 0x08
MSG_TYPE_ARTWORK_CH1 = 0x09
MSG_TYPE_ARTWORK_CH2 = 0x0A
MSG_TYPE_ARTWORK_CH3 = 0x0B


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


def _resize_for_channel(
    image_bytes: bytes, max_width: int, max_height: int
) -> bytes:
    """Resize image to exactly max_width × max_height, centered with white bars.

    The source image is scaled as large as possible while preserving aspect
    ratio, then centered on a white canvas of exactly max_width × max_height.
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
    dither_algo: DitheringAlgo = "floyd-steinberg",
) -> None:
    """Send an artwork binary message to a single client.

    Per the Sendspin spec, the image is resized to fit within the dimensions
    the client declared in client/hello (or updated via stream/request-format).

    If the client's artwork channel has format 'e6-dithered', or if
    *force_e6_dither* is True, dithering to the six-color ACeP palette is
    applied after resizing (always post-resize, never before).
    """
    loop = asyncio.get_event_loop()

    if 0 <= channel < len(client.artwork_channels):
        ch = client.artwork_channels[channel]

        # Resize to the client's requested dimensions (only if declared)
        if ch.media_width is not None and ch.media_height is not None:
            image_bytes = await loop.run_in_executor(
                None, _resize_for_channel, image_bytes, ch.media_width, ch.media_height
            )

        # Determine output format from the channel's declared format.
        # 'e6-dithered' is a processing directive, not a container format;
        # it encodes the result as JPEG.  Unknown values fall back to JPEG.
        fmt_map = {"jpeg": "JPEG", "png": "PNG", "bmp": "BMP", "e6-dithered": "JPEG"}
        output_format = fmt_map.get(ch.format.lower(), "JPEG")

        # Apply e6 dithering if requested by client or forced by caller
        if ch.wants_e6_dither or force_e6_dither:
            logger.debug(
                "Applying e6 dithering (%s) for client %s channel %d → %s",
                dither_algo, client.client_id, channel, output_format,
            )
            image_bytes = await loop.run_in_executor(
                None, floyd_steinberg_e6, image_bytes, dither_algo, output_format
            )
        else:
            # Re-encode to the client's requested format even without dithering
            def _reencode(data: bytes, fmt: str) -> bytes:
                from PIL import Image as _Image
                import io as _io
                img = _Image.open(_io.BytesIO(data)).convert("RGB")
                return encode_pil(img, fmt)

            image_bytes = await loop.run_in_executor(
                None, _reencode, image_bytes, output_format
            )

    ts = server_time_us()
    msg = build_artwork_message(channel, ts, image_bytes)
    await client.websocket.send(msg)
