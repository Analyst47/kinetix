from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import OrgContext, require
from app.models import AuditEvent
from app.schemas import AuditEventOut, ChainOut
from app.security.permissions import Permission
from app.services import audit

router = APIRouter(prefix="/orgs/{org_slug}/audit", tags=["audit"])


@router.get("")
def list_events(
    before_seq: int | None = Query(default=None, ge=1),
    limit: int = Query(default=100, ge=1, le=500),
    ctx: OrgContext = Depends(require(Permission.AUDIT_READ)),
    db: Session = Depends(get_db),
) -> list[AuditEventOut]:
    stmt = select(AuditEvent).where(AuditEvent.org_id == ctx.org.id)
    if before_seq:
        stmt = stmt.where(AuditEvent.seq < before_seq)
    rows = db.scalars(stmt.order_by(AuditEvent.seq.desc()).limit(limit)).all()
    return [AuditEventOut.model_validate(r) for r in rows]


@router.get("/verify")
def verify(
    ctx: OrgContext = Depends(require(Permission.AUDIT_READ)), db: Session = Depends(get_db)
) -> ChainOut:
    return ChainOut(**audit.verify_chain(db, ctx.org.id).__dict__)
