from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import OrgContext, load_project, require
from app.models import Dependency, Finding
from app.models.enums import SEVERITY_RANK, Severity
from app.schemas import AdvisoryOut, DependencyOut, DependencyPage
from app.security.permissions import Permission
from app.services.versions import highest_fix

router = APIRouter(
    prefix="/orgs/{org_slug}/projects/{project_slug}/dependencies", tags=["dependencies"]
)


def to_out(dep: Dependency, finding_ids: dict) -> DependencyOut:
    advisories = [
        AdvisoryOut(
            id=link.advisory.id,
            display_id=link.advisory.display_id,
            aliases=link.advisory.aliases,
            summary=link.advisory.summary,
            severity=link.advisory.severity,
            cwe_ids=link.advisory.cwe_ids,
            affected_range=link.affected_range,
            fixed_version=link.fixed_version,
        )
        for link in dep.advisories
    ]
    advisories.sort(key=lambda a: SEVERITY_RANK.get(a.severity, 9) if a.severity else 9)
    severities = [a.severity for a in advisories if a.severity]
    max_sev: Severity | None = (
        min(severities, key=lambda s: SEVERITY_RANK[s]) if severities else None
    )
    return DependencyOut(
        id=dep.id,
        ecosystem=dep.ecosystem,
        name=dep.name,
        version=dep.version,
        direct=dep.direct,
        license=dep.license,
        manifest=dep.manifest,
        max_severity=max_sev,
        fixed_version=highest_fix([a.fixed_version for a in advisories]),
        finding_public_id=finding_ids.get(dep.finding_id),
        advisories=advisories,
    )


@router.get("")
def list_dependencies(
    project_slug: str,
    vulnerable_only: bool = False,
    q: str | None = Query(default=None, max_length=200),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    ctx: OrgContext = Depends(require(Permission.PROJECT_READ)),
    db: Session = Depends(get_db),
) -> DependencyPage:
    project = load_project(db, ctx, project_slug)
    deps = db.scalars(select(Dependency).where(Dependency.project_id == project.id)).all()
    finding_ids = {
        f.id: f.public_id
        for f in db.scalars(
            select(Finding).where(Finding.id.in_([d.finding_id for d in deps if d.finding_id]))
        )
    }
    items = [to_out(d, finding_ids) for d in deps]
    vulnerable = sum(1 for i in items if i.advisories)
    if vulnerable_only:
        items = [i for i in items if i.advisories]
    if q:
        items = [i for i in items if q.lower() in i.name.lower()]
    items.sort(
        key=lambda i: (
            SEVERITY_RANK[i.max_severity] if i.max_severity else 9,
            not i.direct,
            i.name,
        )
    )
    return DependencyPage(
        items=items[offset : offset + limit], total=len(items), vulnerable=vulnerable
    )
