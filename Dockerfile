# ── Python server ─────────────────────────────────────────────────────────────
FROM python:3.12-slim

# Install uv (pinned so image builds are reproducible)
COPY --from=ghcr.io/astral-sh/uv:0.12.7 /uv /usr/local/bin/uv

WORKDIR /app

# Install dependencies straight from pyproject.toml so this never drifts from
# the declared dependency set. A stub package lets uv resolve and install the
# dependencies in their own cacheable layer, before the source is copied in.
COPY pyproject.toml ./
RUN mkdir -p sendspin_image_server \
 && touch sendspin_image_server/__init__.py \
 && uv pip install --system . \
 && uv pip uninstall --system sendspin-image-server

# Copy Python source
COPY sendspin_image_server/ ./sendspin_image_server/

# Copy the pre-built React UI into the package directory where cli.py expects it
# (build it first with: cd ui && npm run build)
COPY ui/dist/ ./sendspin_image_server/ui_dist/

# Create empty images directory — mount your own images here at runtime:
# docker run -v /host/photos:/app/images ...
RUN mkdir -p /app/images

# Install the package itself
RUN uv pip install --system --no-deps .

# Sendspin WebSocket port
EXPOSE 8927
# HTTP / UI port
EXPOSE 8928

ENV PYTHONUNBUFFERED=1
# DATA_DIR: mount a host directory here for persistent DB storage.
# e.g. docker run -v /host/data:/data -e DATA_DIR=/data ...
VOLUME ["/data"]

ENTRYPOINT ["sendspin-image-server"]
