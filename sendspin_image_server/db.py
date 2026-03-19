"""Persistent storage for endpoints and client assignments.

Uses SQLite via aiosqlite — same file-based philosophy as PGlite but from
pure Python with no extra services.

Schema
------
endpoints
    id          TEXT PRIMARY KEY   -- UUID or "builtin-local"
    kind        TEXT NOT NULL      -- "local" | "immich"
    name        TEXT NOT NULL
    config_json TEXT NOT NULL      -- kind-specific fields as JSON

assignments
    client_id      TEXT PRIMARY KEY
    endpoint_id    TEXT NOT NULL
    dither_algo    TEXT NOT NULL DEFAULT 'none'
    dither_palette TEXT NOT NULL DEFAULT 'e6'
    interval       REAL NOT NULL DEFAULT 0  -- 0 means use server default

clients
    client_id       TEXT PRIMARY KEY
    name            TEXT NOT NULL DEFAULT ''
    last_known_url  TEXT          -- last WebSocket URL we successfully connected to
"""

from __future__ import annotations

import json
import logging
import pathlib
from typing import Any

import aiosqlite

logger = logging.getLogger(__name__)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS endpoints (
    id          TEXT PRIMARY KEY,
    kind        TEXT NOT NULL,
    name        TEXT NOT NULL,
    config_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS assignments (
    client_id      TEXT PRIMARY KEY,
    endpoint_id    TEXT NOT NULL,
    dither_algo    TEXT NOT NULL DEFAULT 'none',
    dither_palette TEXT NOT NULL DEFAULT 'e6',
    interval       REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS clients (
    client_id      TEXT PRIMARY KEY,
    name           TEXT NOT NULL DEFAULT '',
    last_known_url TEXT
);
"""

# Migrations applied separately (ALTER TABLE is idempotent via try/except)
_MIGRATION_ADD_PALETTE = (
    "ALTER TABLE assignments ADD COLUMN dither_palette TEXT NOT NULL DEFAULT 'e6'"
)
_MIGRATION_ADD_LAST_KNOWN_URL = (
    "ALTER TABLE clients ADD COLUMN last_known_url TEXT"
)

class Database:
    """Async SQLite wrapper for endpoint + assignment persistence."""

    def __init__(self, path: pathlib.Path) -> None:
        self._path = path
        self._db: aiosqlite.Connection | None = None

    async def open(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._db = await aiosqlite.connect(str(self._path))
        self._db.row_factory = aiosqlite.Row
        await self._db.executescript(_SCHEMA)
        await self._db.commit()
        # Run migrations that may already exist on older DBs (swallow duplicate-column errors)
        for migration in (_MIGRATION_ADD_PALETTE, _MIGRATION_ADD_LAST_KNOWN_URL):
            try:
                await self._db.execute(migration)
                await self._db.commit()
            except Exception:
                pass  # Column already exists in existing DB — that's fine
        logger.info("Database opened: %s", self._path)

    async def close(self) -> None:
        if self._db is not None:
            await self._db.close()
            self._db = None

    # ------------------------------------------------------------------
    # Endpoints
    # ------------------------------------------------------------------

    async def save_endpoint(self, endpoint_id: str, kind: str, name: str, config: dict[str, Any]) -> None:
        assert self._db is not None
        await self._db.execute(
            """
            INSERT INTO endpoints (id, kind, name, config_json)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, name=excluded.name, config_json=excluded.config_json
            """,
            (endpoint_id, kind, name, json.dumps(config)),
        )
        await self._db.commit()

    async def delete_endpoint(self, endpoint_id: str) -> None:
        assert self._db is not None
        await self._db.execute("DELETE FROM endpoints WHERE id = ?", (endpoint_id,))
        await self._db.commit()

    async def load_endpoints(self) -> list[dict[str, Any]]:
        """Return all persisted endpoints as dicts."""
        assert self._db is not None
        async with self._db.execute("SELECT id, kind, name, config_json FROM endpoints") as cur:
            rows = await cur.fetchall()
        result = []
        for row in rows:
            try:
                config = json.loads(row["config_json"])
            except Exception:
                config = {}
            result.append({
                "id": row["id"],
                "kind": row["kind"],
                "name": row["name"],
                "config": config,
            })
        return result

    # ------------------------------------------------------------------
    # Assignments
    # ------------------------------------------------------------------

    async def save_assignment(
        self,
        client_id: str,
        endpoint_id: str,
        dither_algo: str = "none",
        dither_palette: str = "e6",
        interval: float = 0,
    ) -> None:
        assert self._db is not None
        await self._db.execute(
            """
            INSERT INTO assignments (client_id, endpoint_id, dither_algo, dither_palette, interval)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(client_id) DO UPDATE SET
                endpoint_id=excluded.endpoint_id,
                dither_algo=excluded.dither_algo,
                dither_palette=excluded.dither_palette,
                interval=excluded.interval
            """,
            (client_id, endpoint_id, dither_algo, dither_palette, interval),
        )
        await self._db.commit()

    async def delete_assignment(self, client_id: str) -> None:
        assert self._db is not None
        await self._db.execute("DELETE FROM assignments WHERE client_id = ?", (client_id,))
        await self._db.commit()

    async def load_assignments(self) -> dict[str, dict[str, Any]]:
        """Return {client_id: {endpoint_id, dither_algo, dither_palette, interval}} for all persisted assignments."""
        assert self._db is not None
        async with self._db.execute(
            "SELECT client_id, endpoint_id, dither_algo, dither_palette, interval FROM assignments"
        ) as cur:
            rows = await cur.fetchall()
        return {
            row["client_id"]: {
                "endpoint_id": row["endpoint_id"],
                "dither_algo": row["dither_algo"],
                "dither_palette": row["dither_palette"],
                "interval": float(row["interval"]),
            }
            for row in rows
        }

    # ------------------------------------------------------------------
    # Clients (last-known URL)
    # ------------------------------------------------------------------

    async def upsert_client_url(self, client_id: str, name: str, url: str) -> None:
        """Persist or update the last-known WebSocket URL for a client."""
        assert self._db is not None
        await self._db.execute(
            """
            INSERT INTO clients (client_id, name, last_known_url)
            VALUES (?, ?, ?)
            ON CONFLICT(client_id) DO UPDATE SET
                name=excluded.name,
                last_known_url=excluded.last_known_url
            """,
            (client_id, name, url),
        )
        await self._db.commit()

    async def load_client_urls(self) -> dict[str, dict[str, str | None]]:
        """Return {client_id: {name, last_known_url}} for all persisted clients."""
        assert self._db is not None
        async with self._db.execute(
            "SELECT client_id, name, last_known_url FROM clients"
        ) as cur:
            rows = await cur.fetchall()
        return {
            row["client_id"]: {
                "name": row["name"],
                "last_known_url": row["last_known_url"],
            }
            for row in rows
        }

    async def delete_client(self, client_id: str) -> None:
        """Remove a client and its assignment from the database."""
        assert self._db is not None
        await self._db.execute("DELETE FROM assignments WHERE client_id = ?", (client_id,))
        await self._db.execute("DELETE FROM clients WHERE client_id = ?", (client_id,))
        await self._db.commit()
