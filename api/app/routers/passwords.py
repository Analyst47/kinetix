"""Forgot, reset and change password.

- Asking for a reset always gets the same answer, whether or not the account exists, and
  the email goes out from a background task so response timing doesn't tell either.
- Links carry a 256-bit token; only its SHA-256 is stored. They expire, work once, and are
  void as soon as the password changes by any route.
- A reset never bypasses two-step verification: with MFA on, the link alone isn't enough.
- A reset signs out every session and cancels pending MFA sign-in challenges.
"""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import Principal, current_principal, forbid_demo_account, is_demo_account
from app.email import deliver, templates
from app.errors import ApiError
from app.models import AuthSession, MfaChallenge, PasswordReset, User
from app.routers.auth import _check_second_factor, _client_ip, _revoke_other_sessions
from app.schemas import (
    ChangePasswordIn,
    ForgotPasswordIn,
    ResetPasswordIn,
    ResetStatusOut,
    ResetTokenIn,
)
from app.security.passwords import hash_password, verify_password
from app.security.ratelimit import login_limiter, reset_email_limiter, reset_request_limiter
from app.security.tokens import new_token, token_digest

router = APIRouter(prefix="/auth/password", tags=["auth"])

MAX_CODE_ATTEMPTS = 5
SENT = {
    "status": "sent",
    "message": "If an account uses that email, we sent it a link to reset the password.",
}


def _when(at: datetime) -> str:
    return at.strftime("%b %d, %Y at %H:%M UTC")


def _email_hint(email: str) -> str:
    local, _, domain = email.partition("@")
    return f"{local[0]}{'•' * max(2, min(len(local) - 1, 6))}@{domain}"


def _usable(db: Session, token: str) -> PasswordReset | None:
    row = db.scalar(select(PasswordReset).where(PasswordReset.token_hash == token_digest(token)))
    if (
        row is None
        or row.used_at is not None
        or row.expires_at <= datetime.now(UTC)
        or row.attempts >= MAX_CODE_ATTEMPTS
        or not row.user.is_active
    ):
        return None
    return row


def _void_pending_resets(db: Session, user: User, now: datetime) -> None:
    db.execute(
        update(PasswordReset)
        .where(PasswordReset.user_id == user.id, PasswordReset.used_at.is_(None))
        .values(used_at=now)
    )


@router.post("/forgot", status_code=202)
def forgot_password(
    body: ForgotPasswordIn,
    request: Request,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    reset_request_limiter.hit(_client_ip(request))
    email = body.email.lower()
    user = db.scalar(select(User).where(func.lower(User.email) == email))
    if (
        user is None
        or not user.is_active
        or is_demo_account(user)
        or not reset_email_limiter.allow(email)
    ):
        return SENT
    s = get_settings()
    token = new_token()
    row = PasswordReset(
        token_hash=token_digest(token),
        user_id=user.id,
        expires_at=datetime.now(UTC) + timedelta(minutes=s.password_reset_minutes),
        requested_ip=_client_ip(request),
    )
    db.add(row)
    db.commit()
    # The token rides in the URL fragment, which browsers never send to a server, so it
    # can't end up in access logs or Referer headers.
    link = f"{s.app_url}/reset-password#token={token}"
    background.add_task(
        deliver,
        templates.password_reset(
            user.email, user.name, link, s.password_reset_minutes, key=f"reset-{row.id}"
        ),
    )
    return SENT


@router.post("/reset/check")
def check_reset(
    body: ResetTokenIn, request: Request, db: Session = Depends(get_db)
) -> ResetStatusOut:
    login_limiter.hit(f"reset|{_client_ip(request)}")
    row = _usable(db, body.token)
    if row is None:
        return ResetStatusOut(valid=False)
    return ResetStatusOut(
        valid=True, mfa_required=row.user.mfa_enabled, email_hint=_email_hint(row.user.email)
    )


@router.post("/reset", status_code=204)
def reset_password(
    body: ResetPasswordIn,
    request: Request,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
) -> Response:
    login_limiter.hit(f"reset|{_client_ip(request)}")
    row = _usable(db, body.token)
    if row is None:
        raise ApiError(
            400, "reset_invalid", "This reset link is invalid or has expired. Ask for a new one."
        )
    user = row.user
    if user.mfa_enabled and not _check_second_factor(db, user, body.code, body.recovery_code):
        row.attempts += 1
        db.commit()
        raise ApiError(
            401,
            "invalid_code",
            "That code didn't work. Use your authenticator app or a recovery code.",
        )
    now = datetime.now(UTC)
    user.password_hash = hash_password(body.password)
    _void_pending_resets(db, user, now)
    db.execute(
        update(AuthSession)
        .where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    db.execute(delete(MfaChallenge).where(MfaChallenge.user_id == user.id))
    db.commit()
    background.add_task(
        deliver,
        templates.password_changed(user.email, user.name, _when(now), "reset by email link"),
    )
    return Response(status_code=204)


@router.post("/change", status_code=204)
def change_password(
    body: ChangePasswordIn,
    background: BackgroundTasks,
    principal: Principal = Depends(current_principal),
    db: Session = Depends(get_db),
) -> Response:
    user = principal.user
    forbid_demo_account(user)
    login_limiter.hit(f"change|{user.id}")
    if not verify_password(user.password_hash, body.current_password):
        raise ApiError(403, "reauth_failed", "Your current password is incorrect.")
    if verify_password(user.password_hash, body.new_password):
        raise ApiError(422, "password_unchanged", "Choose a password you aren't already using.")
    now = datetime.now(UTC)
    user.password_hash = hash_password(body.new_password)
    _void_pending_resets(db, user, now)
    _revoke_other_sessions(db, principal)
    db.commit()
    background.add_task(
        deliver, templates.password_changed(user.email, user.name, _when(now), "changed")
    )
    return Response(status_code=204)
