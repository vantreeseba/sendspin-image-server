"""mDNS advertisement and client discovery for the Sendspin image server."""

from __future__ import annotations

import asyncio
import logging
import socket
from collections.abc import Callable
from ipaddress import ip_address

from zeroconf import ServiceInfo, ServiceStateChange, Zeroconf
from zeroconf.asyncio import AsyncServiceBrowser, AsyncServiceInfo, AsyncZeroconf

logger = logging.getLogger(__name__)

SERVER_SERVICE_TYPE = "_sendspin-server._tcp.local."
CLIENT_SERVICE_TYPE = "_sendspin._tcp.local."


def _first_valid_ip(addresses: list[str]) -> str | None:
    """Return the first non-link-local, non-unspecified IP from a list of address strings."""
    for addr_str in addresses:
        try:
            addr = ip_address(addr_str)
        except ValueError:
            continue
        if not addr.is_link_local and not addr.is_unspecified:
            return addr_str
    return None


_MDNS_PORT = 5353


class MDNSAdvertiser:
    """Advertises the Sendspin server via mDNS (_sendspin-server._tcp.local.)."""

    def __init__(self, name: str, ws_port: int, path: str = "/sendspin") -> None:
        self._name = name
        self._ws_port = ws_port
        self._path = path
        self._zeroconf: AsyncZeroconf | None = None
        self._info: ServiceInfo | None = None

    async def start(self) -> None:
        """Start mDNS advertisement (must be called from within a running event loop)."""
        hostname = socket.gethostname()
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
                s.connect(("8.8.8.8", 80))
                local_ip = s.getsockname()[0]
        except Exception:
            local_ip = "127.0.0.1"

        service_name = f"{self._name}.{SERVER_SERVICE_TYPE}"
        self._info = ServiceInfo(
            SERVER_SERVICE_TYPE,
            service_name,
            addresses=[socket.inet_aton(local_ip)],
            port=self._ws_port,
            properties={"path": self._path},
            server=f"{hostname}.local.",
        )
        self._zeroconf = AsyncZeroconf()
        await self._zeroconf.async_register_service(self._info)
        logger.info(
            "mDNS: advertising '%s' on %s:%d%s (mDNS port: %d)",
            self._name, local_ip, self._ws_port, self._path, _MDNS_PORT,
        )

    async def stop(self) -> None:
        """Stop mDNS advertisement."""
        if self._zeroconf is not None and self._info is not None:
            await self._zeroconf.async_unregister_service(self._info)
            await self._zeroconf.async_close()
            self._zeroconf = None
            self._info = None
            logger.info("mDNS: advertisement stopped")


class MDNSDiscovery:
    """Discovers Sendspin clients via mDNS (_sendspin._tcp.local.).

    Calls `on_client_added(url)` when a client is found and
    `on_client_removed(url)` when it disappears.
    """

    def __init__(
        self,
        on_client_added: Callable[[str], None],
        on_client_removed: Callable[[str], None],
    ) -> None:
        self._on_client_added = on_client_added
        self._on_client_removed = on_client_removed
        self._zeroconf: AsyncZeroconf | None = None
        self._browser: AsyncServiceBrowser | None = None
        # name → url, so we can pass the same url to on_client_removed
        self._known: dict[str, str] = {}

    async def start(self) -> None:
        """Start browsing for Sendspin clients."""
        self._zeroconf = AsyncZeroconf()
        loop = asyncio.get_event_loop()

        def _state_change(
            zeroconf: Zeroconf,
            service_type: str,
            name: str,
            state_change: ServiceStateChange,
        ) -> None:
            if state_change in (ServiceStateChange.Added, ServiceStateChange.Updated):
                loop.call_soon_threadsafe(
                    lambda: asyncio.ensure_future(self._handle_added(zeroconf, service_type, name))
                )
            elif state_change is ServiceStateChange.Removed:
                loop.call_soon_threadsafe(lambda: self._handle_removed(name))

        self._browser = AsyncServiceBrowser(
            self._zeroconf.zeroconf,
            CLIENT_SERVICE_TYPE,
            handlers=[_state_change],
        )
        logger.info("mDNS: browsing for Sendspin clients (%s)", CLIENT_SERVICE_TYPE)

    async def stop(self) -> None:
        """Stop browsing."""
        if self._browser is not None:
            await self._browser.async_cancel()
            self._browser = None
        if self._zeroconf is not None:
            await self._zeroconf.async_close()
            self._zeroconf = None
        logger.info("mDNS: discovery stopped")

    async def _handle_added(self, zeroconf: Zeroconf, service_type: str, name: str) -> None:
        info = AsyncServiceInfo(service_type, name)
        if not info.load_from_cache(zeroconf):
            await info.async_request(zeroconf, 3000)

        addresses = info.parsed_addresses()
        if not addresses:
            logger.debug("mDNS: no addresses for %s, ignoring", name)
            return

        address = _first_valid_ip(addresses)
        if address is None:
            logger.debug("mDNS: no valid IP for %s, ignoring", name)
            return

        port = info.port
        if port is None:
            logger.debug("mDNS: no port for %s, ignoring", name)
            return

        path = "/sendspin"
        if info.properties:
            for k, v in info.properties.items():
                key = k.decode() if isinstance(k, bytes) else k
                if key == "path" and v is not None:
                    path = v.decode() if isinstance(v, bytes) else str(v)
                    break

        url = f"ws://{address}:{port}{path}"
        if self._known.get(name) == url:
            return  # already connected

        self._known[name] = url
        logger.info("mDNS: discovered Sendspin client '%s' at %s", name, url)
        self._on_client_added(url)

    def _handle_removed(self, name: str) -> None:
        url = self._known.pop(name, None)
        if url is not None:
            logger.info("mDNS: Sendspin client '%s' removed (%s)", name, url)
            self._on_client_removed(url)
