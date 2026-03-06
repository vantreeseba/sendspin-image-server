# sendspin-image-server

A home-automation server that pushes artwork to e-Paper displays and other [Sendspin](https://sendspin.com)-compatible clients on your local network. It discovers clients automatically via mDNS, manages multiple image sources ("Image Providers"), and serves a React web UI for configuration.

---

## Contents

- [How it works](#how-it-works)
- [Image Providers](#image-providers)
- [Dithering](#dithering)
- [Web UI](#web-ui)
- [REST API](#rest-api)
- [Deploying on a local Docker machine](#deploying-on-a-local-docker-machine)
  - [Quick start](#quick-start)
  - [With a remote Docker daemon](#with-a-remote-docker-daemon)
  - [Persistent data](#persistent-data)
  - [Mounting local images](#mounting-local-images)
  - [docker-compose](#docker-compose)
- [Configuration reference](#configuration-reference)
- [CI / publishing](#ci--publishing)

---

## How it works

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

1. **mDNS discovery** — the server advertises itself as `_sendspin-server._tcp.local.` and discovers clients advertising `_sendspin._tcp.local.`. It opens outbound WebSocket connections to clients automatically and reconnects with exponential backoff if they go offline.

2. **Sendspin protocol** — a binary+JSON WebSocket protocol. Clients declare roles (`player@v1`, `artwork@v1`); the server performs a handshake, then streams silent PCM audio (to keep audio-player clients alive) and pushes artwork frames on each assigned provider's schedule.

3. **Per-client feed loops** — each Image Provider runs its own asyncio loop. Every second the loop checks which assigned clients are due for a new image based on their individual interval setting, fetches the next image from the provider, resizes it to each client's declared pixel dimensions (letterboxed on white), applies the client's chosen dither algorithm, and pushes the result over WebSocket.

4. **Persistence** — if `DATA_DIR` is set, a SQLite database (`sendspin.db`) stores provider configurations and per-client settings (endpoint assignment, dither algorithm, interval). State is restored on restart.

---

## Image Providers

Three provider types are supported. All are managed through the web UI or REST API — no restart required.

### Local folder

Cycles through image files in a directory on the server's filesystem. The built-in provider points to `/app/images` (see [Mounting local images](#mounting-local-images)); it cannot be deleted.

| Field  | Required | Description                          |
|--------|----------|--------------------------------------|
| `name` | yes      | Display name                         |
| `path` | yes      | Absolute path to a directory of images |

Supported file types: `.jpg`, `.jpeg`, `.png`, `.bmp`, `.webp`.

### Immich

Streams images from an [Immich](https://immich.app) album in order. The album asset list is refreshed at the start of each cycle so newly added photos are picked up automatically.

| Field      | Required | Description                          |
|------------|----------|--------------------------------------|
| `name`     | yes      | Display name                         |
| `base_url` | yes      | Immich server URL, e.g. `http://192.168.1.10:2283` |
| `album_id` | yes      | UUID of the album                    |
| `api_key`  | yes      | Immich API key (`x-api-key` header)  |

### Home Assistant

Browses the HA Media Browser tree via the HA WebSocket API and downloads images. Walks the tree recursively (depth ≤ 6) collecting all image-type leaf nodes.

| Field              | Required | Default                          | Description                           |
|--------------------|----------|----------------------------------|---------------------------------------|
| `name`             | yes      | —                                | Display name                          |
| `base_url`         | yes      | —                                | HA base URL, e.g. `http://homeassistant.local:8123` |
| `token`            | yes      | —                                | Long-Lived Access Token               |
| `media_content_id` | no       | `media-source://media_source`    | Starting node in the Media Browser    |

---

## Dithering

The primary target display is the **Waveshare 7.3" e-Paper (E)** — a 6-colour ACeP panel. Images are snapped to its palette using a prebuilt CIE L\*a\*b\* nearest-colour LUT (262 144 entries, built at import time). A 1.2× contrast and 1.3× saturation boost is applied before dithering.

**Palette:**

| Ink    | RGB              |
|--------|------------------|
| Black  | (0, 0, 0)        |
| White  | (255, 255, 255)  |
| Green  | (0, 255, 0)      |
| Blue   | (0, 0, 255)      |
| Red    | (255, 0, 0)      |
| Yellow | (255, 255, 0)    |

**Algorithms** (configurable per client in the UI):

| Value                        | Description |
|------------------------------|-------------|
| `none`                       | No dithering — pass through after contrast/saturation boost |
| `floyd-steinberg`            | Error diffusion via Pillow's C engine (fastest) |
| `floyd-steinberg-serpentine` | Bidirectional Floyd-Steinberg — alternates row direction to eliminate directional grain |
| `atkinson`                   | Bill Atkinson's ¾-error diffusion — crisper highlights and contrast |
| `ordered`                    | 8×8 Bayer ordered dithering — deterministic crosshatch, no error propagation |

---

## Web UI

The React SPA is served from `http://<host>:8928/`.

- **Clients panel** — shows all connected Sendspin devices with their MAC address, resolution, and format. Per client you can set the image provider, dither algorithm, and slideshow interval, then apply all changes with a single **Update** button.
- **Image Providers panel** — lists all providers. Add new ones (Immich, Home Assistant, or local folder) via the **Add Provider** button. The built-in local provider cannot be deleted.
- **Theme** — defaults to dark mode; toggle with the Sun/Moon button in the top-right corner. Preference is stored in `localStorage`.

---

## REST API

Base URL: `http://<host>:8928`

| Method   | Path                           | Body                                                | Description                                        |
|----------|--------------------------------|-----------------------------------------------------|----------------------------------------------------|
| `GET`    | `/api/clients`                 | —                                                   | List connected clients                             |
| `GET`    | `/api/endpoints`               | —                                                   | List all image providers                           |
| `POST`   | `/api/endpoints`               | `{kind, name, ...}`                                 | Add a provider                                     |
| `DELETE` | `/api/endpoints/{id}`          | —                                                   | Remove a provider (403 if built-in)                |
| `POST`   | `/api/clients/{id}/endpoint`   | `{"endpoint_id": "<id>"}`                           | Assign a client to a provider                      |
| `POST`   | `/api/clients/{id}/dither`     | `{"dither_algo": "<algo>"}`                         | Set per-client dither algorithm                    |
| `POST`   | `/api/clients/{id}/interval`   | `{"interval": <seconds>}` (0 = server default)      | Set per-client slideshow interval                  |
| `POST`   | `/image`                       | raw image bytes; `?channel=N`                       | Push an image to all connected artwork clients     |
| `GET`    | `/debug/current-image`         | —                                                   | Return the last-pushed image as a dithered PNG     |

---

## Deploying on a local Docker machine

### Quick start

```bash
docker run -d \
  --name sendspin-image-server \
  --network host \
  -e DATA_DIR=/data \
  -v sendspin-data:/data \
  -v /path/to/your/photos:/app/images \
  ghcr.io/vantreeseba/sendspin-image-server:main
```

> `--network host` is required for mDNS multicast to work. Without it the server cannot advertise itself or discover clients on the local network.

Open `http://<your-docker-host>:8928` to access the UI.

### With a remote Docker daemon

If your Docker daemon runs on a different machine (e.g. a home server at `docker.lan`):

```bash
export DOCKER_HOST=tcp://docker.lan:2375

docker pull ghcr.io/vantreeseba/sendspin-image-server:main

docker rm -f sendspin-image-server

docker run -d \
  --name sendspin-image-server \
  --network host \
  -e DATA_DIR=/data \
  -v sendspin-data:/data \
  -v /path/to/photos:/app/images \
  ghcr.io/vantreeseba/sendspin-image-server:main
```

### Persistent data

Mount a volume or host directory at `/data` and set `DATA_DIR=/data`. The server writes `sendspin.db` there, storing all provider configurations and per-client settings across restarts.

```bash
# Named volume (recommended)
-v sendspin-data:/data -e DATA_DIR=/data

# Or a host path
-v /srv/sendspin:/data -e DATA_DIR=/data
```

Without `DATA_DIR`, the server runs without persistence — providers and assignments must be reconfigured after each restart.

### Mounting local images

The built-in local provider looks for images at `/app/images` inside the container. Mount your photo directory there:

```bash
-v /path/to/your/photos:/app/images
```

Supported formats: JPEG, PNG, BMP, WebP.

### docker-compose

```yaml
services:
  sendspin-image-server:
    image: ghcr.io/vantreeseba/sendspin-image-server:main
    container_name: sendspin-image-server
    network_mode: host
    restart: unless-stopped
    volumes:
      - sendspin-data:/data
      - /path/to/your/photos:/app/images
    environment:
      DATA_DIR: /data
      SLIDESHOW_INTERVAL: "120"   # server-wide default; override per client in UI
      DITHER_ALGO: floyd-steinberg  # server-wide default; override per client in UI

volumes:
  sendspin-data:
```

With an Immich provider (added via UI after first start, or pre-configured):

```yaml
    environment:
      DATA_DIR: /data
      SLIDESHOW_INTERVAL: "120"
```

> Immich credentials are stored in the database after you add the provider through the UI — no environment variables needed.

---

## Configuration reference

| Environment variable | CLI flag        | Default           | Description                                                                 |
|----------------------|-----------------|-------------------|-----------------------------------------------------------------------------|
| `SLIDESHOW_INTERVAL` | `--interval`    | `120`             | Seconds between image advances (server-wide default; overridable per client)|
| `DITHER_ALGO`        | `--dither-algo` | `floyd-steinberg` | Default dither algorithm; overridable per client in the UI                  |
| `DATA_DIR`           | `--data-dir`    | *(none)*          | Path for SQLite persistence. Omit to run stateless.                         |
| —                    | `--host`        | `0.0.0.0`         | Bind address for both servers                                               |
| —                    | `--port`        | `8927`            | WebSocket (Sendspin protocol) port                                          |
| —                    | `--http-port`   | `8928`            | HTTP / REST API / Web UI port                                               |
| —                    | `--name`        | `Sendspin Image Server` | Server display name (shown in mDNS and client handshake)              |
| —                    | `--log-level`   | `INFO`            | One of `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`                      |

---

## CI / publishing

Every push to `main` and every `v*` tag triggers a GitHub Actions workflow that builds the container image and pushes it to both registries:

- `ghcr.io/vantreeseba/sendspin-image-server`
- `docker.io/vantreeseba/sendspin-image-server`

Tags produced: `main`, `sha-<short>`, and for version tags: `1.2.3` + `1.2`.

Two repository secrets are required (Settings → Secrets and variables → Actions):

| Secret               | Value                                    |
|----------------------|------------------------------------------|
| `DOCKERHUB_USERNAME` | Your Docker Hub username                 |
| `DOCKERHUB_TOKEN`    | A Docker Hub Personal Access Token (Read & Write) |

`GITHUB_TOKEN` is provided automatically by GitHub Actions — no configuration needed for GHCR.
