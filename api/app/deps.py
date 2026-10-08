"""Request dependencies: authentication, tenant context and permission checks."""

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db, set_tenant
from app.errors import ApiError, forbidden, not_found
from app.models import AuthSession, Membership, Organization, Project, User
from app.models.enums import Role
from app.security.permissions import Permission, has_permission
from app.security.tokens import token_digest

_TOUCH_INTERVAL = timedelta(minutes=5)


@dataclass
class Principal:
    user: User
    session: AuthSession


def current_principal(request: Request, db: Session = Depends(get_db)) -> Principal:
    token = request.cookies.get(get_settings().session_cookie)
    if not token:
        raise ApiError(401, "unauthenticated", "Sign in to continue.")
    session = db.scalar(select(AuthSession).where(AuthSession.token_hash == token_digest(token)))
    now = datetime.now(UTC)
    if (
        session is None
        or session.revoked_at is not None
        or session.expires_at <= now
        or not session.user.is_active
    ):
        raise ApiError(401, "unauthenticated", "Your session has ended. Sign in again.")
    if now - session.last_seen_at > _TOUCH_INTERVAL:
        session.last_seen_at = now
        db.commit()
    return Principal(user=session.user, session=session)


def current_user(principal: Principal = Depends(current_principal)) -> User:
    return principal.user


@dataclass
class OrgContext:
    org: Organization
    role: Role
    user: User

    def require(self, permission: Permission) -> None:
        if not has_permission(self.role, permission):
            raise forbidden()


def org_context(
    org_slug: str, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> OrgContext:
    row = db.execute(
        select(Organization, Membership.role)
        .join(Membership, Membership.org_id == Organization.id)
        .where(Organization.slug == org_slug, Membership.user_id == user.id)
    ).first()
    if row is None:
        # Not a member and nonexistent look identical.
        raise not_found("Organization")
    org, role = row
    set_tenant(db, org.id)
    return OrgContext(org=org, role=role, user=user)


def require(permission: Permission) -> Callable[[OrgContext], OrgContext]:
    def checker(ctx: OrgContext = Depends(org_context)) -> OrgContext:
        ctx.require(permission)
        return ctx

    return checker


def load_project(db: Session, ctx: OrgContext, project_slug: str) -> Project:
    project = db.scalar(
        select(Project).where(Project.org_id == ctx.org.id, Project.slug == project_slug)
    )
    if project is None:
        raise not_found("Project")
    return project


def parse_uuid(value: str, what: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise not_found(what) from exc


def is_demo_account(user: User) -> bool:
    demo = get_settings().demo_account_email
    return bool(demo) and user.email.lower() == demo.lower()


def forbid_demo_account(user: User) -> None:
    if is_demo_account(user):
        raise ApiError(
            403,
            "demo_account",
            "The shared demo account can't change its sign-in settings. Create your own account.",
        )
