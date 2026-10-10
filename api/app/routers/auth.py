import re
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import Principal, current_principal, forbid_demo_account, parse_uuid
from app.email import deliver, templates
from app.errors import ApiError, not_found
from app.models import AuthSession, Membership, MfaChallenge, Organization, RecoveryCode, User
from app.models.enums import Role
from app.schemas import (
    LoginIn,
    MembershipOut,
    MeOut,
    MfaCodeIn,
    MfaDisableIn,
    MfaRequiredOut,
    MfaSetupOut,
    MfaStatusOut,
    MfaVerifyIn,
    PasswordIn,
    RecoveryCodesOut,
    RegisterIn,
    SessionOut,
    UserOut,
)
from app.security import mfa
from app.security.clientip import client_ip
from app.security.passwords import hash_password, needs_rehash, verify_password
from app.security.ratelimit import account_limiter, login_limiter, register_limiter
from app.security.tokens import new_token, token_digest

router = APIRouter(prefix="/auth", tags=["auth"])

MFA_CHALLENGE_TTL = timedelta(minutes=5)
MFA_MAX_ATTEMPTS = 5
# Top-level web routes that an organization slug must never shadow.
RESERVED_ORG_SLUGS = frozenset(
    {
        "report",
        "invite",
        "login",
        "register",
        "api",
        "settings",
        "forgot-password",
        "reset-password",
    }
)


def _client_ip(request: Request) -> str:
    return client_ip(request)


def _set_cookie(
    response: Response, name: str, value: str, *, http_only: bool, max_age: int
) -> None:
    s = get_settings()
    response.set_cookie(
        name,
        value,
        max_age=max_age,
        httponly=http_only,
        secure=s.cookie_secure,
        samesite="lax",
        path="/",
    )


def _start_session(db: Session, user: User, request: Request, response: Response) -> None:
    s = get_settings()
    token = new_token()
    db.add(
        AuthSession(
            token_hash=token_digest(token),
            user_id=user.id,
            expires_at=datetime.now(UTC) + timedelta(hours=s.session_ttl_hours),
            ip_address=_client_ip(request),
            user_agent=(request.headers.get("user-agent") or "")[:300],
        )
    )
    max_age = s.session_ttl_hours * 3600
    _set_cookie(response, s.session_cookie, token, http_only=True, max_age=max_age)
    # Rotate the CSRF token at every privilege change.
    _set_cookie(response, s.csrf_cookie, new_token(), http_only=False, max_age=max_age)


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:48] or "org"
    return slug


def _me(db: Session, user: User) -> MeOut:
    rows = db.execute(
        select(Organization.slug, Organization.name, Membership.role)
        .join(Membership, Membership.org_id == Organization.id)
        .where(Membership.user_id == user.id)
        .order_by(Organization.name)
    ).all()
    return MeOut(
        user=UserOut.model_validate(user),
        organizations=[MembershipOut(slug=r.slug, name=r.name, role=r.role) for r in rows],
        mfa_enabled=user.mfa_enabled,
    )


@router.get("/csrf")
def csrf(response: Response) -> dict[str, str]:
    """Issue a CSRF token cookie. Unsafe requests must echo it in X-CSRF-Token."""
    token = new_token()
    _set_cookie(response, get_settings().csrf_cookie, token, http_only=False, max_age=12 * 3600)
    return {"csrf_token": token}


@router.post("/register", status_code=201)
def register(
    body: RegisterIn, request: Request, response: Response, db: Session = Depends(get_db)
) -> MeOut:
    register_limiter.hit(_client_ip(request))
    email = body.email.lower()
    if db.scalar(select(User.id).where(func.lower(User.email) == email)):
        raise ApiError(
            409, "email_taken", "An account with that email already exists. Sign in instead."
        )
    user = User(email=email, name=body.name, password_hash=hash_password(body.password))
    base = _slugify(body.organization_name)
    slug, n = base, 1
    while slug in RESERVED_ORG_SLUGS or db.scalar(
        select(Organization.id).where(Organization.slug == slug)
    ):
        n += 1
        slug = f"{base}-{n}"
    org = Organization(slug=slug, name=body.organization_name)
    db.add_all([user, org])
    db.flush()
    org.created_by_id = user.id
    db.add(Membership(org_id=org.id, user_id=user.id, role=Role.OWNER))
    _start_session(db, user, request, response)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ApiError(409, "email_taken", "An account with that email already exists.") from exc
    return _me(db, user)


@router.post("/login")
def login(
    body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)
) -> MeOut | MfaRequiredOut:
    email = body.email.lower()
    login_limiter.hit(f"{_client_ip(request)}|{email}")
    account_limiter.hit(email)
    user = db.scalar(select(User).where(func.lower(User.email) == email))
    ok = verify_password(user.password_hash if user else None, body.password)
    if not ok or user is None or not user.is_active:
        raise ApiError(401, "invalid_credentials", "Email or password is incorrect.")
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(body.password)
    if user.mfa_enabled:
        # Password alone never yields a session when MFA is on: hand back a short-lived
        # challenge that must be exchanged together with a code.
        token = new_token()
        db.add(
            MfaChallenge(
                token_hash=token_digest(token),
                user_id=user.id,
                expires_at=datetime.now(UTC) + MFA_CHALLENGE_TTL,
            )
        )
        db.commit()
        return MfaRequiredOut(challenge=token)
    _start_session(db, user, request, response)
    db.commit()
    return _me(db, user)


@router.post("/mfa/verify")
def mfa_verify(
    body: MfaVerifyIn, request: Request, response: Response, db: Session = Depends(get_db)
) -> MeOut:
    login_limiter.hit(f"mfa|{_client_ip(request)}")
    challenge = db.scalar(
        select(MfaChallenge).where(MfaChallenge.token_hash == token_digest(body.challenge))
    )
    now = datetime.now(UTC)
    if (
        challenge is None
        or challenge.consumed_at is not None
        or challenge.expires_at <= now
        or challenge.attempts >= MFA_MAX_ATTEMPTS
    ):
        raise ApiError(401, "mfa_expired", "That sign-in attempt expired. Sign in again.")
    user = challenge.user
    if not _check_second_factor(db, user, body.code, body.recovery_code):
        challenge.attempts += 1
        db.commit()
        raise ApiError(401, "invalid_code", "That code didn't work. Check your authenticator app.")
    challenge.consumed_at = now
    _start_session(db, user, request, response)
    db.commit()
    return _me(db, user)


def _check_second_factor(
    db: Session, user: User, code: str | None, recovery_code: str | None
) -> bool:
    if code and user.totp_secret_enc:
        secret = mfa.decrypt(user.totp_secret_enc)
        step = mfa.match_step(secret, code, user.totp_last_step) if secret else None
        if step is not None:
            user.totp_last_step = step
            return True
        return False
    if recovery_code:
        row = db.scalar(
            select(RecoveryCode).where(
                RecoveryCode.user_id == user.id,
                RecoveryCode.code_hash == mfa.hash_recovery_code(recovery_code),
                RecoveryCode.used_at.is_(None),
            )
        )
        if row is not None:
            row.used_at = datetime.now(UTC)
            return True
    return False


@router.post("/logout", status_code=204)
def logout(
    response: Response,
    principal: Principal = Depends(current_principal),
    db: Session = Depends(get_db),
) -> Response:
    principal.session.revoked_at = datetime.now(UTC)
    db.commit()
    s = get_settings()
    response.delete_cookie(s.session_cookie, path="/")
    response.delete_cookie(s.csrf_cookie, path="/")
    response.status_code = 204
    return response


@router.get("/me")
def me(principal: Principal = Depends(current_principal), db: Session = Depends(get_db)) -> MeOut:
    return _me(db, principal.user)


@router.get("/sessions")
def list_sessions(
    principal: Principal = Depends(current_principal), db: Session = Depends(get_db)
) -> list[SessionOut]:
    rows = db.scalars(
        select(AuthSession)
        .where(
            AuthSession.user_id == principal.user.id,
            AuthSession.revoked_at.is_(None),
            AuthSession.expires_at > datetime.now(UTC),
        )
        .order_by(AuthSession.last_seen_at.desc())
    ).all()
    out = []
    for row in rows:
        item = SessionOut.model_validate(row)
        item.current = row.id == principal.session.id
        out.append(item)
    return out


@router.delete("/sessions/{session_id}", status_code=204)
def revoke_session(
    session_id: str,
    principal: Principal = Depends(current_principal),
    db: Session = Depends(get_db),
) -> Response:
    sid = parse_uuid(session_id, "Session")
    row = db.scalar(
        select(AuthSession).where(AuthSession.id == sid, AuthSession.user_id == principal.user.id)
    )
    if row is None:
        raise not_found("Session")
    row.revoked_at = datetime.now(UTC)
    db.commit()
    return Response(status_code=204)


# ── MFA management ────────────────────────────────────────────────────────────


def _remaining_codes(db: Session, user: User) -> int:
    return (
        db.scalar(
            select(func.count()).where(
                RecoveryCode.user_id == user.id, RecoveryCode.used_at.is_(None)
            )
        )
        or 0
    )


def _issue_recovery_codes(db: Session, user: User) -> list[str]:
    db.execute(delete(RecoveryCode).where(RecoveryCode.user_id == user.id))
    codes = mfa.new_recovery_codes()
    db.add_all(RecoveryCode(user_id=user.id, code_hash=mfa.hash_recovery_code(c)) for c in codes)
    return codes


def _require_password(user: User, password: str) -> None:
    if not verify_password(user.password_hash, password):
        raise ApiError(403, "reauth_failed", "Your password is incorrect.")


@router.get("/mfa")
def mfa_status(
    principal: Principal = Depends(current_principal), db: Session = Depends(get_db)
) -> MfaStatusOut:
    user = principal.user
    return MfaStatusOut(
        enabled=user.mfa_enabled,
        enabled_at=user.totp_enabled_at,
        recovery_codes_remaining=_remaining_codes(db, user),
    )


@router.post("/mfa/setup")
def mfa_setup(
    body: PasswordIn,
    principal: Principal = Depends(current_principal),
    db: Session = Depends(get_db),
) -> MfaSetupOut:
    user = principal.user
    forbid_demo_account(user)
    _require_password(user, body.password)
    if user.mfa_enabled:
        raise ApiError(409, "mfa_enabled", "Two-step verification is already on.")
    secret = mfa.new_secret()
    user.totp_secret_enc = mfa.encrypt(secret)
    user.totp_last_step = None
    db.commit()
    return MfaSetupOut(secret=secret, otpauth_uri=mfa.provisioning_uri(secret, user.email))


@router.post("/mfa/enable")
def mfa_enable(
    body: MfaCodeIn,
    principal: Principal = Depends(current_principal),
    db: Session = Depends(get_db),
) -> RecoveryCodesOut:
    user = principal.user
    if user.mfa_enabled:
        raise ApiError(409, "mfa_enabled", "Two-step verification is already on.")
    secret = mfa.decrypt(user.totp_secret_enc) if user.totp_secret_enc else None
    if secret is None:
        raise ApiError(409, "mfa_not_started", "Start setup again to get a new QR code.")
    step = mfa.match_step(secret, body.code, None)
    if step is None:
        raise ApiError(422, "invalid_code", "That code didn't match. Try the newest code.")
    user.totp_enabled_at = datetime.now(UTC)
    user.totp_last_step = step
    codes = _issue_recovery_codes(db, user)
    # Turning MFA on ends every other session, so a stolen session can't outlive it.
    _revoke_other_sessions(db, principal)
    db.commit()
    return RecoveryCodesOut(recovery_codes=codes)


@router.post("/mfa/disable", status_code=204)
def mfa_disable(
    body: MfaDisableIn,
    background: BackgroundTasks,
    principal: Principal = Depends(current_principal),
    db: Session = Depends(get_db),
) -> Response:
    user = principal.user
    _require_password(user, body.password)
    if not user.mfa_enabled:
        raise ApiError(409, "mfa_disabled", "Two-step verification is already off.")
    if not _check_second_factor(db, user, body.code, body.code):
        raise ApiError(422, "invalid_code", "That code didn't work.")
    user.totp_secret_enc = None
    user.totp_enabled_at = None
    user.totp_last_step = None
    db.execute(delete(RecoveryCode).where(RecoveryCode.user_id == user.id))
    db.commit()
    when = datetime.now(UTC).strftime("%b %d, %Y at %H:%M UTC")
    background.add_task(deliver, templates.mfa_disabled(user.email, user.name, when))
    return Response(status_code=204)


@router.post("/mfa/recovery-codes")
def regenerate_recovery_codes(
    body: MfaCodeIn,
    principal: Principal = Depends(current_principal),
    db: Session = Depends(get_db),
) -> RecoveryCodesOut:
    user = principal.user
    if not user.mfa_enabled or not _check_second_factor(db, user, body.code, None):
        raise ApiError(422, "invalid_code", "That code didn't work.")
    codes = _issue_recovery_codes(db, user)
    db.commit()
    return RecoveryCodesOut(recovery_codes=codes)


def _revoke_other_sessions(db: Session, principal: Principal) -> None:
    now = datetime.now(UTC)
    for row in db.scalars(
        select(AuthSession).where(
            AuthSession.user_id == principal.user.id,
            AuthSession.id != principal.session.id,
            AuthSession.revoked_at.is_(None),
        )
    ):
        row.revoked_at = now
