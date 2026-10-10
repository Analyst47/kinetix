"""Database engine, sessions and tenant context.

Tenant isolation is enforced twice: every query in the service layer is scoped by
organization, and Postgres row-level security (see the initial migration) hides any
row whose org_id does not match the transaction's ``app.org_id`` setting. If the
application code ever forgets a filter, the database still refuses to leak data.

Per-user tables (a user's plan and AI usage) are isolated the same way by ``app.user_id``,
which is bound once the request's session cookie has been verified.
"""

import uuid
from collections.abc import Iterator
from datetime import datetime

from sqlalchemy import DateTime, MetaData, create_engine, event, func, text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    Session,
    SessionTransaction,
    mapped_column,
    sessionmaker,
)

from app.config import get_settings

NAMING = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING)


class Timestamped:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


engine = create_engine(get_settings().database_url, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)

ORG_KEY = "org_id"
USER_KEY = "user_id"


def set_tenant(session: Session, org_id: uuid.UUID | None) -> None:
    """Bind the session to an organization. Re-applied at the start of every transaction."""
    if org_id is None:
        session.info.pop(ORG_KEY, None)
    else:
        session.info[ORG_KEY] = str(org_id)
    _apply_tenant(session, session.connection())


def set_user(session: Session, user_id: uuid.UUID | None) -> None:
    """Bind the session to the authenticated user, for per-user tables. Re-applied at the start
    of every transaction, like the tenant."""
    if user_id is None:
        session.info.pop(USER_KEY, None)
    else:
        session.info[USER_KEY] = str(user_id)
    _apply_tenant(session, session.connection())


def _apply_tenant(session: Session, conn: Connection) -> None:
    # is_local=true scopes the settings to the current transaction, so a pooled
    # connection can never carry one tenant's (or user's) context into another request.
    conn.execute(
        text("select set_config('app.org_id', :o, true), set_config('app.user_id', :u, true)"),
        {"o": session.info.get(ORG_KEY, ""), "u": session.info.get(USER_KEY, "")},
    )


@event.listens_for(Session, "after_begin")
def _on_begin(session: Session, transaction: SessionTransaction, conn: Connection) -> None:
    if session.info.get(ORG_KEY) or session.info.get(USER_KEY):
        _apply_tenant(session, conn)


def get_db() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
