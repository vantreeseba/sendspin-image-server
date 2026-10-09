"""Artwork push logic."""

from __future__ import annotations

import asyncio
import io
import logging

from PIL import Image

from sendspin_image_server.client import ClientState
from sendspin_image_server.dither import (
    DitheringAlgo,
    DitheringPalette,
    dither_to_bytes,
    encode_pil,
)

logger = logging.getLogger(__name__)

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
    scaled = src_rgb.resize((scaled_w, scaled_h), Image.Resampling.LANCZOS)

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
    dither_palette: DitheringPalette = "e6",
) -> bytes | None:
    """Send an image to one artwork channel of a single client.

    The image is resized to the exact dimensions the client declared for the
    channel and encoded in the channel's format. If *force_e6_dither* is True,
    dithering to the chosen palette is applied after resizing (always
    post-resize, never before).

    Returns the encoded bytes handed to the client, or None if the client is
    not streaming `channel`.
    """
    ch = next((c for c in client.artwork_channels if c.channel_index == channel), None)
    if ch is None:
        logger.debug(
            "Client %s is not streaming channel %d, returning", client.client_id, channel
        )
        return None

    loop = asyncio.get_event_loop()

    if ch.width is not None and ch.height is not None:
        image_bytes = await loop.run_in_executor(
            None, _resize_for_channel, image_bytes, ch.width, ch.height
        )

    # Unknown values fall back to JPEG. 'bmp' was dropped from the spec but
    # older clients may still declare it.
    fmt_map = {"jpeg": "JPEG", "png": "PNG", "bmp": "BMP"}
    output_format = fmt_map.get(ch.format.lower(), "JPEG")

    if force_e6_dither:
        logger.debug(
            "Applying dithering (algo=%s, palette=%s) for client %s channel %d → %s",
            dither_algo, dither_palette, client.client_id, channel, output_format,
        )
        image_bytes = await loop.run_in_executor(
            None, dither_to_bytes, image_bytes, dither_algo, output_format, dither_palette
        )
    else:
        # Re-encode to the client's requested format even without dithering
        def _reencode(data: bytes, fmt: str) -> bytes:
            img = Image.open(io.BytesIO(data)).convert("RGB")
            return encode_pil(img, fmt)

        image_bytes = await loop.run_in_executor(
            None, _reencode, image_bytes, output_format
        )

    # aiosendspin frames the image for the wire the client speaks.
    client.send_artwork(channel, image_bytes)
    return image_bytes
