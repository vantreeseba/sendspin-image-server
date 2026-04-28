"""Tier 1 — Tests for pure dither functions.

All functions tested here are pure: given identical input they always
produce identical output.  No fixtures, no async, no mocking.
Tests run in <1 ms each and are fully deterministic.

    pytest tests/dither_test.py -v
"""

from __future__ import annotations

import io
from unittest.mock import patch

import numpy as np
import pytest
from PIL import Image

from sendspin_image_server import dither
from sendspin_image_server.dither import (
    BW_PALETTE_RGB,
    BW_PALETTE_SET,
    DITHER_ALGOS,
    E6_PALETTE_RGB,
    E6_PALETTE_SET,
    PALETTE_LABELS,
    PALETTE_RGB,
    PALETTE_SETS,
    _BAYER_OFFSETS,
    _LUT_BITS,
    _LUT_SHIFT,
    _LUT_SIZE,
    _LUT_STEP,
    _build_lut,
    _preprocess,
    _nearest,
    _srgb_to_linear,
    _rgb_to_lab,
    dither_to_bytes,
    dither_to_pil,
    encode_pil,
)


# ===== SECTION: Constants and data structures ===


class TestPaletteConstants:
    """Tests for palette-related module-level constants."""

    def test_bw_palette_has_two_colors(self):
        assert len(BW_PALETTE_RGB) == 2

    def test_bw_palette_contains_black_and_white(self):
        assert (0, 0, 0) in BW_PALETTE_RGB
        assert (255, 255, 255) in BW_PALETTE_RGB

    def test_bw_palette_set_is_correct(self):
        assert BW_PALETTE_SET == frozenset(BW_PALETTE_RGB)

    def test_e6_palette_has_six_colors(self):
        assert len(E6_PALETTE_RGB) == 6

    def test_e6_palette_contains_expected_colors(self):
        # Physical ink colors for the Waveshare Spectra E6 (PhotoPainter)
        expected = [(25, 30, 33), (232, 232, 232), (18, 95, 32),
                    (33, 87, 186), (178, 19, 24), (239, 222, 68)]
        for c in expected:
            assert c in E6_PALETTE_RGB

    def test_e6_palette_set_is_correct(self):
        assert E6_PALETTE_SET == frozenset(E6_PALETTE_RGB)

    def test_palette_sets_match_rgb_lists(self):
        for name, palette_rgb in PALETTE_RGB.items():
            assert PALETTE_SETS[name] == frozenset(palette_rgb)

    def test_all_rgb_pairs_are_valid(self):
        for name, palette in PALETTE_RGB.items():
            for r, g, b in palette:
                assert 0 <= r <= 255
                assert 0 <= g <= 255
                assert 0 <= b <= 255

    def test_all_palettes_have_labels(self):
        for name in ("bw", "e6"):
            assert name in PALETTE_LABELS
            assert isinstance(PALETTE_LABELS[name], str)
            assert len(PALETTE_LABELS[name]) > 0


class TestDitherAlgos:
    """Tests for DITHER_ALGOS constant."""

    def test_contains_all_expected_algos(self):
        assert "none" in DITHER_ALGOS
        assert "floyd-steinberg" in DITHER_ALGOS
        assert "floyd-steinberg-serpentine" in DITHER_ALGOS
        assert "atkinson" in DITHER_ALGOS
        assert "ordered" in DITHER_ALGOS

    def test_has_correct_count(self):
        assert len(DITHER_ALGOS) == 5


class TestLutConstants:
    """Tests for LUT configuration constants."""

    def test_bits_is_six(self):
        assert _LUT_BITS == 6

    def test_size_is_64(self):
        assert _LUT_SIZE == 64

    def test_step_is_four(self):
        assert _LUT_STEP == 4

    def test_shift_is_two(self):
        assert _LUT_SHIFT == 2

    def test_two_to_the_bits_equals_size(self):
        assert 2 ** _LUT_BITS == _LUT_SIZE

    def test_step_and_shift_are_valid(self):
        # step=4 means each bucket covers 4 input values per channel
        # shift=2 means the index offset is step << 2 = 4 * 4 = 16
        assert _LUT_STEP == 4
        assert _LUT_SHIFT == 2
        assert _LUT_STEP * (2 ** _LUT_SHIFT) == 16  # the actual index spacing


# ===== SECTION: Color conversion (sRGB → LAB) ===


class TestSrgbToLinear:
    """Tests for _srgb_to_linear."""

    def test_zero_is_zero(self):
        assert _srgb_to_linear(0) == pytest.approx(0.0, abs=1e-12)

    def test_255_is_one(self):
        assert _srgb_to_linear(255) == pytest.approx(1.0, abs=1e-12)

    def test_boundary_at_10(self):
        """Value 10 is below the sRGB threshold (~3.9), so uses the linear portion."""
        result = _srgb_to_linear(10)
        # 10/255 gives raw normalized value 0.0392...
        expected = (10 / 255) / 12.92
        assert result == pytest.approx(expected, abs=1e-12)

    def test_monotonic_increasing(self):
        values = [_srgb_to_linear(i) for i in range(256)]
        assert all(values[i] <= values[i + 1] for i in range(255))

    def test_non_negative(self):
        for i in range(256):
            assert _srgb_to_linear(i) >= 0


class TestRgbToLab:
    """Tests for _rgb_to_lab."""

    def test_black_is_near_zero_lab(self):
        lab = _rgb_to_lab(0, 0, 0)
        assert lab[0] == pytest.approx(0, abs=1.0)  # L* ≈ 0
        assert abs(lab[1]) < 1
        assert abs(lab[2]) < 1

    def test_white_is_near_100_lab(self):
        lab = _rgb_to_lab(255, 255, 255)
        assert lab[0] == pytest.approx(100, abs=2.0)

    def test_gray_is_neutral(self):
        lab = _rgb_to_lab(128, 128, 128)
        assert abs(lab[1]) < 2
        assert abs(lab[2]) < 2

    def test_returns_three_floats(self):
        lab = _rgb_to_lab(100, 150, 200)
        assert len(lab) == 3
        assert all(isinstance(v, float) for v in lab)

    def test_darker_color_has_lower_l_star(self):
        dark_lab = _rgb_to_lab(10, 10, 10)
        light_lab = _rgb_to_lab(245, 245, 245)
        assert dark_lab[0] < light_lab[0]

    def test_red_is_positive_a_star(self):
        lab = _rgb_to_lab(255, 0, 0)
        assert lab[1] > 50  # a* strongly positive for saturated red

    def test_green_is_negative_a_star(self):
        lab = _rgb_to_lab(0, 200, 0)
        assert lab[1] < -50  # a* strongly negative for saturated green

    def test_blue_is_negative_b_star(self):
        lab = _rgb_to_lab(0, 0, 255)
        assert lab[2] < -50  # b* strongly negative for saturated blue

    def test_yellow_is_positive_b_star(self):
        lab = _rgb_to_lab(255, 255, 0)
        assert lab[2] > 50  # b* strongly positive for saturated yellow

    def test_physical_red_has_positive_a_star(self):
        lab = _rgb_to_lab(178, 19, 24)
        assert lab[1] > 30  # physical red ink is still positive a*

    def test_physical_green_has_negative_a_star(self):
        lab = _rgb_to_lab(18, 95, 32)
        assert lab[1] < -10  # physical green ink is negative a*

    def test_physical_blue_has_negative_b_star(self):
        lab = _rgb_to_lab(33, 87, 186)
        assert lab[2] < -10  # physical blue ink is negative b*

    def test_physical_yellow_has_positive_b_star(self):
        lab = _rgb_to_lab(239, 222, 68)
        assert lab[2] > 20  # physical yellow ink is positive b*


# ===== SECTION: LUT building ===


class TestBuildLut:
    """Tests for _build_lut."""

    def test_returns_numpy_array(self):
        lut = _build_lut(E6_PALETTE_RGB)
        assert isinstance(lut, np.ndarray)

    def test_shape_is_cube(self):
        lut = _build_lut(E6_PALETTE_RGB)
        assert lut.shape == (64, 64, 64)

    def test_values_in_range(self):
        for palette_name, lut in dither._LUTS.items():
            n_colors = len(PALETTE_RGB[palette_name])
            assert lut.min() >= 0
            assert lut.max() < n_colors

    def test_all_buckets_mapped(self):
        """Every bucket in the LUT should map to a valid palette index."""
        for palette_name, lut in dither._LUTS.items():
            n_colors = len(PALETTE_RGB[palette_name])
            assert lut.size == _LUT_SIZE ** 3
            assert (lut >= 0).all()
            assert (lut < n_colors).all()


# ===== SECTION: Nearest color via LUT ===


class TestNearest:
    """Tests for _nearest helper."""

    def test_sharp_black_snaps_to_black(self):
        r, g, b = _nearest(0, 0, 0, "bw")
        assert (r, g, b) == (0, 0, 0)

    def test_sharp_white_snaps_to_white_bw(self):
        r, g, b = _nearest(255, 255, 255, "bw")
        assert (r, g, b) == (255, 255, 255)

    def test_mid_gray_in_bw_becomes_black_or_white(self):
        r, g, b = _nearest(128, 128, 128, "bw")
        assert (r, g, b) in ((0, 0, 0), (255, 255, 255))

    def test_sharp_colors_in_e6_return_exact(self):
        # Each palette color is its own nearest neighbour
        for color in E6_PALETTE_RGB:
            r, g, b = _nearest(color[0], color[1], color[2], "e6")
            assert (r, g, b) == color

    def test_physical_green_snaps_to_green(self):
        r, g, b = _nearest(18, 95, 32, "e6")
        assert (r, g, b) == (18, 95, 32)

    def test_physical_blue_snaps_to_blue(self):
        r, g, b = _nearest(33, 87, 186, "e6")
        assert (r, g, b) == (33, 87, 186)

    def test_physical_red_snaps_to_red(self):
        r, g, b = _nearest(178, 19, 24, "e6")
        assert (r, g, b) == (178, 19, 24)

    def test_nearest_returns_color_from_palette(self):
        r, g, b = _nearest(255, 255, 255, "e6")
        assert (r, g, b) in E6_PALETTE_SET

    def test_nearest_for_gray_returns_a_palette_color(self):
        r, g, b = _nearest(200, 200, 200, "e6")
        assert (r, g, b) in E6_PALETTE_SET


# ===== SECTION: Image preprocessing ===


class TestPreprocessing:
    """Tests for _preprocess."""

    def test_converts_grayscale_to_rgb(self):
        img = Image.new("L", (10, 10), 128)
        result = _preprocess(img)
        assert result.mode == "RGB"

    def test_converts_rgba_to_rgb(self):
        img = Image.new("RGBA", (10, 10), (128, 64, 32, 200))
        result = _preprocess(img)
        assert result.mode == "RGB"

    def test_converts_rgb_still_rgb(self):
        img = Image.new("RGB", (10, 10), (128, 64, 32))
        result = _preprocess(img)
        assert result.mode == "RGB"

    def test_preserves_dimensions(self):
        img = Image.new("RGB", (50, 100), (128, 64, 32))
        result = _preprocess(img)
        assert result.size == (50, 100)


# ===== SECTION: Dithering algorithms (high-level) ===


class TestDitherToPilNoneAlgo:
    """Tests for dither_to_pil with algo='none'."""

    def test_no_dither_returns_rgb(self, solid_jpeg: bytes):
        result = dither_to_pil(solid_jpeg, "none", "none")
        assert result.mode == "RGB"

    def test_no_dither_preserves_pixel_values(self, solid_jpeg: bytes):
        # With no dithering, all pixels should retain their original luminance.
        result = dither_to_pil(solid_jpeg, "none", "bw")
        arr = np.array(result)
        unique = set(tuple(p) for p in arr.reshape(-1, 3))
        assert unique == {(128, 128, 128)}

    def test_output_dimensions_match_input(self, solid_jpeg: bytes):
        result = dither_to_pil(solid_jpeg, "none", "none")
        assert result.size == (100, 100)


class TestDitherToPilWithPalette:
    """Tests for dither_to_pil with palette='e6'."""

    def test_e6_dither_output_is_rgb(self, solid_jpeg: bytes):
        result = dither_to_pil(solid_jpeg, "floyd-steinberg", "e6")
        assert result.mode == "RGB"

    def test_bw_dither_output_is_rgb(self, solid_jpeg: bytes):
        result = dither_to_pil(solid_jpeg, "floyd-steinberg", "bw")
        assert result.mode == "RGB"

    def test_floyd_steinberg_output_in_bw_palette(self, solid_jpeg: bytes):
        result = dither_to_pil(solid_jpeg, "floyd-steinberg", "bw")
        arr = np.array(result)
        unique = set(tuple(p) for p in arr.reshape(-1, 3))
        for color in unique:
            assert color in BW_PALETTE_SET

    def test_floyd_steinberg_output_in_e6_palette(self, solid_jpeg: bytes):
        result = dither_to_pil(solid_jpeg, "floyd-steinberg", "e6")
        arr = np.array(result)
        unique = set(tuple(p) for p in arr.reshape(-1, 3))
        for color in unique:
            assert color in E6_PALETTE_SET

    def test_atkinson_output_in_e6_palette(self, solid_jpeg: bytes):
        result = dither_to_pil(solid_jpeg, "atkinson", "e6")
        arr = np.array(result)
        unique = set(tuple(p) for p in arr.reshape(-1, 3))
        for color in unique:
            assert color in E6_PALETTE_SET

    def test_ordered_output_in_e6_palette(self, solid_jpeg: bytes):
        result = dither_to_pil(solid_jpeg, "ordered", "e6")
        arr = np.array(result)
        unique = set(tuple(p) for p in arr.reshape(-1, 3))
        for color in unique:
            assert color in E6_PALETTE_SET


class TestDitherToPilWithNonePalette:
    """Tests for dither_to_pil with palette='none'."""

    def test_outputs_rgb(self, solid_jpeg: bytes):
        result = dither_to_pil(solid_jpeg, "floyd-steinberg", "none")
        assert result.mode == "RGB"

    def test_has_more_than_6_unique_colors(self, large_jpeg: bytes):
        result = dither_to_pil(large_jpeg, "floyd-steinberg", "none")
        arr = np.array(result)
        unique = set(tuple(p) for p in arr.reshape(-1, 3))
        assert len(unique) > 6  # gradient should produce many colors when not restricted


class TestFsSerpentineAlias:
    """Verify floyd-steinberg and floyd-steinberg-serpentine produce identical output."""

    def test_identical_output(self, solid_jpeg: bytes):
        result1 = dither_to_pil(solid_jpeg, "floyd-steinberg", "bw")
        result2 = dither_to_pil(solid_jpeg, "floyd-steinberg-serpentine", "bw")
        np.testing.assert_array_equal(np.array(result1), np.array(result2))


# ===== SECTION: encode_pil ===


class TestEncodePil:
    """Tests for encode_pil."""

    def test_jpeg_returns_bytes(self):
        img = Image.new("RGB", (10, 10), (128, 64, 32))
        result = encode_pil(img, "JPEG")
        assert isinstance(result, bytes)
        assert len(result) > 0

    def test_png_returns_bytes(self):
        img = Image.new("RGB", (10, 10), (128, 64, 32))
        result = encode_pil(img, "PNG")
        assert isinstance(result, bytes)
        assert len(result) > 0

    def test_jpeg_is_valid(self):
        img = Image.new("RGB", (10, 10), (128, 64, 32))
        result = encode_pil(img, "JPEG")
        decoded = Image.open(io.BytesIO(result))
        assert decoded.mode == "RGB"

    def test_png_is_valid(self):
        img = Image.new("RGB", (10, 10), (128, 64, 32))
        result = encode_pil(img, "PNG")
        decoded = Image.open(io.BytesIO(result))
        assert decoded.mode == "RGB"

    def test_preserves_dimensions(self):
        img = Image.new("RGB", (50, 100), (128, 64, 32))
        result = encode_pil(img, "JPEG")
        decoded = Image.open(io.BytesIO(result))
        assert decoded.size == (50, 100)


# ===== SECTION: dither_to_bytes (full pipeline) ===


class TestDitherToBytes:
    """Tests for dither_to_bytes end-to-end."""

    def test_returns_bytes(self, solid_jpeg: bytes):
        result = dither_to_bytes(solid_jpeg, "floyd-steinberg", "png", "e6")
        assert isinstance(result, bytes)
        assert len(result) > 0

    def test_output_is_valid_png(self, solid_jpeg: bytes):
        result = dither_to_bytes(solid_jpeg, "floyd-steinberg", "png", "e6")
        decoded = Image.open(io.BytesIO(result))
        assert decoded.mode == "RGB"

    def test_output_is_valid_jpeg(self, solid_jpeg: bytes):
        result = dither_to_bytes(solid_jpeg, "floyd-steinberg", "jpeg", "e6")
        decoded = Image.open(io.BytesIO(result))
        assert decoded.mode == "RGB"

    def test_floyd_steinberg_serpentine_alias_consistent(self, solid_jpeg: bytes):
        r1 = dither_to_bytes(solid_jpeg, "floyd-steinberg", "png", "bw")
        r2 = dither_to_bytes(solid_jpeg, "floyd-steinberg-serpentine", "png", "bw")
        assert r1 == r2

    def test_atkinson_produces_output(self, solid_jpeg: bytes):
        result = dither_to_bytes(solid_jpeg, "atkinson", "png", "e6")
        decoded = Image.open(io.BytesIO(result))
        assert decoded.size == (100, 100)

    def test_ordered_produces_output(self, solid_jpeg: bytes):
        result = dither_to_bytes(solid_jpeg, "ordered", "png", "e6")
        decoded = Image.open(io.BytesIO(result))
        assert decoded.size == (100, 100)

    def test_none_algo_no_palette_produces_rgb(self, solid_jpeg: bytes):
        result = dither_to_bytes(solid_jpeg, "none", "png", "e6")
        decoded = Image.open(io.BytesIO(result))
        assert decoded.mode == "RGB"

    def test_bayer_offsets_are_correct_8x8(self):
        assert len(_BAYER_OFFSETS) == 8
        for row in _BAYER_OFFSETS:
            assert len(row) == 8

    def test_bayer_offsets_have_64_unique_values(self):
        values = set()
        for row in _BAYER_OFFSETS:
            values |= set(row)
        assert len(values) == 64


# ===== SECTION: Error handling ===


class TestErrorHandling:
    """Tests for error conditions and edge cases."""

    def test_invalid_algo_raises_value_error(self, solid_jpeg: bytes):
        with pytest.raises(ValueError, match="Unknown dithering algorithm"):
            dither_to_pil(solid_jpeg, "invalid-algo", "bw")  # type: ignore[arg-type]

    def test_lut_values_dont_overflow(self):
        for palette_name, lut in dither._LUTS.items():
            n_colors = len(PALETTE_RGB[palette_name])
            assert lut.min() >= 0
            assert lut.max() < n_colors
