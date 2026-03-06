"""Dithering to the 7.3" e-Paper (E) six-color ACeP palette.

Supported algorithms (select via the DITHER_ALGO env var or the dither_to_pil()
*algo* argument):

  floyd-steinberg            — error-diffusion via Pillow's C engine (default)
  floyd-steinberg-serpentine — bidirectional FS, alternating row direction (pure Python, Lab LUT)
  atkinson                   — Bill Atkinson's 3/4-error diffusion (pure Python)
  ordered                    — 8×8 Bayer ordered/threshold dithering (pure Python)

All algorithms share the same nearest-colour lookup: a 6-bit-per-channel LUT
(262 144 entries, built at import time) that maps any 8-bit RGB triple to the
closest ACeP palette index using CIE L*a*b* distance.  Each bucket covers 4
raw sRGB values (±2 counts max error per channel), compared to 16 values (±8)
with a 4-bit LUT.

The dithered image is returned as a PIL RGB Image; callers that need bytes use
floyd_steinberg_e6() / encode_pil().
"""

from __future__ import annotations

import io
import logging
from typing import Final, Literal

import numpy as np
from PIL import Image, ImageEnhance

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Palette
# ---------------------------------------------------------------------------
# These are the exact RGB values used by Waveshare's official epd7in3f driver
# in its getbuffer() palette (see waveshare/e-Paper on GitHub).  The display
# controller maps each 4-bit index to its physical ink; the driver sends pure
# primaries for each slot, so these are the correct values to dither against.
#
# Index → wire value → physical ink color:
#   0  0x0  Black
#   1  0x1  White
#   2  0x2  Green
#   3  0x3  Blue
#   4  0x4  Red
#   5  0x5  Yellow
#   6  0x6  Orange  (7-colour variant only; omitted here for the 6-colour screen)

E6_PALETTE_RGB: Final[list[tuple[int, int, int]]] = [
    (0,   0,   0),    # 0 Black
    (255, 255, 255),  # 1 White
    (0,   255, 0),    # 2 Green
    (0,   0,   255),  # 3 Blue
    (255, 0,   0),    # 4 Red
    (255, 255, 0),    # 5 Yellow
]

E6_PALETTE_SET: Final[frozenset[tuple[int, int, int]]] = frozenset(E6_PALETTE_RGB)

DitheringAlgo = Literal["floyd-steinberg", "floyd-steinberg-serpentine", "atkinson", "ordered"]
DITHER_ALGOS: Final[tuple[str, ...]] = ("floyd-steinberg", "floyd-steinberg-serpentine", "atkinson", "ordered")

# ---------------------------------------------------------------------------
# Pillow palette image (used only by floyd-steinberg path)
# ---------------------------------------------------------------------------

def _build_palette_image() -> Image.Image:
    pal_data: list[int] = []
    for r, g, b in E6_PALETTE_RGB:
        pal_data.extend([r, g, b])
    pal_data += [0, 0, 0] * (256 - len(E6_PALETTE_RGB))
    pal_img = Image.new("P", (1, 1))
    pal_img.putpalette(pal_data)
    return pal_img

_PALETTE_IMAGE: Final[Image.Image] = _build_palette_image()

# ---------------------------------------------------------------------------
# Nearest-colour LUT  (shared by atkinson + ordered)
# ---------------------------------------------------------------------------
# sRGB → Lab conversion for perceptual nearest-colour matching.

def _srgb_to_linear(c: float) -> float:
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _rgb_to_lab(r: int, g: int, b: int) -> tuple[float, float, float]:
    rl, gl, bl = _srgb_to_linear(r), _srgb_to_linear(g), _srgb_to_linear(b)
    x = rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375
    y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750
    z = rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041
    x /= 0.95047; y /= 1.00000; z /= 1.08883  # noqa: E702

    def f(t: float) -> float:
        return t ** (1.0 / 3.0) if t > 0.008856 else 7.787 * t + 16.0 / 116.0

    fx, fy, fz = f(x), f(y), f(z)
    return 116.0 * fy - 16.0, 500.0 * (fx - fy), 200.0 * (fy - fz)


_E6_LAB: Final[list[tuple[float, float, float]]] = [
    _rgb_to_lab(r, g, b) for r, g, b in E6_PALETTE_RGB
]

_LUT_BITS: Final[int] = 6             # bits per channel
_LUT_SIZE: Final[int] = 1 << _LUT_BITS    # 64 steps per channel
_LUT_STEP: Final[int] = 256 >> _LUT_BITS  # 4 raw sRGB values per bucket
_LUT_SHIFT: Final[int] = 8 - _LUT_BITS   # right-shift to extract top _LUT_BITS bits (= 2)


def _build_lut() -> np.ndarray:
    """Build a 6-bit-per-channel LUT mapping (r>>2, g>>2, b>>2) → palette index.

    Returns a uint8 ndarray of shape (64, 64, 64).  Each cell holds the index
    into E6_PALETTE_RGB of the perceptually closest colour (CIE L*a*b* ΔE²).
    Each bucket represents a 4-value range of raw sRGB; the midpoint is used
    as the representative sample (max assignment error ±2 counts per channel).

    Fully vectorised via numpy — builds in ~5 ms.
    """
    n = _LUT_SIZE
    # Midpoint sRGB value for each bucket index along one axis
    steps = np.arange(n, dtype=np.float64) * _LUT_STEP + _LUT_STEP // 2  # shape (64,)

    # Build (64,64,64,3) grid of midpoint sRGB triples
    ri, gi, bi = np.meshgrid(steps, steps, steps, indexing="ij")
    rgb = np.stack([ri, gi, bi], axis=-1)  # (64,64,64,3) float64

    # sRGB → linear RGB
    flat = rgb.reshape(-1, 3) / 255.0  # (N,3)
    linear = np.where(flat <= 0.04045, flat / 12.92, ((flat + 0.055) / 1.055) ** 2.4)

    # Linear RGB → XYZ (D65)
    M = np.array([
        [0.4124564, 0.3575761, 0.1804375],
        [0.2126729, 0.7151522, 0.0721750],
        [0.0193339, 0.1191920, 0.9503041],
    ])
    xyz = linear @ M.T  # (N,3)

    # XYZ → Lab
    xyz[:, 0] /= 0.95047
    # xyz[:, 1] /= 1.00000  (no-op)
    xyz[:, 2] /= 1.08883

    def _f(t: np.ndarray) -> np.ndarray:
        return np.where(t > 0.008856, t ** (1.0 / 3.0), 7.787 * t + 16.0 / 116.0)

    fx, fy, fz = _f(xyz[:, 0]), _f(xyz[:, 1]), _f(xyz[:, 2])
    lab = np.stack([116.0 * fy - 16.0, 500.0 * (fx - fy), 200.0 * (fy - fz)], axis=-1)
    # lab shape: (N, 3)

    # Palette Lab values — shape (6, 3)
    pal_lab = np.array(_E6_LAB, dtype=np.float64)

    # Squared ΔE² to each palette entry — (N, 6)
    diff = lab[:, np.newaxis, :] - pal_lab[np.newaxis, :, :]  # (N,6,3)
    dist2 = (diff ** 2).sum(axis=-1)                           # (N,6)

    best = dist2.argmin(axis=-1).astype(np.uint8)              # (N,)
    return best.reshape(n, n, n)


_LUT: Final[np.ndarray] = _build_lut()

# Palette as a numpy array for fast index→RGB lookup in _nearest
_PAL_NP: Final[np.ndarray] = np.array(E6_PALETTE_RGB, dtype=np.uint8)


def _nearest(r: int, g: int, b: int) -> tuple[int, int, int]:
    """Return the palette RGB colour closest to (r, g, b) via LUT."""
    rgb = _PAL_NP[int(_LUT[r >> _LUT_SHIFT, g >> _LUT_SHIFT, b >> _LUT_SHIFT])]
    return int(rgb[0]), int(rgb[1]), int(rgb[2])


# ---------------------------------------------------------------------------
# Pre-processing
# ---------------------------------------------------------------------------

def _preprocess(img: Image.Image) -> Image.Image:
    """Convert to RGB and apply a gentle contrast + saturation boost."""
    img = img.convert("RGB")
    img = ImageEnhance.Contrast(img).enhance(1.2)
    img = ImageEnhance.Color(img).enhance(1.3)
    return img


# ---------------------------------------------------------------------------
# Algorithm implementations
# ---------------------------------------------------------------------------

def _floyd_steinberg(img: Image.Image) -> Image.Image:
    """Floyd-Steinberg via Pillow's C quantize engine."""
    dithered = img.quantize(palette=_PALETTE_IMAGE, dither=Image.Dither.FLOYDSTEINBERG)
    return dithered.convert("RGB")


def _serpentine_floyd_steinberg(img: Image.Image) -> Image.Image:
    """Serpentine Floyd-Steinberg error diffusion (pure Python, Lab LUT).

    Identical to standard Floyd-Steinberg (7/5/3/1 kernel) but alternates
    the horizontal scan direction each row — left-to-right on even rows,
    right-to-left on odd rows.  This eliminates the directional grain streak
    that standard left-to-right-only diffusion can produce on smooth gradients.

    Error kernel (relative to current pixel P, forward direction →):

        .  P  7
        3  5  1   (all /16)

    On right-to-left rows the kernel is mirrored:

        7  P  .
        1  5  3   (all /16)

    Uses the shared Lab-space LUT for perceptually accurate colour matching,
    consistent with the Atkinson and ordered implementations.
    """
    w, h = img.size
    buf = list(img.tobytes())  # flat r,g,b interleaved, length = w*h*3

    def add_err(x: int, y: int, er: int, eg: int, eb: int) -> None:
        if 0 <= x < w and 0 <= y < h:
            o = (y * w + x) * 3
            buf[o]     = max(0, min(255, buf[o]     + er))
            buf[o + 1] = max(0, min(255, buf[o + 1] + eg))
            buf[o + 2] = max(0, min(255, buf[o + 2] + eb))

    out = bytearray(w * h * 3)

    for y in range(h):
        # Alternate scan direction each row
        xs = range(w) if y % 2 == 0 else range(w - 1, -1, -1)
        forward = 1 if y % 2 == 0 else -1

        for x in xs:
            o = (y * w + x) * 3
            or_, og, ob = buf[o], buf[o + 1], buf[o + 2]
            pr, pg, pb = _nearest(or_, og, ob)
            out[o], out[o + 1], out[o + 2] = pr, pg, pb

            er, eg, eb = or_ - pr, og - pg, ob - pb

            # Floyd-Steinberg weights: 7, 3, 5, 1  (sum = 16)
            add_err(x + forward, y,      (er * 7) >> 4, (eg * 7) >> 4, (eb * 7) >> 4)
            add_err(x - forward, y + 1,  (er * 3) >> 4, (eg * 3) >> 4, (eb * 3) >> 4)
            add_err(x,           y + 1,  (er * 5) >> 4, (eg * 5) >> 4, (eb * 5) >> 4)
            add_err(x + forward, y + 1,  (er * 1) >> 4, (eg * 1) >> 4, (eb * 1) >> 4)

    return Image.frombytes("RGB", (w, h), bytes(out))


def _atkinson(img: Image.Image) -> Image.Image:
    """Atkinson dithering — distributes 3/4 of the error to 6 neighbours.

    Atkinson spreads less error than Floyd-Steinberg, which tends to preserve
    highlights and produce a slightly crisper look at the cost of some shadow
    detail. Well-suited to high-contrast images.
    """
    w, h = img.size
    # Use a flat list of ints for speed (r, g, b interleaved)
    buf = list(img.tobytes())  # length = w * h * 3

    def get(x: int, y: int) -> tuple[int, int, int]:
        o = (y * w + x) * 3
        return buf[o], buf[o + 1], buf[o + 2]

    def add_err(x: int, y: int, er: int, eg: int, eb: int) -> None:
        if 0 <= x < w and 0 <= y < h:
            o = (y * w + x) * 3
            buf[o]     = max(0, min(255, buf[o]     + er))
            buf[o + 1] = max(0, min(255, buf[o + 1] + eg))
            buf[o + 2] = max(0, min(255, buf[o + 2] + eb))

    out = bytearray(w * h * 3)

    for y in range(h):
        for x in range(w):
            or_, og, ob = get(x, y)
            pr, pg, pb = _nearest(or_, og, ob)
            o = (y * w + x) * 3
            out[o], out[o + 1], out[o + 2] = pr, pg, pb
            # Atkinson distributes 1/8 of the error to each of 6 neighbours
            # (total propagated = 6/8 = 3/4; 1/4 is "lost" intentionally)
            er, eg, eb = (or_ - pr) >> 3, (og - pg) >> 3, (ob - pb) >> 3
            add_err(x + 1, y,     er, eg, eb)
            add_err(x + 2, y,     er, eg, eb)
            add_err(x - 1, y + 1, er, eg, eb)
            add_err(x,     y + 1, er, eg, eb)
            add_err(x + 1, y + 1, er, eg, eb)
            add_err(x,     y + 2, er, eg, eb)

    result = Image.frombytes("RGB", (w, h), bytes(out))
    return result


# 8×8 Bayer matrix, normalised to [0, 255] range for direct addition to pixels
_BAYER_8: Final[list[list[int]]] = [
    [  0, 32,  8, 40,  2, 34, 10, 42],
    [ 48, 16, 56, 24, 50, 18, 58, 26],
    [ 12, 44,  4, 36, 14, 46,  6, 38],
    [ 60, 28, 52, 20, 62, 30, 54, 22],
    [  3, 35, 11, 43,  1, 33,  9, 41],
    [ 51, 19, 59, 27, 49, 17, 57, 25],
    [ 15, 47,  7, 39, 13, 45,  5, 37],
    [ 63, 31, 55, 23, 61, 29, 53, 21],
]
# Scale each entry from [0,63] to approximately [-63, +63] centred on 0
# so it acts as a symmetric threshold offset rather than a one-sided bias.
_BAYER_OFFSETS: Final[list[list[int]]] = [
    [v * 2 - 63 for v in row] for row in _BAYER_8
]


def _ordered(img: Image.Image) -> Image.Image:
    """8×8 Bayer ordered dithering.

    Adds a spatially-varying threshold offset to each pixel before snapping to
    the nearest palette colour. Produces a regular cross-hatch pattern with no
    error propagation — fast and deterministic. Works best for images with
    smooth gradients.
    """
    w, h = img.size
    raw = img.tobytes()
    out = bytearray(w * h * 3)

    for y in range(h):
        bayer_row = _BAYER_OFFSETS[y & 7]
        for x in range(w):
            o = (y * w + x) * 3
            threshold = bayer_row[x & 7]
            r = max(0, min(255, raw[o]     + threshold))
            g = max(0, min(255, raw[o + 1] + threshold))
            b = max(0, min(255, raw[o + 2] + threshold))
            pr, pg, pb = _nearest(r, g, b)
            out[o], out[o + 1], out[o + 2] = pr, pg, pb

    return Image.frombytes("RGB", (w, h), bytes(out))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def dither_to_pil(image_bytes: bytes, algo: DitheringAlgo = "floyd-steinberg") -> Image.Image:
    """Dither *image_bytes* to the 6-color palette and return a PIL RGB Image.

    :param algo: One of ``"floyd-steinberg"``, ``"floyd-steinberg-serpentine"``,
                 ``"atkinson"``, ``"ordered"``.
    :returns: RGB PIL Image whose pixels are all members of E6_PALETTE_RGB.
    """
    src = Image.open(io.BytesIO(image_bytes))
    src.load()
    img = _preprocess(src)

    if algo == "floyd-steinberg":
        return _floyd_steinberg(img)
    if algo == "floyd-steinberg-serpentine":
        return _serpentine_floyd_steinberg(img)
    if algo == "atkinson":
        return _atkinson(img)
    if algo == "ordered":
        return _ordered(img)
    msg = f"Unknown dithering algorithm: {algo!r}. Choose from {DITHER_ALGOS}"
    raise ValueError(msg)


def encode_pil(pil_img: Image.Image, orig_format: str) -> bytes:
    """Encode a PIL RGB image to *orig_format* bytes."""
    buf = io.BytesIO()
    kwargs: dict[str, object] = {}
    if orig_format.upper() == "JPEG":
        kwargs["quality"] = 95
        kwargs["subsampling"] = 0
    pil_img.save(buf, format=orig_format, **kwargs)
    return buf.getvalue()


def floyd_steinberg_e6(
    image_bytes: bytes,
    algo: DitheringAlgo = "floyd-steinberg",
    output_format: str = "JPEG",
) -> bytes:
    """Dither *image_bytes* and return encoded bytes in *output_format*.

    :param output_format: Pillow format string (e.g. ``"JPEG"``, ``"PNG"``).
                          Defaults to ``"JPEG"``.
    """
    src = Image.open(io.BytesIO(image_bytes))
    src.load()
    orig_size = src.size

    out = dither_to_pil(image_bytes, algo=algo)
    result = encode_pil(out, output_format)

    logger.debug(
        "e6 dither (%s) complete: %dx%d → %s  %d bytes → %d bytes",
        algo, orig_size[0], orig_size[1], output_format, len(image_bytes), len(result),
    )
    return result
