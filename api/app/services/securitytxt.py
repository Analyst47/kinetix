"""security.txt (RFC 9116) discovery for vendor contacts.

Fetching a URL derived from user input is a classic SSRF vector, so this module only ever
requests ``https://<domain>/.well-known/security.txt`` where:

- the domain is a syntactically valid public hostname (no IP literals, no ports, no userinfo)
- every address it resolves to is public (no loopback, private, link-local, metadata, ...)
- the connection is pinned to an address that passed the check, so a DNS answer that changes
  between the check and the connection (DNS rebinding) can't redirect the request; TLS still
  verifies the certificate against the domain
- redirects are not followed, responses are capped at 32 KB, and the whole fetch times out
"""

import ipaddress
import re
import socket
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime

import httpx

from app.errors import ApiError

MAX_BYTES = 32 * 1024
TIMEOUT = httpx.Timeout(5.0, connect=3.0)
_LABEL = re.compile(r"^(?!-)[a-z0-9-]{1,63}(?<!-)$")

Resolver = Callable[[str], list[str]]


def system_resolver(host: str) -> list[str]:
    infos = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    return sorted({info[4][0] for info in infos})


def normalize_domain(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"^https?://", "", value).split("/", 1)[0]
    if "@" in value or ":" in value:
        raise ApiError(422, "invalid_domain", "Enter a domain name only, like example.com.")
    value = value.rstrip(".")
    try:
        value = value.encode("idna").decode("ascii")
    except UnicodeError as exc:
        raise ApiError(422, "invalid_domain", "That isn't a valid domain name.") from exc
    labels = value.split(".")
    if len(value) > 253 or len(labels) < 2 or not all(_LABEL.match(lbl) for lbl in labels):
        raise ApiError(422, "invalid_domain", "That isn't a valid domain name.")
    if labels[-1].isdigit():
        raise ApiError(422, "invalid_domain", "Enter a domain name, not an IP address.")
    if value in {"localhost"} or value.endswith((".localhost", ".local", ".internal", ".lan")):
        raise ApiError(422, "invalid_domain", "Only public domains can be looked up.")
    return value


def is_public(address: str) -> bool:
    ip = ipaddress.ip_address(address)
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return ip.is_global and not ip.is_multicast


@dataclass
class SecurityTxt:
    domain: str
    url: str
    contacts: list[str] = field(default_factory=list)
    policy: list[str] = field(default_factory=list)
    encryption: list[str] = field(default_factory=list)
    acknowledgments: list[str] = field(default_factory=list)
    preferred_languages: str | None = None
    expires: str | None = None
    signed: bool = False
    warnings: list[str] = field(default_factory=list)


def parse(text: str, domain: str, url: str, now: datetime | None = None) -> SecurityTxt:
    result = SecurityTxt(domain=domain, url=url)
    result.signed = "-----BEGIN PGP SIGNED MESSAGE-----" in text
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, _, value = line.partition(":")
        key, value = key.strip().lower(), value.strip()
        if not value:
            continue
        if key == "contact":
            result.contacts.append(value)
        elif key == "policy":
            result.policy.append(value)
        elif key == "encryption":
            result.encryption.append(value)
        elif key == "acknowledgments":
            result.acknowledgments.append(value)
        elif key == "preferred-languages":
            result.preferred_languages = value
        elif key == "expires":
            result.expires = value
    now = now or datetime.now(UTC)
    if not result.contacts:
        result.warnings.append("No Contact field. The file doesn't say how to report issues.")
    if result.expires is None:
        result.warnings.append("No Expires field, which RFC 9116 requires.")
    else:
        try:
            if datetime.fromisoformat(result.expires.replace("Z", "+00:00")) < now:
                result.warnings.append("This file has expired. The contact may be out of date.")
        except ValueError:
            result.warnings.append("The Expires date can't be read.")
    return result


def fetch(
    domain: str, resolver: Resolver = system_resolver, client: httpx.Client | None = None
) -> SecurityTxt:
    domain = normalize_domain(domain)
    try:
        addresses = resolver(domain)
    except OSError as exc:
        raise ApiError(404, "domain_not_found", f"{domain} doesn't resolve.") from exc
    if not addresses or not all(is_public(a) for a in addresses):
        raise ApiError(422, "domain_not_public", f"{domain} resolves to a non-public address.")
    pinned = addresses[0]
    host = f"[{pinned}]" if ":" in pinned else pinned
    url = f"https://{domain}/.well-known/security.txt"
    owned = client is None
    client = client or httpx.Client(timeout=TIMEOUT, follow_redirects=False)
    try:
        with client.stream(
            "GET",
            f"https://{host}/.well-known/security.txt",
            headers={"Host": domain, "Accept": "text/plain"},
            extensions={"sni_hostname": domain},
        ) as resp:
            if resp.status_code != 200:
                raise ApiError(
                    404,
                    "security_txt_missing",
                    f"{domain} has no security.txt (HTTP {resp.status_code}). Look for a security "
                    "page or bug bounty program instead.",
                )
            ctype = resp.headers.get("content-type", "")
            if not ctype.startswith("text/plain"):
                raise ApiError(
                    404, "security_txt_missing", f"{domain} doesn't serve a valid security.txt."
                )
            body = b""
            for chunk in resp.iter_bytes():
                body += chunk
                if len(body) > MAX_BYTES:
                    raise ApiError(
                        422, "security_txt_too_large", "That security.txt is unusually large."
                    )
    except httpx.HTTPError as exc:
        raise ApiError(502, "fetch_failed", f"Couldn't reach {domain} over HTTPS.") from exc
    finally:
        if owned:
            client.close()
    return parse(body.decode("utf-8", errors="replace"), domain, url)
