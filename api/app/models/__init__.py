from app.models.audit import AuditEvent
from app.models.billing import UserPlan
from app.models.identity import (
    AuthSession,
    Invitation,
    Membership,
    MfaChallenge,
    Organization,
    PasswordReset,
    RecoveryCode,
    User,
)
from app.models.research import (
    Advisory,
    AiRun,
    Dependency,
    DependencyAdvisory,
    Disclosure,
    DisclosureEvent,
    Evidence,
    Finding,
    Project,
    Scan,
    Target,
)

# Tables that carry org_id and are protected by row-level security. (user_plans is isolated
# per user instead, on app.user_id; see its migration.)
TENANT_TABLES = (
    "projects",
    "targets",
    "scans",
    "findings",
    "evidence",
    "dependencies",
    "dependency_advisories",
    "audit_events",
    "disclosures",
    "disclosure_events",
    "ai_runs",
)

__all__ = [
    "TENANT_TABLES",
    "Advisory",
    "AiRun",
    "AuditEvent",
    "AuthSession",
    "Dependency",
    "DependencyAdvisory",
    "Disclosure",
    "DisclosureEvent",
    "Evidence",
    "Finding",
    "Invitation",
    "Membership",
    "MfaChallenge",
    "Organization",
    "PasswordReset",
    "Project",
    "RecoveryCode",
    "Scan",
    "Target",
    "User",
    "UserPlan",
]
