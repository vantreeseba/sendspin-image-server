# Technical Reference — sendspin-image-server

This document covers the internals of sendspin-image-server for contributors and integrators. For setup and everyday usage, see [README.md](README.md).

---

## Contents

- [Architecture Overview](#architecture-overview)
- [Sendspin Protocol](#sendspin-protocol)
- [mDNS Service Types](#mdns-service-types)
- [Connection Lifecycle](#connection-lifecycle)
- [Client States](#client-states)
- [Feed Loop Internals](#feed-loop-internals)
- [Dithering Internals](#dithering-internals)
- [Database Schema](#database-schema)
- [REST API Reference](#rest-api-reference)
- [Building Locally](#building-locally)
- [CI and Publishing](#ci-and-publishing)
- [Development Setup](#development-setup)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                 sendspin-image-server                │
│                                                      │
│  ┌─────────────┐   ┌──────────────┐                 │
│  │ Image       │   │  Endpoint    │                 │
│  │ Providers   │──▶│  Registry   │──▶ resize+dither │
│  │ (local /    │   │  feed loops  │       │         │
│  │  immich /   │   └──────────────┘       ▼         │
│  │  HA)        │               WebSocket push       │
│  └─────────────┘                    │               │
│                                     │               │
│  ┌──────────────┐    mDNS discover  │               │
│  │  React UI    │    ◀─────────────▶│               │
│  │  (port 8928) │                   ▼               │
│  └──────────────┘           e-Paper display         │
└──────────────────────────────────────────────────────┘
```

**Data flow, top to bottom:**

1. `MDNSDiscovery` (`mdns.py`) watches for `_sendspin._tcp.local.` announcements. When a display appears, it calls `server.connect_to_client(url)`.
2. `SendspinImageServer` (`server.py`) opens an outbound WebSocket to that URL and runs the Sendspin handshake. On success, a `ClientState` is added to `server.clients`.
3. The `EndpointRegistry` (`registry.py`) runs one asyncio task per image provider. Each task wakes up every second, checks which assigned clients are due for a new image, fetches the next image from the provider, and calls `push_image_to_client`.
4. `push_image_to_client` (`stream.py`) resizes the image to the display's declared pixel dimensions, optionally dithers it, and sends a binary WebSocket frame.
5. The React SPA (`ui/`) talks to the REST API (`cli.py`) and renders current state.

---

## Sendspin Protocol

The Sendspin protocol runs over WebSocket. The transport is a mix of JSON text messages (control) and binary messages (image frames). The key design point is that **the server dials out to clients** — clients advertise themselves via mDNS and wait; the server initiates the WebSocket connection.

### Message types

| Direction      | Type                    | Format | Description                                               |
|----------------|-------------------------|--------|-----------------------------------------------------------|
| client → server | `client/hello`         | JSON   | First message; declares client identity and supported roles |
| server → client | `server/hello`         | JSON   | Acknowledges the hello; confirms active roles and connection reason |
| server → client | `stream/start`         | JSON   | Declares the stream format (channel count, image dimensions, wire format) |
| server → client | `server/state`         | JSON   | Sends metadata (title, artist, playback progress) to metadata-role clients |
| server → client | artwork binary frame   | binary | `[type byte][8-byte big-endian int64 timestamp µs][image bytes]` |
| client → server | `stream/request-format` | JSON  | Client requests a change to channel format or dimensions   |
| client → server | `client/time`          | JSON   | Clock-sync request                                        |
| server → client | `server/time`          | JSON   | Clock-sync response                                       |
| client → server | `client/goodbye`       | JSON   | Graceful disconnect; carries a `reason` string            |

### Roles

Clients declare which roles they support in `client/hello` via `supported_roles`. The server activates the first version of each role family it recognises:

| Role        | Description                                                          |
|-------------|----------------------------------------------------------------------|
| `artwork@v1` | Client accepts binary image frames on artwork channels              |
| `metadata@v1` | Client wants `server/state` messages with playback metadata        |

### `connection_reason` field

`server/hello` includes a `connection_reason` string that tells the client why the server connected:

| Value       | Meaning                                                              |
|-------------|----------------------------------------------------------------------|
| `discovery` | Standard mDNS discovery (default)                                   |
| `playback`  | Forced reconnect triggered by the user via the Force Connect button  |

### Binary frame format

```
Byte 0      : message type
              0x08 = artwork channel 0
              0x09 = artwork channel 1
              0x0A = artwork channel 2
              0x0B = artwork channel 3
Bytes 1–8   : server monotonic timestamp in microseconds (big-endian int64)
Bytes 9+    : raw image bytes (JPEG, PNG, or BMP depending on channel negotiation)
```

---

## mDNS Service Types

| Role    | Service type                   | Who registers it         |
|---------|--------------------------------|--------------------------|
| Server  | `_sendspin-server._tcp.local.` | `MDNSAdvertiser` in `mdns.py` |
| Client  | `_sendspin._tcp.local.`        | The e-Paper display itself |

The server advertises its own presence so that future Sendspin clients could theoretically discover servers. Currently, only the client service type is consumed: `MDNSDiscovery` browses for `_sendspin._tcp.local.`, extracts the host address, port, and `/sendspin` path from the service record, and builds a `ws://host:port/sendspin` URL to connect to.

Service records may include a `path` TXT property. If present, it overrides the default `/sendspin` path in the constructed WebSocket URL.

---

## Connection Lifecycle

### Outbound connection loop

```
connect_to_client(url)
  └─ _outbound_connection_loop(url)
       └─ websockets.connect(url) ──► _handle_connection()
            1. recv client/hello
            2. send server/hello  (with connection_reason)
            3. send stream/start
            4. push last_image to new client (if any)
            5. send server/state (metadata clients only)
            6. message loop until disconnect or client/goodbye
       ↑ on disconnect: exponential backoff (1s → 2s → 4s … cap 300s)
       ↑ on goodbye reason "another_server": stop retrying
```

When `MDNSDiscovery` fires `on_client_removed`, the corresponding outbound task is cancelled immediately via `disconnect_from_client`.

### Exponential backoff

The retry loop starts at 1 second, doubles on each failure, and caps at 300 seconds (5 minutes). A successful connection resets the backoff to 1 second.

### `goodbye` reason `another_server`

If the client sends `client/goodbye` with `reason: "another_server"`, the loop exits without retrying. This prevents competing with a different Sendspin server that the display has chosen to connect to.

### Force reconnect

`POST /api/clients/{id}/connect` calls `server.reconnect_to_client(url, connection_reason="playback")`. This cancels any existing outbound task and starts a fresh loop, bypassing the backoff delay.

---

## Client States

The registry exposes three tiers of client state via `client_info()`, which drives the Clients panel in the UI:

| Status         | `status` value  | `discovered_only` | Description |
|----------------|-----------------|--------------------|-------------|
| Connected      | `"connected"`   | `false`            | WebSocket is open; `ClientState` exists in `server.clients` |
| Offline/known  | `"discovered"` or `"disconnected"` | `false` | Has a DB record (has connected before); currently unreachable |
| Discovered only | `"discovered"` | `true`             | Seen via mDNS but never completed a hello handshake; no DB record |

**`last_known_url`**: every time a client completes a successful hello handshake, `registry.ensure_client()` writes the WebSocket URL to the `clients` table. On restart, these URLs are loaded back and held in `_client_last_url`. The Force Connect button uses this URL to attempt reconnection even after mDNS has gone silent.

---

## Feed Loop Internals

`EndpointRegistry` runs one asyncio task per endpoint (`_feed_loop`). The loop:

1. Wakes every 1 second.
2. Collects all currently-connected artwork clients assigned to this endpoint whose stream has started.
3. Filters down to the clients that are *due* — `time.monotonic() - last_push[client_id] >= effective_interval(client_id)`.
4. If any clients are due, calls `endpoint.fetch_next()` once to get the next image.
5. Fans out the raw image bytes to all due clients concurrently via `asyncio.gather`.
6. Records the push timestamp per client.

The effective interval for a client is its explicit per-client override (if > 0) or the server-wide `--interval` default. Setting a client's interval to `0` reverts to the server-wide default.

### Image pipeline per client

Inside `push_image_to_client` (`stream.py`):

1. **Resize** — the image is scaled to fit within the dimensions the client declared in `client/hello` (letterboxed on a white canvas using Lanczos resampling). This step is skipped if the client did not declare dimensions.
2. **Dither** — if the client's channel format is `e6-dithered`, or if `force_e6_dither=True`, `floyd_steinberg_e6()` is called with the configured algorithm and palette.
3. **Re-encode** — even without dithering, the image is re-encoded to the wire format the client's channel declared (`jpeg`, `png`, or `bmp`).
4. **Frame** — `build_artwork_message()` wraps the image bytes in the binary frame format and the frame is sent over the WebSocket.

All CPU-bound image work (resize, dither, encode) runs in the default thread pool executor via `loop.run_in_executor` to avoid blocking the event loop.

---

## Dithering Internals

Source: `sendspin_image_server/dither.py`.

### Pre-processing

Before any dithering algorithm runs, `_preprocess()` applies:
- `ImageEnhance.Contrast(img).enhance(1.2)` — 20% contrast boost
- `ImageEnhance.Color(img).enhance(1.3)` — 30% saturation boost

These values compensate for the relatively muted look of e-Paper ink rendering pure sRGB primaries.

### Nearest-colour LUT

All palette-based algorithms share a prebuilt LUT (look-up table) for fast colour quantisation. The LUT is built at import time by `_build_lut()`:

- **6 bits per channel** — the LUT has 64 × 64 × 64 = 262,144 entries.
- Each entry covers a 4-value sRGB range (2-bit bucket); the midpoint of each bucket is the representative sample.
- Distances are computed in **CIE L\*a\*b\* colour space** (via a full sRGB → linear → XYZ → Lab conversion) and stored as `uint8` palette indices.
- The build is fully vectorised with NumPy and completes in approximately 5 ms.

At query time, `_nearest(r, g, b, palette)` does a single array lookup: `lut[r >> 2, g >> 2, b >> 2]`.

### Algorithms

| Value                        | Implementation                | Notes |
|------------------------------|-------------------------------|-------|
| `none`                       | pass-through                  | Returns pre-processed image without palette restriction |
| `floyd-steinberg`            | Pillow `Image.quantize()`     | Delegates to Pillow's C engine; fastest option |
| `floyd-steinberg-serpentine` | Pure Python, Lab LUT          | Alternates scan direction (left→right on even rows, right→left on odd rows) using the 7/5/3/1 error kernel; eliminates directional grain |
| `atkinson`                   | Pure Python, Lab LUT          | Distributes 1/8 of the error to each of 6 neighbours (6/8 = 3/4 total); intentionally loses 1/4 of the error to preserve highlights |
| `ordered`                    | Pure Python, Lab LUT          | 8×8 Bayer matrix; adds a spatially-varying threshold offset before snapping to nearest palette colour; fully deterministic |

The serpentine and Atkinson implementations operate on a flat `list[int]` of interleaved RGB bytes for speed.

---

## Database Schema

SQLite database at `$DATA_DIR/sendspin.db`, managed by `sendspin_image_server/db.py` using `aiosqlite`.

### `endpoints`

Stores user-added image providers. The built-in local endpoint (`builtin-local`) is not written to this table.

| Column        | Type | Description                                                      |
|---------------|------|------------------------------------------------------------------|
| `id`          | TEXT | UUID (primary key)                                               |
| `kind`        | TEXT | `"local"`, `"immich"`, or `"homeassistant"`                      |
| `name`        | TEXT | Display name                                                     |
| `config_json` | TEXT | Kind-specific configuration as a JSON object (e.g. `base_url`, `album_id`, `api_key` for Immich) |

### `assignments`

Stores per-client configuration. One row per client that has been explicitly configured.

| Column          | Type | Default  | Description                                                  |
|-----------------|------|----------|--------------------------------------------------------------|
| `client_id`     | TEXT | —        | Client's UUID (primary key)                                  |
| `endpoint_id`   | TEXT | —        | UUID of the assigned endpoint                                |
| `dither_algo`   | TEXT | `'none'` | Active dithering algorithm for this client                   |
| `dither_palette`| TEXT | `'e6'`   | Active dithering palette for this client                     |
| `interval`      | REAL | `0`      | Slideshow interval in seconds; `0` means use server default  |

### `clients`

Stores last-known connection URLs so that offline clients can be force-reconnected.

| Column           | Type | Description                                                       |
|------------------|------|-------------------------------------------------------------------|
| `client_id`      | TEXT | Client's UUID (primary key)                                       |
| `name`           | TEXT | Client display name as reported in `client/hello`                 |
| `last_known_url` | TEXT | Last WebSocket URL the server successfully connected to (nullable)|

**Schema migrations**: `dither_palette` in `assignments` and `last_known_url` in `clients` were added as `ALTER TABLE` migrations. These are run on every startup and swallow `OperationalError` if the column already exists, ensuring forward compatibility with older databases.

---

## REST API Reference

Base URL: `http://<host>:8928`

All JSON request bodies must have `Content-Type: application/json`. Responses are JSON unless noted.

### Clients

| Method   | Path                             | Request body                                     | Response | Description |
|----------|----------------------------------|--------------------------------------------------|----------|-------------|
| `GET`    | `/api/clients`                   | —                                                | 200 JSON array | List all known clients (connected, offline, and discovered) |
| `POST`   | `/api/clients/{id}/endpoint`     | `{"endpoint_id": "<uuid>"}`                      | 204      | Assign a client to an image provider |
| `POST`   | `/api/clients/{id}/dither`       | `{"dither_algo": "<algo>"}`                      | 204      | Set the dithering algorithm for a client |
| `POST`   | `/api/clients/{id}/palette`      | `{"dither_palette": "<palette>"}`                | 204      | Set the dithering palette for a client |
| `POST`   | `/api/clients/{id}/interval`     | `{"interval": <seconds>}` (`0` = server default)| 204      | Set the slideshow interval for a client |
| `POST`   | `/api/clients/{id}/connect`      | —                                                | 204      | Force an immediate reconnect attempt to this client |
| `DELETE` | `/api/clients/{id}`              | —                                                | 204      | Forget this client entirely (removes from DB and in-memory state) |

### Image Providers (Endpoints)

| Method   | Path                    | Request body                                                           | Response    | Description |
|----------|-------------------------|------------------------------------------------------------------------|-------------|-------------|
| `GET`    | `/api/endpoints`        | —                                                                      | 200 JSON array | List all configured image providers |
| `POST`   | `/api/endpoints`        | `{"kind": "local\|immich\|homeassistant", "name": "...", ...}`         | 201 JSON    | Add a new image provider |
| `DELETE` | `/api/endpoints/{id}`   | —                                                                      | 204         | Remove a provider (returns 403 for the built-in local provider) |

**`POST /api/endpoints` body fields by kind:**

*`kind: "local"`*
```json
{"kind": "local", "name": "My Photos", "path": "/mnt/photos"}
```

*`kind: "immich"`*
```json
{"kind": "immich", "name": "Holiday Album", "base_url": "http://192.168.1.10:2283", "album_id": "<uuid>", "api_key": "<key>"}
```

*`kind: "homeassistant"`*
```json
{"kind": "homeassistant", "name": "HA Media", "base_url": "http://homeassistant.local:8123", "token": "<llat>", "media_content_id": "media-source://media_source/local/photos"}
```

### Image Push

| Method | Path                   | Request body            | Response | Description |
|--------|------------------------|-------------------------|----------|-------------|
| `POST` | `/image`               | Raw image bytes         | 200      | Push an image to all connected artwork clients immediately. Optional query param `?channel=N` (0–3). |
| `GET`  | `/debug/current-image` | —                       | 200 PNG  | Return the last-broadcast image as a PNG, with dithering applied if configured. Also validates palette compliance and logs results. |

---

## Building Locally

The Dockerfile uses a two-stage build:

1. **Stage 1 (`ui-builder`)**: `node:24-slim` — runs `npm ci && npm run build` in the `ui/` directory. Output is `/ui/dist/`.
2. **Stage 2**: `python:3.12-slim` — installs Python dependencies via `uv`, copies the Python source and the compiled UI dist, then installs the package.

```bash
docker build -t sendspin-image-server:dev .
```

The UI dist is copied into `sendspin_image_server/ui_dist/` inside the image, where `cli.py` expects to find `index.html`.

---

## CI and Publishing

Two GitHub Actions workflows manage releases:

### `release.yml` — runs on every push to `main`

Uses [python-semantic-release](https://python-semantic-release.readthedocs.io/) to inspect conventional commits since the last tag. If a version bump is warranted, it updates `pyproject.toml`, commits and tags the release, then triggers `publish.yml` on the new tag.

Requires the repository secret `GH_TOKEN` (a Personal Access Token with `contents: write` permissions — needed because `GITHUB_TOKEN` cannot push tags that trigger other workflows).

### `publish.yml` — runs on `v*` tags

Builds the multi-stage Docker image and pushes to both registries:

- `ghcr.io/vantreeseba/sendspin-image-server`
- `docker.io/vantreeseba/sendspin-image-server`

Tags produced from a `v1.2.3` tag:
- `1.2.3`
- `1.2`
- `sha-<short>`

`GITHUB_TOKEN` is used automatically for GHCR (no configuration required). Docker Hub requires two repository secrets:

| Secret               | Value                                             |
|----------------------|---------------------------------------------------|
| `DOCKERHUB_USERNAME` | Your Docker Hub username                          |
| `DOCKERHUB_TOKEN`    | A Docker Hub Personal Access Token (Read & Write) |

---

## Development Setup

The server has no local development mode that bypasses Docker — but running without Docker is straightforward if you have Python 3.12 and Node.

**Python server:**

```bash
# Install uv (https://github.com/astral-sh/uv), then:
uv pip install -e ".[dev]"

sendspin-image-server --log-level DEBUG --data-dir /tmp/sendspin-dev
```

The server listens on port 8927 (WebSocket) and 8928 (HTTP). The UI will 503 until you also build the frontend.

**React UI:**

```bash
cd ui
npm ci
npm run dev   # Vite dev server with HMR on port 5173
```

The Vite dev server proxies `/api` and `/image` to `localhost:8928`, so the Python server needs to be running alongside it. For production, run `npm run build` and the compiled assets are served directly by the Python process from `sendspin_image_server/ui_dist/`.

**Linting and type-checking:**

```bash
ruff check .        # linting
ruff format .       # formatting
mypy .              # type checking
```
