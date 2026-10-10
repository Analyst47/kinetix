"""Message wording. Plain, specific, and never asks the reader to reply with secrets."""

from app.email import Message

FOOTER = "KinetixZero: vulnerability research and coordinated disclosure."


def password_reset(to: str, name: str, link: str, minutes: int, key: str) -> Message:
    return Message(
        to=to,
        subject="Reset your KinetixZero password",
        text=f"""Hi {name},

Someone asked to reset the password for your KinetixZero account. If it was you, open this link within {minutes} minutes:

{link}

If you have two-step verification on, you'll need your authenticator app or a recovery code too.

If you didn't ask for this, ignore this email. Your password stays the same.

{FOOTER}""",
        idempotency_key=key,
    )


def password_changed(to: str, name: str, when: str, how: str) -> Message:
    return Message(
        to=to,
        subject="Your KinetixZero password was changed",
        text=f"""Hi {name},

The password for your KinetixZero account was {how} on {when}. Other signed-in sessions were signed out.

If this wasn't you, reset your password right away from the sign-in page, and tell your workspace owner.

{FOOTER}""",
    )


def mfa_disabled(to: str, name: str, when: str) -> Message:
    return Message(
        to=to,
        subject="Two-step verification was turned off",
        text=f"""Hi {name},

Two-step verification was turned off for your KinetixZero account on {when}.

If this wasn't you, reset your password from the sign-in page and turn two-step verification back on.

{FOOTER}""",
    )


def invitation(to: str, inviter: str, org: str, role: str, link: str, key: str) -> Message:
    return Message(
        to=to,
        subject=f"{inviter} invited you to {org} on KinetixZero",
        text=f"""{inviter} invited you to join the {org} workspace on KinetixZero as {role}.

Accept the invitation within 7 days:

{link}

The invitation only works for this email address. If you weren't expecting it, you can ignore this email.

{FOOTER}""",
        idempotency_key=key,
    )
