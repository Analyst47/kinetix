import os
import tempfile
from collections.abc import Iterator

from sqlalchemy import create_engine, make_url, text

# The test database URL is an owner/admin connection, used for setup and cleanup only. Tests
# run the app as a restricted role, exactly as production does: superusers and BYPASSRLS roles
# skip row-level security, so testing as one would hide isolation bugs.
ADMIN_DB = os.environ.get(
    "KINETIX_TEST_DATABASE_URL", "postgresql+psycopg://kinetix:kinetix@localhost:5432/kinetix_test"
)
APP_ROLE = "kinetix_app_test"
TEST_DB = (
    make_url(ADMIN_DB)
    .set(username=APP_ROLE, password=APP_ROLE)
    .render_as_string(hide_password=False)
)
admin_engine = create_engine(ADMIN_DB)
with admin_engine.begin() as _conn:
    if not _conn.execute(
        text("SELECT 1 FROM pg_roles WHERE rolname = :r"), {"r": APP_ROLE}
    ).first():
        _conn.execute(
            text(
                f"CREATE ROLE {APP_ROLE} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE "
                f"PASSWORD '{APP_ROLE}'"
            )
        )
os.environ["KINETIX_DATABASE_URL"] = TEST_DB
os.environ["KINETIX_MIGRATION_DATABASE_URL"] = ADMIN_DB
os.environ["KINETIX_DB_APP_ROLE"] = APP_ROLE
os.environ["KINETIX_STORAGE_DIR"] = tempfile.mkdtemp(prefix="kinetix-test-storage-")
os.environ["KINETIX_SCAN_MODE"] = "inline"

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.email import MemoryMailer, set_mailer  # noqa: E402
from app.main import app  # noqa: E402
from app.security.ratelimit import (  # noqa: E402
    account_limiter,
    login_limiter,
    register_limiter,
    reset_email_limiter,
    reset_request_limiter,
)

TABLES = (
    "ai_runs, disclosure_events, disclosures, dependency_advisories, dependencies, advisories, "
    "evidence, findings, scans, targets, "
    "projects, audit_events, invitations, recovery_codes, mfa_challenges, memberships, "
    "auth_sessions, password_resets, user_plans, organizations, users"
)


@pytest.fixture(scope="session", autouse=True)
def migrated() -> None:
    with admin_engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option(
        "script_location", os.path.join(os.path.dirname(__file__), "..", "migrations")
    )
    cfg.attributes["database_url"] = ADMIN_DB
    command.upgrade(cfg, "head")


@pytest.fixture(autouse=True)
def outbox() -> Iterator[MemoryMailer]:
    """Every test captures email instead of printing or sending it."""
    mailer = MemoryMailer()
    set_mailer(mailer)
    yield mailer
    set_mailer(None)


@pytest.fixture(autouse=True)
def clean() -> Iterator[None]:
    for limiter in (
        login_limiter,
        account_limiter,
        register_limiter,
        reset_request_limiter,
        reset_email_limiter,
    ):
        limiter.reset()
    yield
    with admin_engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {TABLES} RESTART IDENTITY CASCADE"))


class ApiClient(TestClient):
    """A browser-like client: keeps cookies and echoes the CSRF cookie on unsafe requests."""

    def request(self, method, url, **kwargs):  # type: ignore[override]
        if method.upper() in {"POST", "PUT", "PATCH", "DELETE"}:
            token = self.cookies.get("kx_csrf")
            if token is None:
                token = super().request("GET", "/api/v1/auth/csrf").json()["csrf_token"]
            headers = dict(kwargs.pop("headers", None) or {})
            headers.setdefault("X-CSRF-Token", token)
            kwargs["headers"] = headers
        return super().request(method, url, **kwargs)


@pytest.fixture
def client() -> Iterator[ApiClient]:
    with ApiClient(app, base_url="http://testserver") as c:
        yield c


def make_client() -> ApiClient:
    return ApiClient(app, base_url="http://testserver")


@pytest.fixture
def db() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session


PASSWORD = "correct horse battery staple"


def register(c: ApiClient, email: str = "fahim@example.com", org: str = "Fahim's lab") -> str:
    r = c.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "name": "Fahim Abrar",
            "password": PASSWORD,
            "organization_name": org,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()["organizations"][0]["slug"]


PROJECT = {
    "slug": "juice-shop",
    "name": "OWASP Juice Shop",
    "authorization_type": "open_source",
    "in_scope": "Source repository juice-shop at v17.1.1",
    "out_of_scope": "Any hosted deployment",
    "attest": True,
}


def create_project(c: ApiClient, org: str, **overrides) -> dict:
    r = c.post(f"/api/v1/orgs/{org}/projects", json={**PROJECT, **overrides})
    assert r.status_code == 201, r.text
    return r.json()


def create_finding(c: ApiClient, org: str, project: str = "juice-shop", **overrides) -> dict:
    body = {
        "title": "Potential SQL injection in login handler",
        "severity": "critical",
        "cwe": "CWE-89",
        "file_path": "routes/login.ts",
        "line": 34,
        **overrides,
    }
    r = c.post(f"/api/v1/orgs/{org}/projects/{project}/findings", json=body)
    assert r.status_code == 201, r.text
    return r.json()
