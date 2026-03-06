"""Floyd-Steinberg dithering to the 7.3" e-Paper (E) six-color palette.

The Waveshare ESP32-S3-PhotoPainter uses a 7.3" ACeP e-Paper display that
supports six colors: Black, White, Green, Blue, Red, Yellow.

Dithering is delegated to Pillow's C-speed quantize engine (Floyd-Steinberg).
A contrast and saturation pre-pass spreads tones across the narrow e-Paper gamut.

The dithered image is returned in the same format and dimensions as the input.
"""

from __future__ import annotations

import io
import logging
from typing import Final

from PIL import Image, ImageEnhance

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Calibrated ACeP palette
# ---------------------------------------------------------------------------
# Tuned to the actual printed appearance of the Waveshare 7.3" ACeP display
# rather than idealised sRGB primaries.
E6_PALETTE_RGB: Final[list[tuple[int, int, int]]] = [
    (0,   0,   0),    # Black
    (255, 255, 255),  # White
    (0,   180, 60),   # Green  (ACeP green is teal-shifted and darker)
    (0,   80,  200),  # Blue   (ACeP blue is darker/desaturated)
    (200, 30,  30),   # Red    (ACeP red is slightly darker)
    (220, 200, 0),    # Yellow (ACeP yellow is warm, slightly dimmer)
]


def _build_palette_image() -> Image.Image:
    """Return a 256-entry palette-mode Image for use with Image.quantize()."""
    pal_data: list[int] = []
    for r, g, b in E6_PALETTE_RGB:
        pal_data.extend([r, g, b])
    # Pad remaining 250 slots with black (index 0 color).
    # Pillow's FS diffusion may assign error to these slots, but they all
    # resolve to (0,0,0) on convert("RGB") — same as our Black entry — so
    # the RGB output is always one of the 6 palette colors.
    pal_data += [0, 0, 0] * (256 - len(E6_PALETTE_RGB))
    pal_img = Image.new("P", (1, 1))
    pal_img.putpalette(pal_data)
    return pal_img


_PALETTE_IMAGE: Final[Image.Image] = _build_palette_image()


def floyd_steinberg_e6(image_bytes: bytes) -> bytes:
    """Dither an image to the 6-color e-Paper palette using Pillow's C engine.

    Steps:
    1. Decode and record original format.
    2. Boost contrast and saturation to spread tones across the e-Paper gamut.
    3. Quantise with Floyd-Steinberg dithering via Pillow's quantize().
    4. Re-encode in the original format and return.
    """
    src_buf = io.BytesIO(image_bytes)
    src = Image.open(src_buf)
    src.load()
    orig_format: str = src.format or "JPEG"
    orig_size: tuple[int, int] = src.size
    img = src.convert("RGB")

    # Gentle contrast + saturation boost to spread tones across the e-Paper gamut
    img = ImageEnhance.Contrast(img).enhance(1.2)
    img = ImageEnhance.Color(img).enhance(1.3)

    dithered = img.quantize(palette=_PALETTE_IMAGE, dither=Image.Dither.FLOYDSTEINBERG)
    out = dithered.convert("RGB")

    out_buf = io.BytesIO()
    save_kwargs: dict[str, object] = {}
    if orig_format.upper() == "JPEG":
        save_kwargs["quality"] = 95
        save_kwargs["subsampling"] = 0
    out.save(out_buf, format=orig_format, **save_kwargs)
    result = out_buf.getvalue()

    logger.debug(
        "e6 dither complete: %dx%d %s  %d bytes → %d bytes",
        orig_size[0], orig_size[1], orig_format, len(image_bytes), len(result),
    )
    return result
