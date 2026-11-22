"""Artwork push logic."""

from __future__ import annotations

import asyncio
import io
import logging
from functools import partial

from PIL import Image

from sendspin_image_server.client import ClientState, ImageDelivery
from sendspin_image_server.dither import (
    DitheringAlgo,
    DitheringPalette,
    dither_to_pil,
)
from sendspin_image_server.encode import FittedImage, encode_to_budget

logger = logging.getLogger(__name__)

# Fast and lossless: this PNG is only an intermediate between resizing and dithering.
_INTERMEDIATE_PNG_COMPRESS_LEVEL = 1


def _resize_for_channel(
    image_bytes: bytes, max_width: int, max_height: int
) -> bytes:
    """Resize image to exactly max_width × max_height, centered with white bars.

    The source image is scaled as large as possible while preserving aspect
    ratio, then centered on a white canvas of exactly max_width × max_height.
    Returns a lossless PNG, so the final encode is the only lossy one.
    """
    src = Image.open(io.BytesIO(image_bytes))
    src.load()
    orig_w, orig_h = src.size

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
    canvas.save(out, format="PNG", compress_level=_INTERMEDIATE_PNG_COMPRESS_LEVEL)
    return out.getvalue()


def _dither_with_dot_size(
    image_bytes: bytes,
    algo: DitheringAlgo,
    palette: DitheringPalette,
    dot_size: int,
) -> Image.Image:
    """Dither at a lower resolution and scale back up, keeping size and palette."""
    src = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    reduced_size = (max(1, src.width // dot_size), max(1, src.height // dot_size))
    reduced = io.BytesIO()
    src.resize(reduced_size, Image.Resampling.LANCZOS).save(
        reduced, format="PNG", compress_level=_INTERMEDIATE_PNG_COMPRESS_LEVEL
    )
    dithered = dither_to_pil(reduced.getvalue(), algo, palette)
    return dithered.resize(src.size, Image.Resampling.NEAREST)


def _encode_for_channel(
    image_bytes: bytes,
    output_format: str,
    max_image_bytes: int,
    algo: DitheringAlgo,
    palette: DitheringPalette,
) -> FittedImage:
    """Dither if asked to, then encode to the channel's format within its budget."""
    image = dither_to_pil(image_bytes, algo, palette)
    reduces_to_palette = algo != "none" and palette != "none"
    coarser_dither = (
        partial(_dither_with_dot_size, image_bytes, algo, palette)
        if reduces_to_palette
        else None
    )
    return encode_to_budget(image, output_format, max_image_bytes, coarser_dither)


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
    channel, optionally dithered after resizing, and encoded in the channel's
    format within the client's byte budget.

    Returns the encoded bytes handed to the client, or None if the client is
    not streaming `channel` or no encoding fits its budget.
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

    fitted = await loop.run_in_executor(
        None,
        _encode_for_channel,
        image_bytes,
        output_format,
        client.max_image_bytes,
        dither_algo if force_e6_dither else "none",
        dither_palette,
    )
    client.last_delivery = ImageDelivery(size_bytes=len(fitted.data), delivered=fitted.fits)

    if not fitted.fits:
        logger.warning(
            "Not sending image to %s: smallest encoding (%s) is %d bytes, over its %d byte budget",
            client.client_id, fitted.step, len(fitted.data), client.max_image_bytes,
        )
        return None

    logger.debug(
        "Encoded image for %s channel %d as %s: %d bytes",
        client.client_id, channel, fitted.step, len(fitted.data),
    )
    # aiosendspin frames the image for the wire the client speaks.
    client.send_artwork(channel, fitted.data)
    return fitted.data
