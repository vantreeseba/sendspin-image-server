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

device_presets
    id             TEXT PRIMARY KEY   -- UUID
    name           TEXT NOT NULL
    dither_algo    TEXT NOT NULL DEFAULT 'none'
    dither_palette TEXT NOT NULL DEFAULT 'e6'
    interval       REAL NOT NULL DEFAULT 0

assignments
    client_id      TEXT PRIMARY KEY
    endpoint_id    TEXT NOT NULL
    preset_id      TEXT                -- optional reference to device_presets.id
    dither_algo    TEXT NOT NULL DEFAULT 'none'
    dither_palette TEXT NOT NULL DEFAULT 'e6'
    interval       REAL NOT NULL DEFAULT 0  -- 0 = server default

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

CREATE TABLE IF NOT EXISTS device_presets (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    dither_algo    TEXT NOT NULL DEFAULT 'none',
    dither_palette TEXT NOT NULL DEFAULT 'e6',
    interval       REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS assignments (
    client_id      TEXT PRIMARY KEY,
    endpoint_id    TEXT NOT NULL,
    preset_id      TEXT,
    dither_algo    TEXT NOT NULL DEFAULT 'none',
    dither_palette TEXT NOT NULL DEFAULT 'e6',
    interval       REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS clients (
    client_id      TEXT PRIMARY KEY,
    name           TEXT NOT NULL DEFAULT '',
    last_known_url TEXT,
    locked         INTEGER NOT NULL DEFAULT 0
);
"""

# Migrations applied separately (ALTER TABLE is idempotent via try/except)
_MIGRATION_ADD_PALETTE = (
    "ALTER TABLE assignments ADD COLUMN dither_palette TEXT NOT NULL DEFAULT 'e6'"
)
_MIGRATION_ADD_LAST_KNOWN_URL = "ALTER TABLE clients ADD COLUMN last_known_url TEXT"
_MIGRATION_ADD_PRESET_ID = "ALTER TABLE assignments ADD COLUMN preset_id TEXT"
_MIGRATION_ADD_LOCKED = "ALTER TABLE clients ADD COLUMN locked INTEGER NOT NULL DEFAULT 0"


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
        for migration in (
            _MIGRATION_ADD_PALETTE,
            _MIGRATION_ADD_LAST_KNOWN_URL,
            _MIGRATION_ADD_PRESET_ID,
            _MIGRATION_ADD_LOCKED,
        ):
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

    async def save_endpoint(
        self, endpoint_id: str, kind: str, name: str, config: dict[str, Any]
    ) -> None:
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
            result.append(
                {
                    "id": row["id"],
                    "kind": row["kind"],
                    "name": row["name"],
                    "config": config,
                }
            )
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
        preset_id: str | None = None,
    ) -> None:
        assert self._db is not None
        await self._db.execute(
            """
            INSERT INTO assignments (client_id, endpoint_id, preset_id, dither_algo, dither_palette, interval)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(client_id) DO UPDATE SET
                endpoint_id=excluded.endpoint_id,
                preset_id=excluded.preset_id,
                dither_algo=excluded.dither_algo,
                dither_palette=excluded.dither_palette,
                interval=excluded.interval
            """,
            (client_id, endpoint_id, preset_id, dither_algo, dither_palette, interval),
        )
        await self._db.commit()

    async def delete_assignment(self, client_id: str) -> None:
        assert self._db is not None
        await self._db.execute("DELETE FROM assignments WHERE client_id = ?", (client_id,))
        await self._db.commit()

    async def load_assignments(self) -> dict[str, dict[str, Any]]:
        """Return {client_id: {endpoint_id, preset_id, dither_algo, dither_palette, interval}} for all persisted assignments."""
        assert self._db is not None
        async with self._db.execute(
            "SELECT client_id, endpoint_id, preset_id, dither_algo, dither_palette, interval FROM assignments"
        ) as cur:
            rows = await cur.fetchall()
        return {
            row["client_id"]: {
                "endpoint_id": row["endpoint_id"],
                "preset_id": row["preset_id"],
                "dither_algo": row["dither_algo"],
                "dither_palette": row["dither_palette"],
                "interval": float(row["interval"]),
            }
            for row in rows
        }

    # ------------------------------------------------------------------
    # Device Presets
    # ------------------------------------------------------------------

    async def save_device_preset(
        self,
        preset_id: str,
        name: str,
        dither_algo: str = "none",
        dither_palette: str = "e6",
        interval: float = 0,
    ) -> None:
        assert self._db is not None
        await self._db.execute(
            """
            INSERT INTO device_presets (id, name, dither_algo, dither_palette, interval)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name=excluded.name,
                dither_algo=excluded.dither_algo,
                dither_palette=excluded.dither_palette,
                interval=excluded.interval
            """,
            (preset_id, name, dither_algo, dither_palette, interval),
        )
        await self._db.commit()

    async def delete_device_preset(self, preset_id: str) -> None:
        assert self._db is not None
        await self._db.execute("DELETE FROM device_presets WHERE id = ?", (preset_id,))
        await self._db.commit()

    async def load_device_presets(self) -> list[dict[str, Any]]:
        """Return all persisted device presets as dicts."""
        assert self._db is not None
        async with self._db.execute(
            "SELECT id, name, dither_algo, dither_palette, interval FROM device_presets"
        ) as cur:
            rows = await cur.fetchall()
        return [
            {
                "id": row["id"],
                "name": row["name"],
                "dither_algo": row["dither_algo"],
                "dither_palette": row["dither_palette"],
                "interval": float(row["interval"]),
            }
            for row in rows
        ]

    async def get_device_preset(self, preset_id: str) -> dict[str, Any] | None:
        """Return a single device preset by id, or None if not found."""
        assert self._db is not None
        async with self._db.execute(
            "SELECT id, name, dither_algo, dither_palette, interval FROM device_presets WHERE id = ?",
            (preset_id,),
        ) as cur:
            row = await cur.fetchone()
        if row is None:
            return None
        return {
            "id": row["id"],
            "name": row["name"],
            "dither_algo": row["dither_algo"],
            "dither_palette": row["dither_palette"],
            "interval": float(row["interval"]),
        }

    async def update_preset_assignment(self, client_id: str, preset_id: str | None) -> None:
        """Assign or unassign a preset for a client (keeps per-client overrides)."""
        assert self._db is not None
        await self._db.execute(
            """
            INSERT INTO assignments (client_id, endpoint_id, preset_id, dither_algo, dither_palette, interval)
            VALUES (?, NULL, ?, 'none', 'e6', 0)
            ON CONFLICT(client_id) DO UPDATE SET preset_id=excluded.preset_id
            """,
            (client_id, preset_id),
        )
        await self._db.commit()

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

    async def load_client_urls(self) -> dict[str, dict[str, str | None | bool]]:
        """Return {client_id: {name, last_known_url, locked}} for all persisted clients."""
        assert self._db is not None
        async with self._db.execute(
            "SELECT client_id, name, last_known_url, locked FROM clients"
        ) as cur:
            rows = await cur.fetchall()
        return {
            row["client_id"]: {
                "name": row["name"],
                "last_known_url": row["last_known_url"],
                "locked": bool(row["locked"]),
            }
            for row in rows
        }

    async def set_client_locked(self, client_id: str, locked: bool) -> None:
        """Set the locked flag for a client (upsert — creates the row if absent)."""
        assert self._db is not None
        await self._db.execute(
            """
            INSERT INTO clients (client_id, locked)
            VALUES (?, ?)
            ON CONFLICT(client_id) DO UPDATE SET locked=excluded.locked
            """,
            (client_id, int(locked)),
        )
        await self._db.commit()

    async def delete_client(self, client_id: str) -> None:
        """Remove a client and its assignment from the database."""
        assert self._db is not None
        await self._db.execute("DELETE FROM assignments WHERE client_id = ?", (client_id,))
        await self._db.execute("DELETE FROM clients WHERE client_id = ?", (client_id,))
        await self._db.commit()
