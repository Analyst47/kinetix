import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, Timestamped
from app.models.enums import (
    AuthorizationType,
    FindingSource,
    FindingStatus,
    ScanStatus,
    Severity,
    TargetKind,
)
from app.models.identity import User, _enum


def _org_fk() -> Mapped[uuid.UUID]:
    return mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )


class Project(Timestamped, Base):
    """The unit of research. Cannot exist without a recorded authorization attestation."""

    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = _org_fk()
    slug: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)

    # Authorization boundary. The attestation text is stored verbatim as the researcher saw it.
    authorization_type: Mapped[AuthorizationType] = mapped_column(
        _enum(AuthorizationType), nullable=False
    )
    in_scope: Mapped[str] = mapped_column(Text, nullable=False)
    out_of_scope: Mapped[str] = mapped_column(Text, default="", nullable=False)
    authorization_reference: Mapped[str | None] = mapped_column(String(500))
    attestation_text: Mapped[str] = mapped_column(Text, nullable=False)
    attested_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    attested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    authorization_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    attested_by: Mapped[User] = relationship(lazy="joined")

    __table_args__ = (UniqueConstraint("org_id", "slug", name="uq_projects_org_slug"),)


class Target(Timestamped, Base):
    __tablename__ = "targets"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = _org_fk()
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    kind: Mapped[TargetKind] = mapped_column(_enum(TargetKind), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    locator: Mapped[str] = mapped_column(String(500), nullable=False)
    version: Mapped[str | None] = mapped_column(String(100))
    commit: Mapped[str | None] = mapped_column(String(64))
    archive_sha256: Mapped[str | None] = mapped_column(String(64))


class Scan(Timestamped, Base):
    __tablename__ = "scans"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = _org_fk()
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    target_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("targets.id", ondelete="CASCADE"), nullable=False
    )
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[ScanStatus] = mapped_column(_enum(ScanStatus), nullable=False)
    analyzers: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    stats: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    error: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)


class Finding(Timestamped, Base):
    __tablename__ = "findings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = _org_fk()
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    scan_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("scans.id", ondelete="SET NULL"))
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    severity: Mapped[Severity] = mapped_column(_enum(Severity), nullable=False)
    status: Mapped[FindingStatus] = mapped_column(_enum(FindingStatus), nullable=False)
    source: Mapped[FindingSource] = mapped_column(_enum(FindingSource), nullable=False)
    cwe: Mapped[str | None] = mapped_column(String(16))
    cvss_vector: Mapped[str | None] = mapped_column(String(200))
    cvss_score: Mapped[Decimal | None] = mapped_column(Numeric(3, 1))
    file_path: Mapped[str | None] = mapped_column(String(1000))
    line: Mapped[int | None] = mapped_column(Integer)
    rule_id: Mapped[str | None] = mapped_column(String(200))
    reference: Mapped[str | None] = mapped_column(String(200))
    fingerprint: Mapped[str | None] = mapped_column(String(64), index=True)
    reproduction: Mapped[str] = mapped_column(Text, default="", nullable=False)
    remediation: Mapped[str] = mapped_column(Text, default="", server_default="", nullable=False)
    duplicate_of_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("findings.id"))
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    confirmed_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    assignee: Mapped[User | None] = relationship(foreign_keys=[assignee_id], lazy="joined")

    __table_args__ = (UniqueConstraint("org_id", "number", name="uq_findings_org_number"),)

    @property
    def public_id(self) -> str:
        return f"FND-{self.number:06d}"


class Evidence(Timestamped, Base):
    __tablename__ = "evidence"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = _org_fk()
    finding_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("findings.id", ondelete="CASCADE"), index=True, nullable=False
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), nullable=False)
    size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    note: Mapped[str] = mapped_column(Text, default="", nullable=False)
    uploaded_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)

    uploaded_by: Mapped[User] = relationship(lazy="joined")


class Dependency(Timestamped, Base):
    __tablename__ = "dependencies"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = _org_fk()
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    scan_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("scans.id", ondelete="SET NULL"))
    ecosystem: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    version: Mapped[str] = mapped_column(String(100), nullable=False)
    direct: Mapped[bool] = mapped_column(default=False, nullable=False)
    license: Mapped[str | None] = mapped_column(String(120))
    manifest: Mapped[str] = mapped_column(String(500), nullable=False)
    finding_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("findings.id", ondelete="SET NULL")
    )

    advisories: Mapped[list["DependencyAdvisory"]] = relationship(
        lazy="selectin", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint(
            "project_id",
            "ecosystem",
            "name",
            "version",
            "manifest",
            name="uq_dependencies_identity",
        ),
    )


class Advisory(Base):
    """Public vulnerability intelligence (OSV, NVD, GHSA). Shared across tenants; not RLS-scoped."""

    __tablename__ = "advisories"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    aliases: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    summary: Mapped[str] = mapped_column(Text, default="", nullable=False)
    details: Mapped[str] = mapped_column(Text, default="", nullable=False)
    severity: Mapped[Severity | None] = mapped_column(_enum(Severity))
    cvss_vector: Mapped[str | None] = mapped_column(String(200))
    cwe_ids: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    references: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    modified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    @property
    def display_id(self) -> str:
        cve = next((a for a in self.aliases if a.startswith("CVE-")), None)
        return cve or self.id


class DependencyAdvisory(Base):
    __tablename__ = "dependency_advisories"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = _org_fk()
    dependency_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("dependencies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    advisory_id: Mapped[str] = mapped_column(ForeignKey("advisories.id"), nullable=False)
    affected_range: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    fixed_version: Mapped[str | None] = mapped_column(String(100))

    advisory: Mapped[Advisory] = relationship(lazy="joined")


class Disclosure(Timestamped, Base):
    """Coordinated disclosure of one confirmed finding to its vendor."""

    __tablename__ = "disclosures"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = _org_fk()
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    finding_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("findings.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    vendor_name: Mapped[str] = mapped_column(String(200), nullable=False)
    contact: Mapped[str] = mapped_column(String(500), nullable=False)
    contact_source: Mapped[str] = mapped_column(String(32), nullable=False)
    channel: Mapped[str] = mapped_column(String(32), nullable=False)
    policy_url: Mapped[str | None] = mapped_column(String(500))
    deadline_days: Mapped[int] = mapped_column(Integer, nullable=False)
    notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deadline_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    stage: Mapped[str] = mapped_column(String(32), nullable=False)
    cve_id: Mapped[str | None] = mapped_column(String(32))
    advisory_url: Mapped[str | None] = mapped_column(String(500))
    created_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    events: Mapped[list["DisclosureEvent"]] = relationship(
        lazy="selectin", order_by="DisclosureEvent.occurred_at", cascade="all, delete-orphan"
    )


class DisclosureEvent(Timestamped, Base):
    __tablename__ = "disclosure_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = _org_fk()
    disclosure_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("disclosures.id", ondelete="CASCADE"), index=True, nullable=False
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    note: Mapped[str] = mapped_column(Text, default="", nullable=False)
    data: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    created_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)

    created_by: Mapped[User] = relationship(lazy="joined")


class AiRun(Base):
    """One request to the AI assistant and its validated output. Advisory only."""

    __tablename__ = "ai_runs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = _org_fk()
    finding_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("findings.id", ondelete="CASCADE"), index=True, nullable=False
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    question: Mapped[str | None] = mapped_column(Text)
    output: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    input_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    injection_signals: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    created_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    created_by: Mapped[User] = relationship(lazy="joined")
