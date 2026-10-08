"""Scan pipeline: dependencies → OSV correlation → secrets → SAST → normalized findings.

Each analyzer is isolated: one failing analyzer is recorded in the scan's stats and the
rest still run. Findings are de-duplicated by fingerprint, so re-scanning the same code
never creates the same finding twice.
"""

import logging
import uuid
from datetime import UTC, datetime
from pathlib import Path

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import set_tenant
from app.models import Advisory, Dependency, DependencyAdvisory, Finding, Project, Scan, Target
from app.models.enums import SEVERITY_RANK, Confidence, FindingSource, ScanStatus, Severity
from app.scanners import lockfiles, secrets, semgrep
from app.scanners.osv import NormalizedAdvisory, OsvClient
from app.services import audit
from app.services import findings as fsvc
from app.services.versions import highest_fix

log = logging.getLogger(__name__)

ANALYZERS = ("dependencies", "secrets", "sast")


def _exists(db: Session, project: Project, fp: str) -> bool:
    return (
        db.scalar(
            select(Finding.id).where(Finding.project_id == project.id, Finding.fingerprint == fp)
        )
        is not None
    )


def _upsert_advisory(db: Session, adv: NormalizedAdvisory) -> Advisory:
    row = db.get(Advisory, adv.id)
    if row is None:
        row = Advisory(id=adv.id)
        db.add(row)
    row.aliases = adv.aliases
    row.summary = adv.summary
    row.details = adv.details
    row.severity = adv.severity
    row.cvss_vector = adv.cvss_vector
    row.cwe_ids = adv.cwe_ids
    row.references = adv.references
    row.published_at = adv.published_at
    row.modified_at = adv.modified_at
    row.fetched_at = datetime.now(UTC)
    return row


class AnalyzerError(Exception):
    """An analyzer couldn't run. The message is written for the researcher."""


def analyze_dependencies(
    db: Session, scan: Scan, project: Project, root: Path, osv: OsvClient
) -> dict:
    packages = lockfiles.discover(root)
    cache: dict[str, NormalizedAdvisory] = {}
    try:
        hits = osv.match(packages) if packages else {}
        for ids in hits.values():
            for adv_id in ids:
                if adv_id not in cache:
                    cache[adv_id] = osv.fetch(adv_id)
                    _upsert_advisory(db, cache[adv_id])
    except httpx.HTTPError as exc:
        raise AnalyzerError(
            "couldn't reach the OSV vulnerability database (api.osv.dev). "
            "Check the worker's outbound network access, then scan again."
        ) from exc
    db.flush()

    created = 0
    for i, pkg in enumerate(packages):
        dep = db.scalar(
            select(Dependency).where(
                Dependency.project_id == project.id,
                Dependency.ecosystem == pkg.ecosystem,
                Dependency.name == pkg.name,
                Dependency.version == pkg.version,
                Dependency.manifest == pkg.manifest,
            )
        )
        if dep is None:
            dep = Dependency(
                org_id=project.org_id,
                project_id=project.id,
                ecosystem=pkg.ecosystem,
                name=pkg.name,
                version=pkg.version,
                direct=pkg.direct,
                license=pkg.license,
                manifest=pkg.manifest,
            )
            db.add(dep)
            db.flush()
        dep.scan_id = scan.id
        linked = {link.advisory_id for link in dep.advisories}
        advs = [cache[a] for a in hits.get(i, [])]
        for adv in advs:
            if adv.id in linked:
                continue
            rng, fixed = adv.ranges.get((pkg.ecosystem, pkg.name), ("", None))
            dep.advisories.append(
                DependencyAdvisory(
                    org_id=project.org_id,
                    advisory_id=adv.id,
                    affected_range=rng,
                    fixed_version=fixed,
                )
            )
        if not advs or dep.finding_id is not None:
            continue
        fp = fsvc.fingerprint(project.id, "dependency", pkg.ecosystem, pkg.name, pkg.version)
        if _exists(db, project, fp):
            continue
        advs.sort(key=lambda a: SEVERITY_RANK.get(a.severity, 9) if a.severity else 9)
        top = advs[0]
        top_id = next((a for a in top.aliases if a.startswith("CVE-")), top.id)
        fix = highest_fix(
            [adv.ranges.get((pkg.ecosystem, pkg.name), ("", None))[1] for adv in advs]
        )
        title = f"{pkg.name} {pkg.version}: {top.summary or 'known vulnerability'}"[:300]
        scope = "direct" if pkg.direct else "transitive"
        description = (
            f"{pkg.name}@{pkg.version} ({pkg.ecosystem}, {scope}) "
            f"matches {len(advs)} published advisor{'y' if len(advs) == 1 else 'ies'}: "
            + ", ".join(next((x for x in a.aliases if x.startswith("CVE-")), a.id) for a in advs)
            + (f". Fixed in {fix}." if fix else ". No fixed version is published.")
        )
        finding = fsvc.create_finding(
            db,
            project=project,
            actor=None,
            actor_label=f"Scan SCN-{scan.number:04d}",
            title=title,
            severity=top.severity or Severity.MEDIUM,
            source=FindingSource.DEPENDENCY,
            confidence=Confidence.FIRM,
            description=description,
            cwe=(top.cwe_ids[0] if top.cwe_ids else None),
            file_path=pkg.manifest,
            rule_id=f"{pkg.ecosystem}:{pkg.name}",
            reference=top_id,
            scan_id=scan.id,
        )
        finding.fingerprint = fp
        dep.finding_id = finding.id
        created += 1
    return {
        "packages": len(packages),
        "vulnerable": len(hits),
        "advisories": len(cache),
        "findings": created,
    }


def analyze_secrets(db: Session, scan: Scan, project: Project, root: Path) -> dict:
    created = 0
    matches = secrets.scan(root)
    for m in matches:
        fp = fsvc.fingerprint(project.id, "secret", m.rule.id, m.file_path, m.line)
        if _exists(db, project, fp):
            continue
        test_path = secrets.looks_like_test(m.file_path)
        finding = fsvc.create_finding(
            db,
            project=project,
            actor=None,
            actor_label=f"Scan SCN-{scan.number:04d}",
            title=f"{m.rule.title} in {'test fixture' if test_path else 'source'}",
            severity=Severity.INFO if test_path else m.rule.severity,
            source=FindingSource.SECRET,
            confidence=Confidence.TENTATIVE,
            description=f"Matched rule {m.rule.id} ({m.preview}). The value itself is not stored.",
            cwe=m.rule.cwe,
            file_path=m.file_path,
            line=m.line,
            rule_id=f"kinetix-secret-{m.rule.id}",
            scan_id=scan.id,
        )
        finding.fingerprint = fp
        created += 1
    return {"matches": len(matches), "findings": created}


def analyze_sast(db: Session, scan: Scan, project: Project, root: Path) -> dict:
    if not semgrep.available():
        return {"skipped": "semgrep is not installed"}
    created = 0
    matches = semgrep.run(root)
    for m in matches:
        fp = fsvc.fingerprint(project.id, "sast", m.rule_id, m.file_path, m.line)
        if _exists(db, project, fp):
            continue
        finding = fsvc.create_finding(
            db,
            project=project,
            actor=None,
            actor_label=f"Scan SCN-{scan.number:04d}",
            title=m.title,
            severity=m.severity,
            source=FindingSource.SAST,
            confidence=m.confidence,
            description=m.message,
            cwe=m.cwe,
            file_path=m.file_path,
            line=m.line,
            rule_id=m.rule_id,
            scan_id=scan.id,
        )
        finding.fingerprint = fp
        created += 1
    return {"matches": len(matches), "findings": created}


def run_scan(
    db: Session, scan_id: uuid.UUID, org_id: uuid.UUID, osv: OsvClient | None = None
) -> Scan:
    set_tenant(db, org_id)
    scan = db.get(Scan, scan_id)
    if scan is None:
        raise LookupError("scan not found")
    project = db.get(Project, scan.project_id)
    target = db.get(Target, scan.target_id)
    assert project is not None and target is not None
    root = get_settings().storage_dir / "sources" / str(target.id)

    scan.status = ScanStatus.RUNNING
    scan.started_at = datetime.now(UTC)
    db.commit()

    stats: dict = {}
    failures = []
    steps = {
        "dependencies": lambda: analyze_dependencies(db, scan, project, root, osv or OsvClient()),
        "secrets": lambda: analyze_secrets(db, scan, project, root),
        "sast": lambda: analyze_sast(db, scan, project, root),
    }
    for name in scan.analyzers:
        try:
            with db.begin_nested():
                stats[name] = steps[name]()
        except AnalyzerError as exc:
            log.warning("analyzer %s failed: %s", name, exc)
            stats[name] = {"error": str(exc)[:300]}
            failures.append(f"{name} ({exc})")
        except Exception as exc:  # one analyzer failing must not sink the scan
            log.exception("analyzer %s failed", name)
            stats[name] = {"error": str(exc)[:300]}
            failures.append(name)
    scan.stats = stats
    scan.finished_at = datetime.now(UTC)
    scan.status = (
        ScanStatus.FAILED
        if failures and len(failures) == len(scan.analyzers)
        else ScanStatus.SUCCEEDED
    )
    scan.error = (
        (
            f"Analyzer failed: {failures[0]}"
            if len(failures) == 1
            else f"Analyzers failed: {'; '.join(failures)}"
        )
        if failures
        else None
    )
    audit.record(
        db,
        org_id=org_id,
        actor=None,
        actor_label=f"Scan SCN-{scan.number:04d}",
        action="scan.finished",
        subject_type="scan",
        subject_id=f"SCN-{scan.number:04d}",
        data={"status": scan.status.value, "stats": stats},
    )
    db.commit()
    return scan
