"""Dithering to configurable palettes (e.g. the 7.3" e-Paper ACeP six-color palette).

Supported algorithms (select via the *algo* argument):

  floyd-steinberg               — error-diffusion, alternating row direction (Lab LUT)
  floyd-steinberg-serpentine    — same as floyd-steinberg (alias)
  atkinson                      — Bill Atkinson's 3/4-error diffusion (Lab LUT)
  ordered                       — 8×8 Bayer ordered/threshold dithering (Lab LUT)
  none                          — no dithering at all (pure passthrough, no preprocessing)

Supported palettes:

  none  — no palette restriction (full color, dithering disabled)
  bw    — black and white (binary; two-color)
  e6    — 7.3" e-Paper E six-color ACeP palette (Black, White, Green, Blue, Red, Yellow)

All palette-based algorithms use the same nearest-colour lookup: a per-palette
6-bit-per-channel LUT (262 144 entries, built on first use) that maps any 8-bit
RGB triple to the closest palette index using CIE L*a*b* distance. Each bucket
covers 4 raw sRGB values (±2 counts max error per channel).

 The dithered image is returned as a PIL RGB Image; callers that need bytes use
dither_to_pil() / encode_pil().
"""

from __future__ import annotations

import io
import logging
from typing import Final, Literal

import numpy as np
from PIL import Image, ImageEnhance

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Section 1 — constants / palettes
# ---------------------------------------------------------------------------

DitheringPalette = Literal["none", "bw", "e6"]
DITHER_PALETTES: Final[tuple[str, ...]] = ("none", "bw", "e6")

PALETTE_LABELS: Final[dict[str, str]] = {
    "none": "Full Color (no dithering)",
    "bw": "Black & White",
    "e6": "E-Paper 6-Color",
}

BW_PALETTE_RGB: Final[list[tuple[int, int, int]]] = [
    (0,   0,   0),    # 0 Black
    (255, 255, 255),  # 1 White
]

# Measured physical ink colors for the Waveshare Spectra E6 (PhotoPainter /
# ESP32-S3-PhotoPainter). These are the actual on-screen hues, not idealised
# primaries. Using physical values gives accurate error-diffusion targets so
# that the dithered image looks correct on the real hardware.
E6_PALETTE_RGB: Final[list[tuple[int, int, int]]] = [
    (25,  30,  33),   # 0 Black
    (232, 232, 232),  # 1 White
    (18,  95,  32),   # 2 Green
    (33,  87,  186),  # 3 Blue
    (178, 19,  24),   # 4 Red
    (239, 222, 68),   # 5 Yellow
]

PALETTE_RGB: Final[dict[str, list[tuple[int, int, int]]]] = {
    "bw": BW_PALETTE_RGB,
    "e6": E6_PALETTE_RGB,
}

E6_PALETTE_SET: Final[frozenset[tuple[int, int, int]]] = frozenset(E6_PALETTE_RGB)
BW_PALETTE_SET: Final[frozenset[tuple[int, int, int]]] = frozenset(BW_PALETTE_RGB)
PALETTE_SETS: Final[dict[str, frozenset[tuple[int, int, int]]]] = {
    "bw": BW_PALETTE_SET,
    "e6": E6_PALETTE_SET,
}

DitheringAlgo = Literal["none", "floyd-steinberg", "floyd-steinberg-serpentine", "atkinson", "ordered"]
DITHER_ALGOS: Final[tuple[str, ...]] = (
    "none",
    "floyd-steinberg",
    "floyd-steinberg-serpentine",
    "atkinson",
    "ordered",
)


# ---------------------------------------------------------------------------
# Section 2 — color conversion helpers
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Section 3 — LUT building
# ---------------------------------------------------------------------------

_LUT_BITS: Final[int] = 6                # bits per channel
_LUT_SIZE: Final[int] = 1 << _LUT_BITS   # 64
_LUT_STEP: Final[int] = 256 >> _LUT_BITS # 4
_LUT_SHIFT: Final[int] = 8 - _LUT_BITS   # 2


def _build_lut(palette_rgb: list[tuple[int, int, int]]) -> np.ndarray:
    """Build a 6-bit-per-channel LUT: (r>>2, g>>2, b>>2) → palette index.

    Uses CIE L*a*b* ΔE². Each bucket represents a 4-value range of raw
    sRGB; the midpoint is used as the representative sample.
    """
    n = _LUT_SIZE
    steps = np.arange(n, dtype=np.float64) * _LUT_STEP + _LUT_STEP // 2
    ri, gi, bi = np.meshgrid(steps, steps, steps, indexing="ij")
    rgb = np.stack([ri, gi, bi], axis=-1)

    flat = rgb.reshape(-1, 3) / 255.0
    linear = np.where(flat <= 0.04045, flat / 12.92, ((flat + 0.055) / 1.055) ** 2.4)

    M = np.array([
        [0.4124564, 0.3575761, 0.1804375],
        [0.2126729, 0.7151522, 0.0721750],
        [0.0193339, 0.1191920, 0.9503041],
    ])
    xyz = linear @ M.T
    xyz[:, 0] /= 0.95047
    xyz[:, 2] /= 1.08883

    def _f(t: np.ndarray) -> np.ndarray:
        return np.where(t > 0.008856, t ** (1.0 / 3.0), 7.787 * t + 16.0 / 116.0)

    fx, fy, fz = _f(xyz[:, 0]), _f(xyz[:, 1]), _f(xyz[:, 2])
    lab = np.stack([116.0 * fy - 16.0, 500.0 * (fx - fy), 200.0 * (fy - fz)], axis=-1)

    pal_lab = np.array([_rgb_to_lab(r, g, b) for r, g, b in palette_rgb], dtype=np.float64)

    dist2 = (lab[:, np.newaxis, :] - pal_lab[np.newaxis, :, :]).sum(axis=-1) ** 2
    best = dist2.argmin(axis=-1).astype(np.uint8)
    return best.reshape(n, n, n)


_LUTS: Final[dict[str, np.ndarray]] = {
    name: _build_lut(rgb) for name, rgb in PALETTE_RGB.items()
}
_PAL_NPS: Final[dict[str, np.ndarray]] = {
    name: np.array(rgb, dtype=np.uint8) for name, rgb in PALETTE_RGB.items()
}


def _nearest(r: int, g: int, b: int, palette: DitheringPalette) -> tuple[int, int, int]:
    """Return the palette RGB colour closest to (r, g, b) via LUT."""
    lut = _LUTS[palette]
    pal_np = _PAL_NPS[palette]
    idx = int(lut[r >> _LUT_SHIFT, g >> _LUT_SHIFT, b >> _LUT_SHIFT])
    rgb = pal_np[idx]
    return int(rgb[0]), int(rgb[1]), int(rgb[2])


# ---------------------------------------------------------------------------
# Section 4 — dithering algorithms
# ---------------------------------------------------------------------------

def _preprocess(img: Image.Image) -> Image.Image:
    """Convert to RGB and apply a gentle contrast + saturation boost."""
    img = img.convert("RGB")
    img = ImageEnhance.Contrast(img).enhance(1.2)
    img = ImageEnhance.Color(img).enhance(1.3)
    return img


def _serpentine(img: Image.Image, palette: DitheringPalette) -> Image.Image:
    """Bidirectional Floyd-Steinberg error diffusion (pure Python, Lab LUT).

    Alternates horizontal scan direction each row. Kernel (normalized / 16):

        even row →  .  P  7
                    3  5  1

        odd row →  7  P  .
                   1  5  3
    """
    w, h = img.size
    buf = list(img.tobytes())

    def add_err(x: int, y: int, er: int, eg: int, eb: int) -> None:
        if 0 <= x < w and 0 <= y < h:
            o = (y * w + x) * 3
            buf[o]     = max(0, min(255, buf[o]     + er))
            buf[o + 1] = max(0, min(255, buf[o + 1] + eg))
            buf[o + 2] = max(0, min(255, buf[o + 2] + eb))

    out = bytearray(w * h * 3)

    for y in range(h):
        xs = range(w) if y % 2 == 0 else range(w - 1, -1, -1)
        forward = 1 if y % 2 == 0 else -1

        for x in xs:
            o = (y * w + x) * 3
            cr, cg, cb = buf[o], buf[o + 1], buf[o + 2]
            pr, pg, pb = _nearest(cr, cg, cb, palette)
            out[o], out[o + 1], out[o + 2] = pr, pg, pb

            er, eg, eb = cr - pr, cg - pg, cb - pb
            add_err(x + forward, y,      (er * 7) >> 4, (eg * 7) >> 4, (eb * 7) >> 4)
            add_err(x - forward, y + 1,  (er * 3) >> 4, (eg * 3) >> 4, (eb * 3) >> 4)
            add_err(x,           y + 1,  (er * 5) >> 4, (eg * 5) >> 4, (eb * 5) >> 4)
            add_err(x + forward, y + 1,  (er * 1) >> 4, (eg * 1) >> 4, (eb * 1) >> 4)

    return Image.frombytes("RGB", (w, h), bytes(out))


def _atkinson(img: Image.Image, palette: DitheringPalette) -> Image.Image:
    """Atkinson dithering — distributes 3/4 of error to 6 neighbours."""
    w, h = img.size
    buf = list(img.tobytes())

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
            cr, cg, cb = get(x, y)
            pr, pg, pb = _nearest(cr, cg, cb, palette)
            o = (y * w + x) * 3
            out[o], out[o + 1], out[o + 2] = pr, pg, pb
            er, eg, eb = (cr - pr) >> 3, (cg - pg) >> 3, (cb - pb) >> 3
            add_err(x + 1, y,     er, eg, eb)
            add_err(x + 2, y,     er, eg, eb)
            add_err(x - 1, y + 1, er, eg, eb)
            add_err(x,     y + 1, er, eg, eb)
            add_err(x + 1, y + 1, er, eg, eb)
            add_err(x,     y + 2, er, eg, eb)

    return Image.frombytes("RGB", (w, h), bytes(out))


_BAYER_OFFSETS: Final[list[list[int]]] = [
    [v * 2 - 63 for v in row] for row in [
        [  0, 32,  8, 40,  2, 34, 10, 42],
        [ 48, 16, 56, 24, 50, 18, 58, 26],
        [ 12, 44,  4, 36, 14, 46,  6, 38],
        [ 60, 28, 52, 20, 62, 30, 54, 22],
        [  3, 35, 11, 43,  1, 33,  9, 41],
        [ 51, 19, 59, 27, 49, 17, 57, 25],
        [ 15, 47,  7, 39, 13, 45,  5, 37],
        [ 63, 31, 55, 23, 61, 29, 53, 21],
    ]
]


def _ordered(img: Image.Image, palette: DitheringPalette) -> Image.Image:
    """8×8 Bayer ordered dithering with Lab LUT nearest-colour snap."""
    w, h = img.size
    raw = img.tobytes()
    out = bytearray(w * h * 3)

    for y in range(h):
        bayer_row = _BAYER_OFFSETS[y & 7]
        for x in range(w):
            o = (y * w + x) * 3
            r = max(0, min(255, raw[o]     + bayer_row[x & 7]))
            g = max(0, min(255, raw[o + 1] + bayer_row[x & 7]))
            b_val = max(0, min(255, raw[o + 2] + bayer_row[x & 7]))
            pr, pg, pb = _nearest(r, g, b_val, palette)
            out[o], out[o + 1], out[o + 2] = pr, pg, pb

    return Image.frombytes("RGB", (w, h), bytes(out))


# ---------------------------------------------------------------------------
# Section 5 — public API
# ---------------------------------------------------------------------------

def dither_to_pil(
    image_bytes: bytes,
    algo: DitheringAlgo = "floyd-steinberg",
    palette: DitheringPalette = "e6",
) -> Image.Image:
    """Dither *image_bytes* to *palette* and return a PIL RGB Image.

    - **algo="none"** → return raw RGB image unmodified, no preprocessing.
    - **palette="none"** → no palette restriction; full color passthrough
      with preprocessing (contrast + saturation boost) but no colour quantization.
    - **all other combos**: preprocess, then dither to palette using Lab LUT.
    - **"floyd-steinberg"** is an alias for the serpentine (bidirectional) algorithm.
    """
    # Algo "none": pure passthrough — no preprocessing, no dithering, no palette
    if algo == "none":
        src = Image.open(io.BytesIO(image_bytes))
        src.load()
        return src.convert("RGB")

    # Load and preprocess (needed for palette="none" passthrough and all dithering)
    src = Image.open(io.BytesIO(image_bytes))
    src.load()
    img = _preprocess(src)

    # Palette "none": full color passthrough — no colour quantization
    if palette == "none":
        return img

    # Dispatch to Lab LUT-based algorithm (all use _nearest)
    match algo:
        case "floyd-steinberg":
            return _serpentine(img, palette)
        case "floyd-steinberg-serpentine":
            return _serpentine(img, palette)
        case "atkinson":
            return _atkinson(img, palette)
        case "ordered":
            return _ordered(img, palette)
        case _:
            raise ValueError(f"Unknown dithering algorithm: {algo!r}. Choose from {DITHER_ALGOS}")


def encode_pil(pil_img: Image.Image, orig_format: str) -> bytes:
    """Encode a PIL RGB image to *orig_format* bytes."""
    buf = io.BytesIO()
    kwargs: dict[str, object] = {}
    if orig_format.upper() == "JPEG":
        kwargs["quality"] = 95
        kwargs["subsampling"] = 0
    pil_img.save(buf, format=orig_format, **kwargs)
    return buf.getvalue()


def dither_to_bytes(
    image_bytes: bytes,
    algo: DitheringAlgo = "floyd-steinberg",
    output_format: str = "png",
    palette: DitheringPalette = "e6",
) -> bytes:
    """Apply dithering and return the encoded result.

    This is a convenience wrapper around :func:`dither_to_pil` + :func:`encode_pil`
    for callers that work with raw byte buffers and need a final byte payload.

    Args:
        image_bytes:   Raw image bytes (RGB / JPEG / PNG).
        algo:          Dithering algorithm to use (default ``"floyd-steinberg"``).
        output_format: Output image format passed to :func:`encode_pil`
                       (default ``"png"``, must be a Pillow-supported format).
        palette:       Dithering palette to use (default ``"e6"``).

    Returns:
        ``bytes``: The final encoded image data after resizing, dithering,
        and the requested encoding step.
    """
    src = Image.open(io.BytesIO(image_bytes))
    src.load()
    orig_size = src.size

    out = dither_to_pil(image_bytes, algo, palette=palette)
    result = encode_pil(out, output_format)

    logger.debug(
        "dither (%s, palette=%s) complete: %dx%d → %s  %d bytes → %d bytes",
        algo, palette, orig_size[0], orig_size[1], output_format,
        len(image_bytes), len(result),
    )
    return result
