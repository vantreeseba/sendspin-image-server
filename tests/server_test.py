"""Tests for SendspinImageServer's outbound connection handling."""

from __future__ import annotations

import asyncio
from unittest.mock import MagicMock

import pytest

from sendspin_image_server.server import SendspinImageServer

URL = "ws://192.0.2.1:8928/sendspin"


@pytest.fixture
def attempts(monkeypatch: pytest.MonkeyPatch) -> asyncio.Queue[str]:
    """Make every outbound connection fail, recording each attempt."""
    made: asyncio.Queue[str] = asyncio.Queue()

    def _refuse(url: str):
        made.put_nowait(url)
        raise OSError("unreachable")

    monkeypatch.setattr("sendspin_image_server.server.websockets.connect", _refuse)
    return made


class TestOutboundReconnect:
    async def test_seeing_a_client_again_retries_without_waiting_out_backoff(self, attempts):
        server = SendspinImageServer(server_id="s", server_name="Server")
        try:
            server.connect_to_client(URL)
            await asyncio.wait_for(attempts.get(), 1)

            # The first backoff is a full second; a re-announce must not wait for it.
            server.connect_to_client(URL)
            await asyncio.wait_for(attempts.get(), 0.5)
        finally:
            server.disconnect_from_client(URL)
            await asyncio.sleep(0)

    async def test_replacing_a_loop_keeps_the_new_one_registered(self, attempts):
        server = SendspinImageServer(server_id="s", server_name="Server")
        try:
            server.connect_to_client(URL)
            await asyncio.wait_for(attempts.get(), 1)

            server.reconnect_to_client(URL)
            await asyncio.wait_for(attempts.get(), 1)
            await asyncio.sleep(0)

            # The cancelled loop's cleanup must not drop its replacement.
            assert URL in server._outbound_tasks
            assert not server._outbound_tasks[URL].done()
        finally:
            server.disconnect_from_client(URL)
            await asyncio.sleep(0)


class TestDuplicateConnections:
    def test_closing_the_newer_connection_falls_back_to_the_older(self):
        server = SendspinImageServer(server_id="s", server_name="Server")
        older, newer = MagicMock(client_id="frame"), MagicMock(client_id="frame")
        server._connections["frame"] = [older, newer]
        server._clients["frame"] = newer

        server._forget_connection(newer)
        assert server.clients["frame"] is older

        server._forget_connection(older)
        assert "frame" not in server.clients

    def test_closing_the_older_connection_keeps_the_newer(self):
        server = SendspinImageServer(server_id="s", server_name="Server")
        older, newer = MagicMock(client_id="frame"), MagicMock(client_id="frame")
        server._connections["frame"] = [older, newer]
        server._clients["frame"] = newer

        server._forget_connection(older)
        assert server.clients["frame"] is newer
