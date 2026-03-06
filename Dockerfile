# ── Stage 1: build the React UI ──────────────────────────────────────────────
FROM node:24-slim AS ui-builder

WORKDIR /ui

COPY ui/package*.json ./
RUN npm ci

COPY ui/ ./
RUN npm run build
# Output is in /ui/dist/

# ── Stage 2: Python server ────────────────────────────────────────────────────
FROM python:3.12-slim

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Copy dependency metadata first for layer caching
COPY pyproject.toml ./

# Install Python dependencies
RUN uv pip install --system "websockets>=12.0" "zeroconf>=0.131.0" "aiohttp>=3.9.0" "Pillow>=10.0.0" "numpy>=1.26.0" "aiosqlite>=0.20.0"

# Copy Python source
COPY sendspin_image_server/ ./sendspin_image_server/

# Copy the built UI into the package directory where cli.py expects it
COPY --from=ui-builder /ui/dist/ ./sendspin_image_server/ui_dist/

# Copy images directory (used for built-in local slideshow endpoint)
COPY images/ ./images/

# Install the package itself
RUN uv pip install --system --no-deps .

# Sendspin WebSocket port
EXPOSE 8927
# HTTP / UI port
EXPOSE 8928

ENV PYTHONUNBUFFERED=1
ENV SLIDESHOW_INTERVAL=120
# DATA_DIR: mount a host directory here for persistent DB storage.
# e.g. docker run -v /host/data:/data -e DATA_DIR=/data ...
VOLUME ["/data"]

ENTRYPOINT ["sendspin-image-server"]
