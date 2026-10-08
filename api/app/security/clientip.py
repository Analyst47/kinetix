"""The client's IP address, as far as it can be trusted.

Behind a reverse proxy, the socket peer is the proxy, and the real client is in
X-Forwarded-For. That header is client-controlled, so it is only read when the request
arrives from a proxy listed in KINETIX_TRUSTED_PROXIES, and then from the right: each
trusted hop is skipped, and the first address that isn't a trusted proxy is the client.
"""

import ipaddress
from functools import lru_cache

from fastapi import Request

from app.config import get_settings

Network = ipaddress.IPv4Network | ipaddress.IPv6Network


@lru_cache
def _trusted(cidrs: tuple[str, ...]) -> tuple[Network, ...]:
    return tuple(ipaddress.ip_network(c, strict=False) for c in cidrs)


def _parse(value: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    value = value.strip().strip('"')
    if value.startswith("[") and "]" in value:  # [v6]:port
        value = value[1 : value.index("]")]
    elif value.count(":") == 1:  # v4:port
        value = value.split(":", 1)[0]
    try:
        ip = ipaddress.ip_address(value)
    except ValueError:
        return None
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        return ip.ipv4_mapped
    return ip


def client_ip(request: Request) -> str:
    peer = request.client.host if request.client else "unknown"
    s = get_settings()
    if not s.trusted_proxies:
        return peer
    networks = _trusted(tuple(s.trusted_proxies))

    def trusted(ip: ipaddress.IPv4Address | ipaddress.IPv6Address | None) -> bool:
        return ip is not None and any(ip in n for n in networks)

    if not trusted(_parse(peer)):
        return peer
    hops = [h for h in request.headers.get(s.client_ip_header, "").split(",") if h.strip()]
    for hop in reversed(hops):
        ip = _parse(hop)
        if ip is None:
            break  # garbage in the chain: stop trusting it
        if not trusted(ip):
            return str(ip)
    return peer
