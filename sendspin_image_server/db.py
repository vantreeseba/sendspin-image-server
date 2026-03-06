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
    client_id   TEXT PRIMARY KEY
    endpoint_id TEXT NOT NULL
    dither_algo TEXT NOT NULL DEFAULT 'floyd-steinberg'
    interval    REAL NOT NULL DEFAULT 0  -- 0 means use server default
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
    client_id   TEXT PRIMARY KEY,
    endpoint_id TEXT NOT NULL,
    dither_algo TEXT NOT NULL DEFAULT 'floyd-steinberg',
    interval    REAL NOT NULL DEFAULT 0
);
"""

# Migrations applied after schema creation (idempotent ALTER TABLE statements)
_MIGRATIONS = [
    # v1: add dither_algo column if it doesn't exist yet
    "ALTER TABLE assignments ADD COLUMN dither_algo TEXT NOT NULL DEFAULT 'floyd-steinberg'",
    # v2: add interval column (0 = use server default)
    "ALTER TABLE assignments ADD COLUMN interval REAL NOT NULL DEFAULT 0",
]


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
        await self._run_migrations()
        logger.info("Database opened: %s", self._path)

    async def _run_migrations(self) -> None:
        assert self._db is not None
        for sql in _MIGRATIONS:
            try:
                await self._db.execute(sql)
                await self._db.commit()
            except Exception:
                # Column already exists or other harmless conflict — skip
                pass

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
        dither_algo: str = "floyd-steinberg",
        interval: float = 0,
    ) -> None:
        assert self._db is not None
        await self._db.execute(
            """
            INSERT INTO assignments (client_id, endpoint_id, dither_algo, interval)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(client_id) DO UPDATE SET
                endpoint_id=excluded.endpoint_id,
                dither_algo=excluded.dither_algo,
                interval=excluded.interval
            """,
            (client_id, endpoint_id, dither_algo, interval),
        )
        await self._db.commit()

    async def delete_assignment(self, client_id: str) -> None:
        assert self._db is not None
        await self._db.execute("DELETE FROM assignments WHERE client_id = ?", (client_id,))
        await self._db.commit()

    async def load_assignments(self) -> dict[str, dict[str, Any]]:
        """Return {client_id: {endpoint_id, dither_algo, interval}} for all persisted assignments."""
        assert self._db is not None
        async with self._db.execute(
            "SELECT client_id, endpoint_id, dither_algo, interval FROM assignments"
        ) as cur:
            rows = await cur.fetchall()
        return {
            row["client_id"]: {
                "endpoint_id": row["endpoint_id"],
                "dither_algo": row["dither_algo"],
                "interval": float(row["interval"]),
            }
            for row in rows
        }
