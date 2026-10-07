import io
import json
import uuid
import zipfile
from datetime import UTC, datetime

import httpx
from sqlalchemy import select

from app.db import SessionLocal
from app.models import Organization, Scan
from app.scanners.lockfiles import parse_npm_lock
from app.scanners.osv import OsvClient, normalize
from app.scanners.pipeline import run_scan
from tests.conftest import PROJECT, create_project, register

LOCK = {
    "name": "juice-shop",
    "lockfileVersion": 3,
    "packages": {
        "": {"dependencies": {"jsonwebtoken": "0.4.0", "express": "^4.21.2"}},
        "node_modules/jsonwebtoken": {"version": "0.4.0", "license": "MIT"},
        "node_modules/express": {"version": "4.21.2", "license": "MIT"},
        "node_modules/express/node_modules/ms": {"version": "2.0.0"},
    },
}

OSV_VULN = {
    "id": "GHSA-test-0001",
    "aliases": ["CVE-2015-9235"],
    "summary": "Verification bypass via algorithm confusion",
    "modified": "2024-01-01T00:00:00Z",
    "published": "2018-04-26T00:00:00Z",
    "database_specific": {"severity": "CRITICAL", "cwe_ids": ["CWE-327"]},
    "affected": [
        {
            "package": {"ecosystem": "npm", "name": "jsonwebtoken"},
            "ranges": [{"type": "SEMVER", "events": [{"introduced": "0"}, {"fixed": "4.2.2"}]}],
        }
    ],
    "references": [{"type": "ADVISORY", "url": "https://nvd.nist.gov/vuln/detail/CVE-2015-9235"}],
}

FAKE_KEY = "-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----\n"


def fake_osv() -> OsvClient:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/querybatch"):
            queries = json.loads(request.content)["queries"]
            return httpx.Response(
                200,
                json={
                    "results": [
                        {"vulns": [{"id": "GHSA-test-0001"}]}
                        if q["package"]["name"] == "jsonwebtoken"
                        else {}
                        for q in queries
                    ]
                },
            )
        if request.url.path.endswith("/vulns/GHSA-test-0001"):
            return httpx.Response(200, json=OSV_VULN)
        return httpx.Response(404)

    return OsvClient(
        httpx.Client(transport=httpx.MockTransport(handler), base_url="https://osv.test")
    )


def _archive(files: dict[str, str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, content in files.items():
            zf.writestr(name, content)
    return buf.getvalue()


def _upload(client, org, files) -> dict:
    r = client.post(
        f"/api/v1/orgs/{org}/projects/juice-shop/targets/archive",
        data={"name": "juice-shop", "version": "17.1.1", "commit": "3f2c9e1"},
        files={"file": ("juice-shop.zip", _archive(files), "application/zip")},
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_hostile_archive_is_rejected_at_upload(client):
    org = register(client)
    create_project(client, org)
    r = client.post(
        f"/api/v1/orgs/{org}/projects/juice-shop/targets/archive",
        data={"name": "evil"},
        files={"file": ("evil.zip", _archive({"../../escape.sh": "x"}), "application/zip")},
    )
    assert r.status_code == 422
    assert "escapes the archive root" in r.json()["error"]["message"]


def test_expired_authorization_blocks_new_targets_and_scans(client):
    org = register(client)
    create_project(client, org)
    target = _upload(client, org, {"a.txt": "x"})
    with SessionLocal() as db:
        from app.db import set_tenant
        from app.models import Project

        set_tenant(db, db.scalar(select(Organization.id).where(Organization.slug == org)))
        project = db.scalar(select(Project))
        project.authorization_expires_at = datetime(2020, 1, 1, tzinfo=UTC)
        db.commit()
    r = client.post(
        f"/api/v1/orgs/{org}/projects/juice-shop/scans", json={"target_id": target["id"]}
    )
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "authorization_expired"
    rejected = client.post(
        f"/api/v1/orgs/{org}/projects",
        json={**PROJECT, "slug": "old", "authorization_expires_at": "2020-01-01T00:00:00Z"},
    )
    assert rejected.status_code == 422


def test_full_pipeline_creates_dependencies_findings_and_dedupes(client):
    org = register(client)
    create_project(client, org)
    target = _upload(
        client,
        org,
        {
            "package-lock.json": json.dumps(LOCK),
            "lib/insecurity.ts": f"export const privateKey = `{FAKE_KEY}`\n",
            "test/fixtures/key.pem": FAKE_KEY,
        },
    )
    r = client.post(
        f"/api/v1/orgs/{org}/projects/juice-shop/scans",
        json={"target_id": target["id"], "analyzers": ["secrets"]},
    )
    assert r.status_code == 202

    with SessionLocal() as db:
        org_id = db.scalar(select(Organization.id).where(Organization.slug == org))
    # Run dependencies through the pipeline with a fake OSV backend.
    with SessionLocal() as db:
        from app.db import set_tenant

        set_tenant(db, org_id)
        scan = Scan(
            org_id=org_id,
            project_id=db.scalar(select(Scan.project_id)),
            target_id=uuid.UUID(target["id"]),
            number=99,
            status="queued",
            analyzers=["dependencies", "secrets"],
            stats={},
            created_by_id=db.scalar(select(Scan.created_by_id)),
        )
        db.add(scan)
        db.commit()
        done = run_scan(db, scan.id, org_id, osv=fake_osv())
        assert done.status.value == "succeeded", done.stats
        assert done.stats["dependencies"] == {
            "packages": 3,
            "vulnerable": 1,
            "advisories": 1,
            "findings": 1,
        }
        # Secrets were already found by the first scan; the second one must not duplicate them.
        assert done.stats["secrets"] == {"matches": 2, "findings": 0}

    findings = client.get(
        f"/api/v1/orgs/{org}/projects/juice-shop/findings", params={"status": "all"}
    ).json()
    by_source = {(f["source"], f["severity"]) for f in findings["items"]}
    assert ("dependency", "critical") in by_source
    assert ("secret", "high") in by_source  # lib/insecurity.ts
    assert ("secret", "info") in by_source  # test fixture is downgraded
    dep_finding = next(f for f in findings["items"] if f["source"] == "dependency")
    assert dep_finding["reference"] == "CVE-2015-9235"
    assert (
        "FIXED" not in dep_finding["description"] and "Fixed in 4.2.2" in dep_finding["description"]
    )
    assert FAKE_KEY not in json.dumps(findings)

    deps = client.get(f"/api/v1/orgs/{org}/projects/juice-shop/dependencies").json()
    assert deps["vulnerable"] == 1
    top = deps["items"][0]
    assert (top["name"], top["max_severity"], top["fixed_version"]) == (
        "jsonwebtoken",
        "critical",
        "4.2.2",
    )
    assert top["advisories"][0]["display_id"] == "CVE-2015-9235"
    assert top["finding_public_id"] == dep_finding["public_id"]
    ms = next(d for d in deps["items"] if d["name"] == "ms")
    assert ms["direct"] is False


def test_npm_lockfile_marks_direct_dependencies(tmp_path):
    path = tmp_path / "package-lock.json"
    path.write_text(json.dumps(LOCK))
    pkgs = {p.name: p for p in parse_npm_lock(path, tmp_path)}
    assert pkgs["jsonwebtoken"].direct and pkgs["express"].direct
    assert not pkgs["ms"].direct


def test_osv_normalization_maps_moderate_and_fixed_range():
    raw = {**OSV_VULN, "database_specific": {"severity": "MODERATE"}}
    adv = normalize(raw)
    assert adv.severity.value == "medium"
    assert adv.ranges[("npm", "jsonwebtoken")] == ("< 4.2.2", "4.2.2")
