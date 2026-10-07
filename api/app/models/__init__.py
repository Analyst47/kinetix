from app.models.audit import AuditEvent
from app.models.identity import (
    AuthSession,
    Invitation,
    Membership,
    MfaChallenge,
    Organization,
    RecoveryCode,
    User,
)
from app.models.research import (
    Advisory,
    Dependency,
    DependencyAdvisory,
    Evidence,
    Finding,
    Project,
    Scan,
    Target,
)

# Tables that carry org_id and are protected by row-level security.
TENANT_TABLES = (
    "projects",
    "targets",
    "scans",
    "findings",
    "evidence",
    "dependencies",
    "dependency_advisories",
    "audit_events",
)

__all__ = [
    "TENANT_TABLES",
    "Advisory",
    "AuditEvent",
    "AuthSession",
    "Dependency",
    "DependencyAdvisory",
    "Evidence",
    "Finding",
    "Invitation",
    "Membership",
    "MfaChallenge",
    "Organization",
    "Project",
    "RecoveryCode",
    "Scan",
    "Target",
    "User",
]
