import hashlib

from tests.conftest import create_finding, create_project, register


def _base(org: str) -> str:
    return f"/api/v1/orgs/{org}/projects/juice-shop/findings"


def test_project_requires_attestation(client):
    org = register(client)
    r = client.post(
        f"/api/v1/orgs/{org}/projects",
        json={
            "slug": "x",
            "name": "X",
            "authorization_type": "open_source",
            "in_scope": "repo",
            "attest": False,
        },
    )
    assert r.status_code == 422
    assert "authorized" in r.json()["error"]["message"]


def test_project_stores_attestation_verbatim(client):
    org = register(client)
    p = create_project(client, org)
    assert p["attestation_text"].startswith("I am authorized to analyze this target")
    assert p["attested_by"]["name"] == "Fahim Abrar"


def test_new_finding_gets_sequential_public_id_and_starts_discovered(client):
    org = register(client)
    create_project(client, org)
    first = create_finding(client, org)
    second = create_finding(client, org, title="Path traversal in file server", severity="high")
    assert first["public_id"] == "FND-000001"
    assert second["public_id"] == "FND-000002"
    assert first["status"] == "discovered"
    assert "confirmed" not in first["allowed_transitions"]


def test_list_sorts_by_severity_and_counts_statuses(client):
    org = register(client)
    create_project(client, org)
    create_finding(client, org, title="Low thing here", severity="low")
    create_finding(client, org, title="Critical thing", severity="critical")
    create_finding(client, org, title="Medium thing", severity="medium")
    page = client.get(_base(org)).json()
    assert [f["severity"] for f in page["items"]] == ["critical", "medium", "low"]
    assert page["status_counts"]["open"] == 3
    assert page["severity_counts"] == {"critical": 1, "medium": 1, "low": 1}
    filtered = client.get(_base(org), params={"severity": ["critical", "high"]}).json()
    assert filtered["total"] == 1


def test_illegal_transition_is_rejected_with_allowed_list(client):
    org = register(client)
    create_project(client, org)
    f = create_finding(client, org)
    r = client.post(f"{_base(org)}/{f['public_id']}/transitions", json={"status": "confirmed"})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "invalid_transition"
    assert "needs_validation" in r.json()["error"]["details"]["allowed"]


def test_confirmation_gate_requires_evidence_reproduction_and_cvss(client):
    org = register(client)
    create_project(client, org)
    f = create_finding(client, org)
    url = f"{_base(org)}/{f['public_id']}"
    client.post(f"{url}/transitions", json={"status": "needs_validation"})

    r = client.post(f"{url}/transitions", json={"status": "confirmed"})
    assert r.status_code == 409
    assert r.json()["error"]["details"]["missing"] == [
        "Evidence attached",
        "Reproduction steps written",
        "CVSS assessed",
    ]

    client.post(
        f"{url}/evidence", files={"file": ("request.txt", b"POST /rest/user/login", "text/plain")}
    )
    client.patch(url, json={"reproduction": "1. Send ' OR 1=1-- as email."})
    patched = client.patch(
        url, json={"cvss_vector": "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:N/SC:N/SI:N/SA:N"}
    ).json()
    assert patched["cvss_score"] == "9.3"
    assert all(item["done"] for item in patched["readiness"])

    r = client.post(f"{url}/transitions", json={"status": "confirmed"})
    assert r.status_code == 200
    assert r.json()["status"] == "confirmed"
    assert r.json()["confirmed_at"] is not None


def test_invalid_cvss_vector_is_rejected(client):
    org = register(client)
    create_project(client, org)
    f = create_finding(client, org)
    r = client.patch(f"{_base(org)}/{f['public_id']}", json={"cvss_vector": "CVSS:4.0/AV:Q"})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_cvss"


def test_duplicate_requires_original(client):
    org = register(client)
    create_project(client, org)
    a = create_finding(client, org)
    b = create_finding(client, org, title="Same SQL injection again")
    url = f"{_base(org)}/{b['public_id']}/transitions"
    assert client.post(url, json={"status": "duplicate"}).status_code == 422
    r = client.post(url, json={"status": "duplicate", "duplicate_of": a["public_id"]})
    assert r.status_code == 200
    # Closed findings can be reopened to triage only.
    assert r.json()["allowed_transitions"] == ["triage"]


def test_evidence_is_hashed_verified_and_served_as_download(client):
    org = register(client)
    create_project(client, org)
    f = create_finding(client, org)
    url = f"{_base(org)}/{f['public_id']}/evidence"
    payload = b"<script>alert(1)</script>"
    r = client.post(url, files={"file": ("../../etc/passwd.html", payload, "text/html")})
    assert r.status_code == 201, r.text
    ev = r.json()
    assert ev["sha256"] == hashlib.sha256(payload).hexdigest()
    assert ev["filename"] == "passwd.html"

    dl = client.get(f"{url}/{ev['id']}/download")
    assert dl.content == payload
    assert dl.headers["content-type"] == "application/octet-stream"
    assert dl.headers["content-disposition"].startswith("attachment")
    assert dl.headers["x-content-type-options"] == "nosniff"

    assert client.post(f"{url}/{ev['id']}/verify").json()["verified"] is True


def test_custody_chain_lists_events_and_verifies(client):
    org = register(client)
    create_project(client, org)
    f = create_finding(client, org)
    url = f"{_base(org)}/{f['public_id']}"
    client.post(f"{url}/transitions", json={"status": "triage", "note": "Looks real"})
    client.post(f"{url}/evidence", files={"file": ("r.txt", b"x", "text/plain")})
    custody = client.get(f"{url}/custody").json()
    assert [e["action"] for e in custody["events"]] == [
        "evidence.attached",
        "finding.status_changed",
        "finding.created",
    ]
    assert custody["chain"]["verified"] is True
    events = custody["events"]
    assert events[0]["prev_hash"] == events[1]["hash"] or events[0]["seq"] > events[1]["seq"]


def test_safe_filename_strips_paths_and_control_characters():
    from app.services.storage import safe_filename

    assert safe_filename("..\\..\\boot.ini") == "boot.ini"
    assert safe_filename("a\x00b\x1f.txt") == "ab.txt"
    assert safe_filename("...") == "evidence.bin"
    assert safe_filename(None) == "evidence.bin"
