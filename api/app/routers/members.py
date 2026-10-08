"""Organization members and invitations.

Invitation links carry a 256-bit token; only its SHA-256 is stored. An invitation can only
be accepted by a signed-in user whose email matches it, so a forwarded link is useless.
"""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db, set_tenant
from app.deps import OrgContext, current_user, parse_uuid, require
from app.email import deliver, templates
from app.email import is_configured as email_configured
from app.errors import ApiError, forbidden, not_found
from app.models import Invitation, Membership, User
from app.models.enums import Role
from app.schemas import (
    InvitationIn,
    InvitationOut,
    InvitationPreview,
    MemberOut,
    MemberRoleIn,
    MembershipOut,
    UserOut,
)
from app.security.permissions import Permission
from app.security.tokens import new_token, token_digest
from app.services import audit

router = APIRouter(tags=["members"])

INVITE_TTL = timedelta(days=7)


def _owner_count(db: Session, org_id) -> int:
    return (
        db.scalar(
            select(func.count()).where(Membership.org_id == org_id, Membership.role == Role.OWNER)
        )
        or 0
    )


def _guard_owner_change(ctx: OrgContext, current: Role, new: Role | None) -> None:
    # Only owners can grant, change or remove the owner role.
    if (current == Role.OWNER or new == Role.OWNER) and ctx.role != Role.OWNER:
        raise forbidden("Only an owner can change owner access.")


@router.get("/orgs/{org_slug}/members")
def list_members(
    ctx: OrgContext = Depends(require(Permission.PROJECT_READ)), db: Session = Depends(get_db)
) -> list[MemberOut]:
    rows = db.execute(
        select(Membership, User)
        .join(User, User.id == Membership.user_id)
        .where(Membership.org_id == ctx.org.id)
        .order_by(User.name)
    ).all()
    return [
        MemberOut(
            user=UserOut.model_validate(u),
            role=m.role,
            joined_at=m.created_at,
            mfa_enabled=u.mfa_enabled,
            you=u.id == ctx.user.id,
        )
        for m, u in rows
    ]


def _membership(db: Session, ctx: OrgContext, user_id: str) -> Membership:
    m = db.scalar(
        select(Membership).where(
            Membership.org_id == ctx.org.id, Membership.user_id == parse_uuid(user_id, "Member")
        )
    )
    if m is None:
        raise not_found("Member")
    return m


@router.patch("/orgs/{org_slug}/members/{user_id}")
def change_role(
    user_id: str,
    body: MemberRoleIn,
    ctx: OrgContext = Depends(require(Permission.MEMBERS_MANAGE)),
    db: Session = Depends(get_db),
) -> MemberOut:
    m = _membership(db, ctx, user_id)
    _guard_owner_change(ctx, m.role, body.role)
    if m.role == Role.OWNER and body.role != Role.OWNER and _owner_count(db, ctx.org.id) == 1:
        raise ApiError(409, "last_owner", "Make someone else an owner before changing this role.")
    previous = m.role
    m.role = body.role
    user = db.get(User, m.user_id)
    assert user is not None
    audit.record(
        db, org_id=ctx.org.id, actor=ctx.user, action="member.role_changed", subject_type="user",
        subject_id=user.email, data={"from": previous.value, "to": body.role.value},
    )  # fmt: skip
    db.commit()
    return MemberOut(
        user=UserOut.model_validate(user),
        role=m.role,
        joined_at=m.created_at,
        mfa_enabled=user.mfa_enabled,
        you=user.id == ctx.user.id,
    )


@router.delete("/orgs/{org_slug}/members/{user_id}", status_code=204)
def remove_member(
    user_id: str,
    ctx: OrgContext = Depends(require(Permission.PROJECT_READ)),
    db: Session = Depends(get_db),
) -> Response:
    m = _membership(db, ctx, user_id)
    leaving = m.user_id == ctx.user.id
    if not leaving:
        ctx.require(Permission.MEMBERS_MANAGE)
        _guard_owner_change(ctx, m.role, None)
    if m.role == Role.OWNER and _owner_count(db, ctx.org.id) == 1:
        raise ApiError(409, "last_owner", "A workspace needs at least one owner.")
    user = db.get(User, m.user_id)
    assert user is not None
    db.delete(m)
    action = "member.left" if leaving else "member.removed"
    audit.record(
        db, org_id=ctx.org.id, actor=ctx.user, action=action,
        subject_type="user", subject_id=user.email, data={"role": m.role.value},
    )  # fmt: skip
    db.commit()
    return Response(status_code=204)


def _invitation_out(inv: Invitation, link: str | None = None) -> InvitationOut:
    return InvitationOut(
        id=inv.id,
        email=inv.email,
        role=inv.role,
        invited_by=inv.invited_by.name,
        created_at=inv.created_at,
        expires_at=inv.expires_at,
        link=link,
    )


@router.get("/orgs/{org_slug}/invitations")
def list_invitations(
    ctx: OrgContext = Depends(require(Permission.MEMBERS_MANAGE)), db: Session = Depends(get_db)
) -> list[InvitationOut]:
    rows = db.scalars(
        select(Invitation)
        .where(
            Invitation.org_id == ctx.org.id,
            Invitation.accepted_at.is_(None),
            Invitation.revoked_at.is_(None),
            Invitation.expires_at > datetime.now(UTC),
        )
        .order_by(Invitation.created_at.desc())
    ).all()
    return [_invitation_out(i) for i in rows]


@router.post("/orgs/{org_slug}/invitations", status_code=201)
def invite(
    body: InvitationIn,
    background: BackgroundTasks,
    ctx: OrgContext = Depends(require(Permission.MEMBERS_MANAGE)),
    db: Session = Depends(get_db),
) -> InvitationOut:
    _guard_owner_change(ctx, Role.VIEWER, body.role)
    email = body.email.lower()
    already = db.scalar(
        select(Membership.id)
        .join(User, User.id == Membership.user_id)
        .where(Membership.org_id == ctx.org.id, func.lower(User.email) == email)
    )
    if already:
        raise ApiError(409, "already_member", "That person is already a member.")
    now = datetime.now(UTC)
    for old in db.scalars(
        select(Invitation).where(
            Invitation.org_id == ctx.org.id,
            Invitation.email == email,
            Invitation.accepted_at.is_(None),
            Invitation.revoked_at.is_(None),
        )
    ):
        old.revoked_at = now
    token = new_token()
    inv = Invitation(
        org_id=ctx.org.id,
        email=email,
        role=body.role,
        token_hash=token_digest(token),
        invited_by_id=ctx.user.id,
        expires_at=now + INVITE_TTL,
    )
    db.add(inv)
    db.flush()
    audit.record(
        db, org_id=ctx.org.id, actor=ctx.user, action="member.invited", subject_type="user",
        subject_id=email, data={"role": body.role.value},
    )  # fmt: skip
    db.commit()
    db.refresh(inv)
    link = f"{get_settings().app_url}/invite/{token}"
    background.add_task(
        deliver,
        templates.invitation(
            email, ctx.user.name, ctx.org.name, body.role.value, link, key=f"invite-{inv.id}"
        ),
    )
    # The link is also shown once, to the person who created it, in case email is off.
    out = _invitation_out(inv, link=link)
    out.emailed = email_configured()
    return out


@router.delete("/orgs/{org_slug}/invitations/{invitation_id}", status_code=204)
def revoke_invitation(
    invitation_id: str,
    ctx: OrgContext = Depends(require(Permission.MEMBERS_MANAGE)),
    db: Session = Depends(get_db),
) -> Response:
    inv = db.scalar(
        select(Invitation).where(
            Invitation.id == parse_uuid(invitation_id, "Invitation"),
            Invitation.org_id == ctx.org.id,
        )
    )
    if inv is None or inv.accepted_at is not None:
        raise not_found("Invitation")
    inv.revoked_at = datetime.now(UTC)
    audit.record(
        db, org_id=ctx.org.id, actor=ctx.user, action="member.invite_revoked",
        subject_type="user", subject_id=inv.email, data={},
    )  # fmt: skip
    db.commit()
    return Response(status_code=204)


def _open_invitation(db: Session, token: str) -> Invitation:
    inv = db.scalar(select(Invitation).where(Invitation.token_hash == token_digest(token)))
    if (
        inv is None
        or inv.revoked_at is not None
        or inv.accepted_at is not None
        or inv.expires_at <= datetime.now(UTC)
    ):
        raise ApiError(
            404, "invitation_invalid", "This invitation is no longer valid. Ask for a new one."
        )
    return inv


@router.get("/invitations/{token}")
def preview_invitation(token: str, db: Session = Depends(get_db)) -> InvitationPreview:
    inv = _open_invitation(db, token)
    return InvitationPreview(
        organization=inv.organization.name,
        role=inv.role,
        invited_by=inv.invited_by.name,
        email=inv.email,
        expires_at=inv.expires_at,
    )


@router.post("/invitations/{token}/accept")
def accept_invitation(
    token: str, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> MembershipOut:
    inv = _open_invitation(db, token)
    if user.email.lower() != inv.email:
        raise ApiError(
            403,
            "wrong_account",
            f"This invitation is for {inv.email}. Sign in with that account to accept it.",
        )
    exists = db.scalar(
        select(Membership.id).where(Membership.org_id == inv.org_id, Membership.user_id == user.id)
    )
    if exists:
        raise ApiError(409, "already_member", "You're already a member of this workspace.")
    inv.accepted_at = datetime.now(UTC)
    db.add(Membership(org_id=inv.org_id, user_id=user.id, role=inv.role))
    set_tenant(db, inv.org_id)
    audit.record(
        db, org_id=inv.org_id, actor=user, action="member.joined", subject_type="user",
        subject_id=user.email, data={"role": inv.role.value},
    )  # fmt: skip
    db.commit()
    return MembershipOut(slug=inv.organization.slug, name=inv.organization.name, role=inv.role)
