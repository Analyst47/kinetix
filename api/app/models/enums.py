from enum import StrEnum


class Role(StrEnum):
    OWNER = "owner"
    ADMIN = "admin"
    RESEARCHER = "researcher"
    REVIEWER = "reviewer"
    VIEWER = "viewer"


class AuthorizationType(StrEnum):
    OPEN_SOURCE = "open_source"
    BUG_BOUNTY = "bug_bounty"
    VENDOR = "vendor_authorization"
    PERSONAL_LAB = "personal_lab"
    ORG_OWNED = "organization_owned"


class TargetKind(StrEnum):
    REPOSITORY = "repository"
    ARCHIVE = "archive"
    PACKAGE = "package"
    CONTAINER = "container"


class Severity(StrEnum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


SEVERITY_RANK = {
    Severity.CRITICAL: 0,
    Severity.HIGH: 1,
    Severity.MEDIUM: 2,
    Severity.LOW: 3,
    Severity.INFO: 4,
}


class FindingSource(StrEnum):
    SAST = "sast"
    DEPENDENCY = "dependency"
    SECRET = "secret"  # noqa: S105 - enum label, not a credential
    MANUAL = "manual"


class FindingStatus(StrEnum):
    DISCOVERED = "discovered"
    TRIAGE = "triage"
    NEEDS_VALIDATION = "needs_validation"
    CONFIRMED = "confirmed"
    REPORTED = "reported"
    VENDOR_ACKNOWLEDGED = "vendor_acknowledged"
    FIX_AVAILABLE = "fix_available"
    PUBLIC_DISCLOSURE = "public_disclosure"
    # Terminal states that close a finding without confirming it.
    FALSE_POSITIVE = "false_positive"
    DUPLICATE = "duplicate"
    NOT_A_SECURITY_ISSUE = "not_a_security_issue"
    OUT_OF_SCOPE = "out_of_scope"


class ScanStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
