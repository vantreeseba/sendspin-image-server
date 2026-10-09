"""Regression test: our default dithering against Waveshare's own.

The reference is a port of ``ImgDecode_DitherRgb888`` from Waveshare's
PhotoPainter firmware (waveshareteam/ESP32-S3-PhotoPainter, imgdecode_app.cpp):
Floyd-Steinberg against the six pure colours, nearest colour by RGB distance.

We do NOT require pixel-exact agreement — the two round the diffused error
differently, which shifts the dot pattern — but we do require:
  1. Only Spectra 6 palette colours in the output
  2. Each colour's share of the pixels within TOLERANCE of the reference
"""

from __future__ import annotations

import numpy as np
import pytest
from PIL import Image

from sendspin_image_server.dither import E6_PALETTE_RGB, _floyd_steinberg

WIDTH, HEIGHT = 120, 200
TOLERANCE = 0.02  # a colour's share may differ by up to 2 % of all pixels

# In the order of the PALETTE table in imgdecode_app.cpp.
WAVESHARE_PALETTE = [
    (0, 0, 0),
    (255, 255, 255),
    (255, 0, 0),
    (0, 255, 0),
    (0, 0, 255),
    (255, 255, 0),
]


def _waveshare_dither(img: Image.Image) -> np.ndarray:
    """Dither as ImgDecode_DitherRgb888 does; C division truncates toward zero."""
    work = np.array(img).astype(int).tolist()
    height, width = len(work), len(work[0])
    out = np.zeros((height, width, 3), dtype=np.uint8)

    def spread(y: int, x: int, error: list[int], weight: int) -> None:
        pixel = work[y][x]
        for channel in range(3):
            pixel[channel] = max(0, min(255, pixel[channel] + int(error[channel] * weight / 16)))

    for y in range(height):
        for x in range(width):
            r, g, b = work[y][x]
            nearest = min(
                WAVESHARE_PALETTE,
                key=lambda c: (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2,
            )
            out[y, x] = nearest
            error = [r - nearest[0], g - nearest[1], b - nearest[2]]
            if x + 1 < width:
                spread(y, x + 1, error, 7)
            if y + 1 < height:
                if x > 0:
                    spread(y + 1, x - 1, error, 3)
                spread(y + 1, x, error, 5)
                if x + 1 < width:
                    spread(y + 1, x + 1, error, 1)
    return out


def _share(pixels: np.ndarray, color: tuple[int, int, int]) -> float:
    return float((pixels == color).all(-1).mean())


@pytest.fixture(scope="module")
def source(photo: Image.Image) -> Image.Image:
    return photo.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)


@pytest.fixture(scope="module")
def reference(source: Image.Image) -> np.ndarray:
    return _waveshare_dither(source)


@pytest.fixture(scope="module")
def dithered(source: Image.Image) -> np.ndarray:
    return np.array(_floyd_steinberg(source, "e6"))


class TestReferenceOutput:
    def test_waveshare_palette_is_our_e6_palette(self):
        assert set(WAVESHARE_PALETTE) == set(E6_PALETTE_RGB)

    def test_only_palette_colours_in_output(self, dithered: np.ndarray):
        unique = {tuple(px) for px in dithered.reshape(-1, 3).tolist()}

        assert unique <= set(E6_PALETTE_RGB)

    def test_reference_uses_every_colour(self, reference: np.ndarray):
        for color in E6_PALETTE_RGB:
            assert _share(reference, color) > 0.02

    def test_colour_distribution_close_to_reference(
        self, dithered: np.ndarray, reference: np.ndarray
    ):
        shares = {c: (_share(dithered, c), _share(reference, c)) for c in E6_PALETTE_RGB}
        off = {c: pair for c, pair in shares.items() if abs(pair[0] - pair[1]) > TOLERANCE}

        assert not off, f"(ours, waveshare) shares differ by more than {TOLERANCE:.0%}: {off}"
