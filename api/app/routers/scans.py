from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import SessionLocal, get_db
from app.deps import OrgContext, load_project, parse_uuid, require
from app.errors import ApiError, not_found
from app.models import Scan, Target
from app.models.enums import ScanStatus
from app.routers.projects import ensure_authorized
from app.scanners.pipeline import ANALYZERS, run_scan
from app.schemas import ScanOut
from app.security.permissions import Permission
from app.services import audit

router = APIRouter(prefix="/orgs/{org_slug}/projects/{project_slug}/scans", tags=["scans"])


class ScanIn(BaseModel):
    target_id: str
    analyzers: list[str] = Field(default_factory=lambda: list(ANALYZERS))


def _run_inline(scan_id, org_id) -> None:
    with SessionLocal() as db:
        run_scan(db, scan_id, org_id)


@router.get("")
def list_scans(
    project_slug: str,
    ctx: OrgContext = Depends(require(Permission.PROJECT_READ)),
    db: Session = Depends(get_db),
) -> list[ScanOut]:
    project = load_project(db, ctx, project_slug)
    rows = db.scalars(
        select(Scan).where(Scan.project_id == project.id).order_by(Scan.number.desc())
    ).all()
    return [ScanOut.model_validate(s) for s in rows]


@router.post("", status_code=202)
def start_scan(
    project_slug: str,
    body: ScanIn,
    background: BackgroundTasks,
    ctx: OrgContext = Depends(require(Permission.SCAN_START)),
    db: Session = Depends(get_db),
) -> ScanOut:
    project = load_project(db, ctx, project_slug)
    ensure_authorized(project)
    unknown = set(body.analyzers) - set(ANALYZERS)
    if unknown or not body.analyzers:
        raise ApiError(422, "invalid_analyzers", f"Choose analyzers from: {', '.join(ANALYZERS)}.")
    target = db.scalar(
        select(Target).where(
            Target.id == parse_uuid(body.target_id, "Target"), Target.project_id == project.id
        )
    )
    if target is None:
        raise not_found("Target")
    number = (db.scalar(select(func.max(Scan.number)).where(Scan.org_id == ctx.org.id)) or 0) + 1
    scan = Scan(
        org_id=ctx.org.id,
        project_id=project.id,
        target_id=target.id,
        number=number,
        status=ScanStatus.QUEUED,
        analyzers=[a for a in ANALYZERS if a in body.analyzers],
        stats={},
        created_by_id=ctx.user.id,
    )
    db.add(scan)
    db.flush()
    audit.record(
        db,
        org_id=ctx.org.id,
        actor=ctx.user,
        action="scan.started",
        subject_type="scan",
        subject_id=f"SCN-{number:04d}",
        data={"target": target.name, "analyzers": scan.analyzers},
    )
    db.commit()
    if get_settings().scan_mode == "celery":
        from app.worker import run_scan_task

        run_scan_task.delay(str(scan.id), str(ctx.org.id))
    else:
        background.add_task(_run_inline, scan.id, ctx.org.id)
    return ScanOut.model_validate(scan)


@router.get("/{scan_number}")
def get_scan(
    project_slug: str,
    scan_number: int,
    ctx: OrgContext = Depends(require(Permission.PROJECT_READ)),
    db: Session = Depends(get_db),
) -> ScanOut:
    project = load_project(db, ctx, project_slug)
    scan = db.scalar(select(Scan).where(Scan.project_id == project.id, Scan.number == scan_number))
    if scan is None:
        raise not_found("Scan")
    return ScanOut.model_validate(scan)
