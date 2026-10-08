import uuid

from celery import Celery

from app.config import get_settings

celery_app = Celery("kinetix", broker=get_settings().redis_url, backend=get_settings().redis_url)
celery_app.conf.update(
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_time_limit=30 * 60,
    task_soft_time_limit=25 * 60,
    task_serializer="json",
    accept_content=["json"],
)


@celery_app.task(name="kinetix.run_scan")
def run_scan_task(scan_id: str, org_id: str) -> str:
    from app.db import SessionLocal
    from app.scanners.pipeline import run_scan

    with SessionLocal() as db:
        scan = run_scan(db, uuid.UUID(scan_id), uuid.UUID(org_id))
        return scan.status.value


@celery_app.task(name="kinetix.fetch_target")
def fetch_target_task(
    target_id: str, org_id: str, scan_by: str | None, analyzers: list[str]
) -> str:
    from app.db import SessionLocal
    from app.services.scans import run_fetch

    with SessionLocal() as db:
        target = run_fetch(
            db,
            uuid.UUID(target_id),
            uuid.UUID(org_id),
            uuid.UUID(scan_by) if scan_by else None,
            analyzers,
        )
        return target.fetch_status
