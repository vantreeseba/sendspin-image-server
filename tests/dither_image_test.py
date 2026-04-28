"""Integration tests for dithering applied to images/test.jpg.

These tests verify that the full dithering pipeline produces output that
renders correctly on the Waveshare Spectra E6 display via ESPHome.

ESPHome's Waveshare ACeP driver uses a threshold decision tree (not
nearest-neighbour) to map each received pixel to an ink colour index.
A palette colour that falls in the wrong zone silently renders as the
wrong ink — which is why these tests exist.
"""

from __future__ import annotations

import io
import pathlib

import numpy as np
import pytest
from PIL import Image

from sendspin_image_server.dither import (
    DITHER_ALGOS,
    E6_PALETTE_RGB,
    E6_PALETTE_SET,
    dither_to_pil,
)

# ---------------------------------------------------------------------------
# Paths / constants
# ---------------------------------------------------------------------------

_IMAGES_DIR = pathlib.Path(__file__).parent.parent / "images"
TEST_IMAGE = _IMAGES_DIR / "test.jpg"

# PhotoPainter display resolution
DISPLAY_W, DISPLAY_H = 480, 800


# ---------------------------------------------------------------------------
# ESPHome ACeP threshold function (mirrors waveshare_epaper.cpp color_to_hex)
# ---------------------------------------------------------------------------

# Ink index constants (match ESPHome's EPD_COLOR_* values)
INK_BLACK  = 0
INK_WHITE  = 1
INK_GREEN  = 2
INK_BLUE   = 3
INK_RED    = 4
INK_YELLOW = 5
INK_ORANGE = 6  # absent from the 6-colour palette; any hit here is a bug


def esphome_ink_index(r: int, g: int, b: int) -> int:
    """Replicate ESPHome's Waveshare ACeP color_to_hex() threshold logic."""
    if r > 127:
        if g > 170 and b > 127:
            return INK_WHITE
        if g > 170:
            return INK_YELLOW
        if g > 85:
            return INK_ORANGE  # only in 7-colour displays
        return INK_RED
    # Low red
    if g > 127:
        return INK_BLUE if b > 127 else INK_GREEN
    if b > 127:
        return INK_BLUE
    return INK_BLACK


# Expected ink index for each of our 6 palette entries.
# Keyed by (R,G,B) tuple; computed from E6_PALETTE_RGB at import time so
# tests automatically reflect palette changes without needing manual updates.
PALETTE_INK: dict[tuple[int, int, int], int] = {
    (color[0], color[1], color[2]): esphome_ink_index(*color)
    for color in E6_PALETTE_RGB
}

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _load_as_jpeg(path: pathlib.Path, width: int, height: int) -> bytes:
    """Open an image, resize to (width, height), return as JPEG bytes."""
    img = Image.open(path).convert("RGB")
    img = img.resize((width, height), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)
    return buf.getvalue()


@pytest.fixture(scope="module")
def source_jpeg() -> bytes:
    if not TEST_IMAGE.exists():
        pytest.fail(f"Test image missing: {TEST_IMAGE}")
    return _load_as_jpeg(TEST_IMAGE, DISPLAY_W, DISPLAY_H)


@pytest.fixture(scope="module")
def dithered_fs(source_jpeg: bytes) -> Image.Image:
    """Floyd-Steinberg dithered result."""
    return dither_to_pil(source_jpeg, "floyd-steinberg", "e6")


@pytest.fixture(scope="module")
def dithered_atkinson(source_jpeg: bytes) -> Image.Image:
    """Atkinson dithered result."""
    return dither_to_pil(source_jpeg, "atkinson", "e6")


# ---------------------------------------------------------------------------
# Palette zone tests  (no image needed — pure logic)
# ---------------------------------------------------------------------------


class TestPaletteEsphomeZones:
    """Verify each palette colour falls in the correct ESPHome ink zone.

    Tests use E6_PALETTE_RGB directly (by index) so they remain correct
    if the palette values change — no hardcoded RGB tuples here.

    This is the most critical test: a wrong zone means a whole colour
    renders as the wrong ink on the physical display.
    """

    def test_black_maps_to_black_zone(self):
        assert esphome_ink_index(*E6_PALETTE_RGB[0]) == INK_BLACK

    def test_white_maps_to_white_zone(self):
        assert esphome_ink_index(*E6_PALETTE_RGB[1]) == INK_WHITE

    def test_green_maps_to_green_zone(self):
        assert esphome_ink_index(*E6_PALETTE_RGB[2]) == INK_GREEN

    def test_blue_maps_to_blue_zone(self):
        assert esphome_ink_index(*E6_PALETTE_RGB[3]) == INK_BLUE

    def test_red_maps_to_red_zone(self):
        assert esphome_ink_index(*E6_PALETTE_RGB[4]) == INK_RED

    def test_yellow_maps_to_yellow_zone(self):
        assert esphome_ink_index(*E6_PALETTE_RGB[5]) == INK_YELLOW

    def test_no_palette_colour_maps_to_orange(self):
        """Orange (index 6) is absent from the 6-colour palette."""
        for color in E6_PALETTE_RGB:
            ink = esphome_ink_index(*color)
            assert ink != INK_ORANGE, (
                f"Palette colour {color} maps to Orange zone — "
                "it would render as the wrong ink on a 6-colour display"
            )

    def test_all_six_zones_covered(self):
        """Every ink index 0-5 must have exactly one palette entry."""
        used_zones = {esphome_ink_index(*c) for c in E6_PALETTE_RGB}
        assert used_zones == {INK_BLACK, INK_WHITE, INK_GREEN, INK_BLUE, INK_RED, INK_YELLOW}


# ---------------------------------------------------------------------------
# Dithered-image tests
# ---------------------------------------------------------------------------


class TestDitheredImage:
    """Tests that apply dithering to test.jpg and inspect the pixel output."""

    # ---- pixel set correctness ----

    def test_floyd_steinberg_all_pixels_in_palette(self, dithered_fs: Image.Image):
        arr = np.array(dithered_fs)
        unique = set(map(tuple, arr.reshape(-1, 3)))
        rogue = unique - E6_PALETTE_SET
        assert not rogue, f"Non-palette pixels in output: {rogue}"

    def test_atkinson_all_pixels_in_palette(self, dithered_atkinson: Image.Image):
        arr = np.array(dithered_atkinson)
        unique = set(map(tuple, arr.reshape(-1, 3)))
        rogue = unique - E6_PALETTE_SET
        assert not rogue, f"Non-palette pixels in output: {rogue}"

    # ---- colour coverage ----

    def test_all_six_colours_used(self, dithered_fs: Image.Image):
        """A real photograph should use all six ink colours."""
        arr = np.array(dithered_fs)
        unique = set(map(tuple, arr.reshape(-1, 3)))
        missing = E6_PALETTE_SET - unique
        assert not missing, f"Palette colours absent from dithered output: {missing}"

    def test_no_single_colour_dominates(self, dithered_fs: Image.Image):
        """No colour should exceed 70 % of pixels — sanity-checks the dithering."""
        arr = np.array(dithered_fs).reshape(-1, 3)
        n = len(arr)
        for color in E6_PALETTE_RGB:
            count = int(np.sum(np.all(arr == color, axis=1)))
            frac = count / n
            assert frac < 0.70, (
                f"Colour {color} dominates at {frac:.1%} of pixels — dithering may be broken"
            )

    # ---- ESPHome zone correctness on the actual image ----

    def test_no_pixels_in_orange_zone(self, dithered_fs: Image.Image):
        """No output pixel should land in ESPHome's Orange zone (ink index 6).

        The Orange zone (R>127, G>85, G<=170) has no entry in our 6-colour
        palette.  A hit here means a pixel would render as the wrong ink.
        """
        arr = np.array(dithered_fs).astype(int)
        r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
        orange = (r > 127) & (g > 85) & (g <= 170)
        count = int(np.sum(orange))
        assert count == 0, (
            f"{count} pixels fall in the ESPHome Orange zone — "
            "palette colour(s) misconfigured"
        )

    def test_output_dimensions_match_input(self, dithered_fs: Image.Image):
        assert dithered_fs.size == (DISPLAY_W, DISPLAY_H)

    def test_output_is_rgb(self, dithered_fs: Image.Image):
        assert dithered_fs.mode == "RGB"

    # ---- algorithm consistency ----

    def test_atkinson_and_fs_use_same_palette(self, dithered_atkinson: Image.Image):
        arr = np.array(dithered_atkinson)
        unique = set(map(tuple, arr.reshape(-1, 3)))
        assert unique.issubset(E6_PALETTE_SET)

    def test_algorithms_produce_different_output(
        self, dithered_fs: Image.Image, dithered_atkinson: Image.Image
    ):
        """Different dithering algorithms should give different pixel distributions."""
        fs_arr = np.array(dithered_fs)
        at_arr = np.array(dithered_atkinson)
        assert not np.array_equal(fs_arr, at_arr), (
            "Floyd-Steinberg and Atkinson produced identical output — "
            "one of them may not be running"
        )
