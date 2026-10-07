"""Security vulnerability report for one finding: structured data plus a Markdown rendering."""

import hashlib
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import AuditEvent, Evidence, Finding, Organization, Project, Scan, Target, User
from app.models.enums import FindingStatus
from app.services import audit

CONFIRMED_OR_LATER = {
    FindingStatus.CONFIRMED,
    FindingStatus.REPORTED,
    FindingStatus.VENDOR_ACKNOWLEDGED,
    FindingStatus.FIX_AVAILABLE,
    FindingStatus.PUBLIC_DISCLOSURE,
}

# General guidance keyed by CWE. The researcher's own analysis always comes first in the report.
REMEDIATION: dict[str, str] = {
    "CWE-89": "Use parameterized queries or the ORM's bind parameters for every value that "
    "reaches SQL. Never build statements by string concatenation or template interpolation.",
    "CWE-79": "Encode output for its context (HTML, attribute, URL, JavaScript) and avoid APIs "
    "that bypass the framework's sanitizer. Add a Content-Security-Policy as defense in depth.",
    "CWE-22": "Resolve the requested path, then verify it is inside the allowed directory before "
    "opening it. Prefer an allowlist of file identifiers over user-supplied paths.",
    "CWE-78": "Avoid the shell. Call programs with an argument array and validate inputs against "
    "an allowlist.",
    "CWE-321": "Remove the key from source control, rotate it, and load keys from a secrets "
    "manager or environment at runtime.",
    "CWE-798": "Remove the credential from the repository, revoke it, and load secrets at runtime "
    "from a secrets manager.",
    "CWE-347": "Pin the accepted signature algorithms explicitly when verifying tokens and upgrade "
    "the library to a fixed version.",
    "CWE-601": "Redirect only to exact, allowlisted URLs or to relative paths on the same origin.",
    "CWE-502": "Never deserialize untrusted data with formats that can construct objects. Use "
    "data-only formats such as JSON with schema validation.",
    "CWE-916": "Hash passwords with a memory-hard algorithm (Argon2id, scrypt or bcrypt) and a "
    "per-user salt.",
    "CWE-209": "Return generic error messages to clients and log details server-side.",
    "CWE-285": "Enforce authorization on the server for every request, and upgrade the affected "
    "component to a fixed version.",
}


def _source_excerpt(
    db: Session, project: Project, finding: Finding, context: int = 4
) -> dict | None:
    if not finding.file_path or not finding.line:
        return None
    targets = db.scalars(select(Target).where(Target.project_id == project.id)).all()
    for target in targets:
        root = (get_settings().storage_dir / "sources" / str(target.id)).resolve()
        path = (root / finding.file_path).resolve()
        if root in path.parents and path.is_file() and not path.is_symlink():
            if path.stat().st_size > 2 * 1024 * 1024:
                return None
            lines = Path(path).read_text(encoding="utf-8", errors="replace").splitlines()
            start = max(1, finding.line - context)
            end = min(len(lines), finding.line + context)
            return {
                "path": finding.file_path,
                "start": start,
                "highlight": finding.line,
                "lines": [lines[n - 1] for n in range(start, end + 1)],
            }
    return None


def build(db: Session, org: Organization, project: Project, finding: Finding) -> dict[str, Any]:
    evidence = db.scalars(
        select(Evidence).where(Evidence.finding_id == finding.id).order_by(Evidence.created_at)
    ).all()
    events = db.scalars(
        select(AuditEvent)
        .where(AuditEvent.subject_type == "finding", AuditEvent.subject_id == finding.public_id)
        .order_by(AuditEvent.seq)
    ).all()
    chain = audit.verify_chain(db, org.id)
    target = None
    if finding.scan_id:
        scan = db.get(Scan, finding.scan_id)
        target = db.get(Target, scan.target_id) if scan else None
    if target is None:
        target = db.scalar(
            select(Target).where(Target.project_id == project.id).order_by(Target.created_at.desc())
        )
    researcher = db.get(
        User, finding.confirmed_by_id or finding.assignee_id or project.attested_by_id
    )
    return {
        "id": finding.public_id,
        "title": finding.title,
        "draft": finding.status not in CONFIRMED_OR_LATER,
        "status": finding.status.value,
        "severity": finding.severity.value,
        "cvss": {"score": str(finding.cvss_score), "vector": finding.cvss_vector}
        if finding.cvss_vector
        else None,
        "cwe": finding.cwe,
        "reference": finding.reference,
        "location": f"{finding.file_path}:{finding.line}" if finding.line else finding.file_path,
        "description": finding.description,
        "reproduction": finding.reproduction,
        "remediation": REMEDIATION.get(finding.cwe or ""),
        "researcher": researcher.name if researcher else None,
        "organization": org.name,
        "product": {
            "name": project.name,
            "target": target.name if target else None,
            "version": target.version if target else None,
            "commit": target.commit if target else None,
        },
        "discovered_at": finding.created_at.isoformat(),
        "confirmed_at": finding.confirmed_at.isoformat() if finding.confirmed_at else None,
        "source": _source_excerpt(db, project, finding),
        "evidence": [
            {
                "filename": e.filename,
                "size": e.size,
                "sha256": e.sha256,
                "added_at": e.created_at.isoformat(),
            }
            for e in evidence
        ],
        "authorization": {
            "type": project.authorization_type.value,
            "in_scope": project.in_scope,
            "out_of_scope": project.out_of_scope,
            "reference": project.authorization_reference,
            "attestation": project.attestation_text,
            "attested_by": project.attested_by.name,
            "attested_at": project.attested_at.isoformat(),
        },
        "custody": [
            {
                "seq": e.seq,
                "at": e.created_at.isoformat(),
                "actor": e.actor_label,
                "action": e.action,
                "data": e.data,
                "hash": e.hash,
            }
            for e in events
        ],
        "chain": {"verified": chain.verified, "entries": chain.entries},
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
    }


AUTH_LABEL = {
    "open_source": "Open-source project",
    "bug_bounty": "Bug bounty scope",
    "vendor_authorization": "Vendor authorization",
    "personal_lab": "Personal or lab environment",
    "organization_owned": "Organization-owned asset",
}


def _cell(value: object) -> str:
    return str(value if value not in (None, "") else "—").replace("|", "\\|").replace("\n", " ")


def to_markdown(r: dict[str, Any]) -> str:
    out: list[str] = []
    w = out.append
    w(f"# {r['id']}: {r['title']}\n")
    if r["draft"]:
        w(
            "> **Draft.** This finding has not been confirmed. Treat everything below as a "
            "hypothesis under investigation.\n"
        )
    product = r["product"]
    version = product["version"] or "—"
    rows = [
        ("Product", product["name"]),
        (
            "Affected version",
            f"{version}" + (f" (commit {product['commit']})" if product["commit"] else ""),
        ),
        ("Severity", r["severity"].capitalize()),
        (
            "CVSS",
            f"{r['cvss']['score']} `{r['cvss']['vector']}` (preliminary)"
            if r["cvss"]
            else "Not assessed",
        ),
        ("CWE", r["cwe"]),
        ("Reference", r["reference"]),
        ("Location", f"`{r['location']}`" if r["location"] else None),
        ("Researcher", r["researcher"]),
        ("Status", r["status"].replace("_", " ").capitalize()),
    ]
    w("| | |\n|---|---|")
    for k, v in rows:
        w(f"| {k} | {_cell(v)} |")
    w("")
    w("## Summary\n")
    w((r["description"] or "_No description provided._") + "\n")
    if r["source"]:
        s = r["source"]
        w("## Technical details\n")
        w(f"`{s['path']}`, lines {s['start']}–{s['start'] + len(s['lines']) - 1}:\n")
        w("```")
        for i, line in enumerate(s["lines"]):
            n = s["start"] + i
            marker = ">" if n == s["highlight"] else " "
            w(f"{marker}{n:>5}  {line}")
        w("```\n")
    w("## Reproduction\n")
    w((r["reproduction"] or "_No reproduction steps recorded._") + "\n")
    w("## Evidence\n")
    if r["evidence"]:
        w("| File | Size | SHA-256 |\n|---|---|---|")
        for e in r["evidence"]:
            w(f"| {_cell(e['filename'])} | {e['size']} B | `{e['sha256']}` |")
        w("")
    else:
        w("_No evidence attached._\n")
    w("## Suggested remediation\n")
    w((r["remediation"] or "_Describe the fix for this issue._") + "\n")
    a = r["authorization"]
    w("## Authorization\n")
    w(f"- **Basis:** {AUTH_LABEL.get(a['type'], a['type'])}")
    if a["reference"]:
        w(f"- **Reference:** {a['reference']}")
    w(f"- **In scope:** {a['in_scope']}")
    if a["out_of_scope"]:
        w(f"- **Out of scope:** {a['out_of_scope']}")
    w(f"- **Attested by** {a['attested_by']} on {a['attested_at'][:10]}: “{a['attestation']}”\n")
    w("## Chain of custody\n")
    w("| # | Time (UTC) | Actor | Action | Hash |\n|---|---|---|---|---|")
    for e in r["custody"]:
        w(
            f"| {e['seq']} | {e['at'][:19].replace('T', ' ')} | {_cell(e['actor'])} | {e['action']} | `{e['hash'][:16]}…` |"
        )
    chain = r["chain"]
    w(
        "\n"
        + (
            f"Chain verified: all {chain['entries']} workspace entries recompute from the first."
            if chain["verified"]
            else "**Chain verification failed.** Entries in this ledger may have been altered."
        )
        + "\n"
    )
    w(
        f"---\nGenerated by Kinetix for {r['organization']} on {r['generated_at'].replace('T', ' ')} UTC."
    )
    return "\n".join(out) + "\n"


def digest(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()
