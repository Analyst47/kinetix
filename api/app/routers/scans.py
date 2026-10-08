from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import OrgContext, load_project, parse_uuid, require
from app.errors import ApiError, not_found
from app.models import Scan, Target
from app.routers.projects import ensure_authorized
from app.scanners.pipeline import ANALYZERS
from app.schemas import ScanOut
from app.security.permissions import Permission
from app.services.scans import create_scan, dispatch_scan

router = APIRouter(prefix="/orgs/{org_slug}/projects/{project_slug}/scans", tags=["scans"])


class ScanIn(BaseModel):
    target_id: str
    analyzers: list[str] = Field(default_factory=lambda: list(ANALYZERS))


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
    if target.fetch_status != "ready":
        raise ApiError(
            409,
            "target_not_ready",
            "This repository hasn't been fetched yet."
            if target.fetch_status == "pending"
            else "This repository couldn't be fetched. Add it again to retry.",
        )
    scan = create_scan(db, project, target, ctx.user, [a for a in ANALYZERS if a in body.analyzers])
    db.commit()
    dispatch_scan(background, scan)
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
