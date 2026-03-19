# sendspin-image-server

A home server that automatically pushes artwork to [Sendspin](https://sendspin.com)-compatible e-Paper displays — like Waveshare e-ink picture frames — on your local network. Point it at your photos, and it handles everything else: finding your displays, cycling through images on a schedule, and converting colours to match what your display can actually show.

---

## Contents

- [Getting Started](#getting-started)
- [Persistent Storage](#persistent-storage)
- [Mounting Your Photos](#mounting-your-photos)
- [docker-compose](#docker-compose)
- [The Web UI](#the-web-ui)
- [Image Providers](#image-providers)
- [Dithering](#dithering)
- [Configuration](#configuration)
- [For Developers](#for-developers)

---

## Getting Started

The server runs as a Docker container. The one important flag is `--network host`: without it, Docker's network isolation blocks the multicast traffic that lets the server find your displays automatically. Think of it as telling Docker to share your computer's network directly rather than putting the container behind a virtual switch.

```bash
docker run -d \
  --name sendspin-image-server \
  --network host \
  -e DATA_DIR=/data \
  -v sendspin-data:/data \
  -v /path/to/your/photos:/app/images \
  ghcr.io/vantreeseba/sendspin-image-server:main
```

Then open `http://<your-server>:8928` in a browser. Your displays should appear in the Clients panel within a few seconds of powering on.

> **Why `--network host`?** Your e-Paper displays announce themselves over a local network protocol called mDNS — the same technology behind `.local` hostnames. Docker's default networking mode doesn't pass that traffic through to containers, so the server would never hear the displays calling out. `--network host` fixes this by letting the container use your machine's network directly.

---

## Persistent Storage

Without a persistent volume, all your provider settings and per-display configuration will be lost when the container restarts. To keep them, mount a volume and set `DATA_DIR`:

```bash
# Using a named Docker volume (recommended)
-v sendspin-data:/data -e DATA_DIR=/data

# Or a folder on your host
-v /srv/sendspin:/data -e DATA_DIR=/data
```

The server writes a small SQLite database called `sendspin.db` to that directory. It stores your image provider credentials, which provider each display is assigned to, dither settings, and slideshow intervals.

---

## Mounting Your Photos

The built-in "Local Images" provider looks for photos at `/app/images` inside the container. Mount your photo directory there at startup:

```bash
-v /path/to/your/photos:/app/images
```

Supported formats: JPEG, PNG, BMP, WebP.

You can also add additional local folders later through the web UI — see [Image Providers](#image-providers).

---

## docker-compose

This is the most convenient way to run the server. Save the following as `docker-compose.yml` and run `docker compose up -d`.

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

volumes:
  sendspin-data:
```

Replace `/path/to/your/photos` with the actual path to your photo folder. If you are using Immich or Home Assistant as your image source, you can leave the photos volume out entirely and add those providers through the UI after the first start — no environment variables needed for their credentials.

---

## The Web UI

Open `http://<your-server>:8928` to reach the dashboard. There are two main panels.

### Clients panel

Shows every display the server knows about, in three states:

- **Online** (green) — currently connected and receiving images
- **Offline** (red) — known to the server (it has seen this display before), but not currently reachable
- **Discovered** (amber) — spotted on the network but never fully connected yet

For each display you can configure:

- **Image Provider** — which photo source to use
- **Dither algorithm** — how to convert colours for the display's limited palette (see [Dithering](#dithering))
- **Palette** — the colour set to target (Full Color, Black & White, or E-Paper 6-Color)
- **Slideshow interval** — how often to advance to the next image (in seconds; leave at 0 to use the server-wide default)

Hit **Update** to apply any changes.

Two additional buttons appear on displays that are not currently connected:

- **Force Connect** — tells the server to try reconnecting to that display immediately, using the last known address
- **Forget** — removes the display from the server's memory entirely (useful for displays you no longer have)

### Image Providers panel

Lists all configured image sources. The "Local Images" provider pointing at `/app/images` is always present and cannot be removed. Click **Add Provider** to add an Immich album, Home Assistant media folder, or another local directory. Providers can be removed at any time (except the built-in one) without restarting.

### Theme

The UI defaults to dark mode. Toggle light/dark with the sun/moon button in the top-right corner. Your preference is remembered in the browser.

---

## Image Providers

Three types of image source are supported. All are managed live through the web UI — no restart required.

### Local folder

Cycles through image files in a directory on the server's filesystem. The built-in provider points to `/app/images` (the volume you mount at startup) and cannot be deleted, but you can add additional local folders.

| Field  | Required | Description                             |
|--------|----------|-----------------------------------------|
| `name` | yes      | A label for this provider in the UI     |
| `path` | yes      | Absolute path to a directory of images  |

Supported file types: `.jpg`, `.jpeg`, `.png`, `.bmp`, `.webp`.

### Immich

Streams images from an [Immich](https://immich.app) photo library album. The album contents are refreshed at the start of each cycle, so newly uploaded photos are picked up automatically without any intervention.

| Field      | Required | Description                                              |
|------------|----------|----------------------------------------------------------|
| `name`     | yes      | A label for this provider in the UI                      |
| `base_url` | yes      | Your Immich server URL, e.g. `http://192.168.1.10:2283`  |
| `album_id` | yes      | The UUID of the album (visible in the album's URL)       |
| `api_key`  | yes      | An Immich API key (create one under Account Settings)    |

### Home Assistant

Pulls images from the Home Assistant Media Browser. The server browses the media tree starting at the path you specify, collects all image files it finds (recursing up to six levels deep), and cycles through them.

| Field              | Required | Default                           | Description                                               |
|--------------------|----------|-----------------------------------|-----------------------------------------------------------|
| `name`             | yes      | —                                 | A label for this provider in the UI                       |
| `base_url`         | yes      | —                                 | Your HA URL, e.g. `http://homeassistant.local:8123`       |
| `token`            | yes      | —                                 | A Long-Lived Access Token (create one in your HA profile) |
| `media_content_id` | no       | `media-source://media_source`     | The starting folder in the Media Browser                  |

---

## Dithering

E-Paper displays can only show a small number of colours — the Waveshare 7.3" ACeP panel, for example, has exactly six inks. Dithering is the technique of mixing those six colours together in fine patterns to simulate the thousands of shades in a photograph.

The server applies a small contrast and saturation boost before dithering (1.2× and 1.3× respectively) to compensate for the muted look e-Paper palettes can produce on real-world images.

**Palette options:**

| Value          | Description                                            |
|----------------|--------------------------------------------------------|
| `none`         | No palette restriction — pass the image through as-is |
| `bw`           | Black and white only                                   |
| `e6`           | 6-colour ACeP e-Paper (default)                        |

**E-Paper 6-Color palette:**

| Ink    | RGB             |
|--------|-----------------|
| Black  | (0, 0, 0)       |
| White  | (255, 255, 255) |
| Green  | (0, 255, 0)     |
| Blue   | (0, 0, 255)     |
| Red    | (255, 0, 0)     |
| Yellow | (255, 255, 0)   |

**Dithering algorithms** (configurable per display in the UI):

| Value                        | Character                                                                                      |
|------------------------------|------------------------------------------------------------------------------------------------|
| `none`                       | No dithering — pixels are snapped to the nearest palette colour with no blending               |
| `floyd-steinberg`            | The classic dithering algorithm; smooth results and fast                                       |
| `floyd-steinberg-serpentine` | A variant that alternates scan direction each row, reducing the faint diagonal grain that standard Floyd-Steinberg can produce on smooth gradients |
| `atkinson`                   | Spreads less error than Floyd-Steinberg, giving crisper highlights and a slightly punchier look |
| `ordered`                    | Uses a repeating geometric pattern (Bayer matrix) instead of error diffusion — deterministic and good on images with smooth gradients |

If you are not sure which to pick, `floyd-steinberg` is a solid default for most photos. Try `atkinson` for high-contrast artwork.

---

## Configuration

All settings can be provided as environment variables or CLI flags. Environment variables take precedence over defaults; CLI flags take precedence over environment variables.

| Environment variable | CLI flag        | Default                   | Description                                                                  |
|----------------------|-----------------|---------------------------|------------------------------------------------------------------------------|
| `DATA_DIR`           | `--data-dir`    | *(none)*                  | Directory for persistent storage. Omit to run without saving settings.       |
| `WS_PORT`            | `--port`        | `8927`                    | Port for the internal Sendspin WebSocket protocol                            |
| `HTTP_PORT`          | `--http-port`   | `8928`                    | Port for the web UI and REST API                                             |
| —                    | `--host`        | `0.0.0.0`                 | Network address to listen on                                                 |
| —                    | `--interval`    | `120`                     | Seconds between image advances (server-wide default; overridable per display)|
| —                    | `--dither-algo` | `none`                    | Default dithering algorithm; overridable per display in the UI               |
| —                    | `--dither-palette` | `e6`                   | Default colour palette; overridable per display in the UI                    |
| —                    | `--name`        | `Sendspin Image Server`   | Server name shown to displays during connection                              |
| —                    | `--log-level`   | `INFO`                    | Log verbosity: `DEBUG`, `INFO`, `WARNING`, `ERROR`, or `CRITICAL`            |

---

## For Developers

The full technical reference — protocol details, mDNS service types, connection lifecycle, dithering internals, database schema, REST API reference, and CI/build information — lives in [TECHNICAL.md](TECHNICAL.md).
