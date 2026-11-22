"""Tunable values, grouped by the concept they tune."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ImageEncodingSettings:
    """How images are encoded, and how far they are reduced to fit a client."""

    # Largest image a client is sent, in bytes. Matches sendspin-cpp's default of 128 KiB.
    max_image_bytes: int = 131072
    # JPEG quality tried first, at full chroma resolution.
    jpeg_quality: int = 95
    # JPEG qualities tried in order, with 4:2:0 chroma, when the first is too large.
    jpeg_fallback_qualities: tuple[int, ...] = (85, 75, 60, 50, 40, 30, 20, 10)
    # Palette sizes tried in order for an undithered PNG that is too large.
    png_color_counts: tuple[int, ...] = (256, 64, 16)
    # How many panel pixels wide each dither dot is, tried in order for a dithered PNG.
    dither_dot_sizes: tuple[int, ...] = (2, 4)


IMAGE_ENCODING_DEFAULTS = ImageEncodingSettings()
