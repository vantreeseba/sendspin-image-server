"""Tier 2 — Tests for ClientAssignmentManager.

All methods under test are synchronous (db=None eliminates asyncio.create_task
calls), so no event loop is needed here.
"""

from __future__ import annotations

import pathlib
from unittest.mock import MagicMock

import pytest

from sendspin_image_server.assignments import ClientAssignmentManager
from sendspin_image_server.client import ROLE_ARTWORK, ClientState
from sendspin_image_server.endpoints import LocalFolderEndpoint
from sendspin_image_server.registry import DevicePreset


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _server(clients=None, discovered=None):
    srv = MagicMock()
    srv.clients = clients or {}
    srv.get_discovered_urls.return_value = discovered or []
    return srv


def _ep(eid: str = "ep1", name: str = "Endpoint") -> LocalFolderEndpoint:
    return LocalFolderEndpoint(name=name, path=pathlib.Path("/tmp"), endpoint_id=eid)


def _preset(
    pid: str = "p1",
    name: str = "Preset",
    algo: str = "floyd-steinberg",
    palette: str = "e6",
    interval: float = 60.0,
) -> DevicePreset:
    return DevicePreset(preset_id=pid, name=name, dither_algo=algo, dither_palette=palette, interval=interval)


def _manager(
    server=None,
    endpoints=None,
    presets=None,
    interval: float = 120.0,
    default_id: str | None = None,
) -> ClientAssignmentManager:
    srv = server or _server()
    ep_dict = {ep.endpoint_id: ep for ep in (endpoints or [])}
    preset_dict = {p.preset_id: p for p in (presets or [])}
    return ClientAssignmentManager(
        server=srv,
        interval=interval,
        dither_algo="none",
        dither_palette="e6",
        db=None,
        _default_endpoint_id=default_id,
        _endpoints=ep_dict,
        _device_presets=preset_dict,
    )


# ---------------------------------------------------------------------------
# assign / unassign
# ---------------------------------------------------------------------------


class TestAssign:
    def test_assign_to_known_endpoint_returns_true(self):
        ep = _ep()
        mgr = _manager(endpoints=[ep])
        assert mgr.assign("c1", ep.endpoint_id) is True

    def test_assign_stores_endpoint_id(self):
        ep = _ep()
        mgr = _manager(endpoints=[ep], default_id=ep.endpoint_id)
        mgr.assign("c1", ep.endpoint_id)
        assert mgr.effective_endpoint_id("c1") == ep.endpoint_id

    def test_assign_to_unknown_endpoint_returns_false(self):
        mgr = _manager()
        assert mgr.assign("c1", "nonexistent") is False

    def test_unassign_reverts_to_default(self):
        ep1 = _ep("ep1")
        ep2 = _ep("ep2", "Second")
        mgr = _manager(endpoints=[ep1, ep2], default_id=ep2.endpoint_id)
        mgr.assign("c1", ep1.endpoint_id)
        assert mgr.effective_endpoint_id("c1") == ep1.endpoint_id
        mgr.unassign("c1")
        assert mgr.effective_endpoint_id("c1") == ep2.endpoint_id

    def test_assign_with_unknown_preset_returns_false(self):
        ep = _ep()
        mgr = _manager(endpoints=[ep])
        assert mgr.assign("c1", ep.endpoint_id, preset_id="ghost") is False

    def test_effective_endpoint_id_with_no_assignment_returns_default(self):
        ep = _ep()
        mgr = _manager(endpoints=[ep], default_id=ep.endpoint_id)
        assert mgr.effective_endpoint_id("nobody") == ep.endpoint_id

    def test_effective_endpoint_id_no_default_returns_none(self):
        mgr = _manager()
        assert mgr.effective_endpoint_id("nobody") is None


# ---------------------------------------------------------------------------
# Dither / palette / interval per-client overrides
# ---------------------------------------------------------------------------


class TestOverrides:
    def test_set_client_dither_stores_algo(self):
        mgr = _manager()
        mgr.set_client_dither("c1", "floyd-steinberg")
        assert mgr.client_dither_algo("c1") == "floyd-steinberg"

    def test_set_client_palette_stores_palette(self):
        mgr = _manager()
        mgr.set_client_palette("c1", "bw")
        assert mgr.client_dither_palette("c1") == "bw"

    def test_set_client_interval_stores_interval(self):
        mgr = _manager()
        mgr.set_client_interval("c1", 30.0)
        assert mgr.client_interval("c1") == 30.0

    def test_client_dither_algo_defaults_to_server(self):
        mgr = _manager()
        assert mgr.client_dither_algo("unknown") == "none"

    def test_client_palette_defaults_to_server(self):
        mgr = _manager()
        assert mgr.client_dither_palette("unknown") == "e6"

    def test_client_interval_defaults_to_zero(self):
        mgr = _manager()
        assert mgr.client_interval("unknown") == 0

    def test_per_client_interval_zero_returns_zero(self):
        mgr = _manager(interval=120.0)
        mgr.set_client_interval("c1", 0)
        assert mgr.client_interval("c1") == 0

    def test_different_clients_have_independent_overrides(self):
        mgr = _manager()
        mgr.set_client_dither("c1", "atkinson")
        mgr.set_client_dither("c2", "ordered")
        assert mgr.client_dither_algo("c1") == "atkinson"
        assert mgr.client_dither_algo("c2") == "ordered"


# ---------------------------------------------------------------------------
# Preset assignment
# ---------------------------------------------------------------------------


class TestPresetAssignment:
    def test_assign_preset_clears_per_client_overrides(self):
        preset = _preset()
        mgr = _manager(presets=[preset])
        mgr.set_client_dither("c1", "atkinson")
        mgr.set_client_palette("c1", "bw")
        mgr.set_client_interval("c1", 10.0)
        mgr.assign_preset_to_client("c1", preset.preset_id)
        assert mgr.client_dither_algo("c1") == preset.dither_algo
        assert mgr.client_dither_palette("c1") == preset.dither_palette

    def test_assign_unknown_preset_raises(self):
        mgr = _manager()
        with pytest.raises(ValueError):
            mgr.assign_preset_to_client("c1", "ghost")

    def test_preset_dither_algo_is_returned(self):
        preset = _preset(algo="atkinson")
        mgr = _manager(presets=[preset])
        mgr.assign_preset_to_client("c1", preset.preset_id)
        assert mgr.client_dither_algo("c1") == "atkinson"

    def test_preset_palette_is_returned(self):
        preset = _preset(palette="bw")
        mgr = _manager(presets=[preset])
        mgr.assign_preset_to_client("c1", preset.preset_id)
        assert mgr.client_dither_palette("c1") == "bw"

    def test_preset_positive_interval_is_returned(self):
        preset = _preset(interval=45.0)
        mgr = _manager(presets=[preset])
        mgr.assign_preset_to_client("c1", preset.preset_id)
        assert mgr.client_interval("c1") == 45.0

    def test_preset_zero_interval_falls_back_to_zero(self):
        preset = _preset(interval=0)
        mgr = _manager(presets=[preset])
        mgr.assign_preset_to_client("c1", preset.preset_id)
        assert mgr.client_interval("c1") == 0

    def test_unassign_preset_via_none(self):
        preset = _preset()
        mgr = _manager(presets=[preset])
        mgr.assign_preset_to_client("c1", preset.preset_id)
        mgr.assign_preset_to_client("c1", None)
        assert mgr.client_dither_algo("c1") == "none"

    def test_per_client_override_takes_precedence_over_preset(self):
        preset = _preset(algo="atkinson")
        mgr = _manager(presets=[preset])
        mgr.assign_preset_to_client("c1", preset.preset_id)
        mgr.set_client_dither("c1", "ordered")
        assert mgr.client_dither_algo("c1") == "ordered"


# ---------------------------------------------------------------------------
# ensure_client / delete_client
# ---------------------------------------------------------------------------


class TestClientLifecycle:
    def test_ensure_client_with_url_stores_url(self):
        mgr = _manager()
        mgr.ensure_client("c1", "Frame", url="ws://10.0.0.1:8927/sendspin")
        assert mgr._client_last_url["c1"] == "ws://10.0.0.1:8927/sendspin"

    def test_ensure_client_without_url_does_not_store(self):
        mgr = _manager()
        mgr.ensure_client("c1", "Frame", url=None)
        assert "c1" not in mgr._client_last_url

    def test_delete_removes_assignment(self):
        ep = _ep()
        mgr = _manager(endpoints=[ep])
        mgr.assign("c1", ep.endpoint_id)
        mgr.delete_client("c1")
        assert "c1" not in mgr._assignments

    def test_delete_removes_url(self):
        mgr = _manager()
        mgr.ensure_client("c1", "Frame", url="ws://host/sendspin")
        mgr.delete_client("c1")
        assert "c1" not in mgr._client_last_url

    def test_delete_removes_preset_assignment(self):
        preset = _preset()
        mgr = _manager(presets=[preset])
        mgr.assign_preset_to_client("c1", preset.preset_id)
        mgr.delete_client("c1")
        assert "c1" not in mgr._preset_assignments


# ---------------------------------------------------------------------------
# client_info
# ---------------------------------------------------------------------------


class TestClientInfo:
    def test_returns_empty_list_when_no_clients(self):
        mgr = _manager()
        assert mgr.client_info() == []

    def test_connected_client_shows_status_connected(self):
        ws = MagicMock()
        cs = ClientState(
            client_id="c1",
            name="Frame",
            websocket=ws,
            active_roles=[ROLE_ARTWORK],
            stream_started=True,
        )
        srv = _server(clients={"c1": cs})
        ep = _ep()
        mgr = _manager(server=srv, endpoints=[ep], default_id=ep.endpoint_id)
        result = mgr.client_info()
        assert len(result) == 1
        assert result[0]["status"] == "connected"
        assert result[0]["id"] == "c1"
        assert result[0]["discovered_only"] is False

    def test_discovered_only_client_appears(self):
        srv = _server(discovered=[{"url": "ws://10.0.0.5:8927/sendspin", "client_id": None}])
        mgr = _manager(server=srv)
        result = mgr.client_info()
        assert len(result) == 1
        assert result[0]["discovered_only"] is True

    def test_connected_client_comes_before_discovered(self):
        ws = MagicMock()
        cs = ClientState(
            client_id="c1",
            name="Frame",
            websocket=ws,
            active_roles=[ROLE_ARTWORK],
            stream_started=True,
        )
        srv = _server(
            clients={"c1": cs},
            discovered=[{"url": "ws://10.0.0.5:8927/sendspin", "client_id": None}],
        )
        ep = _ep()
        mgr = _manager(server=srv, endpoints=[ep], default_id=ep.endpoint_id)
        result = mgr.client_info()
        assert result[0]["status"] == "connected"
        assert result[-1]["discovered_only"] is True

    def test_offline_db_client_with_known_url(self):
        ep = _ep()
        srv = _server(
            discovered=[{"url": "ws://10.0.0.5:8927/sendspin", "client_id": "c2"}],
        )
        mgr = _manager(server=srv, endpoints=[ep])
        mgr._assignments["c2"] = ep.endpoint_id
        result = mgr.client_info()
        assert len(result) == 1
        assert result[0]["discovered_only"] is False
        assert result[0]["id"] == "c2"

    def test_client_info_includes_endpoint_name(self):
        ws = MagicMock()
        cs = ClientState(
            client_id="c1",
            name="Frame",
            websocket=ws,
            active_roles=[ROLE_ARTWORK],
            stream_started=True,
        )
        srv = _server(clients={"c1": cs})
        ep = _ep(name="My Photos")
        mgr = _manager(server=srv, endpoints=[ep], default_id=ep.endpoint_id)
        result = mgr.client_info()
        assert result[0]["endpoint_name"] == "My Photos"

    def test_client_info_includes_dither_algo(self):
        ws = MagicMock()
        cs = ClientState(
            client_id="c1",
            name="Frame",
            websocket=ws,
            active_roles=[ROLE_ARTWORK],
            stream_started=True,
        )
        srv = _server(clients={"c1": cs})
        ep = _ep()
        mgr = _manager(server=srv, endpoints=[ep], default_id=ep.endpoint_id)
        mgr.set_client_dither("c1", "floyd-steinberg")
        result = mgr.client_info()
        assert result[0]["dither_algo"] == "floyd-steinberg"
