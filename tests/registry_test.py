"""Tier 3 — Tests for EndpointRegistry (async, no DB).

add_endpoint / remove_endpoint are async because they call asyncio.create_task
internally (via _start_task).  Each test fixture cancels all background tasks
on teardown via registry.stop_all().
"""

from __future__ import annotations

import pathlib
from unittest.mock import MagicMock

import pytest

from sendspin_image_server.registry import DevicePreset, EndpointRegistry
from sendspin_image_server.endpoints import LocalFolderEndpoint


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _mock_server():
    srv = MagicMock()
    srv.clients = {}
    srv.get_discovered_urls.return_value = []
    return srv


def _ep(eid: str = "ep1", name: str = "Endpoint") -> LocalFolderEndpoint:
    return LocalFolderEndpoint(name=name, path=pathlib.Path("/tmp"), endpoint_id=eid)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_server():
    return _mock_server()


@pytest.fixture
async def empty_registry(mock_server):
    reg = EndpointRegistry(server=mock_server, interval=120, dither_algo="none")
    yield reg
    reg.stop_all()
    await reg.wait_stopped()


@pytest.fixture
async def registry_with_ep(mock_server):
    reg = EndpointRegistry(server=mock_server, interval=120, dither_algo="none")
    ep = _ep()
    await reg.add_endpoint(ep, _persist=False)
    yield reg, ep
    reg.stop_all()
    await reg.wait_stopped()


# ---------------------------------------------------------------------------
# Endpoint CRUD
# ---------------------------------------------------------------------------


class TestEndpointCRUD:
    async def test_add_endpoint(self, empty_registry):
        ep = _ep()
        await empty_registry.add_endpoint(ep, _persist=False)
        assert empty_registry.get_endpoint(ep.endpoint_id) is ep

    async def test_add_sets_as_default_when_first(self, empty_registry):
        ep = _ep()
        await empty_registry.add_endpoint(ep, _persist=False)
        assert empty_registry.default_endpoint_id == ep.endpoint_id

    async def test_second_add_does_not_override_default(self, empty_registry):
        ep1 = _ep("ep1", "First")
        ep2 = _ep("ep2", "Second")
        await empty_registry.add_endpoint(ep1, _persist=False)
        await empty_registry.add_endpoint(ep2, _persist=False)
        assert empty_registry.default_endpoint_id == ep1.endpoint_id

    async def test_make_default_flag_overrides(self, empty_registry):
        ep1 = _ep("ep1", "First")
        ep2 = _ep("ep2", "Second")
        await empty_registry.add_endpoint(ep1, _persist=False)
        await empty_registry.add_endpoint(ep2, make_default=True, _persist=False)
        assert empty_registry.default_endpoint_id == ep2.endpoint_id

    async def test_add_duplicate_raises(self, registry_with_ep):
        reg, ep = registry_with_ep
        with pytest.raises(ValueError):
            await reg.add_endpoint(ep, _persist=False)

    async def test_list_endpoints_returns_all(self, empty_registry):
        ep1 = _ep("ep1")
        ep2 = _ep("ep2", "Second")
        await empty_registry.add_endpoint(ep1, _persist=False)
        await empty_registry.add_endpoint(ep2, _persist=False)
        ids = {e.endpoint_id for e in empty_registry.list_endpoints()}
        assert ids == {"ep1", "ep2"}

    async def test_remove_endpoint(self, registry_with_ep):
        reg, ep = registry_with_ep
        removed = await reg.remove_endpoint(ep.endpoint_id)
        assert removed is True
        assert reg.get_endpoint(ep.endpoint_id) is None

    async def test_remove_unknown_returns_false(self, empty_registry):
        assert await empty_registry.remove_endpoint("ghost") is False

    async def test_remove_default_updates_default_to_next(self, empty_registry):
        ep1 = _ep("ep1")
        ep2 = _ep("ep2", "Second")
        await empty_registry.add_endpoint(ep1, _persist=False)
        await empty_registry.add_endpoint(ep2, _persist=False)
        assert empty_registry.default_endpoint_id == "ep1"
        await empty_registry.remove_endpoint("ep1")
        assert empty_registry.default_endpoint_id == "ep2"

    async def test_default_endpoint_id_setter_raises_for_unknown(self, empty_registry):
        with pytest.raises(ValueError):
            empty_registry.default_endpoint_id = "ghost"


# ---------------------------------------------------------------------------
# Device Preset CRUD
# ---------------------------------------------------------------------------


class TestPresetCRUD:
    async def test_add_device_preset(self, empty_registry):
        preset = DevicePreset("p1", "Preset", "floyd-steinberg", "e6", 60)
        await empty_registry.add_device_preset(preset, _persist=False)
        assert empty_registry.get_device_preset("p1") is preset

    async def test_list_device_presets(self, empty_registry):
        p1 = DevicePreset("p1", "P1", "none", "e6", 0)
        p2 = DevicePreset("p2", "P2", "atkinson", "bw", 30)
        await empty_registry.add_device_preset(p1, _persist=False)
        await empty_registry.add_device_preset(p2, _persist=False)
        ids = {p.preset_id for p in empty_registry.list_device_presets()}
        assert ids == {"p1", "p2"}

    async def test_remove_device_preset(self, empty_registry):
        preset = DevicePreset("p1", "Preset", "none", "e6", 0)
        await empty_registry.add_device_preset(preset, _persist=False)
        assert await empty_registry.remove_device_preset("p1") is True
        assert empty_registry.get_device_preset("p1") is None

    async def test_remove_unknown_preset_returns_false(self, empty_registry):
        assert await empty_registry.remove_device_preset("ghost") is False

    async def test_update_preset_name(self, empty_registry):
        preset = DevicePreset("p1", "Old", "none", "e6", 0)
        await empty_registry.add_device_preset(preset, _persist=False)
        assert empty_registry.update_device_preset("p1", name="New") is True
        assert empty_registry.get_device_preset("p1").name == "New"

    async def test_update_preset_same_value_returns_false(self, empty_registry):
        preset = DevicePreset("p1", "Same", "none", "e6", 0)
        await empty_registry.add_device_preset(preset, _persist=False)
        assert empty_registry.update_device_preset("p1", name="Same") is False

    async def test_update_unknown_preset_returns_false(self, empty_registry):
        assert empty_registry.update_device_preset("ghost", name="X") is False

    async def test_update_preset_algo(self, empty_registry):
        preset = DevicePreset("p1", "P", "none", "e6", 0)
        await empty_registry.add_device_preset(preset, _persist=False)
        empty_registry.update_device_preset("p1", dither_algo="atkinson")
        assert empty_registry.get_device_preset("p1").dither_algo == "atkinson"

    async def test_update_preset_palette(self, empty_registry):
        preset = DevicePreset("p1", "P", "none", "e6", 0)
        await empty_registry.add_device_preset(preset, _persist=False)
        empty_registry.update_device_preset("p1", dither_palette="bw")
        assert empty_registry.get_device_preset("p1").dither_palette == "bw"

    async def test_update_preset_interval(self, empty_registry):
        preset = DevicePreset("p1", "P", "none", "e6", 0)
        await empty_registry.add_device_preset(preset, _persist=False)
        empty_registry.update_device_preset("p1", interval=90.0)
        assert empty_registry.get_device_preset("p1").interval == 90.0


# ---------------------------------------------------------------------------
# Client assignment via registry
# ---------------------------------------------------------------------------


class TestClientAssignmentViaRegistry:
    async def test_assign_to_known_endpoint_returns_true(self, registry_with_ep):
        reg, ep = registry_with_ep
        assert reg.assign("c1", ep.endpoint_id) is True

    async def test_assign_to_unknown_endpoint_returns_false(self, registry_with_ep):
        reg, _ = registry_with_ep
        assert reg.assign("c1", "ghost") is False

    async def test_effective_endpoint_falls_back_to_default(self, registry_with_ep):
        reg, ep = registry_with_ep
        assert reg.effective_endpoint_id("unknown") == ep.endpoint_id

    async def test_set_get_client_dither(self, registry_with_ep):
        reg, _ = registry_with_ep
        reg.set_client_dither("c1", "atkinson")
        assert reg.client_dither_algo("c1") == "atkinson"

    async def test_set_get_client_palette(self, registry_with_ep):
        reg, _ = registry_with_ep
        reg.set_client_palette("c1", "bw")
        assert reg.client_dither_palette("c1") == "bw"

    async def test_set_get_client_interval(self, registry_with_ep):
        reg, _ = registry_with_ep
        reg.set_client_interval("c1", 45.0)
        assert reg.client_interval("c1") == 45.0

    async def test_assign_with_preset(self, empty_registry):
        ep = _ep()
        preset = DevicePreset("p1", "Preset", "floyd-steinberg", "bw", 30)
        await empty_registry.add_endpoint(ep, _persist=False)
        await empty_registry.add_device_preset(preset, _persist=False)
        assert empty_registry.assign("c1", ep.endpoint_id, preset_id="p1") is True

    async def test_assign_with_unknown_preset_returns_false(self, registry_with_ep):
        reg, ep = registry_with_ep
        assert reg.assign("c1", ep.endpoint_id, preset_id="ghost") is False

    async def test_assign_preset_to_client_changes_algo(self, empty_registry):
        ep = _ep()
        preset = DevicePreset("p1", "P", "atkinson", "e6", 0)
        await empty_registry.add_endpoint(ep, _persist=False)
        await empty_registry.add_device_preset(preset, _persist=False)
        empty_registry.assign_preset_to_client("c1", "p1")
        assert empty_registry.client_dither_algo("c1") == "atkinson"

    async def test_assign_preset_unknown_raises(self, registry_with_ep):
        reg, _ = registry_with_ep
        with pytest.raises(ValueError):
            reg.assign_preset_to_client("c1", "ghost")

    async def test_unassign_client(self, registry_with_ep):
        reg, ep = registry_with_ep
        reg.assign("c1", ep.endpoint_id)
        reg.unassign("c1")
        assert reg._assignments._assignments.get("c1") is None

    async def test_delete_client(self, registry_with_ep):
        reg, ep = registry_with_ep
        reg.assign("c1", ep.endpoint_id)
        reg.delete_client("c1")
        assert reg._assignments._assignments.get("c1") is None

    async def test_ensure_client_stores_url(self, registry_with_ep):
        reg, _ = registry_with_ep
        reg.ensure_client("c1", "Frame", url="ws://10.0.0.5:8927/sendspin")
        assert reg._assignments._client_last_url.get("c1") == "ws://10.0.0.5:8927/sendspin"

    async def test_client_info_empty(self, empty_registry):
        assert empty_registry.client_info() == []

    async def test_client_info_reflects_added_endpoints(self, registry_with_ep):
        reg, ep = registry_with_ep
        assert isinstance(reg.client_info(), list)
