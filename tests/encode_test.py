"""Tests for encoding images within a client's byte budget."""

from __future__ import annotations

import io
from unittest.mock import MagicMock

import numpy as np
import pytest
from aiosendspin.models.artwork import ArtworkChannel
from aiosendspin.models.types import ArtworkSource, PictureFormat
from PIL import Image

from sendspin_image_server.client import ClientState
from sendspin_image_server.dither import dither_to_pil, encode_pil
from sendspin_image_server.encode import encode_to_budget
from sendspin_image_server.stream import _dither_with_dot_size, push_image_to_client

WIDTH, HEIGHT = 320, 200


def _noise() -> Image.Image:
    rng = np.random.default_rng(7)
    return Image.fromarray(rng.integers(0, 255, (HEIGHT, WIDTH, 3), dtype=np.uint8))


def _png(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _colors(data: bytes) -> set[tuple[int, int, int]]:
    rgb = np.asarray(Image.open(io.BytesIO(data)).convert("RGB")).reshape(-1, 3)
    return {tuple(color) for color in np.unique(rgb, axis=0).tolist()}


def _client(picture_format: PictureFormat, max_image_bytes: int) -> ClientState:
    role = MagicMock()
    role.get_channel_configs.return_value = {
        0: ArtworkChannel(
            source=ArtworkSource.ALBUM, format=picture_format, width=WIDTH, height=HEIGHT
        )
    }
    return ClientState("c1", "Client", artwork=role, max_image_bytes=max_image_bytes)


class TestEncodePng:
    def test_keeps_every_dithered_color_exactly(self):
        dithered = dither_to_pil(_png(_noise()), "floyd-steinberg", "e6")
        encoded = encode_pil(dithered, "PNG")
        assert Image.open(io.BytesIO(encoded)).mode == "P"
        assert _colors(encoded) == _colors(_png(dithered))

    def test_keeps_rgb_above_256_colors(self):
        assert Image.open(io.BytesIO(encode_pil(_noise(), "PNG"))).mode == "RGB"


class TestEncodeToBudget:
    def test_keeps_first_step_when_it_fits(self):
        fitted = encode_to_budget(_noise(), "JPEG", 10_000_000)
        assert fitted.fits
        assert fitted.data == encode_pil(_noise(), "JPEG")

    def test_lowers_jpeg_quality_to_fit(self):
        full_size = len(encode_pil(_noise(), "JPEG"))
        fitted = encode_to_budget(_noise(), "JPEG", full_size // 2)
        assert fitted.fits
        assert len(fitted.data) <= full_size // 2

    def test_reduces_png_colors_to_fit(self):
        full_size = len(encode_pil(_noise(), "PNG"))
        fitted = encode_to_budget(_noise(), "PNG", full_size // 2)
        assert fitted.fits
        assert "colors" in fitted.step

    def test_coarser_dither_keeps_size_and_palette(self):
        source = _png(_noise())
        dithered = dither_to_pil(source, "floyd-steinberg", "e6")
        full_size = len(encode_pil(dithered, "PNG"))
        fitted = encode_to_budget(
            dithered,
            "PNG",
            full_size // 2,
            lambda dot_size: _dither_with_dot_size(source, "floyd-steinberg", "e6", dot_size),
        )
        assert fitted.fits
        assert Image.open(io.BytesIO(fitted.data)).size == (WIDTH, HEIGHT)
        assert _colors(fitted.data) <= _colors(_png(dithered))

    def test_reports_smallest_attempt_when_nothing_fits(self):
        fitted = encode_to_budget(_noise(), "JPEG", 1)
        assert fitted.fits is False
        assert len(fitted.data) < len(encode_pil(_noise(), "JPEG"))

    def test_exempts_bmp(self):
        assert encode_to_budget(_noise(), "BMP", 1).fits


class TestPushWithinBudget:
    @pytest.mark.asyncio
    async def test_sends_image_within_budget(self):
        client = _client(PictureFormat.JPEG, 20_000)
        sent = await push_image_to_client(client, _png(_noise()))
        assert sent is not None
        assert len(sent) <= 20_000
        client.artwork.send_artwork.assert_called_once()
        assert client.last_delivery.delivered

    @pytest.mark.asyncio
    async def test_withholds_image_that_cannot_fit(self):
        client = _client(PictureFormat.JPEG, 1)
        assert await push_image_to_client(client, _png(_noise())) is None
        client.artwork.send_artwork.assert_not_called()
        assert client.last_delivery.delivered is False
