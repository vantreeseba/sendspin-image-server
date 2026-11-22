"""Encode an image so that it fits the byte budget of the client it is for."""

from __future__ import annotations

import io
from collections.abc import Callable, Iterator
from dataclasses import dataclass

from PIL import Image

from sendspin_image_server.defaults import IMAGE_ENCODING_DEFAULTS
from sendspin_image_server.dither import encode_pil

# Pillow's value for 4:2:0 chroma subsampling.
_SUBSAMPLING_420 = 2


@dataclass(frozen=True)
class FittedImage:
    """The encoding chosen for a budget, or the smallest one tried if none fit."""

    data: bytes
    fits: bool
    step: str


def encode_to_budget(
    image: Image.Image,
    image_format: str,
    max_bytes: int,
    coarser_dither: Callable[[int], Image.Image] | None = None,
) -> FittedImage:
    """Encode `image`, reducing it step by step until it is at most `max_bytes`.

    `coarser_dither` redraws a dithered image with dots of a given size in pixels.
    BMP has no compression to reduce and is only declared by legacy clients, so
    it is exempt from the budget.
    """
    normalized_format = image_format.upper()
    if normalized_format == "BMP":
        return FittedImage(encode_pil(image, normalized_format), fits=True, step="bmp")

    steps = (
        _jpeg_steps(image)
        if normalized_format == "JPEG"
        else _png_steps(image, coarser_dither)
    )
    smallest: FittedImage | None = None
    for step, data in steps:
        if len(data) <= max_bytes:
            return FittedImage(data, fits=True, step=step)
        if smallest is None or len(data) < len(smallest.data):
            smallest = FittedImage(data, fits=False, step=step)
    assert smallest is not None
    return smallest


def _jpeg_steps(image: Image.Image) -> Iterator[tuple[str, bytes]]:
    yield f"jpeg q{IMAGE_ENCODING_DEFAULTS.jpeg_quality}", encode_pil(image, "JPEG")
    for quality in IMAGE_ENCODING_DEFAULTS.jpeg_fallback_qualities:
        buffer = io.BytesIO()
        image.save(
            buffer,
            format="JPEG",
            quality=quality,
            subsampling=_SUBSAMPLING_420,
            optimize=True,
        )
        yield f"jpeg q{quality} 4:2:0", buffer.getvalue()


def _png_steps(
    image: Image.Image, coarser_dither: Callable[[int], Image.Image] | None
) -> Iterator[tuple[str, bytes]]:
    yield "png", encode_pil(image, "PNG")
    if coarser_dither is not None:
        for dot_size in IMAGE_ENCODING_DEFAULTS.dither_dot_sizes:
            yield f"png {dot_size}px dither", encode_pil(coarser_dither(dot_size), "PNG")
        return
    for color_count in IMAGE_ENCODING_DEFAULTS.png_color_counts:
        reduced = image.quantize(colors=color_count, dither=Image.Dither.NONE)
        buffer = io.BytesIO()
        reduced.save(buffer, format="PNG", optimize=True)
        yield f"png {color_count} colors", buffer.getvalue()
