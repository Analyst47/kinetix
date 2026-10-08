"""Outgoing email. Every message is plain text first, with a minimal HTML twin.

Backends: "console" prints messages (development), "resend" uses the Resend HTTP API,
"memory" keeps them in a list (tests), "none" drops them. Sending is fire-and-forget from a
background task, so a slow or failing provider never changes an API response, which also
keeps response timing from revealing whether an account exists.
"""

import html
import logging
from dataclasses import dataclass, field
from typing import Protocol

import httpx

from app.config import get_settings

log = logging.getLogger("kinetix.email")


@dataclass(frozen=True)
class Message:
    to: str
    subject: str
    text: str
    # Stable per logical message, so a retried send can't deliver twice.
    idempotency_key: str | None = None

    @property
    def html(self) -> str:
        paragraphs = "".join(
            f'<p style="margin:0 0 14px">{html.escape(p).replace(chr(10), "<br>")}</p>'
            for p in self.text.strip().split("\n\n")
        )
        return (
            '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;'
            'font-size:15px;line-height:1.5;color:#1b1f1e;max-width:560px">'
            f"{paragraphs}</div>"
        )


class Mailer(Protocol):
    def send(self, message: Message) -> None: ...


class ConsoleMailer:
    def send(self, message: Message) -> None:
        if get_settings().is_production:
            # Bodies carry reset and invitation links, which must not land in production logs.
            log.error("Email isn't configured; dropped message subject=%r", message.subject)
            return
        log.warning(
            "Email (console backend) to=%s subject=%r\n%s",
            message.to,
            message.subject,
            message.text,
        )


class NullMailer:
    def send(self, message: Message) -> None:
        return None


@dataclass
class MemoryMailer:
    outbox: list[Message] = field(default_factory=list)

    def send(self, message: Message) -> None:
        self.outbox.append(message)


@dataclass
class ResendMailer:
    api_key: str
    sender: str
    base_url: str = "https://api.resend.com"
    client: httpx.Client | None = None

    def send(self, message: Message) -> None:
        headers = {"authorization": f"Bearer {self.api_key}", "content-type": "application/json"}
        if message.idempotency_key:
            headers["idempotency-key"] = message.idempotency_key
        client = self.client or httpx.Client(timeout=15.0)
        try:
            resp = client.post(
                f"{self.base_url}/emails",
                headers=headers,
                json={
                    "from": self.sender,
                    "to": [message.to],
                    "subject": message.subject,
                    "text": message.text,
                    "html": message.html,
                },
            )
        except httpx.HTTPError:
            log.exception("Email send failed (network) subject=%r", message.subject)
            return
        finally:
            if self.client is None:
                client.close()
        if resp.status_code >= 300:
            # Never log the body we sent: it can contain a reset or invitation link.
            log.error("Email send failed: HTTP %s subject=%r", resp.status_code, message.subject)


_override: Mailer | None = None


def set_mailer(mailer: Mailer | None) -> None:
    """Tests install a MemoryMailer here."""
    global _override
    _override = mailer


def get_mailer() -> Mailer:
    if _override is not None:
        return _override
    s = get_settings()
    if s.email_backend == "resend" and s.resend_api_key:
        return ResendMailer(api_key=s.resend_api_key, sender=s.email_from)
    if s.email_backend == "none":
        return NullMailer()
    return ConsoleMailer()


def deliver(message: Message) -> None:
    """Entry point for background tasks. Swallows every error: email is best-effort."""
    try:
        get_mailer().send(message)
    except Exception:
        log.exception("Email send failed subject=%r", message.subject)


def is_configured() -> bool:
    """True when messages actually leave the server."""
    s = get_settings()
    return _override is not None or (s.email_backend == "resend" and bool(s.resend_api_key))
