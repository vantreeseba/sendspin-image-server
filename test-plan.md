# Sendspin Image Server — Test Plan

> **Date:** 2026-04-27  
> **Status:** Proposed — not yet implemented  

---

## 1. Current Test Coverage

**Zero tests exist.** No `tests/` directory, no `conftest.py`, no `*_test.py` files anywhere in the codebase. No pytest configuration in `pyproject.toml`.

---

## 2. Remaining Issues Found in Code Review

Before writing tests, these issues should be addressed because they block reliable testing:

### Issue A1: `server.py` `registry` property getter returns `None` always
**File:** `server.py` line 73  
```python
@property
def registry(self) -> EndpointRegistry | None:
    """The endpoint registry, if wired up."""
    # getter body is missing — returns None implicitly
```
This property has no `return self._registry` in the getter body. The getter always returns `None` regardless of what was set. The setter (`self._registry = value`) works fine, but the getter is effectively broken.

**Fix:** Add `return self._registry` to the getter body.

**Testability impact:** `registry.py` line 294-295 in server.py does `if self._registry is not None: self._registry.ensure_client(...)`. Because the getter is broken, this `if` condition is always `False` regardless, meaning clients are never persisted during a connection handshake. This is a **production bug**. The tests would pass (testing against the wrong thing) until the getter is fixed.

### Issue A2: `add_endpoint` is sync but calls async DB functions
**File:** `registry.py` line 108  
```python
def add_endpoint(self, endpoint: ImageEndpoint, *, make_default: bool = False, _persist: bool = True) -> None:
    ...
    if _persist and self._assignments._db is not None:
        asyncio.create_task(...)  # fire & forget
```
The method spawns `asyncio.create_task()` calls but doesn't await them. If the caller is in a sync context (like `__main__` in cli.py), the DB writes will either fail (no running event loop) or silently drop.

**Fix:** Either make `add_endpoint` async (`async def`) and `await` the DB writes, or document that persistence is fire-and-forget. The same issue affects `remove_endpoint`, `add_device_preset`, `remove_device_preset`, etc.

**Testability impact:** Tests can't verify persistence because writes happen in background tasks that may not complete before assertions. Every DB-dependent test would need to `await asyncio.sleep(0.1)` to give tasks time to run.

### Issue A3: `update_device_preset` doesn't sync changed preset to `_assignments._device_presets`
**File:** `registry.py` line 177  
```python
def update_device_preset(self, preset_id, ...) -> bool:
    preset = self._device_presets.get(preset_id)
    ...  # mutates preset in place
    # MISSING: copies changes to self._assignments._device_presets[preset_id]
```
This is a regression from the original code. The original `registry.py` (757 lines) had `self._assignments._device_presets[preset_id] = preset` after mutation. The current code only mutates `self._device_presets` but `_assignments._device_presets` is a *separate dict* that was passed in as a reference — they point to the same dict object, so this actually works. **Wait — actually it works** because both dicts reference the same keys, and `self._device_presets[preset_id]` is the same object as `self._assignments._device_presets[preset_id]` since they're the same dict. So this is OK, but misleading.

### Issue A4: `_device_presets` passed as shared mutable ref, easy to diverge
**File:** `assignments.py` line 39  
```python
def __init__(self, ..., _device_presets: dict[str, Any] | None = None):
    self._device_presets = _device_presets  # shared with EndpointRegistry
```
And `assignments.py` line 357 copies presets: `self._assignments._device_presets[pid] = preset`. But `EndpointRegistry.add_device_preset` and `EndpointRegistry._assignments` both have the same dict, so they're the same. However, the type annotation `dict[str, Any]` hides the fact that the values should be `DevicePreset` objects.

**Testability impact:** Hard to test `ClientAssignmentManager` in isolation without passing the exact same dict that `EndpointRegistry` uses.

### Issue A5: No `asyncio.run()` or `asyncio.new_event_loop()` wrapper in cli.py `main()` for async calls
**File:** `cli.py` line 85  
```python
registry.add_endpoint(endpoint, make_default=True)
```
This is a synchronous call to an async method. If `add_endpoint` is made async (fix for A2), the CLI would need to change from `registry.add_endpoint(...)` to `await registry.add_endpoint(...)`.

**Testability impact:** Tests would need event loops to test CLI flow.

---

## 3. Recommended Test Pyramid

```
          /   Integration / E2E    \      (8-10 tests)
         /                            \
        /  Unit (registry/assignments) \     (30-40 tests)
       /                                \
      /  Unit (dither/stream)           \    (25-30 tests)
     /                                    \
    /  Pure function tests (dither.py)   \   (20-25 tests)
```

### Tier 1: Pure Functions (dither.py, ~25 tests) — **High value, low effort**

Pure functions, no mocking needed, fast (<1ms/test), deterministic.

| Test | What it verifies | Effort |
|------|------------------|--------|
| `test_dither_to_palette_bw` | B&W palette produces only black/white pixels | Low |
| `test_dither_to_palette_e6` | E6 palette produces exactly 6 colors | Low |
| `test_dither_all_algorithms_produce_same_shape` | All 3 algorithms output correct dimensions | Low |
| `test_resize_image_preserves_aspect_ratio` | Resizing with aspect ratio lock works | Low |
| `test_resize_image_exact_fit` | Resizing with exact dimensions | Low |
| `test_rgb_to_lab_round_trip` | Any color → LAB → RGB = original | Low |
| `test_lab_nearest_color_accuracy` | nearest-color returns closest palette color | Low |
| `test_lut_generation_matches_function` | Generated LUT equals function results | Low |
| `test_dither_ordered_bayer_pattern` | Bayer dither produces known pattern | Low |

### Tier 2: Data Classes (device_preset, client, ~8 tests) — Trivial but useful

| Test | What it verifies | Effort |
|------|------------------|--------|
| `test_device_preset_to_dict_roundtrip` | serialize → deserialize = original | Low |
| `test_client_state_default_values` | ClientState created with defaults | Low |
| `test_artwork_channel_default_values` | ArtworkChannel created with defaults | Low |

### Tier 3: Core Business Logic (assignments.py + registry.py, ~45 tests) — **High value, medium effort**

**ClientAssignmentManager — Assignment logic**

| Test | What it verifies | Effort |
|------|------------------|--------|
| `test_assign_sets_endpoint` | assign(client, ep) → effective_endpoint_id = ep | Low |
| `test_assign_to_unknown_endpoint_fails` | assign(client, fake) → False | Low |
| `test_assign_with_preset_clears_overrides` | assign with preset → dither/palette/interval cleared | Low |
| `test_assign_with_bad_preset_fails` | assign with nonexistent preset → False | Low |
| `test_effective_dither_prefs_client_override` | client override takes precedence over preset | Low |
| `test_effective_dither_prefs_preset` | preset value used when no client override | Low |
| `test_effective_dither_prefs_server_default` | server default used when no override/preset | Low |
| `test_effective_palette_prefs_client_override` | same pattern for palette | Low |
| `test_effective_interval_prefs_client_override` | same pattern for interval | Low |
| `test_effective_interval_prefs_preset` | preset interval used when > 0 | Low |
| `test_effective_interval_prefs_server_default_when_zero` | interval 0 → server default | Low |
| `test_set_dither_persists_to_db` | set_client_dither → db record updated | Medium |
| `test_set_palette_persists_to_db` | set_client_palette → db record updated | Medium |
| `test_set_interval_persists_to_db` | set_client_interval → db record updated | Medium |
| `test_unassign_clears_endpoint_preset_assignments` | unassign → effective_endpoint_id = None/default | Low |
| `test_delete_client_clears_all_state` | delete_client → all dicts cleared | Low |
| `test_ensure_client_records_url` | ensure_client(url=...) → _client_last_url set | Low |
| `test_ensure_client_no_url_logs_debug` | ensure_client(url=None) → debug log only | Low |
| `test_client_dither_algo_default` | default algo returned when no override | Low |

**ClientAssignmentManager — client_info() grouping**

| Test | What it verifies | Effort |
|------|------------------|--------|
| `test_client_info_connected_tier_only` | connected client appears in tier 1 | Low |
| `test_client_info_offline_included` | disconnected with DB record in tier 2 | Low |
| `test_client_info_discovered_only_included` | mDNS only in tier 3 | Low |
| `test_connected_not_duplicated_in_other_tiers` | client appears exactly once | Low |
| `test_client_info_metadata_correct` | dither/palette/interval/endpoint correct per tier | Medium |
| `test_client_info_discovered_url_populated` | discovered URL appears in discovered_only tier | Low |
| `test_client_info_empty_when_no_clients` | returns [] when no clients at all | Low |

**EndpointRegistry — CRUD operations**

| Test | What it verifies | Effort |
|------|------------------|--------|
| `test_add_endpoint_stores_in_dict` | add_endpoint → get_endpoint returns it | Low |
| `test_add_duplicate_endpoint_raises` | adding same ID twice → ValueError | Low |
| `test_add_endpoint_with_make_default_sets_default` | make_default=True → default_endpoint_id | Low |
| `test_add_first_endpoint_automatically_becomes_default` | first endpoint → default | Low |
| `test_builtin_endpoints_cannot_be_default` | builtin-local → guard prevents being default | Low |
| `test_remove_endpoint_removes_from_dict` | remove → get returns None | Low |
| `test_remove_nonexistent_endpoint_returns_false` | remove fake → False | Low |
| `test_remove_endpoint_removes_task` | remove → _assignments tasks cleaned | Low |
| `test_default_cascades_when_default_removed` | remove default endpoint → next becomes default | Low |
| `test_get_endpoint_returns_none_for_missing` | get fake → None | Low |
| `test_list_endpoints_returns_all` | list → len matches add count | Low |

**EndpointRegistry — preset operations**

| Test | What it verifies | Effort |
|------|------------------|--------|
| `test_add_preset_stores_in_dict` | add → get returns it | Low |
| `test_remove_preset_returns_bool` | remove → True, fake → False | Low |
| `test_update_preset_mutates_in_place` | update → object changed | Low |
| `test_update_preset_returns_changed_flag` | changed=True when modified, False when not | Low |
| `test_update_device_preset_presets_synced_to_assignments` | updated preset visible via _assignments | Medium |

### Tier 4: Integration (server.py, endpoints.py, ~15 tests) — **Medium value, medium-high effort**

| Test | What it verifies | Effort |
|------|------------------|--------|
| `test_broadcast_image_to_connected_clients` | image broadcast reaches all connected | High |
| `test_broadcast_image_skips_non_artwork_clients` | non-artwork clients not affected | High |
| `test_broadcast_image_persists_last_image` | _last_image set after broadcast | High |
| `test_handle_client_hello_parses_roles` | hello with roles → active_roles set correctly | Medium |
| `test_handle_client_hello_with_artwork_channels` | hello with channels → artwork_channels created | Medium |
| `test_handle_client_hello_with_artwork_channels_default` | hello without channels → one default channel | Medium |
| `test_handle_text_message_unhandled_returns_debug_log` | unknown msg type → debug log | Low |
| `test_stream_request_format_changes_channel` | format request → artwork channel updated | Medium |
| `test_outbound_connection_loop_retries_on_disconnect` | connection drops → retry happens | High |
| `test_disconnect_from_client_cancels_task` | disconnect → outbound task cancelled | Medium |

### Tier 5: Database Layer (~10 tests) — **High value, medium effort**

| Test | What it verifies | Effort |
|------|------------------|--------|
| `test_save_and_load_endpoint` | save → load → correct data | Medium |
| `test_save_and_load_device_preset` | save preset → load correct | Medium |
| `test_save_and_load_assignment` | save assignment → load correct | Medium |
| `test_upsert_client_url` | upsert → update overwrites | Medium |
| `test_delete_endpoint_removes_from_db` | delete → load returns empty | Medium |
| `test_migrations_add_config_json_column` | load_endpoints works after migration | Medium |
| `test_migrations_add_interval_column` | load_assignments includes interval | Medium |
| `test_restore_from_db_restores_all_tiers` | restore from DB → all tiers populated | High |

### Tier 6: REST API (~10 tests) — **Low value, high effort**

This is the least valuable area to test because:
- FastAPI handles parameter validation automatically
- The business logic is in `assignments.py` which is tested at Tier 3
- Network integration adds complexity without commensurate coverage value

If time allows:

| Test | What it verifies | Effort |
|------|------------------|--------|
| `test_list_clients_empty` | GET `/api/clients` → 200 + [] | Medium |
| `test_list_endpoints_empty` | GET `/api/endpoints` → 200 + [] | Medium |
| `test_add_endpoint` | POST `/api/endpoints` → 201 | Medium |
| `test_delete_nonexistent_endpoint` | DELETE → 404 | Medium |
| `test_create_device_preset` | POST → 201 | Medium |

---

## 4. Suggested Project Layout

```
sendspin-image-server/
├── sendspin_image_server/
│   ├── conftest.py              ← shared fixtures (db, mock_server, mock_endpoint)
│   ├── dither_test.py           ← Tier 1: ~25 tests
│   ├── preset_test.py           ← Tier 2: DevicePreset tests
│   ├── client_test.py           ← Tier 2: ClientState tests  
│   ├── stream_test.py           ← Tier 2a: stream tests
│   ├── assignments_test.py      ← Tier 3: ClientAssignmentManager + client_info
│   ├── registry_test.py         ← Tier 3: EndpointRegistry CRUD
│   ├── server_test.py           ← Tier 4: Broadcast, hello parsing
│   ├── endpoint_test.py         ← Tier 4: endpoint fetching
│   ├── database_test.py         ← Tier 5: DB layer tests
│   └── api_test.py              ← Tier 6: REST API (optional)
└── tests/                       ← optional: integration/E2E tests
```

### `conftest.py` contents (proposed)

```python
import asyncio
import pathlib
import tempfile
from unittest.mock import AsyncMock, MagicMock, Mock

import aiosqlite
import pytest

async def _ensure_tables(conn):
    from sendspin_image_server.db import Database
    db = Database(conn)
    await db._ensure_tables()

@pytest_asyncio.fixture
async def db():
    """In-memory SQLite database with all tables created."""
    conn = await aiosqlite.connect(":memory:")
    await _ensure_tables(conn)
    yield db
    await conn.close()

@pytest.fixture
def mock_server():
    """Minimal mock of SendspinImageServer for unit testing."""
    server = Mock()
    server.clients = {}
    server.get_discovered_urls = Mock(return_value=[])
    return server

@pytest.fixture
def mock_endpoint():
    """Create a mock image endpoint."""
    ep = MagicMock()
    ep.endpoint_id = "test-ep"
    ep.kind = "local"
    ep.name = "Test Endpoint"
    ep.fetch_next = AsyncMock(return_value=b"test-image-bytes")
    return ep

@pytest.fixture
def endpoint_registry(db, mock_server):
    """EndpointRegistry wired up with in-memory DB."""
    from sendspin_image_server.registry import EndpointRegistry
    r = EndpointRegistry(
        server=mock_server,
        interval=30.0,
        dither_algo="floyd-steinberg",
        dither_palette="e6",
        db=db,
    )
    return r
```

---

## 5. Running Tests

```bash
# Install deps
pip install pytest pytest-aiosqlite pillow numpy

# Run all tests
pytest sendspin_image_server/ -v

# Run only pure function tests (fastest)
pytest sendspin_image_server/dither_test.py -v

# Run only core logic tests
pytest sendspin_image_server/assignments_test.py sendspin_image_server/registry_test.py -v

# Run with coverage
pytest sendspin_image_server/ --cov=sendspin_image_server --cov-report=term-missing
```

---

## 6. Recommended Priority Order

| # | Module | Tests | Effort | Value | Notes |
|---|--------|-------|--------|-------|-------|
| 1 | `dither.py` | ~25 | Low | High | Pure functions, fast to write |
| 2 | `assignments.py` (ClientAssignmentManager) | ~30 | Medium | High | Core business logic, most complex |
| 3 | `registry.py` (EndpointRegistry CRUD) | ~20 | Medium | High | Ensures CRUD contracts work |
| 4 | `db.py` | ~8 | Medium | High | Persistence correctness |
| 5 | `stream.py` | ~5 | Medium | Medium | Image processing correctness |
| 6 | `server.py` | ~6 | High | Medium | Async/mocking complexity |
| 7 | REST API | ~5 | High | Low | Low value, FastAPI handles validation |

**Estimated total: ~99 tests, ~40 hours**
