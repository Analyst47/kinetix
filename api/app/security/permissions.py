"""Role-based access control. Roles map to explicit permission sets; nothing is implied."""

from enum import StrEnum

from app.models.enums import Role


class Permission(StrEnum):
    PROJECT_READ = "project:read"
    PROJECT_CREATE = "project:create"
    TARGET_WRITE = "target:write"
    SCAN_START = "scan:start"
    FINDING_WRITE = "finding:write"
    FINDING_CONFIRM = "finding:confirm"
    FINDING_CLOSE = "finding:close"
    EVIDENCE_WRITE = "evidence:write"
    AUDIT_READ = "audit:read"
    MEMBERS_MANAGE = "members:manage"


_READ = {Permission.PROJECT_READ}
_RESEARCH = _READ | {
    Permission.TARGET_WRITE,
    Permission.SCAN_START,
    Permission.FINDING_WRITE,
    Permission.FINDING_CONFIRM,
    Permission.FINDING_CLOSE,
    Permission.EVIDENCE_WRITE,
}

ROLE_PERMISSIONS: dict[Role, frozenset[Permission]] = {
    Role.VIEWER: frozenset(_READ),
    # Reviewers check other people's work: they can close findings as false positives
    # or duplicates and read the audit log, but cannot create or confirm findings.
    Role.REVIEWER: frozenset(_READ | {Permission.FINDING_CLOSE, Permission.AUDIT_READ}),
    Role.RESEARCHER: frozenset(_RESEARCH),
    Role.ADMIN: frozenset(
        _RESEARCH | {Permission.PROJECT_CREATE, Permission.AUDIT_READ, Permission.MEMBERS_MANAGE}
    ),
    Role.OWNER: frozenset(Permission),
}

# Researchers may create projects too; listed separately so the intent is explicit.
ROLE_PERMISSIONS[Role.RESEARCHER] = ROLE_PERMISSIONS[Role.RESEARCHER] | {Permission.PROJECT_CREATE}


def has_permission(role: Role, permission: Permission) -> bool:
    return permission in ROLE_PERMISSIONS[role]
