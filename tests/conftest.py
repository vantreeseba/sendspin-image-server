import io

import numpy as np
import pytest
from PIL import Image


@pytest.fixture
def solid_jpeg() -> bytes:
    """Return bytes for a 100x100 solid gray (128,128,128) JPEG image."""
    img = Image.new("RGB", (100, 100), (128, 128, 128))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)
    return buf.getvalue()


@pytest.fixture
def gradient_jpeg() -> bytes:
    """Return bytes for a 50x50 vertical gradient JPEG."""
    img_arr = np.zeros((50, 50, 3), dtype=np.uint8)
    for y in range(50):
        img_arr[y, :, 0] = y * 5  # red channel goes 0→245
        img_arr[y, :, 1] = y * 5  # green channel goes 0→245
        img_arr[y, :, 2] = y * 5  # blue channel goes 0→245
    img = Image.fromarray(img_arr, "RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)
    return buf.getvalue()


@pytest.fixture
def small_jpeg() -> bytes:
    """Return bytes for an 8x8 solid red JPEG (minimal image)."""
    img = Image.new("RGB", (8, 8), (255, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)
    return buf.getvalue()


@pytest.fixture
def large_jpeg() -> bytes:
    """Return bytes for a 512x512 JPEG with multiple colors."""
    img_arr = np.zeros((512, 512, 3), dtype=np.uint8)
    # Quadrants
    img_arr[:256, :256] = [128, 0, 0]    # red quadrant
    img_arr[:256, 256:] = [0, 128, 0]    # green quadrant
    img_arr[256:, :256] = [0, 0, 128]    # blue quadrant
    img_arr[256:, 256:] = [128, 128, 0]   # yellow quadrant
    img = Image.fromarray(img_arr, "RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)
    return buf.getvalue()
