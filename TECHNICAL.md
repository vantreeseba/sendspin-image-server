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
2. `SendspinImageServer` (`server.py`) has aiosendspin open an outbound WebSocket to that URL and run the Sendspin handshake. On success, a `ClientState` is added to `server.clients`.
3. The `EndpointRegistry` (`registry.py`) runs one asyncio task per image provider. Each task wakes up every second, checks which assigned clients are due for a new image, fetches the next image from the provider, and calls `push_image_to_client`.
4. `push_image_to_client` (`stream.py`) resizes the image to the display's declared pixel dimensions, optionally dithers it, and hands the encoded image to the client's artwork role.
5. The React SPA (`ui/`) talks to the REST API (`cli.py`) and renders current state.

---

## Sendspin Protocol

The server speaks [Sendspin](https://github.com/Sendspin/spec) 1.0.0-rc1 through the [`aiosendspin`](https://pypi.org/project/aiosendspin/) library: the handshake, encryption, clock sync, message framing and reconnects are all aiosendspin's. `SendspinImageServer` (`server.py`) is a thin layer on top that tracks which clients have an artwork stream and decides which image each one gets. The key design point is that **the server dials out to clients** — clients advertise themselves via mDNS and wait; the server initiates the WebSocket connection.

### Roles

Only two roles matter here; aiosendspin negotiates them (and ignores the audio roles, since nothing is ever played):

| Role        | Description                                                          |
|-------------|----------------------------------------------------------------------|
| `artwork@v1` | Client accepts images on up to four artwork channels                |
| `metadata@v1` | Client gets a `server/state` with the title "Image Server"         |

A client declares each artwork channel as a `source`, a `format` (`jpeg` or `png`) and the exact `width` and `height` it wants delivered. The stream starts once those are known, and `ClientState.artwork_channels` reflects them.

### Encryption, pairing and old clients

Sendspin 1.0 connections are encrypted with Noise, and the server and each client are identified by a Curve25519 public key. The server's key pair is created on first start and kept in `DATA_DIR/sendspin_identity.key` (mode 0600); approved clients are kept in `DATA_DIR/sendspin_pairing.json`. Without a data directory both live in memory, so the server has a new id after every restart.

What a client is sent depends on how it connects:

| Client                                             | Result |
|----------------------------------------------------|--------|
| Encrypted, has **unpaired access** enabled         | Approved automatically and sent images. Turn this off with `--no-trust-unpaired` (`TRUST_UNPAIRED=0`). |
| Encrypted, requires pairing                        | Connects but gets no images. Pairing is not implemented in this server yet; a warning is logged. |
| Cleartext, pre-1.0 protocol                        | Accepted and sent images in the old one-message-per-image framing. Turn this off with `--no-allow-unencrypted` (`ALLOW_UNENCRYPTED=0`). |

A cleartext client can claim any id, so it is never approved or paired. Two limits apply to cleartext clients: aiosendspin holds their first image until they send a `client/state` (or for 5 seconds if they never do), and a hello that declares a channel format other than `jpeg`, `png` or `bmp` — such as the `e6-dithered` format older versions of this server accepted — is rejected as malformed. Dithering is chosen per client in the UI instead.

### Why the group artwork role is replaced

aiosendspin normally keeps one artwork image per group and sends it, letterboxed and re-encoded, to every member — or clears the display when the group has none. This server resizes and dithers per client, so `server.py` registers `ImageArtworkGroupRole` in its place: it holds no image and instead reports each stream start as an `ArtworkStreamStartedEvent`. `SendspinImageServer` then builds a fresh `ClientState` for that stream and pushes through `ArtworkV1Role.send_artwork`, which frames the bytes for whichever wire the client speaks.

### `connection_reason` field

`server/hello` includes a `connection_reason` string that tells the client why the server connected:

| Value       | Meaning                                                              |
|-------------|----------------------------------------------------------------------|
| `discovery` | Standard mDNS discovery (default)                                   |
| `playback`  | Forced reconnect triggered by the user via the Force Connect button  |

---

## mDNS Service Types

| Role    | Service type                   | Who registers it         |
|---------|--------------------------------|--------------------------|
| Server  | `_sendspin-server._tcp.local.` | aiosendspin, when the server starts |
| Client  | `_sendspin._tcp.local.`        | The e-Paper display itself |

The server advertises itself so that clients which dial servers can find it. Client discovery is this project's own `MDNSDiscovery` (`mdns.py`) rather than aiosendspin's, because it also reports the mDNS instance name and every re-announcement: it browses for `_sendspin._tcp.local.`, extracts the host address, port, and `/sendspin` path from the service record, and builds a `ws://host:port/sendspin` URL to connect to.

Service records may include a `path` TXT property. If present, it overrides the default `/sendspin` path in the constructed WebSocket URL.

---

## Connection Lifecycle

### Outbound connections

```
connect_to_client(url)
  └─ SendspinServer.connect_to_client(url, retry_initial_connection=True)
       1. handshake (Noise for 1.0 clients, client/hello for older ones)
       2. ClientConnectedEvent  → ClientState created, registry.ensure_client()
       3. stream/start once the client's artwork channels are known
       4. ArtworkStreamStartedEvent → fresh ClientState, registry.client_connected(),
          push last_image (if any, and only when no endpoint feeds the client —
          the feed loop pushes to those on connect)
       5. ClientDisconnectedEvent → registry.client_disconnected()
       ↑ on disconnect: exponential backoff (1s → 2s → 4s … cap 300s)
       ↑ on mDNS re-announce: retry immediately
       ↑ on a goodbye that asks not to be redialled: stop retrying
```

When `MDNSDiscovery` fires `on_client_removed`, the outbound connection is stopped via `disconnect_from_client`.

### Exponential backoff

aiosendspin's retry loop starts at 1 second, doubles on each failure, and caps at 300 seconds. The backoff returns to 1 second after a connection that lasted at least 10 seconds.

A battery device that deep-sleeps is only reachable for a brief window each time it wakes, so the server does not rely on the backoff to catch it: `MDNSDiscovery` reports a client every time it announces itself, and `connect_to_client` on a URL that is already managed cuts the current backoff short and retries at once.

### Push on connect

Each endpoint feed loop remembers which connection it last pushed to, per client. A client that reconnects is a new connection, so it is due immediately rather than after the rest of its interval. Together with the fast reconnect above, a frame waking from deep sleep gets its next image within a few seconds.

Two more things keep that window short. The feed loop is woken the moment a client finishes its handshake, instead of noticing it on its next one-second pass. And after every push it fetches the following image in the background, so the next client that is due gets an image that is already in memory rather than waiting on Immich or Home Assistant.

### Client-initiated connections

A client may also dial the server itself (`ws://<server>:8927/sendspin`), which skips mDNS discovery altogether. If the server dials the same client at the same time, the client keeps one connection and closes the other; aiosendspin keeps the newer connection and closes the older one.

### Sleeping clients

The server notes when each client's last connection closed, and how long it was away the last time it came back. A disconnected client that has come back before is reported as `sleeping` (with `last_seen` and `wake_interval`) until it is more than twice its last cycle plus a minute overdue, after which it is plain offline. This is held in memory only, so it starts fresh after a server restart.

### `goodbye` reason `another_server`

If the client sends `client/goodbye` with `reason: "another_server"`, aiosendspin stops redialling it. This prevents competing with a different Sendspin server that the display has chosen to connect to.

### Force reconnect

`POST /api/clients/{id}/connect` calls `server.reconnect_to_client(url, connection_reason="playback")`. This dials the client again right away — also when retries had stopped — and tells it the server wants to take over.

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

1. **Resize** — the image is scaled to fit within the dimensions the client declared for the channel (letterboxed on a white canvas using Lanczos resampling — the spec asks for black bars, but white suits e-paper).
2. **Dither** — if `force_e6_dither=True` (set from the client's dither settings), `floyd_steinberg_e6()` is called with the configured algorithm and palette.
3. **Re-encode** — even without dithering, the image is re-encoded to the wire format the client's channel declared (`jpeg`, `png`, or `bmp`).
4. **Send** — `ClientState.send_artwork()` passes the bytes to aiosendspin, which frames them for the protocol version the client speaks.

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
| `PUT`    | `/api/endpoints/{id}`   | Any of `name` and the kind's own fields                                | 200 JSON    | Edit a provider in place. The kind cannot change, and a blank or missing `api_key`/`token` keeps the stored one (returns 403 for the built-in local provider) |
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
