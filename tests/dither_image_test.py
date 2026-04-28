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
    E6_WIRE_RGB,
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


# Expected ESPHome nibble for each wire-format output colour.
WIRE_INK: dict[tuple[int, int, int], int] = {
    (c[0], c[1], c[2]): esphome_ink_index(*c)
    for c in E6_WIRE_RGB
}
PALETTE_INK = WIRE_INK

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
    """Verify each wire-format colour hits the correct ESPHome nibble zone.

    Hardware calibration (verified):
      wire (0,0,0)       → nibble 0 → Black ink
      wire (255,255,255) → nibble 1 → White ink
      wire (255,255,0)   → nibble 2 → Red ink   (YELLOW zone)
      wire (255,0,0)     → nibble 3 → Blue ink  (RED zone)
      wire (0,0,255)     → nibble 5 → Green ink (BLUE zone)
    """

    def test_black_wire_hits_black_nibble(self):
        assert esphome_ink_index(*E6_WIRE_RGB[0]) == INK_BLACK

    def test_white_wire_hits_white_nibble(self):
        assert esphome_ink_index(*E6_WIRE_RGB[1]) == INK_WHITE

    def test_red_ink_wire_hits_yellow_nibble(self):
        assert esphome_ink_index(*E6_WIRE_RGB[2]) == INK_YELLOW  # nibble 2 → Red physical

    def test_blue_ink_wire_hits_red_nibble(self):
        assert esphome_ink_index(*E6_WIRE_RGB[3]) == INK_RED  # nibble 3 → Blue physical

    def test_green_ink_wire_hits_blue_nibble(self):
        assert esphome_ink_index(*E6_WIRE_RGB[4]) == INK_BLUE  # nibble 5 → Green physical

    def test_no_wire_colour_uses_orange_nibble(self):
        """nibble 6 (GREEN zone) shows as Red on this display — intentionally excluded."""
        for color in E6_WIRE_RGB:
            assert esphome_ink_index(*color) not in (INK_GREEN, INK_ORANGE), (
                f"Wire colour {color} unexpectedly maps to Green/Orange nibble"
            )

    def test_all_required_nibbles_present(self):
        nibbles = {esphome_ink_index(*c) for c in E6_WIRE_RGB}
        assert nibbles == {INK_BLACK, INK_WHITE, INK_YELLOW, INK_RED, INK_BLUE}


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

    def test_all_five_wire_colours_used(self, dithered_fs: Image.Image):
        """A real photograph should use all five wire-format output colours."""
        arr = np.array(dithered_fs)
        unique = set(map(tuple, arr.reshape(-1, 3)))
        missing = E6_PALETTE_SET - unique  # E6_PALETTE_SET == E6_WIRE_SET
        assert not missing, f"Wire colours absent from dithered output: {missing}"

    def test_no_single_colour_dominates(self, dithered_fs: Image.Image):
        """No wire colour should exceed 70 % of pixels — sanity-checks dithering."""
        arr = np.array(dithered_fs).reshape(-1, 3)
        n = len(arr)
        for color in E6_WIRE_RGB:
            count = int(np.sum(np.all(arr == color, axis=1)))
            frac = count / n
            assert frac < 0.70, (
                f"Wire colour {color} dominates at {frac:.1%} of pixels"
            )

    # ---- ESPHome zone correctness on the actual image ----

    def test_no_pixels_in_excluded_zones(self, dithered_fs: Image.Image):
        """No output pixel should land in the GREEN zone (nibble 6 → Red physical)
        or the ORANGE zone (nibble 6 on 7-colour displays).  Both show as red,
        duplicating the RED-ink zone and making green areas look red.
        """
        arr = np.array(dithered_fs).astype(int)
        r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
        # GREEN zone: R≤128, G>128, B≤128 → nibble 6 → Red physical
        green_zone = (r <= 128) & (g > 128) & (b <= 128)
        # ORANGE zone: R>127, G>85, G≤170 → nibble 6
        orange_zone = (r > 127) & (g > 85) & (g <= 170)
        bad = int(np.sum(green_zone | orange_zone))
        assert bad == 0, (
            f"{bad} pixels fall in excluded ESPHome zones (would render as wrong ink)"
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
