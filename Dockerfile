FROM python:3.12-slim

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Copy dependency metadata first for layer caching
COPY pyproject.toml ./

# Install dependencies (no editable install yet, just deps)
RUN uv pip install --system "websockets>=12.0" "zeroconf>=0.131.0" "aiohttp>=3.9.0" "Pillow>=10.0.0"

# Copy source
COPY sendspin_image_server/ ./sendspin_image_server/

# Copy images directory if present (used for slideshow mode)
COPY images/ ./images/

# Install the package itself
RUN uv pip install --system --no-deps .

# Sendspin WebSocket port
EXPOSE 8927
# HTTP image-push port
EXPOSE 8928

ENV PYTHONUNBUFFERED=1
ENV IMAGE_DIR=/app/images
ENV SLIDESHOW_INTERVAL=60

ENTRYPOINT ["sendspin-image-server"]
