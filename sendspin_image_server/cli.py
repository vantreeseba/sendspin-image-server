"""CLI entry point for the Sendspin image server."""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import pathlib
import signal
import uuid

from sendspin_image_server.mdns import MDNSAdvertiser, MDNSDiscovery
from sendspin_image_server.server import SendspinImageServer

logger = logging.getLogger(__name__)

# Image file extensions accepted for slideshow mode
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

# TODO: remove FORCE_E6_FOR_TESTING once testing is complete.
# Dithering is normally applied per-client based on the format negotiated
# during the Sendspin handshake (clients that request 'e6-dithered' receive
# Floyd-Steinberg dithered output; others receive the raw image).
FORCE_E6_FOR_TESTING = True


def _collect_images(image_dir: pathlib.Path) -> list[pathlib.Path]:
    """Return sorted list of image files in *image_dir*."""
    files = sorted(
        p for p in image_dir.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
    )
    return files


async def _slideshow_loop(
    server: SendspinImageServer,
    image_dir: pathlib.Path,
    interval: float,
) -> None:
    """Cycle through images in *image_dir*, broadcasting one every *interval* seconds."""
    images = _collect_images(image_dir)
    if not images:
        logger.warning("No images found in %s — slideshow disabled", image_dir)
        return

    logger.info(
        "Slideshow: %d image(s) in %s, interval %.1fs", len(images), image_dir, interval
    )

    index = 0
    while True:
        path = images[index]
        try:
            data = path.read_bytes()
            logger.info("Slideshow: broadcasting %s (%d bytes)", path.name, len(data))
            await server.broadcast_image(data, channel=0, force_e6_dither=FORCE_E6_FOR_TESTING)
        except Exception:
            logger.exception("Slideshow: failed to send %s", path)

        index = (index + 1) % len(images)
        await asyncio.sleep(interval)


async def run(
    host: str,
    port: int,
    name: str,
    server_id: str,
    http_port: int,
    image_dir: pathlib.Path,
    interval: float,
) -> int:
    """Run the Sendspin image server and HTTP image-push endpoint."""
    from aiohttp import web

    server = SendspinImageServer(server_id=server_id, server_name=name)
    await server.start(host=host, port=port)

    mdns = MDNSAdvertiser(name=name, port=port)
    await mdns.start()

    discovery = MDNSDiscovery(
        on_client_added=server.connect_to_client,
        on_client_removed=server.disconnect_from_client,
    )
    await discovery.start()

    # HTTP endpoint for pushing images manually
    # Query params:
    #   channel=<int>   artwork channel (default 0)
    async def handle_image_post(request: web.Request) -> web.Response:
        data = await request.read()
        if not data:
            return web.Response(status=400, text="Empty body")
        channel = int(request.query.get("channel", "0"))
        if FORCE_E6_FOR_TESTING:
            logger.info("e6 dithering forced (test mode) — will apply post-resize per client")
        await server.broadcast_image(data, channel=channel, force_e6_dither=FORCE_E6_FOR_TESTING)
        logger.info("Pushed image (%d bytes) to artwork clients on channel %d", len(data), channel)
        return web.Response(status=200, text="OK")

    app = web.Application(client_max_size=20 * 1024 * 1024)  # 20MB
    app.router.add_post("/image", handle_image_post)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host, http_port)
    await site.start()

    logger.info("HTTP image-push endpoint at http://%s:%d/image", host, http_port)

    # Start slideshow background task
    slideshow_task: asyncio.Task[None] = asyncio.create_task(
        _slideshow_loop(server, image_dir, interval),
        name="slideshow",
    )

    logger.info("Server running. Press Ctrl+C to quit.")

    loop = asyncio.get_event_loop()
    stop_event = asyncio.Event()

    def _handle_signal() -> None:
        stop_event.set()

    with_signal = True
    try:
        loop.add_signal_handler(signal.SIGINT, _handle_signal)
        loop.add_signal_handler(signal.SIGTERM, _handle_signal)
    except NotImplementedError:
        with_signal = False

    if with_signal:
        await stop_event.wait()
    else:
        try:
            await asyncio.Event().wait()  # wait forever
        except (KeyboardInterrupt, asyncio.CancelledError):
            pass

    logger.info("Shutting down...")
    slideshow_task.cancel()
    await asyncio.gather(slideshow_task, return_exceptions=True)
    await discovery.stop()
    await mdns.stop()
    await server.stop()
    await runner.cleanup()
    return 0


def main() -> None:
    """Parse arguments and run the server."""
    parser = argparse.ArgumentParser(
        description="Sendspin image server — silent audio stream with artwork push"
    )
    parser.add_argument("--host", default="0.0.0.0", help="Bind address (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8927, help="WebSocket port (default: 8927)")
    parser.add_argument(
        "--http-port", type=int, default=8928, help="HTTP image-push port (default: 8928)"
    )
    parser.add_argument("--name", default="Sendspin Image Server", help="Server friendly name")
    parser.add_argument(
        "--server-id",
        default=f"sendspin-image-{uuid.uuid4().hex[:8]}",
        help="Unique server identifier",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
        help="Logging level (default: INFO)",
    )
    parser.add_argument(
        "--image-dir",
        type=pathlib.Path,
        default=pathlib.Path(os.environ.get("IMAGE_DIR", "./images")),
        metavar="DIR",
        help="Directory of images to cycle through as a slideshow (env: IMAGE_DIR, default: ./images)",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=float(os.environ.get("SLIDESHOW_INTERVAL", "60")),
        metavar="SECONDS",
        help="Seconds between slideshow images (env: SLIDESHOW_INTERVAL, default: 60)",
    )
    args = parser.parse_args()

    if not args.image_dir.is_dir():
        parser.error(f"--image-dir {args.image_dir!r} is not a directory (set IMAGE_DIR env var or pass --image-dir)")

    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    raise SystemExit(
        asyncio.run(
            run(
                host=args.host,
                port=args.port,
                name=args.name,
                server_id=args.server_id,
                http_port=args.http_port,
                image_dir=args.image_dir,
                interval=args.interval,
            )
        )
    )
