"""Refuses to serve when the database connection would silently bypass tenant isolation."""

import logging

from sqlalchemy import Connection, text

log = logging.getLogger("kinetix.db")


def rls_bypass_reason(conn: Connection) -> str | None:
    row = conn.execute(
        text("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user")
    ).one()
    if row.rolsuper:
        return "the database user is a superuser"
    if row.rolbypassrls:
        return "the database user has BYPASSRLS"
    return None


def enforce(conn: Connection, *, production: bool) -> None:
    reason = rls_bypass_reason(conn)
    if reason is None:
        return
    message = (
        f"Row-level security would not apply: {reason}. Connect the API as a restricted role "
        "(KINETIX_DATABASE_URL) and run migrations as the owner (KINETIX_MIGRATION_DATABASE_URL)."
    )
    if production:
        raise RuntimeError(message)
    log.warning(message)
