"""Creating scans and repository fetches, and handing them to the worker (or running inline)."""

import logging
import uuid
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import SessionLocal, set_tenant
from app.models import Project, Scan, Target, User
from app.models.enums import ScanStatus
from app.services import audit, gitfetch

log = logging.getLogger("kinetix.scans")


def source_dir(target: Target) -> Path:
    return get_settings().storage_dir / "sources" / str(target.id)


def create_scan(
    db: Session, project: Project, target: Target, user: User, analyzers: list[str]
) -> Scan:
    number = (
        db.scalar(select(func.max(Scan.number)).where(Scan.org_id == project.org_id)) or 0
    ) + 1
    scan = Scan(
        org_id=project.org_id,
        project_id=project.id,
        target_id=target.id,
        number=number,
        status=ScanStatus.QUEUED,
        analyzers=analyzers,
        stats={},
        created_by_id=user.id,
    )
    db.add(scan)
    db.flush()
    audit.record(
        db,
        org_id=project.org_id,
        actor=user,
        action="scan.started",
        subject_type="scan",
        subject_id=f"SCN-{number:04d}",
        data={"target": target.name, "analyzers": analyzers},
    )
    return scan


def run_fetch(
    db: Session,
    target_id: uuid.UUID,
    org_id: uuid.UUID,
    scan_by: uuid.UUID | None = None,
    analyzers: list[str] | None = None,
) -> Target:
    """Fetch a repository target. On success, optionally start and run a scan of it."""
    set_tenant(db, org_id)
    target = db.get(Target, target_id)
    if target is None:
        raise LookupError("target not found")
    try:
        fetched = gitfetch.fetch_into(target.locator, target.version, source_dir(target))
    except (gitfetch.FetchRejected, gitfetch.FetchFailed) as exc:
        target.fetch_status, target.fetch_error = "failed", str(exc)[:300]
    except Exception:
        log.exception("repository fetch failed")
        target.fetch_status, target.fetch_error = "failed", "Unexpected error while fetching."
    else:
        target.fetch_status, target.fetch_error = "ready", None
        target.commit = fetched.commit
        target.fetched_at = datetime.now(UTC)
    audit.record(
        db,
        org_id=org_id,
        actor=None,
        actor_label="Repository fetch",
        action="target.fetched" if target.fetch_status == "ready" else "target.fetch_failed",
        subject_type="target",
        subject_id=str(target.id),
        data={
            "url": target.locator,
            "ref": target.version,
            "commit": target.commit,
            "files": fetched.report.files if target.fetch_status == "ready" else None,
            "error": target.fetch_error,
        },
    )
    db.commit()
    if target.fetch_status == "ready" and scan_by and analyzers:
        from app.scanners.pipeline import run_scan

        user = db.get(User, scan_by)
        project = db.get(Project, target.project_id)
        if user is not None and project is not None:
            scan = create_scan(db, project, target, user, analyzers)
            db.commit()
            run_scan(db, scan.id, org_id)
    return target


# ── Dispatch ──────────────────────────────────────────────────────────────────


def _inline_scan(scan_id: uuid.UUID, org_id: uuid.UUID) -> None:
    from app.scanners.pipeline import run_scan

    with SessionLocal() as db:
        run_scan(db, scan_id, org_id)


def _inline_fetch(
    target_id: uuid.UUID, org_id: uuid.UUID, scan_by: uuid.UUID | None, analyzers: list[str]
) -> None:
    with SessionLocal() as db:
        run_fetch(db, target_id, org_id, scan_by, analyzers)


def dispatch_scan(background, scan: Scan) -> None:
    if get_settings().scan_mode == "celery":
        from app.worker import run_scan_task

        run_scan_task.delay(str(scan.id), str(scan.org_id))
    else:
        background.add_task(_inline_scan, scan.id, scan.org_id)


def dispatch_fetch(
    background, target: Target, scan_by: uuid.UUID | None, analyzers: list[str]
) -> None:
    if get_settings().scan_mode == "celery":
        from app.worker import fetch_target_task

        fetch_target_task.delay(
            str(target.id), str(target.org_id), str(scan_by) if scan_by else None, analyzers
        )
    else:
        background.add_task(_inline_fetch, target.id, target.org_id, scan_by, analyzers)
