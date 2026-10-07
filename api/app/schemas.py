import re
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator

from app.models.enums import (
    AuthorizationType,
    FindingSource,
    FindingStatus,
    Role,
    ScanStatus,
    Severity,
    TargetKind,
)
from app.security.passwords import MIN_PASSWORD_LENGTH

Slug = Annotated[str, StringConstraints(pattern=r"^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$")]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


class Model(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ── Auth ──────────────────────────────────────────────────────────────────────


class RegisterIn(BaseModel):
    email: EmailStr
    name: Name
    password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=256)
    organization_name: Name


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=256)


class UserOut(Model):
    id: uuid.UUID
    email: str
    name: str


class MembershipOut(BaseModel):
    slug: str
    name: str
    role: Role


class MeOut(BaseModel):
    user: UserOut
    organizations: list[MembershipOut]
    mfa_enabled: bool = False


class MfaRequiredOut(BaseModel):
    mfa_required: bool = True
    challenge: str


class MfaVerifyIn(BaseModel):
    challenge: str = Field(max_length=100)
    code: str | None = Field(default=None, max_length=12)
    recovery_code: str | None = Field(default=None, max_length=20)


class PasswordIn(BaseModel):
    password: str = Field(max_length=256)


class MfaSetupOut(BaseModel):
    secret: str
    otpauth_uri: str


class MfaCodeIn(BaseModel):
    code: str = Field(max_length=12)


class MfaDisableIn(BaseModel):
    password: str = Field(max_length=256)
    code: str = Field(max_length=12)


class MfaStatusOut(BaseModel):
    enabled: bool
    enabled_at: datetime | None
    recovery_codes_remaining: int


class RecoveryCodesOut(BaseModel):
    recovery_codes: list[str]


class SessionOut(Model):
    id: uuid.UUID
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime
    ip_address: str | None
    user_agent: str | None
    current: bool = False


# ── Projects ──────────────────────────────────────────────────────────────────

ATTESTATION_TEXT = (
    "I am authorized to analyze this target within the scope below. I will not test "
    "systems or components that are out of scope, and I will report confirmed "
    "vulnerabilities through coordinated disclosure."
)


RESERVED_SLUGS = frozenset({"new", "audit", "settings", "members", "api"})


class ProjectIn(BaseModel):
    slug: Slug
    name: Name
    description: str = Field(default="", max_length=2000)
    authorization_type: AuthorizationType
    in_scope: str = Field(min_length=3, max_length=4000)
    out_of_scope: str = Field(default="", max_length=4000)
    authorization_reference: str | None = Field(default=None, max_length=500)
    authorization_expires_at: datetime | None = None
    attest: bool

    @field_validator("slug")
    @classmethod
    def not_reserved(cls, v: str) -> str:
        if v in RESERVED_SLUGS:
            raise ValueError(f"'{v}' is reserved. Choose another URL name.")
        return v

    @field_validator("attest")
    @classmethod
    def must_attest(cls, v: bool) -> bool:
        if not v:
            raise ValueError("You must confirm you are authorized to analyze this target.")
        return v

    @field_validator("authorization_reference")
    @classmethod
    def https_only(cls, v: str | None) -> str | None:
        if v and not re.match(r"^https://", v):
            raise ValueError("Use an https:// link to the program or authorization.")
        return v


class ProjectOut(Model):
    id: uuid.UUID
    slug: str
    name: str
    description: str
    authorization_type: AuthorizationType
    in_scope: str
    out_of_scope: str
    authorization_reference: str | None
    attestation_text: str
    attested_at: datetime
    authorization_expires_at: datetime | None
    attested_by: UserOut
    created_at: datetime


class ProjectSummary(ProjectOut):
    open_findings: int = 0
    severity_counts: dict[str, int] = Field(default_factory=dict)


# ── Targets & scans ───────────────────────────────────────────────────────────


class TargetOut(Model):
    id: uuid.UUID
    kind: TargetKind
    name: str
    locator: str
    version: str | None
    commit: str | None
    archive_sha256: str | None
    created_at: datetime


class ScanOut(Model):
    id: uuid.UUID
    number: int
    target_id: uuid.UUID
    status: ScanStatus
    analyzers: list[str]
    stats: dict
    error: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


# ── Findings ──────────────────────────────────────────────────────────────────

Cwe = Annotated[str, StringConstraints(pattern=r"^CWE-\d{1,5}$")]


class FindingIn(BaseModel):
    title: str = Field(min_length=3, max_length=300)
    description: str = Field(default="", max_length=20000)
    severity: Severity
    cwe: Cwe | None = None
    file_path: str | None = Field(default=None, max_length=1000)
    line: int | None = Field(default=None, ge=1)
    reference: str | None = Field(default=None, max_length=200)


class FindingPatch(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=300)
    description: str | None = Field(default=None, max_length=20000)
    severity: Severity | None = None
    cwe: Cwe | None = None
    reproduction: str | None = Field(default=None, max_length=50000)
    remediation: str | None = Field(default=None, max_length=20000)
    cvss_vector: str | None = Field(default=None, max_length=200)
    assignee_id: uuid.UUID | None = None


class TransitionIn(BaseModel):
    status: FindingStatus
    note: str = Field(default="", max_length=2000)
    duplicate_of: str | None = Field(default=None, pattern=r"^FND-\d{6}$")


class ReadinessItem(BaseModel):
    key: str
    label: str
    done: bool
    detail: str | None = None


class FindingOut(Model):
    id: uuid.UUID
    public_id: str
    number: int
    title: str
    description: str
    severity: Severity
    status: FindingStatus
    source: FindingSource
    cwe: str | None
    cvss_vector: str | None
    cvss_score: Decimal | None
    file_path: str | None
    line: int | None
    rule_id: str | None
    reference: str | None
    reproduction: str
    remediation: str
    assignee: UserOut | None
    created_at: datetime
    updated_at: datetime
    confirmed_at: datetime | None


class FindingDetail(FindingOut):
    allowed_transitions: list[FindingStatus]
    remediation_guidance: str | None = None
    readiness: list[ReadinessItem]
    evidence_count: int


class FindingPage(BaseModel):
    items: list[FindingOut]
    total: int
    status_counts: dict[str, int]
    severity_counts: dict[str, int]


class SourceLine(BaseModel):
    n: int
    text: str


class SourceExcerpt(BaseModel):
    path: str
    commit: str | None
    highlight: int
    lines: list[SourceLine]


class ReportExportIn(BaseModel):
    format: Literal["markdown", "json", "print"] = "markdown"


class CvssOut(BaseModel):
    version: str
    vector: str
    score: Decimal
    severity: str


# ── Evidence ──────────────────────────────────────────────────────────────────


class EvidenceOut(Model):
    id: uuid.UUID
    filename: str
    content_type: str
    size: int
    sha256: str
    note: str
    uploaded_by: UserOut
    created_at: datetime


class EvidenceVerifyOut(BaseModel):
    id: uuid.UUID
    sha256: str
    verified: bool


# ── Dependencies ──────────────────────────────────────────────────────────────


class AdvisoryOut(BaseModel):
    id: str
    display_id: str
    aliases: list[str]
    summary: str
    severity: Severity | None
    cwe_ids: list[str]
    affected_range: str
    fixed_version: str | None


class DependencyOut(BaseModel):
    id: uuid.UUID
    ecosystem: str
    name: str
    version: str
    direct: bool
    license: str | None
    manifest: str
    max_severity: Severity | None
    fixed_version: str | None
    finding_public_id: str | None
    advisories: list[AdvisoryOut]


class DependencyPage(BaseModel):
    items: list[DependencyOut]
    total: int
    vulnerable: int


# ── Audit ─────────────────────────────────────────────────────────────────────


class AuditEventOut(Model):
    seq: int
    actor_label: str
    action: str
    subject_type: str
    subject_id: str
    data: dict
    created_at: datetime
    prev_hash: str
    hash: str


class ChainOut(BaseModel):
    verified: bool
    entries: int
    first_broken_seq: int | None
    reason: str | None


# ── Members ───────────────────────────────────────────────────────────────────


class MemberOut(BaseModel):
    user: UserOut
    role: Role
    joined_at: datetime
    mfa_enabled: bool
    you: bool = False


class MemberRoleIn(BaseModel):
    role: Role


class InvitationIn(BaseModel):
    email: EmailStr
    role: Role


class InvitationOut(BaseModel):
    id: uuid.UUID
    email: str
    role: Role
    invited_by: str
    created_at: datetime
    expires_at: datetime
    link: str | None = None


class InvitationPreview(BaseModel):
    organization: str
    role: Role
    invited_by: str
    email: str
    expires_at: datetime


# ── Disclosure ────────────────────────────────────────────────────────────────

ContactSource = Literal["security_txt", "bug_bounty", "vendor_site", "manual"]
Channel = Literal["email", "bug_bounty", "web_form", "cna"]
EventKind = Literal[
    "notified",
    "vendor_response",
    "acknowledged",
    "fix_released",
    "cve_assigned",
    "extension",
    "public_disclosure",
    "note",
]
CveId = Annotated[str, StringConstraints(pattern=r"^CVE-\d{4}-\d{4,7}$")]


def _https(v: str | None) -> str | None:
    if v and not v.startswith("https://"):
        raise ValueError("Use an https:// link.")
    return v


class DisclosureIn(BaseModel):
    vendor_name: str = Field(min_length=1, max_length=200)
    contact: str = Field(min_length=3, max_length=500)
    contact_source: ContactSource = "manual"
    channel: Channel = "email"
    policy_url: str | None = Field(default=None, max_length=500)
    deadline_days: int = Field(default=90, ge=7, le=365)

    @field_validator("policy_url")
    @classmethod
    def _policy_https(cls, v: str | None) -> str | None:
        return _https(v)


class DisclosurePatch(BaseModel):
    vendor_name: str | None = Field(default=None, min_length=1, max_length=200)
    contact: str | None = Field(default=None, min_length=3, max_length=500)
    policy_url: str | None = Field(default=None, max_length=500)
    advisory_url: str | None = Field(default=None, max_length=500)

    @field_validator("policy_url", "advisory_url")
    @classmethod
    def _urls_https(cls, v: str | None) -> str | None:
        return _https(v)


class DisclosureEventIn(BaseModel):
    kind: EventKind
    occurred_at: datetime
    note: str = Field(default="", max_length=4000)
    days: int | None = Field(default=None, ge=1, le=180)
    cve_id: CveId | None = None
    advisory_url: str | None = Field(default=None, max_length=500)

    @field_validator("advisory_url")
    @classmethod
    def _advisory_https(cls, v: str | None) -> str | None:
        return _https(v)


class DisclosureEventOut(Model):
    id: uuid.UUID
    kind: str
    occurred_at: datetime
    note: str
    data: dict
    created_by: UserOut
    created_at: datetime


class DisclosureOut(BaseModel):
    id: uuid.UUID
    finding_public_id: str
    finding_title: str
    severity: Severity
    vendor_name: str
    contact: str
    contact_source: str
    channel: str
    policy_url: str | None
    deadline_days: int
    notified_at: datetime | None
    deadline_at: datetime | None
    days_remaining: int | None
    health: Literal["draft", "on_track", "due_soon", "overdue", "complete"]
    stage: str
    cve_id: str | None
    advisory_url: str | None
    events: list[DisclosureEventOut]
    allowed_events: list[str]


class DraftOut(BaseModel):
    to: str
    subject: str
    body: str


class SecurityTxtIn(BaseModel):
    domain: str = Field(min_length=3, max_length=253)


class SecurityTxtOut(BaseModel):
    domain: str
    url: str
    contacts: list[str]
    policy: list[str]
    encryption: list[str]
    acknowledgments: list[str]
    preferred_languages: str | None
    expires: str | None
    signed: bool
    warnings: list[str]


# ── AI ────────────────────────────────────────────────────────────────────────


class AiStatusOut(BaseModel):
    available: bool
    enabled: bool
    provider: str | None
    model: str | None


class AiSettingsIn(BaseModel):
    enabled: bool


class AiAskIn(BaseModel):
    question: str = Field(min_length=3, max_length=1000)


class AiDraftIn(BaseModel):
    field: Literal["description", "remediation"]


class AiRunOut(Model):
    id: uuid.UUID
    kind: str
    question: str | None
    output: dict
    provider: str
    model: str
    input_sha256: str
    injection_signals: list[str]
    created_by: UserOut
    created_at: datetime
