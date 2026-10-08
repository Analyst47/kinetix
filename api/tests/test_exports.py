"""CVE 5.1, OSV and PDF export of a finding, and the Aegis training-dataset export."""

import json

from tests.conftest import create_finding, create_project, register

CVSS = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"


def _finding(client, org, **overrides):
    f = create_finding(client, org, **overrides)
    base = f"/api/v1/orgs/{org}/projects/juice-shop/findings/{f['public_id']}"
    client.patch(base, json={"cvss_vector": CVSS, "description": "User input reaches raw SQL."})
    return f["public_id"], base


def _export(client, base, fmt):
    return client.post(f"{base}/report/export", json={"format": fmt})


def test_cve_record_is_valid_5_1_and_marks_the_missing_id(client):
    org = register(client)
    create_project(client, org)
    _, base = _finding(client, org, cwe="CWE-89", reference="https://github.com/acme/app")
    r = _export(client, base, "cve")
    assert r.status_code == 200 and r.headers["content-type"].startswith("application/json")
    assert r.headers["content-disposition"].endswith('-cve.json"')
    rec = json.loads(r.content)
    assert rec["dataType"] == "CVE_RECORD" and rec["dataVersion"] == "5.1"
    # No disclosure yet, so the ID is a placeholder that can't be submitted by accident.
    assert rec["cveMetadata"]["cveId"] == "CVE-NEEDS-ID"
    assert rec["cveMetadata"]["state"] == "RESERVED" and "x_note" in rec["cveMetadata"]
    cna = rec["containers"]["cna"]
    assert cna["problemTypes"][0]["descriptions"][0]["cweId"] == "CWE-89"
    assert cna["metrics"][0]["cvssV3_1"]["baseScore"] == 9.8
    assert cna["metrics"][0]["cvssV3_1"]["baseSeverity"] == "CRITICAL"
    assert {"url": "https://github.com/acme/app"} in cna["references"]


def test_osv_record_has_summary_severity_and_stable_id(client):
    org = register(client)
    create_project(client, org)
    public_id, base = _finding(client, org, cwe="CWE-79")
    rec = json.loads(_export(client, base, "osv").content)
    assert rec["id"] == f"KINETIX-{public_id}"
    assert rec["schema_version"].startswith("1.")
    assert rec["severity"][0]["type"] == "CVSS_V3" and rec["severity"][0]["score"] == CVSS
    assert rec["database_specific"]["cwe"] == "CWE-79"


def test_pdf_export_is_a_real_pdf_and_is_recorded_in_custody(client):
    org = register(client)
    create_project(client, org)
    _id, base = _finding(client, org)
    r = _export(client, base, "pdf")
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    assert r.content[:5] == b"%PDF-" and len(r.content) > 1000
    assert r.headers["content-disposition"].endswith('-report.pdf"')
    sha = r.headers["X-Report-SHA256"]
    import hashlib

    assert hashlib.sha256(r.content).hexdigest() == sha
    events = client.get(f"/api/v1/orgs/{org}/audit").json()
    exp = next(e for e in events if e["action"] == "report.exported")
    assert exp["data"] == {"format": "pdf", "sha256": sha, "draft": True}


def test_dataset_export_labels_each_finding_with_the_verdict(client):
    org = register(client)
    create_project(client, org)
    keep_id, _ = _finding(client, org, title="Real SQLi", cwe="CWE-89", line=4)
    fp = create_finding(client, org, title="Noise", cwe="CWE-89", line=9)
    fp_base = f"/api/v1/orgs/{org}/projects/juice-shop/findings/{fp['public_id']}"
    assert (
        client.post(f"{fp_base}/transitions", json={"status": "false_positive"}).status_code == 200
    )

    r = client.post(f"/api/v1/orgs/{org}/projects/juice-shop/export/dataset")
    assert r.status_code == 200 and r.headers["content-type"] == "application/x-ndjson"
    assert r.headers["X-Dataset-Count"] == "2"
    rows = [json.loads(line) for line in r.content.decode().splitlines()]
    assert len(rows) == 2
    by_id = {row["finding_id"]: row for row in rows}
    real = by_id[keep_id]
    assert real["features"]["cwe"] == "CWE-89" and real["features"]["cvss_score"] == 9.8
    assert real["features"]["file_ext"] == "ts"
    assert real["label"]["is_false_positive"] is False
    noise = by_id[fp["public_id"]]
    assert noise["label"]["status"] == "false_positive"
    assert noise["label"]["is_false_positive"] is True and noise["label"]["resolved"] is True

    events = client.get(f"/api/v1/orgs/{org}/audit").json()
    exp = next(e for e in events if e["action"] == "dataset.exported")
    assert exp["data"]["findings"] == 2 and exp["data"]["sha256"] == r.headers["X-Dataset-SHA256"]
