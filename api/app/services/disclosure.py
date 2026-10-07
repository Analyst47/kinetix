"""Coordinated disclosure: vendor timeline, deadline tracking and finding lifecycle coupling.

Recording a timeline event moves the finding through its lifecycle, so the finding's status
and the disclosure record can never disagree:

    notified          → finding Reported (starts the deadline clock)
    acknowledged      → finding Vendor acknowledged
    fix_released      → finding Fix available
    public_disclosure → finding Public disclosure
"""

import math
from datetime import UTC, datetime, timedelta

from app.errors import ApiError
from app.models import Disclosure, DisclosureEvent, Finding, Project, User
from app.models.enums import FindingStatus
from app.schemas import DisclosureEventIn, DisclosureEventOut, DisclosureOut
from app.services import audit
from app.services import findings as fsvc

S = FindingStatus
DUE_SOON_DAYS = 14

STARTABLE = {S.CONFIRMED, S.REPORTED, S.VENDOR_ACKNOWLEDGED, S.FIX_AVAILABLE}

# Which events may be recorded at each stage.
ALLOWED: dict[str, list[str]] = {
    "draft": ["notified", "note"],
    "notified": [
        "vendor_response",
        "acknowledged",
        "fix_released",
        "extension",
        "cve_assigned",
        "public_disclosure",
        "note",
    ],
    "acknowledged": [
        "vendor_response",
        "fix_released",
        "extension",
        "cve_assigned",
        "public_disclosure",
        "note",
    ],
    "fix_available": ["vendor_response", "cve_assigned", "public_disclosure", "note"],
    "published": ["cve_assigned", "note"],
}

FINDING_TARGET = {
    "notified": S.REPORTED,
    "acknowledged": S.VENDOR_ACKNOWLEDGED,
    "fix_released": S.FIX_AVAILABLE,
    "public_disclosure": S.PUBLIC_DISCLOSURE,
}
STAGE_AFTER = {
    "notified": "notified",
    "acknowledged": "acknowledged",
    "fix_released": "fix_available",
    "public_disclosure": "published",
}


def health(d: Disclosure, now: datetime | None = None) -> tuple[str, int | None]:
    if d.stage == "published":
        return "complete", None
    if d.deadline_at is None:
        return "draft", None
    now = now or datetime.now(UTC)
    days = math.ceil((d.deadline_at - now).total_seconds() / 86400)
    if d.stage == "fix_available":
        return "on_track", days
    if days < 0:
        return "overdue", days
    return ("due_soon" if days <= DUE_SOON_DAYS else "on_track"), days


def to_out(d: Disclosure, finding: Finding) -> DisclosureOut:
    h, days = health(d)
    return DisclosureOut(
        id=d.id,
        finding_public_id=finding.public_id,
        finding_title=finding.title,
        severity=finding.severity,
        vendor_name=d.vendor_name,
        contact=d.contact,
        contact_source=d.contact_source,
        channel=d.channel,
        policy_url=d.policy_url,
        deadline_days=d.deadline_days,
        notified_at=d.notified_at,
        deadline_at=d.deadline_at,
        days_remaining=days,
        health=h,
        stage=d.stage,
        cve_id=d.cve_id,
        advisory_url=d.advisory_url,
        events=[DisclosureEventOut.model_validate(e) for e in d.events],
        allowed_events=ALLOWED[d.stage],
    )


def record_event(
    db, *, disclosure: Disclosure, finding: Finding, body: DisclosureEventIn, actor: User
) -> None:
    if body.kind not in ALLOWED[disclosure.stage]:
        raise ApiError(
            409,
            "invalid_event",
            f"You can't record '{body.kind.replace('_', ' ')}' "
            f"while the disclosure is {disclosure.stage}.",
            {"allowed": ALLOWED[disclosure.stage]},
        )
    when = body.occurred_at if body.occurred_at.tzinfo else body.occurred_at.replace(tzinfo=UTC)
    now = datetime.now(UTC)
    if when > now + timedelta(days=1):
        raise ApiError(
            422, "future_date", "Events are recorded after they happen. Pick today or earlier."
        )
    if when < finding.created_at - timedelta(days=1):
        raise ApiError(
            422, "date_before_finding", "That date is before this finding was discovered."
        )
    if (
        disclosure.notified_at
        and body.kind != "note"
        and when < disclosure.notified_at - timedelta(days=1)
    ):
        raise ApiError(422, "date_before_notice", "That date is before the vendor was notified.")

    data: dict = {}
    if body.kind == "notified":
        disclosure.notified_at = when
        disclosure.deadline_at = when + timedelta(days=disclosure.deadline_days)
        data["deadline_at"] = disclosure.deadline_at.isoformat()
    elif body.kind == "extension":
        if not body.days:
            raise ApiError(422, "days_required", "Say how many days the deadline is extended by.")
        assert disclosure.deadline_at is not None
        disclosure.deadline_at += timedelta(days=body.days)
        data = {"days": body.days, "deadline_at": disclosure.deadline_at.isoformat()}
    elif body.kind == "cve_assigned":
        if not body.cve_id:
            raise ApiError(422, "cve_required", "Enter the CVE ID, like CVE-2026-12345.")
        disclosure.cve_id = body.cve_id
        data["cve_id"] = body.cve_id
    elif body.kind == "public_disclosure" and body.advisory_url:
        disclosure.advisory_url = body.advisory_url
        data["advisory_url"] = body.advisory_url

    target = FINDING_TARGET.get(body.kind)
    if target is not None and finding.status is not target:
        fsvc.transition(
            db, finding=finding, target=target, actor=actor, note=f"Disclosure: {body.kind}"
        )
    disclosure.stage = STAGE_AFTER.get(body.kind, disclosure.stage)

    db.add(
        DisclosureEvent(
            org_id=disclosure.org_id,
            disclosure_id=disclosure.id,
            kind=body.kind,
            occurred_at=when,
            note=body.note,
            data=data,
            created_by_id=actor.id,
        )
    )
    audit.record(
        db,
        org_id=disclosure.org_id,
        actor=actor,
        action=f"disclosure.{body.kind}",
        subject_type="finding",
        subject_id=finding.public_id,
        data={
            "occurred_at": when.isoformat(),
            **data,
            **({"note": body.note} if body.note else {}),
        },
    )


CHANNEL_LABEL = {
    "email": "email",
    "bug_bounty": "bug bounty platform",
    "web_form": "web form",
    "cna": "CVE Numbering Authority",
}


def draft_notice(
    d: Disclosure, finding: Finding, project: Project, researcher: User, version: str | None
) -> tuple[str, str]:
    """Plain-text initial notification. Written to be pasted, then edited by the researcher."""
    subject = f"Security vulnerability report: {finding.title} ({finding.public_id})"
    cvss = (
        f"CVSS {finding.cvss_score} ({finding.cvss_vector}), our preliminary assessment"
        if finding.cvss_vector
        else "not yet scored"
    )
    lines = [
        f"Hello {d.vendor_name} security team,",
        "",
        f"I'm writing to report a security vulnerability I found in {project.name}"
        + (f" {version}" if version else "")
        + ". I'm sharing it privately so it can be fixed before any public discussion.",
        "",
        "Summary",
        f"  {finding.title}",
        f"  Severity: {finding.severity.value.capitalize()}, {cvss}",
        f"  Weakness: {finding.cwe or 'not classified'}",
    ]
    if finding.file_path:
        lines.append(
            f"  Location: {finding.file_path}" + (f":{finding.line}" if finding.line else "")
        )
    lines += [
        "",
        "Details",
        f"  {finding.description.strip() or '[Describe the issue and its impact.]'}",
    ]
    lines += ["", "Steps to reproduce"]
    lines += [
        f"  {line}"
        for line in (finding.reproduction.strip() or "[Add reproduction steps.]").splitlines()
    ]
    lines += [
        "",
        "Disclosure timeline",
        f"  I follow a {d.deadline_days}-day coordinated disclosure timeline from today.",
        "  I'm happy to coordinate on dates if you need more time for a fix.",
        "",
        "Please confirm you've received this report. I can share the full report and evidence",
        "(with SHA-256 hashes for integrity) over an encrypted channel if you prefer.",
        "",
        "Thank you,",
        researcher.name,
        f"Reference: {finding.public_id}",
    ]
    return subject, "\n".join(lines)
