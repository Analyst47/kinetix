"""OSV.dev client: batch-match packages to advisories, then fetch and normalize each advisory."""

import contextlib
import re
from dataclasses import dataclass, field
from datetime import datetime

import httpx

from app.config import get_settings
from app.errors import ApiError
from app.models.enums import Severity
from app.scanners.lockfiles import Package
from app.services.cvss import score_vector

BATCH = 500
_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{1,99}")

_GHSA_SEVERITY = {
    "CRITICAL": Severity.CRITICAL,
    "HIGH": Severity.HIGH,
    "MODERATE": Severity.MEDIUM,
    "MEDIUM": Severity.MEDIUM,
    "LOW": Severity.LOW,
}


@dataclass
class NormalizedAdvisory:
    id: str
    aliases: list[str]
    summary: str
    details: str
    severity: Severity | None
    cvss_vector: str | None
    cwe_ids: list[str]
    references: list[str]
    published_at: datetime | None
    modified_at: datetime | None
    # (ecosystem, package name) -> (affected range text, fixed version)
    ranges: dict[tuple[str, str], tuple[str, str | None]] = field(default_factory=dict)


def _dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def normalize(raw: dict) -> NormalizedAdvisory:
    severity = _GHSA_SEVERITY.get(
        str((raw.get("database_specific") or {}).get("severity", "")).upper()
    )
    vector = None
    for entry in raw.get("severity") or []:
        if entry.get("type") in ("CVSS_V4", "CVSS_V3") and isinstance(entry.get("score"), str):
            vector = entry["score"]
            if severity is None:
                with contextlib.suppress(ApiError, ValueError):
                    severity = Severity(score_vector(vector).severity.lower())
            if entry.get("type") == "CVSS_V4":
                break
    ranges: dict[tuple[str, str], tuple[str, str | None]] = {}
    for affected in raw.get("affected") or []:
        pkg = affected.get("package") or {}
        key = (pkg.get("ecosystem", ""), pkg.get("name", ""))
        parts, fixed = [], None
        for rng in affected.get("ranges") or []:
            for event in rng.get("events") or []:
                if "introduced" in event:
                    parts.append(f">= {event['introduced']}")
                if "fixed" in event:
                    parts.append(f"< {event['fixed']}")
                    fixed = event["fixed"]
                if "last_affected" in event:
                    parts.append(f"<= {event['last_affected']}")
        text = ", ".join(p for p in parts if p != ">= 0") or "all versions"
        ranges[key] = (text[:200], fixed)
    return NormalizedAdvisory(
        id=raw["id"],
        aliases=[a for a in raw.get("aliases") or [] if isinstance(a, str)],
        summary=(raw.get("summary") or "")[:1000],
        details=(raw.get("details") or "")[:10000],
        severity=severity,
        cvss_vector=vector,
        cwe_ids=list((raw.get("database_specific") or {}).get("cwe_ids") or []),
        references=[
            r["url"] for r in raw.get("references") or [] if isinstance(r, dict) and "url" in r
        ][:50],
        published_at=_dt(raw.get("published")),
        modified_at=_dt(raw.get("modified")),
        ranges=ranges,
    )


class OsvClient:
    def __init__(self, client: httpx.Client | None = None):
        self.base = get_settings().osv_api_url
        self.client = client or httpx.Client(timeout=30)

    def match(self, packages: list[Package]) -> dict[int, list[str]]:
        """Return {index into packages: [advisory ids]}."""
        hits: dict[int, list[str]] = {}
        for start in range(0, len(packages), BATCH):
            chunk = packages[start : start + BATCH]
            body = {
                "queries": [
                    {"package": {"ecosystem": p.ecosystem, "name": p.name}, "version": p.version}
                    for p in chunk
                ]
            }
            resp = self.client.post(f"{self.base}/querybatch", json=body)
            resp.raise_for_status()
            for i, result in enumerate(resp.json().get("results", [])):
                ids = [v["id"] for v in result.get("vulns") or [] if "id" in v]
                if ids:
                    hits[start + i] = ids
        return hits

    def fetch(self, advisory_id: str) -> NormalizedAdvisory:
        if not _ID.fullmatch(advisory_id):
            raise ValueError(f"unexpected advisory id {advisory_id!r}")
        resp = self.client.get(f"{self.base}/vulns/{advisory_id}")
        resp.raise_for_status()
        return normalize(resp.json())
