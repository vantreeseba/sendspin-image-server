# Sendspin Image Server — Code Review & Refactoring Wishlist

> **Date:** 2026-04-27
> **Scope:** All files in `sendspin_image_server/` + `ui/`
> **Purpose:** Audit + cleanup list. Nothing is implemented. Review first, then tell me what to build.

---

## A. Backend Code Review Findings

### A.1: Registry class is a monster (~750 lines) — split it

**File:** `registry.py` (entire file)
**Severity:** 🟠 Major

The `EndpointRegistry` class alone is 757 lines managing five distinct concerns:
- Endpoint registration, updates, and deletion
- Device preset management
- Client explicit assignment + default/preset matching
- mDNS discovery polling (`self._discovery_poller`)
- Image feed polling for all endpoints (`self._feed_loop`)
- Per-client dither override storage

This violates single responsibility and makes any change error-prone.

**Suggested cleanup:**
- Split into: `EndpointRegistry`, `ClientAssignmentManager` (assignments, presets, defaults), `ImageFeedManager` (polling, `_feed_loop`), `DitherOverrideStore` (per-client overrides)
**Priority:** Medium-high

---

### A.2: `_feed_loop` background task is never cancelled or tracked

**File:** `registry.py:135-146`
**Severity:** 🔴 Critical

The `_feed_loop` task is created with `asyncio.create_task()` at startup but the task handle is never stored anywhere. There's no way to cancel it on shutdown. Same problem exists in `mdns.py` for `Discovery._discovery_poller`.

This is a resource leak in long-running deployments.

**Suggested cleanup:**
- Store as `self._feed_task = asyncio.create_task(self._feed_loop())`
- Add `self.aclose()` method that cancels all background tasks
- Call from server shutdown handlers
**Priority:** High

---

### A.3: `discovered_only` clients never removed from `self._clients`

**File:** `registry.py:356-359`, `client.py:8-12`
**Severity:** 🟠 Major

When mDNS discovers a client, a `ClientState` is created with `discovered_only=True` and added to `self._clients`. As devices go online/offline, mDNS discovery fires repeatedly. The old stale entry stays in `_clients` forever. Only when the device connects explicitly do you update in place (line 302).

Memory leak in deployments where devices frequently appear/disappear.

**Suggested cleanup:**
- When mDNS finds a discovered client, check if it already exists in `_clients` and update in place rather than creating a new one
- Add a periodic cleanup task that removes stale discovered-only entries whose mDNS timestamp hasn't updated in > 5 minutes
**Priority:** Medium

---

### A.4: `ClientState.last_image` stores full `ndarray` objects indefinitely

**File:** `client.py:5-6`
**Severity:** 🟡 Minor

`last_image: list[nndarray] = field(default_factory=list)` stores every image frame pushed to the client and never prunes. For long-running sessions this accumulates.

**Suggested cleanup:**
- Cap the list to N frames (e.g., last 5 frames) with a check at the start of `_push_image`
- Or: store a compressed version (JPEG bytes instead of raw ndarray) for the debug preview
**Priority:** Low

---

### A.5: URL canonicalization duplicated between `Client` and `LocalFolderEndpoint`

**File:** `client.py:7-8`, `endpoints.py:20-21`
**Severity:** 🟡 Minor

Both use the same string-manipulation pattern: `rstrip('/') + f"/{port}"`. If the port config changes, this must be updated in both places.

**Suggested cleanup:**
- Extract to a `normalize_url(base_url: str, port: int) -> str` utility function
**Priority:** Low

---

### A.6: `_get_default_endpoint` silently returns `None` with no endpoints

**File:** `registry.py:478-486`
**Severity:** 🟡 Minor

If the registry is started with zero or no `is_default` endpoints configured, the function returns `None`. The downstream caller `_client_info()` (line 497) then defaults to `self._endpoints[0]` which raises if the list is empty.

**Suggested cleanup:**
- Add validation in `_ensure_builtin_endpoints` that guarantees at least one default
- Or: explicitly document and handle the None case everywhere
**Priority:** Low

---

### A.7: `register_endpoint` silently overwrites existing entries

**File:** `registry.py:329-354`
**Severity:** 🟡 Minor

No dedup check or warning on duplicate endpoint_id. Calling `register_endpoint()` twice with the same ID silently replaces the previous one. No URL validation before storing.

**Suggested cleanup:**
- Return `(endpoint, created: bool)` tuple
- Warn when overwriting
- Validate URL format before storing
**Priority:** Low

---

### A.8: `_feed_loop` has no backpressure — fires regardless of send success

**File:** `registry.py:135-146`
**Severity:** 🟠 Major (with many devices)

The polling loop fires every 1 second regardless of whether the previous image was successfully sent. If a client's WebSocket is slow or disconnected, image frames pile up in `ClientState.last_image`.

**Suggested cleanup:**
- Track whether the previous `client_state.last_image` was successfully sent via WebSocket
- If not, skip or apply exponential backoff to that client's polling
- Consider a circular buffer (last N frames) instead of unlimited growth
**Priority:** Medium

---

### A.9: `client_info()` client ordering is inconsistent with UI expectations

**File:** `registry.py:356-359`
**Severity:** 🟢 Design note

The method groups clients into `connected`, `offline`, `discovered_only` internally but returns them as a single flat `.list`. The UI receives no group information and must infer status from individual client fields (e.g., `discovered_only`).

**Suggested cleanup:**
- Either: expose the grouped structure to the API (e.g., `{connected: [...], offline: [...], discovered_only: [...]}`)
- Or: add a computed `group: str` field on each Client that encodes the backend's grouping
**Priority:** Design decision — affects both backend API and frontend

---

### A.10: `endpoints.py` — HomeAssistant endpoint has aggressive retry

**File:** `endpoints.py:185-199`
**Severity:** 🟡 Minor

The `browse()` method retries 3 times with 1-second delay, and `resolve_media()` retries 1 time. Both silently swallow all exceptions. The HTTP download also silently swallows the first retry attempt (except logging). This can mask real configuration problems.

**Suggested cleanup:**
- After all retries exhausted, return None with a clear warning log
- Consider adding a `try_count` or `success` field tracked per endpoint for metrics
**Priority:** Low

---

### A.11: `endpoints.py` — LocalFolderEndpoint `fetch()` silently swallows FileNotFoundError

**File:** `endpoints.py:62-64`
**Severity:** 🟡 Minor

FileNotFoundError in `fetch()` is caught but not re-raised, so the caller gets `None` rather than an actionable error. The registry log message "No current image available" is unhelpful if the problem is a missing folder.

**Suggested cleanup:**
- Add a `exists: bool` or `error: str | None` field on the returned Endpoint state
- Log the actual path that was missing
**Priority:** Low

---

## B. Frontend / UI Review Findings

### B.1: Multiple clients — no visual hierarchy or grouping ✨ (your "make it nice" ask)

**Files:** `App.tsx:75-79`, `registry.py:356-359`
**Severity:** 🟡 Design

**Problem:** The backend already groups clients into `connected`, `offline`, `discovered_only` (registry.py) but the frontend ignores this grouping. All clients are rendered in one flat 2-column grid. When you have 6+ clients connected and 3 discovered, the card for your active e-paper display is visually identical to the card for a device that hasn's sent handshake data in 10 minutes.

**Suggested redesign:**
- **Three sections with headers:** "Active Devices" (connected), "Disconnected" (offline), "Discovered" (unassigned, visible on mDNS)
- **Visual card distinction per status:**
  - Connected: green left border accent + green status pill + full opacity
  - Offline: amber left border + amber status pill + reduced opacity (60% already exists)
  - Discovered-only: amber outline + amber status pill (already partially implemented)
- **Group counts in headers:** "(3)" next to each section header
- **Collapsible cards:** Click a card to expand it. Collapsed shows just: status, name, resolution, provider. Expanded shows all controls below
**Priority:** HIGH — this is your main ask

---

### B.2: ClientCard is overloaded (190 lines of JSX in one card)

**File:** `ClientCard.tsx:166-356`
**Severity:** 🟡 UX

**Problem:** Each card has 7 labeled rows of information plus 6 conditional control rows (endpoint selector, palette selector, preset dropdown, dither algorithm selector, interval input, update button) plus force-connect and forget buttons. Every card is tall and cluttered.

**Suggested redesign:**
- Default state shows 3 lines: status + name + resolution + provider (collapsed)
- Expandable section shows all the rest as "Advanced" controls
- Move "Forget" and "Debug preview" to a hover-only action bar on the card header
- Or: move advanced controls behind a "⋮" context menu
**Priority:** Medium — improves scannability when many clients

---

### B.3: No bulk operations for multiple clients

**Severity:** 🟡 UX

**Problem:** No way to force-connect all discovered clients at once, or assign all offline clients to a preset. Useful when setting up multiple devices.

**Suggested addition:**
- Add a "Select All" checkbox per section header
- Add a "Connect Selected" or "Apply Preset to Selected" button
- Selection state lives in App.tsx, not individual cards
**Priority:** Low — nice-to-have

---

### B.4: Polling interval is hardcoded in both frontend and backend

**Files:** `App.tsx:27-29` (5000ms), `server.py:70` (5s), `usePoller.ts:11` (5s)
**Severity:** 🟢 Nitpick

**Problem:** All three layers hardcode 5000ms. If you want faster or slower refresh, you must change 3 files.

**Suggested cleanup:**
- Add a URL query param `?poll=3000` or a localStorage setting
- Or: add a `pollInterval` prop to `usePoller` with a sensible default
**Priority:** Low

---

### B.5: Client ID shown as plain text — not user-friendly

**Severity:** 🟢 Design note

**Problem:** Each card shows the full Client.id (a UUID-like string), which is hard to read and impossible to remember. The `name` field is used as the card title, but the raw ID is always visible.

**Suggested addition:**
- Add a "Rename client" action (maybe on double-click of the card title, or a small edit icon)
- Or: allow the UI to set a `friendly_name` that gets returned from `client_info()`
**Priority:** Low

---

### B.6: No loading states for cards

**File:** `App.tsx:76`
**Severity:** 🟢 Minor

**Problem:** When clients list is initially loading, the entire section shows "No clients discovered." which is misleading. There's no skeleton or spinner.

**Suggested addition:**
- Add `isLoading` prop to the Clients section
- Show skeleton cards or a loading spinner while fetching
**Priority:** Low

---

## C. Recommended Priority Order for Implementation

| # | Change | Complexity | Impact | Status |
|---|---|---|------|------|
| 1 | **Multi-client UI redesign** (sections + visual hierarchy) | Medium | High — your main ask | Pending |
| 2 | Split `EndpointRegistry` into smaller classes | Medium | High — maintenance | **DONE ✓** |
| 3 | Add `aclose()` for background task cleanup | Low | High — resource leak | Pending |
| 4 | Clean up stale `discovered_only` clients | Medium | Medium — memory | Pending |
| 5 | ClientCard collapse/expand | Low | Medium — usability | Pending |
| 6 | Extract `normalize_url` utility | Low | Low — DRY | Pending |
| 7 | Add validation/warnings to `register_endpoint` | Low | Low — DX | Pending |
| 8 | Add backpressure to `_feed_loop` | Medium | MEDIUM — reliability | Pending |
| 9 | Add bulk client operations | Low | Low — convenience | Pending |
| 10 | Expose client grouping on the ClientInfo API | Low | Medium — if you want grouped UI | Pending |

---

## D. Quick Reference: What the Back-end Already Does vs. What the Frontend Ignores

The backend `registry.py` `client_info()` method already groups every client into 3 buckets:
- `connected: [ClientState, ...]` — status == 'connected'
- `offline: [ClientState, ...]` — status == 'disconnected' or never connected
- `discovered_only: [ClientState, ...]` — mDNS only, no handshake data

But the frontend's `getClients()` returns `ClientInfo.list` which flattens all three into one array. The UI treats all cards identically in a single `sm:grid-cols-2` grid.

**Fixing the UI without changing the backend is possible** — the `connected`, `disconnected`, `discovered-only` status already exists on each `Client` object. You just need to sort/group by status on the frontend and render section headers.
