"""Turn a confirmed finding into submission-ready artifacts.

- ``to_cve_record``  — a CVE Record Format 5.1 JSON object, ready to hand to a CNA.
- ``to_osv``         — an OSV record for the open-source advisory databases.
- ``to_pdf``         — a self-contained PDF of the vulnerability report, for a disclosure.
- ``dataset_record`` — one labelled row (features + the researcher's verdict) for training.

The finding data comes from ``report.build``; none of these invent facts not already in it.
A CVE record has no real CVE ID until a CNA assigns one, so the ID is the disclosure's
assigned CVE when present, and otherwise a clearly-marked placeholder.
"""

from __future__ import annotations

import json
from pathlib import PurePosixPath
from typing import Any

from app.services.cvss import score_vector

CVE_PLACEHOLDER = "CVE-NEEDS-ID"


def _metric(vector: str) -> tuple[str, dict[str, Any]] | None:
    """A CVE-5.1 metric key and body for a CVSS vector, or None if it won't parse."""
    try:
        r = score_vector(vector)
    except Exception:
        return None
    body = {
        "version": r.version,
        "vectorString": r.vector,
        "baseScore": float(r.score),
        "baseSeverity": r.severity.upper(),
    }
    key = "cvssV4_0" if r.version.startswith("4") else f"cvssV{r.version.replace('.', '_')}"
    return key, body


def _repo_url(data: dict[str, Any]) -> str | None:
    ref = data.get("reference") or ""
    if (ref.startswith("https://") and "github.com" in ref) or "gitlab.com" in ref:
        return ref
    return None


def to_cve_record(data: dict[str, Any]) -> dict[str, Any]:
    """A CVE Record Format 5.1 object (https://cveproject.github.io/cve-schema/)."""
    disclosure = data.get("disclosure") or {}
    cve_id = disclosure.get("cve_id") or CVE_PLACEHOLDER
    product = data["product"]
    version = product.get("version") or "unspecified"
    affected: dict[str, Any] = {
        "vendor": disclosure.get("vendor") or product.get("name") or "unspecified",
        "product": product.get("target") or product.get("name") or "unspecified",
        "versions": [{"version": version, "status": "affected"}],
    }
    if product.get("commit"):
        affected["defaultStatus"] = "unknown"
        affected["versions"][0]["version"] = product["commit"]
        affected["versions"][0]["versionType"] = "git"
    repo = _repo_url(data)
    if repo:
        affected["collectionURL"] = repo
    if data.get("location"):
        affected["programFiles"] = [data["location"].split(":", 1)[0]]

    problem: dict[str, Any] = {"lang": "en", "description": data["title"], "type": "text"}
    if data.get("cwe"):
        problem.update(cweId=data["cwe"], type="CWE", description=f"{data['cwe']} {data['title']}")

    references = []
    for url in (repo, disclosure.get("advisory_url"), data.get("reference")):
        if url and url.startswith("https://") and {"url": url} not in references:
            references.append({"url": url})
    if not references:
        references.append({"url": "https://example.invalid/", "tags": ["x_placeholder"]})

    cna: dict[str, Any] = {
        "title": f"{data['title']} in {product.get('name', 'the product')}",
        "providerMetadata": {"shortName": "kinetix"},
        "descriptions": [{"lang": "en", "value": data["description"] or data["title"]}],
        "affected": [affected],
        "problemTypes": [{"descriptions": [problem]}],
        "references": references,
        "x_generator": {"engine": "Kinetix", "findingId": data["id"]},
    }
    if data.get("cvss") and (m := _metric(data["cvss"]["vector"])):
        cna["metrics"] = [{m[0]: m[1], "format": "CVSS"}]
    if data.get("researcher"):
        cna["credits"] = [{"lang": "en", "value": data["researcher"], "type": "finder"}]
    if data.get("remediation"):
        cna["solutions"] = [{"lang": "en", "value": data["remediation"]}]

    record: dict[str, Any] = {
        "dataType": "CVE_RECORD",
        "dataVersion": "5.1",
        "cveMetadata": {
            "cveId": cve_id,
            "assignerShortName": "kinetix",
            "state": "PUBLISHED" if disclosure.get("cve_id") else "RESERVED",
        },
        "containers": {"cna": cna},
    }
    if cve_id == CVE_PLACEHOLDER:
        # A CNA assigns the real ID; make the placeholder impossible to submit by accident.
        record["cveMetadata"]["x_note"] = (
            "No CVE ID is assigned yet. Request one from a CNA (or via a bug-bounty program), "
            "replace cveId, and set state to PUBLISHED before submitting."
        )
    return record


def to_osv(data: dict[str, Any]) -> dict[str, Any]:
    """An OSV record (https://ossf.github.io/osv-schema/)."""
    product = data["product"]
    affected: dict[str, Any] = {
        "package": {"name": product.get("target") or product.get("name") or "unspecified"},
    }
    repo = _repo_url(data)
    if repo and product.get("commit"):
        affected["ranges"] = [{"type": "GIT", "repo": repo, "events": [{"introduced": "0"}]}]
        affected["database_specific"] = {"commit": product["commit"]}
    elif product.get("version"):
        affected["versions"] = [product["version"]]

    severity = []
    if data.get("cvss") and (m := _metric(data["cvss"]["vector"])):
        kind = "CVSS_V4" if m[1]["version"].startswith("4") else "CVSS_V3"
        severity.append({"type": kind, "score": m[1]["vectorString"]})

    references = []
    for kind, url in (
        ("WEB", repo),
        ("ADVISORY", (data.get("disclosure") or {}).get("advisory_url")),
    ):
        if url and url.startswith("https://"):
            references.append({"type": kind, "url": url})

    record: dict[str, Any] = {
        "schema_version": "1.6.0",
        "id": f"KINETIX-{data['id']}",
        "summary": data["title"][:120],
        "details": data["description"] or data["title"],
        "affected": [affected],
        "database_specific": {
            "cwe": data.get("cwe"),
            "severity": data["severity"],
            "confidence": data.get("confidence"),
            "status": data["status"],
            "kinetix_finding": data["id"],
            "draft": data["draft"],
        },
    }
    if severity:
        record["severity"] = severity
    if references:
        record["references"] = references
    if data.get("disclosure", {}) and data["disclosure"].get("cve_id"):
        record["aliases"] = [data["disclosure"]["cve_id"]]
    return record


# ── PDF ───────────────────────────────────────────────────────────────────────

_INK = (27, 31, 30)
_MUTED = (110, 120, 118)
_RULE = (210, 214, 211)
_VG = (13, 107, 93)


def _pdf_text(value: object) -> str:
    """fpdf2's core fonts are latin-1 only; keep output readable without them."""
    s = "" if value is None else str(value)
    return (
        s.replace("’", "'")
        .replace("‘", "'")
        .replace("“", '"')
        .replace("”", '"')
        .replace("–", "-")
        .replace("—", "-")
        .replace("…", "...")
        .replace("→", "->")
        .encode("latin-1", "replace")
        .decode("latin-1")
    )


def to_pdf(data: dict[str, Any]) -> bytes:
    from fpdf import FPDF

    pdf = FPDF(format="A4", unit="mm")
    pdf.set_auto_page_break(True, margin=18)
    pdf.set_margins(18, 18, 18)
    pdf.add_page()
    width = pdf.epw

    def heading(text: str) -> None:
        pdf.ln(2)
        pdf.set_font("helvetica", "B", 12)
        pdf.set_text_color(*_INK)
        pdf.multi_cell(width, 6, _pdf_text(text))
        pdf.set_draw_color(*_RULE)
        pdf.line(pdf.l_margin, pdf.get_y(), pdf.l_margin + width, pdf.get_y())
        pdf.ln(1.5)

    def body(text: str) -> None:
        pdf.set_font("helvetica", "", 10)
        pdf.set_text_color(*_INK)
        pdf.multi_cell(width, 5, _pdf_text(text or "-"))
        pdf.ln(1)

    # Header. multi_cell leaves the cursor at the right edge, so reset x to the left margin
    # before each line or the next one wraps into a sliver off the page.
    pdf.set_font("helvetica", "B", 17)
    pdf.set_text_color(*_INK)
    pdf.multi_cell(width, 8, _pdf_text(f"{data['id']}: {data['title']}"))
    pdf.set_x(pdf.l_margin)
    pdf.set_font("helvetica", "", 9)
    pdf.set_text_color(*_MUTED)
    pdf.multi_cell(
        width,
        5,
        _pdf_text(
            f"Prepared for {data['organization']} - "
            f"generated {data['generated_at'][:19].replace('T', ' ')} UTC"
        ),
    )
    pdf.set_x(pdf.l_margin)
    if data["draft"]:
        pdf.ln(1)
        pdf.set_font("helvetica", "B", 9)
        pdf.set_text_color(176, 58, 46)
        pdf.multi_cell(width, 5, _pdf_text("DRAFT - this finding has not been confirmed."))
    pdf.ln(2)

    # Metadata table
    product = data["product"]
    version = product["version"] or "-"
    if product["commit"]:
        version += f" (commit {product['commit'][:12]})"
    rows = [
        ("Product", product["name"]),
        ("Affected version", version),
        ("Severity", data["severity"].capitalize()),
        (
            "CVSS",
            f"{data['cvss']['score']}  {data['cvss']['vector']}"
            if data["cvss"]
            else "Not assessed",
        ),
        ("CWE", data["cwe"] or "-"),
        ("Location", data["location"] or "-"),
        ("Researcher", data["researcher"] or "-"),
        ("Status", data["status"].replace("_", " ").capitalize()),
    ]
    pdf.set_font("helvetica", "", 10)
    for label, value in rows:
        y = pdf.get_y()
        pdf.set_text_color(*_MUTED)
        pdf.set_xy(pdf.l_margin, y)
        pdf.multi_cell(40, 5.5, _pdf_text(label), align="L")
        pdf.set_text_color(*_INK)
        pdf.set_xy(pdf.l_margin + 40, y)
        pdf.multi_cell(width - 40, 5.5, _pdf_text(value), align="L")

    heading("Summary")
    body(data["description"] or "No description provided.")

    if data["source"]:
        s = data["source"]
        heading("Technical details")
        pdf.set_font("courier", "", 8.5)
        pdf.set_fill_color(246, 247, 245)
        for i, line in enumerate(s["lines"]):
            n = s["start"] + i
            marker = ">" if n == s["highlight"] else " "
            pdf.set_text_color(*(_VG if n == s["highlight"] else _INK))
            pdf.set_x(pdf.l_margin)  # multi_cell leaves the cursor at the right edge
            pdf.multi_cell(
                width, 4.6, _pdf_text(f"{marker}{n:>5}  {line}"), fill=n == s["highlight"]
            )
        pdf.ln(1)

    heading("Reproduction")
    body(data["reproduction"] or "No reproduction steps recorded.")

    heading("Suggested remediation")
    body(data["remediation"] or "Describe the fix for this issue.")

    if data["evidence"]:
        heading("Evidence")
        for e in data["evidence"]:
            body(f"{e['filename']}  -  {e['size']} bytes  -  sha256:{e['sha256'][:24]}...")

    a = data["authorization"]
    heading("Authorization")
    body(f"Basis: {a['type'].replace('_', ' ')}")
    body(f"In scope: {a['in_scope']}")
    if a["out_of_scope"]:
        body(f"Out of scope: {a['out_of_scope']}")
    body(f'Attested by {a["attested_by"]} on {a["attested_at"][:10]}: "{a["attestation"]}"')

    if data.get("disclosure"):
        d = data["disclosure"]
        heading("Disclosure timeline")
        body(f"Vendor: {d['vendor']} ({d['contact']})")
        if d["cve_id"]:
            body(f"CVE: {d['cve_id']}")
        for e in d["events"]:
            note = f": {e['note']}" if e["note"] else ""
            body(f"{e['at'][:10]}  {e['kind'].replace('_', ' ')}{note}")

    heading("Chain of custody")
    pdf.set_font("courier", "", 7.5)
    pdf.set_text_color(*_MUTED)
    for e in data["custody"]:
        pdf.set_x(pdf.l_margin)  # multi_cell leaves the cursor at the right edge
        pdf.multi_cell(
            width,
            4,
            _pdf_text(
                f"{e['seq']:>3}  {e['at'][:19].replace('T', ' ')}  {e['action']:<22}  {e['hash'][:16]}..."
            ),
        )
    chain = data["chain"]
    pdf.ln(1)
    pdf.set_font("helvetica", "", 8)
    pdf.set_text_color(*(_VG if chain["verified"] else (176, 58, 46)))
    pdf.multi_cell(
        width,
        4.5,
        _pdf_text(
            f"Chain verified: all {chain['entries']} entries recompute from the first."
            if chain["verified"]
            else "Chain verification FAILED - entries may have been altered."
        ),
    )
    out = pdf.output()
    return bytes(out)


# ── Aegis training dataset ─────────────────────────────────────────────────────


def dataset_record(finding: Any, excerpt: list[str] | None) -> dict[str, Any]:
    """One labelled example: what the scanner saw, and the researcher's verdict.

    The verdict is the training signal. ``is_false_positive`` / ``is_confirmed`` are only
    meaningful once the researcher has triaged the finding (``resolved`` is True)."""
    status = finding.status.value
    ext = PurePosixPath(finding.file_path).suffix.lstrip(".") if finding.file_path else None
    return {
        "finding_id": finding.public_id,
        "features": {
            "title": finding.title,
            "source": finding.source.value,
            "cwe": finding.cwe,
            "rule_id": finding.rule_id,
            "severity": finding.severity.value,
            "confidence": finding.confidence.value,
            "file_ext": ext or None,
            "line": finding.line,
            "cvss_vector": finding.cvss_vector,
            "cvss_score": float(finding.cvss_score) if finding.cvss_score is not None else None,
            "has_reference": bool(finding.reference),
            "description_len": len(finding.description or ""),
            "has_reproduction": bool((finding.reproduction or "").strip()),
            "ai_verdict": finding.ai_verdict,
            "ai_confidence": finding.ai_confidence,
            "ai_input_controlled": (finding.ai_assessment or {}).get("input_controlled"),
            "ai_reaches_sink": (finding.ai_assessment or {}).get("reaches_sink"),
            "ai_sanitized": (finding.ai_assessment or {}).get("sanitized"),
            "code_excerpt": excerpt,
        },
        "label": {
            "status": status,
            "resolved": status not in ("discovered", "triage", "needs_validation"),
            "is_confirmed": status
            in (
                "confirmed",
                "reported",
                "vendor_acknowledged",
                "fix_available",
                "public_disclosure",
            ),
            "is_false_positive": status == "false_positive",
            # True/False once a human has judged it; None while still open. The clean target.
            "ground_truth_vulnerable": (
                True
                if status
                in (
                    "confirmed",
                    "reported",
                    "vendor_acknowledged",
                    "fix_available",
                    "public_disclosure",
                )
                else False
                if status in ("false_positive", "not_a_security_issue")
                else None
            ),
        },
    }


def dataset_to_jsonl(records: list[dict[str, Any]]) -> str:
    return "".join(json.dumps(r, separators=(",", ":")) + "\n" for r in records)
