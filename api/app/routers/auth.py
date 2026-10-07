import re
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import Principal, current_principal, parse_uuid
from app.errors import ApiError, not_found
from app.models import AuthSession, Membership, Organization, User
from app.models.enums import Role
from app.schemas import LoginIn, MembershipOut, MeOut, RegisterIn, SessionOut, UserOut
from app.security.passwords import hash_password, needs_rehash, verify_password
from app.security.ratelimit import login_limiter, register_limiter
from app.security.tokens import new_token, token_digest

router = APIRouter(prefix="/auth", tags=["auth"])


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


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
    while db.scalar(select(Organization.id).where(Organization.slug == slug)):
        n += 1
        slug = f"{base}-{n}"
    org = Organization(slug=slug, name=body.organization_name)
    db.add_all([user, org])
    db.flush()
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
) -> MeOut:
    email = body.email.lower()
    login_limiter.hit(f"{_client_ip(request)}|{email}")
    user = db.scalar(select(User).where(func.lower(User.email) == email))
    ok = verify_password(user.password_hash if user else None, body.password)
    if not ok or user is None or not user.is_active:
        raise ApiError(401, "invalid_credentials", "Email or password is incorrect.")
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(body.password)
    _start_session(db, user, request, response)
    db.commit()
    return _me(db, user)


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
