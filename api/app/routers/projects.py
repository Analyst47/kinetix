import hashlib
import shutil
import tempfile
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Query, Response, UploadFile
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import OrgContext, is_demo_account, load_project, require
from app.errors import ApiError
from app.models import Finding, Project, Scan, Target
from app.models.enums import TargetKind
from app.scanners.pipeline import ANALYZERS
from app.schemas import (
    ATTESTATION_TEXT,
    GitTargetIn,
    ProjectIn,
    ProjectOut,
    ProjectSummary,
    TargetOut,
)
from app.security.permissions import Permission, has_permission
from app.services import audit, exports, gitfetch, report, storage
from app.services.archives import ArchiveRejected, extract
from app.services.findings import OPEN
from app.services.scans import dispatch_fetch, source_dir

router = APIRouter(prefix="/orgs/{org_slug}/projects", tags=["projects"])


@router.get("")
def list_projects(
    ctx: OrgContext = Depends(require(Permission.PROJECT_READ)), db: Session = Depends(get_db)
) -> list[ProjectSummary]:
    projects = db.scalars(
        select(Project).where(Project.org_id == ctx.org.id).order_by(Project.name)
    ).all()
    counts = db.execute(
        select(Finding.project_id, Finding.severity, func.count())
        .where(Finding.org_id == ctx.org.id, Finding.status.in_(OPEN))
        .group_by(Finding.project_id, Finding.severity)
    ).all()
    out = []
    for p in projects:
        summary = ProjectSummary.model_validate(p)
        sev = {s.value: n for pid, s, n in counts if pid == p.id}
        summary.severity_counts = sev
        summary.open_findings = sum(sev.values())
        out.append(summary)
    return out


@router.post("", status_code=201)
def create_project(
    body: ProjectIn,
    ctx: OrgContext = Depends(require(Permission.PROJECT_CREATE)),
    db: Session = Depends(get_db),
) -> ProjectOut:
    if db.scalar(select(Project.id).where(Project.org_id == ctx.org.id, Project.slug == body.slug)):
        raise ApiError(409, "slug_taken", "A project with that URL name already exists.")
    if body.authorization_expires_at and body.authorization_expires_at <= datetime.now(UTC):
        raise ApiError(
            422, "authorization_expired", "The authorization expiry must be in the future."
        )
    project = Project(
        org_id=ctx.org.id,
        slug=body.slug,
        name=body.name,
        description=body.description,
        authorization_type=body.authorization_type,
        in_scope=body.in_scope,
        out_of_scope=body.out_of_scope,
        authorization_reference=body.authorization_reference,
        authorization_expires_at=body.authorization_expires_at,
        attestation_text=ATTESTATION_TEXT,
        attested_by_id=ctx.user.id,
        attested_at=datetime.now(UTC),
    )
    db.add(project)
    db.flush()
    audit.record(
        db,
        org_id=ctx.org.id,
        actor=ctx.user,
        action="project.created",
        subject_type="project",
        subject_id=project.slug,
        data={
            "authorization_type": body.authorization_type.value,
            "in_scope": body.in_scope,
            "out_of_scope": body.out_of_scope,
            "attestation": ATTESTATION_TEXT,
        },
    )
    db.commit()
    db.refresh(project)
    return ProjectOut.model_validate(project)


@router.get("/{project_slug}")
def get_project(
    project_slug: str,
    ctx: OrgContext = Depends(require(Permission.PROJECT_READ)),
    db: Session = Depends(get_db),
) -> ProjectOut:
    return ProjectOut.model_validate(load_project(db, ctx, project_slug))


@router.delete("/{project_slug}", status_code=204)
def delete_project(
    project_slug: str,
    confirm: str = Query(description="The project's URL name, typed to confirm."),
    ctx: OrgContext = Depends(require(Permission.PROJECT_DELETE)),
    db: Session = Depends(get_db),
) -> Response:
    """Delete a project and everything under it: targets, scans, findings (with their evidence
    records, AI runs and disclosures) and dependencies, plus the fetched source trees on disk.
    Content-addressed uploads (evidence files, source archives) may be shared and aren't
    unlinked here. The audit log keeps a permanent record of the deletion. Owners and admins
    only, and the caller must repeat the project's URL name."""
    if is_demo_account(ctx.user):
        raise ApiError(
            403,
            "demo_account",
            "The shared demo account can't delete projects. Create your own account.",
        )
    project = load_project(db, ctx, project_slug)
    if confirm != project.slug:
        raise ApiError(
            422, "confirm_mismatch", "Type the project's URL name exactly to confirm deletion."
        )
    counts = {
        "findings": db.scalar(
            select(func.count()).select_from(Finding).where(Finding.project_id == project.id)
        )
        or 0,
        "scans": db.scalar(
            select(func.count()).select_from(Scan).where(Scan.project_id == project.id)
        )
        or 0,
    }
    targets = list(db.scalars(select(Target).where(Target.project_id == project.id)))
    sources = [source_dir(t) for t in targets]
    # A finding elsewhere in the workspace may be marked a duplicate of one being deleted.
    doomed = select(Finding.id).where(Finding.project_id == project.id)
    db.execute(
        update(Finding)
        .where(Finding.org_id == ctx.org.id, Finding.duplicate_of_id.in_(doomed))
        .values(duplicate_of_id=None)
    )
    audit.record(
        db,
        org_id=ctx.org.id,
        actor=ctx.user,
        action="project.deleted",
        subject_type="project",
        subject_id=project.slug,
        data={"name": project.name, "targets": len(targets), **counts},
    )
    # Children go with it through ON DELETE CASCADE in the schema.
    db.execute(delete(Project).where(Project.id == project.id, Project.org_id == ctx.org.id))
    db.commit()
    # Fetched source trees are disposable working copies; free the disk they used.
    for path in sources:
        shutil.rmtree(path, ignore_errors=True)
    return Response(status_code=204)


def ensure_authorized(project: Project) -> None:
    exp = project.authorization_expires_at
    if exp is not None and exp <= datetime.now(UTC):
        raise ApiError(
            403,
            "authorization_expired",
            "This project's authorization has expired. Renew it before adding targets or scanning.",
        )


@router.get("/{project_slug}/targets")
def list_targets(
    project_slug: str,
    ctx: OrgContext = Depends(require(Permission.PROJECT_READ)),
    db: Session = Depends(get_db),
) -> list[TargetOut]:
    project = load_project(db, ctx, project_slug)
    rows = db.scalars(
        select(Target).where(Target.project_id == project.id).order_by(Target.created_at.desc())
    ).all()
    return [TargetOut.model_validate(t) for t in rows]


@router.post("/{project_slug}/targets/archive", status_code=201)
def upload_archive_target(
    project_slug: str,
    name: str = Form(min_length=1, max_length=200),
    version: str | None = Form(default=None, max_length=100),
    commit: str | None = Form(default=None, pattern=r"^[0-9a-f]{7,40}$"),
    file: UploadFile = File(...),
    ctx: OrgContext = Depends(require(Permission.TARGET_WRITE)),
    db: Session = Depends(get_db),
) -> TargetOut:
    """Upload a source archive. It is validated and unpacked before the target is created."""
    project = load_project(db, ctx, project_slug)
    ensure_authorized(project)
    s = get_settings()
    blob = storage.put("archives", file.file, s.archive_max_bytes)
    target = Target(
        org_id=ctx.org.id,
        project_id=project.id,
        kind=TargetKind.ARCHIVE,
        name=name,
        locator=storage.safe_filename(file.filename, "source.zip"),
        version=version,
        commit=commit,
        archive_sha256=blob.sha256,
    )
    db.add(target)
    db.flush()
    staging = Path(tempfile.mkdtemp(prefix="kx-extract-", dir=s.storage_dir))
    try:
        report = extract(storage.blob_path("archives", blob.sha256), staging)
        dest = source_dir(target)
        dest.parent.mkdir(parents=True, exist_ok=True)
        staging.rename(dest)
    except ArchiveRejected as exc:
        shutil.rmtree(staging, ignore_errors=True)
        db.rollback()
        raise ApiError(
            422,
            "archive_rejected",
            f"Upload rejected: {exc.reason}"
            + (f" ({exc.member})" if exc.member else "")
            + ". Fix the archive and upload again.",
        ) from exc
    audit.record(
        db,
        org_id=ctx.org.id,
        actor=ctx.user,
        action="target.added",
        subject_type="target",
        subject_id=str(target.id),
        data={
            "name": name,
            "kind": "archive",
            "sha256": blob.sha256,
            "files": report.files,
            "bytes": report.unpacked_bytes,
        },
    )
    db.commit()
    return TargetOut.model_validate(target)


@router.post("/{project_slug}/targets/git", status_code=202)
def add_repository_target(
    project_slug: str,
    body: GitTargetIn,
    background: BackgroundTasks,
    ctx: OrgContext = Depends(require(Permission.TARGET_WRITE)),
    db: Session = Depends(get_db),
) -> TargetOut:
    """Add a public Git repository. The worker fetches one commit, then (optionally) scans it."""
    project = load_project(db, ctx, project_slug)
    ensure_authorized(project)
    try:
        repo = gitfetch.parse_repo_url(body.url)
        ref = gitfetch.validate_ref(body.ref)
    except gitfetch.FetchRejected as exc:
        raise ApiError(422, "invalid_repository", str(exc)) from exc
    default_name = repo.path.rsplit("/", 1)[-1].removesuffix(".git") or repo.host
    target = Target(
        org_id=ctx.org.id,
        project_id=project.id,
        kind=TargetKind.REPOSITORY,
        name=(body.name or "").strip() or default_name,
        locator=repo.url,
        version=ref,
        fetch_status="pending",
    )
    db.add(target)
    db.flush()
    scan_after = body.scan and has_permission(ctx.role, Permission.SCAN_START)
    audit.record(
        db,
        org_id=ctx.org.id,
        actor=ctx.user,
        action="target.added",
        subject_type="target",
        subject_id=str(target.id),
        data={"name": target.name, "kind": "repository", "url": repo.url, "ref": ref},
    )
    db.commit()
    db.refresh(target)
    dispatch_fetch(background, target, ctx.user.id if scan_after else None, list(ANALYZERS))
    return TargetOut.model_validate(target)


@router.post("/{project_slug}/export/dataset")
def export_dataset(
    project_slug: str,
    ctx: OrgContext = Depends(require(Permission.PROJECT_READ)),
    db: Session = Depends(get_db),
) -> Response:
    """Every finding in the project as JSONL: the scanner's features plus the researcher's
    verdict (the training label). Feeds a model such as Aegis. Each export is audited."""
    project = load_project(db, ctx, project_slug)
    findings = db.scalars(
        select(Finding).where(Finding.project_id == project.id).order_by(Finding.created_at)
    ).all()
    records = []
    for finding in findings:
        excerpt = report._source_excerpt(db, project, finding, context=3)
        records.append(exports.dataset_record(finding, excerpt["lines"] if excerpt else None))
    content = exports.dataset_to_jsonl(records).encode()
    sha = hashlib.sha256(content).hexdigest()
    audit.record(
        db,
        org_id=ctx.org.id,
        actor=ctx.user,
        action="dataset.exported",
        subject_type="project",
        subject_id=project.slug,
        data={"findings": len(records), "sha256": sha},
    )
    db.commit()
    return Response(
        content,
        media_type="application/x-ndjson",
        headers={
            "Content-Disposition": f'attachment; filename="{project.slug}-findings.jsonl"',
            "X-Dataset-SHA256": sha,
            "X-Dataset-Count": str(len(records)),
        },
    )
