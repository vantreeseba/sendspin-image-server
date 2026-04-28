# Sendspin Image Server — Todos

> Compiled 2026-04-27. Cross-referenced from `ui-review.md`, `test-plan.md`, and code inspection.

---

## High Priority ✓ (completed 2026-04-28)

### ~~UI: Multi-client visual grouping (B.1)~~ ✓
**Files:** `ui/src/App.tsx`, `ui/src/components/ClientCard.tsx`

Backend already groups clients into `connected` / `offline` / `discovered_only` but the frontend renders them in one flat grid. The main user-facing ask from `ui-review.md`.

Suggested approach (frontend-only, no API change needed):
- Sort clients by status: connected first, then offline, then discovered
- Render section headers: "Active Devices (N)", "Disconnected (N)", "Discovered (N)"
- Visual card distinction: green/amber border + status pill per group
- Collapsible cards: collapsed = name + status + resolution + provider; expanded = full controls

---

### ~~Tests: Write the test suite~~ ✓
**Files:** `tests/` (currently only `conftest.py` and empty `dither_test.py`)

Zero coverage across all modules. `test-plan.md` has a full proposed plan (~99 tests in 6 tiers, ~40 hours estimated). Key areas to cover first:
1. `assignments.py` — assign/unassign, dither overrides, preset lookup
2. `registry.py` — add/remove endpoints, update_device_preset
3. `server.py` — WebSocket handshake, `_parse_client_hello`, ensure_client path
4. REST API endpoints (cli.py) — happy path + 404/400 cases
5. `endpoints.py` — LocalFolder, Immich, HomeAssistant fetch logic

---

## Medium Priority

### Backend: Feed loop backpressure (A.8)
**File:** `sendspin_image_server/assignments.py:372`

`_feed_loop` fires every N seconds regardless of whether the previous push succeeded. If a client's WebSocket is slow or broken, images pile up in `asyncio.gather` coroutines. Add skip logic: if the client's last push is still in-flight or failed, skip that tick for that client.

---

### Backend: Fire-and-forget DB writes (A.2 partial)
**Files:** `sendspin_image_server/assignments.py:86,100,113,129,151,202,212,217`, `registry.py:123,144,158,168,211`

All CRUD operations spawn `asyncio.create_task(db.write(...))` but don't track the task handle. If a write fails, the error is silently dropped (only logged by asyncio's default exception handler). Consider wrapping in a helper that logs failures explicitly, or collect these short-lived tasks for error monitoring.

---

### Backend: Expose client grouping on the API (A.9)
**File:** `sendspin_image_server/assignments.py:235-346` (`client_info()`)

The method already builds `connected`, `offline`, `discovered_only` lists internally but returns them flattened. Either:
- Add a `group: str` field to each client dict, or
- Return `{connected: [...], offline: [...], discovered_only: [...]}` as a top-level structure

Needed if we want the UI grouping to be driven by backend data rather than frontend inference from `status` field.

---

### Security: No URL validation on endpoint registration (A.7 / security)
**File:** `sendspin_image_server/registry.py`

URLs for Immich and HomeAssistant endpoints are stored without validation. No scheme check (http/https only), no malformed-host check. At minimum, validate that the URL parses and uses an allowed scheme before storing.

---

### Security: Credentials stored in plain text (db.py)
**File:** `sendspin_image_server/db.py`

Immich API keys and HA tokens are stored as plain text in SQLite. If the data volume is compromised, all connected services are exposed. Consider documenting this risk prominently, or encrypting credential fields at rest.

---

### UI: ClientCard collapse/expand (B.2)
**File:** `ui/src/components/ClientCard.tsx`

Each card renders 7 info rows + 6 conditional control rows + action buttons in one flat block (~190 lines of JSX). Collapsed state should show: status + name + resolution + current provider. Expand on click to show dither/palette/interval/preset controls and action buttons.

---

## Low Priority

### Backend: Stale discovered-only entries cleanup (A.3)
**File:** `sendspin_image_server/server.py`, `assignments.py`

`MDNSDiscovery` calls `on_client_removed` → `server.disconnect_from_client(url)` which removes the URL from `_discovered_clients`. Verify this path handles rapid churn (device repeatedly advertises/disappears) without creating duplicate entries. If needed, add timestamp tracking and a periodic cleanup task for entries unseen for >5 min.

---

### Backend: ClientState.last_image unbounded growth (A.4)
**File:** `sendspin_image_server/client.py`

`last_image` list is never pruned. Cap at last N frames (e.g., 5) to prevent memory accumulation in long-running sessions.

---

### Backend: Extract normalize_url utility (A.5)
**Files:** `sendspin_image_server/client.py:7-8`, `endpoints.py:20-21`

Both use `rstrip('/') + f"/{port}"`. Extract to a shared `normalize_url(base_url, port)` utility.

---

### Backend: Default endpoint guard (A.6)
**File:** `sendspin_image_server/registry.py`

`_get_default_endpoint()` returns `None` if no `is_default` endpoint is configured, but the downstream caller falls back to `self._endpoints[0]` which raises on empty list. Add a guard in `_ensure_builtin_endpoints` that guarantees at least one default.

---

### Backend: HA endpoint silent error swallowing (A.10)
**File:** `sendspin_image_server/endpoints.py`

`HomeAssistantEndpoint.browse()` retries 3× and swallows all exceptions. After exhausting retries, log a `WARNING` with the actual exception so misconfigured HA tokens/URLs surface in logs.

---

### Backend: LocalFolder FileNotFoundError logging (A.11)
**File:** `sendspin_image_server/endpoints.py`

`LocalFolderEndpoint.fetch()` catches `FileNotFoundError` silently. Log the missing path so users can diagnose configuration issues rather than seeing a generic "No images" message.

---

### UI: Bulk client operations (B.3)
**Files:** `ui/src/App.tsx`

No way to force-connect all discovered clients at once or apply a preset to multiple offline clients. Add per-section "Select All" + "Connect Selected" / "Apply Preset to Selected" actions.

---

### UI: Configurable polling interval (B.4)
**Files:** `ui/src/App.tsx:27-29`, `sendspin_image_server/server.py:70`, `ui/src/hooks/usePoller.ts:11`

5000ms hardcoded in three places. Either add a `?poll=N` query param or a localStorage preference.

---

### UI: Friendly client names / rename action (B.5)

Clients show raw MAC/UUID IDs. Add a rename action (edit icon on card title) that persists a `friendly_name` via a new REST endpoint and returns it in `client_info()`.

---

### UI: Loading states (B.6)
**File:** `ui/src/App.tsx:76`

On initial load, "No clients discovered" shows immediately, which is misleading. Add an `isLoading` state and show skeleton cards or a spinner while the first poll is in flight.

---

## Done ✓

- Split `EndpointRegistry` into `EndpointRegistry` + `ClientAssignmentManager` (A.1) — v1.9.0
- Feed loop background tasks are tracked in `self._tasks` dict and cancelled on `stop_all()` — resolved in refactor
- `registry` property getter correctly returns `self._registry` — no bug present
