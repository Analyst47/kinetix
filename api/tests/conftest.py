import os
import tempfile
from collections.abc import Iterator

TEST_DB = os.environ.get(
    "KINETIX_TEST_DATABASE_URL", "postgresql+psycopg://kinetix:kinetix@localhost:5432/kinetix_test"
)
os.environ["KINETIX_DATABASE_URL"] = TEST_DB
os.environ["KINETIX_STORAGE_DIR"] = tempfile.mkdtemp(prefix="kinetix-test-storage-")
os.environ["KINETIX_SCAN_MODE"] = "inline"

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.db import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.security.ratelimit import login_limiter, register_limiter  # noqa: E402

TABLES = (
    "dependency_advisories, dependencies, advisories, evidence, findings, scans, targets, "
    "projects, audit_events, invitations, recovery_codes, mfa_challenges, memberships, "
    "auth_sessions, organizations, users"
)


@pytest.fixture(scope="session", autouse=True)
def migrated() -> None:
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option(
        "script_location", os.path.join(os.path.dirname(__file__), "..", "migrations")
    )
    cfg.attributes["database_url"] = TEST_DB
    command.upgrade(cfg, "head")


@pytest.fixture(autouse=True)
def clean() -> Iterator[None]:
    login_limiter.reset()
    register_limiter.reset()
    yield
    with engine.begin() as conn:
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
