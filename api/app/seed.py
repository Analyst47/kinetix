"""Seed a demo workspace: OWASP Juice Shop, an intentionally vulnerable open-source app.

Run with ``python -m app.seed``. Every state change goes through the normal services, so
the audit chain of the demo data verifies like real data does.

The advisories below are a hand-picked sample for demonstration. Real scans pull
advisories from OSV.
"""

import io
import shutil
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import select

from app.db import SessionLocal, set_tenant
from app.models import (
    Advisory,
    Dependency,
    DependencyAdvisory,
    Evidence,
    Membership,
    Organization,
    Project,
    Scan,
    Target,
    User,
)
from app.models.enums import (
    AuthorizationType,
    Confidence,
    FindingSource,
    FindingStatus,
    Role,
    ScanStatus,
    Severity,
    TargetKind,
)
from app.schemas import ATTESTATION_TEXT
from app.security.passwords import hash_password
from app.services import audit, storage
from app.services import findings as fsvc

DEMO_EMAIL = "demo@kinetix.dev"
DEMO_PASSWORD = "kinetix-demo-2026"  # noqa: S105 - documented demo account

S = FindingStatus

FINDINGS = [
    # title, severity, source, cwe, file, line, rule/reference, final status
    ("Potential SQL injection in login handler", Severity.CRITICAL, FindingSource.SAST, "CWE-89",
     "routes/login.ts", 34, "kinetix-js-sqli-raw-query", S.NEEDS_VALIDATION),
    ("jsonwebtoken 0.4.0 allows signature algorithm confusion", Severity.CRITICAL,
     FindingSource.DEPENDENCY, "CWE-347", "package.json", None, "CVE-2015-9235", S.CONFIRMED),
    ("Hard-coded RSA private key used to sign session tokens", Severity.HIGH, FindingSource.SECRET,
     "CWE-321", "lib/insecurity.ts", 23, "kinetix-secret-private-key", S.CONFIRMED),
    ("express-jwt 0.1.3 authorization bypass", Severity.HIGH, FindingSource.DEPENDENCY, "CWE-285",
     "package.json", None, "CVE-2020-15084", S.REPORTED),
    ("Potential path traversal in file server route", Severity.HIGH, FindingSource.SAST, "CWE-22",
     "routes/fileServer.ts", 29, "kinetix-js-path-traversal-request", S.NEEDS_VALIDATION),
    ("Search term rendered through bypassSecurityTrustHtml", Severity.MEDIUM, FindingSource.SAST,
     "CWE-79", "frontend/src/app/search-result/search-result.component.ts", 151,
     "kinetix-angular-bypass-sanitizer", S.TRIAGE),
    ("sanitize-html 1.4.2 allows script injection through nested tags", Severity.MEDIUM,
     FindingSource.DEPENDENCY, "CWE-79", "package.json", None, "CVE-2016-1000237", S.NEEDS_VALIDATION),
    ("Redirect allowlist matched by substring", Severity.MEDIUM, FindingSource.MANUAL, "CWE-601",
     "lib/insecurity.ts", 135, None, S.CONFIRMED),
    ("Unsalted MD5 used for password hashing", Severity.LOW, FindingSource.SAST, "CWE-916",
     "lib/insecurity.ts", 43, "kinetix-js-weak-hash", S.TRIAGE),
    ("Error handler returns stack traces to clients", Severity.LOW, FindingSource.MANUAL, "CWE-209",
     "server.ts", 681, None, S.NEEDS_VALIDATION),
    ("Test fixture contains sample API key", Severity.INFO, FindingSource.SECRET, "CWE-798",
     "test/api/fixtures/keys.json", 4, "kinetix-secret-aws-access-key", S.FALSE_POSITIVE),
]  # fmt: skip

ADVISORIES = [
    ("GHSA-demo-jwt-alg", ["CVE-2015-9235"], Severity.CRITICAL, ["CWE-347"],
     "A token signed with an asymmetric algorithm can be re-signed with HS256 using the public "
     "key and still pass verification."),
    ("GHSA-demo-jwt-none", ["CVE-2022-23540"], Severity.HIGH, ["CWE-287"],
     "verify() falls back to the none algorithm when no algorithms are given, accepting "
     "unsigned tokens."),
    ("GHSA-demo-express-jwt", ["CVE-2020-15084"], Severity.HIGH, ["CWE-285"],
     "Authorization can be bypassed when the algorithms option is not set alongside a JWKS "
     "key source."),
    ("GHSA-demo-sanitize-nested", ["CVE-2016-1000237"], Severity.MEDIUM, ["CWE-79"],
     "Improperly nested tags can survive sanitization and execute script."),
    ("GHSA-demo-sanitize-iframe", ["CVE-2021-26539"], Severity.MEDIUM, ["CWE-20"],
     "The iframe hostname allowlist can be bypassed with a crafted URL."),
]  # fmt: skip

DEPENDENCIES = [
    # name, version, direct, [(advisory id, range, fixed)], finding title
    ("jsonwebtoken", "0.4.0", True,
     [("GHSA-demo-jwt-alg", "< 4.2.2", "4.2.2"), ("GHSA-demo-jwt-none", "<= 8.5.1", "9.0.0")],
     "jsonwebtoken 0.4.0 allows signature algorithm confusion"),
    ("express-jwt", "0.1.3", True, [("GHSA-demo-express-jwt", "< 6.0.0", "6.0.0")],
     "express-jwt 0.1.3 authorization bypass"),
    ("sanitize-html", "1.4.2", True,
     [("GHSA-demo-sanitize-nested", "< 1.4.3", "1.4.3"),
      ("GHSA-demo-sanitize-iframe", "< 2.3.1", "2.3.1")],
     "sanitize-html 1.4.2 allows script injection through nested tags"),
    ("express", "4.21.2", True, [], None),
    ("sequelize", "6.37.3", True, [], None),
    ("helmet", "4.6.0", True, [], None),
    ("cookie-parser", "1.4.5", True, [], None),
    ("cors", "2.8.5", True, [], None),
    ("morgan", "1.10.0", True, [], None),
    ("ms", "2.0.0", False, [], None),
    ("debug", "2.6.9", False, [], None),
]  # fmt: skip

REQUEST = b"""POST /rest/user/login HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{"email": "' OR 1=1--", "password": "anything"}
"""
RESPONSE = b"""HTTP/1.1 200 OK
Content-Type: application/json

{"authentication": {"token": "eyJ0eXAiOiJKV1Qi...", "umail": "admin@juice-sh.op"}}
"""


def seed() -> None:
    with SessionLocal() as db:
        if db.scalar(select(User.id).where(User.email == DEMO_EMAIL)):
            print("Demo data already present.")
            return
        user = User(
            email=DEMO_EMAIL, name="Fahim Abrar", password_hash=hash_password(DEMO_PASSWORD)
        )
        org = Organization(slug="demo", name="Fahim's lab", ai_enabled=True)
        db.add_all([user, org])
        db.flush()
        org.created_by_id = user.id
        db.add(Membership(org_id=org.id, user_id=user.id, role=Role.OWNER))
        set_tenant(db, org.id)

        project = Project(
            org_id=org.id,
            slug="juice-shop",
            name="OWASP Juice Shop",
            description="Intentionally insecure web application used as the KinetixZero demo target.",
            authorization_type=AuthorizationType.OPEN_SOURCE,
            in_scope="Source code of the juice-shop repository at v17.1.1, analyzed locally.",
            out_of_scope="Any hosted Juice Shop instance not run by the researcher.",
            authorization_reference="https://github.com/juice-shop/juice-shop",
            attestation_text=ATTESTATION_TEXT,
            attested_by_id=user.id,
            attested_at=datetime.now(UTC),
            authorization_expires_at=datetime.now(UTC) + timedelta(days=116),
        )
        db.add(project)
        db.flush()
        audit.record(
            db,
            org_id=org.id,
            actor=user,
            action="project.created",
            subject_type="project",
            subject_id=project.slug,
            data={"authorization_type": "open_source"},
        )
        target = Target(
            org_id=org.id,
            project_id=project.id,
            kind=TargetKind.REPOSITORY,
            name="juice-shop",
            locator="https://github.com/juice-shop/juice-shop",
            version="17.1.1",
            commit="3f2c9e1",
        )
        db.add(target)
        db.flush()
        _copy_demo_sources(target.id)
        scan = Scan(
            org_id=org.id,
            project_id=project.id,
            target_id=target.id,
            number=42,
            status=ScanStatus.SUCCEEDED,
            analyzers=["dependencies", "secrets", "sast"],
            stats={"dependencies": {"packages": 11, "vulnerable": 3}},
            started_at=datetime.now(UTC) - timedelta(minutes=16),
            finished_at=datetime.now(UTC) - timedelta(minutes=14),
            created_by_id=user.id,
        )
        db.add(scan)
        db.flush()

        for adv_id, aliases, sev, cwes, summary in ADVISORIES:
            db.add(
                Advisory(id=adv_id, aliases=aliases, summary=summary, severity=sev, cwe_ids=cwes)
            )
        db.flush()

        by_title = {}
        for title, sev, source, cwe, path, line, ref, final in FINDINGS:
            f = fsvc.create_finding(
                db,
                project=project,
                actor=None if source != FindingSource.MANUAL else user,
                actor_label=None if source == FindingSource.MANUAL else "Scan SCN-0042",
                title=title,
                severity=sev,
                source=source,
                cwe=cwe,
                file_path=path,
                line=line,
                rule_id=ref if ref and not ref.startswith("CVE-") else None,
                reference=ref if ref and ref.startswith("CVE-") else None,
                scan_id=None if source == FindingSource.MANUAL else scan.id,
            )
            f.assignee_id = user.id
            # Mirror the real scanner: known-vulnerable dependencies and taint-verified
            # weaknesses are firm; the rest are tentative until a human confirms them.
            if source == FindingSource.DEPENDENCY or cwe in ("CWE-22", "CWE-78", "CWE-601"):
                f.confidence = Confidence.FIRM
            by_title[title] = f
            _advance(db, f, final, user)

        for name, version, direct, links, finding_title in DEPENDENCIES:
            dep = Dependency(
                org_id=org.id,
                project_id=project.id,
                scan_id=scan.id,
                ecosystem="npm",
                name=name,
                version=version,
                direct=direct,
                license="MIT",
                manifest="package.json",
                finding_id=by_title[finding_title].id if finding_title else None,
            )
            for adv_id, rng, fixed in links:
                dep.advisories.append(
                    DependencyAdvisory(
                        org_id=org.id, advisory_id=adv_id, affected_range=rng, fixed_version=fixed
                    )
                )
            db.add(dep)

        sqli = by_title["Potential SQL injection in login handler"]
        for name, body in (("request.txt", REQUEST), ("response.txt", RESPONSE)):
            _attach(db, sqli, user, name, body)

        # Demo findings were discovered weeks ago, so the disclosure timeline has history.
        for f in by_title.values():
            f.created_at = datetime.now(UTC) - timedelta(days=40)
        db.flush()
        _seed_disclosures(db, project, user, by_title)
        db.commit()
        print(f"Seeded demo workspace. Sign in as {DEMO_EMAIL} / {DEMO_PASSWORD}")


def _seed_disclosures(db, project, user, by_title) -> None:
    from app.models import Disclosure
    from app.schemas import DisclosureEventIn
    from app.services import disclosure as dsvc

    def start(title: str, **kw) -> tuple[Disclosure, object]:
        f = by_title[title]
        d = Disclosure(
            org_id=project.org_id,
            project_id=project.id,
            finding_id=f.id,
            stage="draft",
            created_by_id=user.id,
            contact_source="vendor_site",
            channel="web_form",
            deadline_days=90,
            **kw,
        )
        db.add(d)
        db.flush()
        audit.record(
            db,
            org_id=project.org_id,
            actor=user,
            action="disclosure.started",
            subject_type="finding",
            subject_id=f.public_id,
            data={"vendor": kw["vendor_name"]},
        )
        return d, f

    def event(d, f, kind: str, days_ago: int, note: str = "") -> None:
        when = datetime.now(UTC) - timedelta(days=days_ago)
        dsvc.record_event(
            db,
            disclosure=d,
            finding=f,
            actor=user,
            body=DisclosureEventIn(kind=kind, occurred_at=when, note=note),
        )
        db.flush()
        db.refresh(d)

    d, f = start(
        "express-jwt 0.1.3 authorization bypass",
        vendor_name="OWASP Juice Shop maintainers",
        contact="https://github.com/juice-shop/juice-shop/security",
    )
    event(d, f, "notified", 33, "Reported through the repository's private advisory form.")
    event(d, f, "acknowledged", 30, "Maintainers confirmed receipt and are evaluating an upgrade.")
    start(
        "jsonwebtoken 0.4.0 allows signature algorithm confusion",
        vendor_name="OWASP Juice Shop maintainers",
        contact="https://github.com/juice-shop/juice-shop/security",
    )


def _copy_demo_sources(target_id) -> None:
    from app.config import get_settings

    dest = get_settings().storage_dir / "sources" / str(target_id)
    shutil.copytree(Path(__file__).parent / "demo" / "juice-shop", dest, dirs_exist_ok=True)


def _attach(db, finding, user, name: str, body: bytes) -> None:
    blob = storage.put("evidence", io.BytesIO(body), 10 * 1024 * 1024)
    ev = Evidence(
        org_id=finding.org_id,
        finding_id=finding.id,
        filename=name,
        content_type="text/plain",
        size=blob.size,
        sha256=blob.sha256,
        uploaded_by_id=user.id,
    )
    db.add(ev)
    db.flush()
    audit.record(
        db,
        org_id=finding.org_id,
        actor=user,
        action="evidence.attached",
        subject_type="finding",
        subject_id=finding.public_id,
        data={"filename": name, "sha256": blob.sha256, "size": blob.size},
    )


def _advance(db, f, final: FindingStatus, user: User) -> None:
    path = {
        S.TRIAGE: [S.TRIAGE],
        S.NEEDS_VALIDATION: [S.TRIAGE, S.NEEDS_VALIDATION],
        S.CONFIRMED: [S.TRIAGE, S.NEEDS_VALIDATION, S.CONFIRMED],
        S.REPORTED: [S.TRIAGE, S.NEEDS_VALIDATION, S.CONFIRMED, S.REPORTED],
        S.FALSE_POSITIVE: [S.FALSE_POSITIVE],
    }[final]
    for step in path:
        if step is S.CONFIRMED:
            _attach(
                db,
                f,
                user,
                "reproduction-notes.md",
                f"# {f.title}\n\nReproduced locally.\n".encode(),
            )
            f.reproduction = "Reproduced against a local build of juice-shop v17.1.1."
            f.cvss_vector = "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:N/SC:N/SI:N/SA:N"
            from app.services.cvss import score_vector

            f.cvss_score = score_vector(f.cvss_vector).score
        fsvc.transition(db, finding=f, target=step, actor=user)


if __name__ == "__main__":
    seed()
    sys.exit(0)
