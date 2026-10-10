"""Semgrep adapter. Runs the KinetixZero rule pack and normalizes results.

Semgrep runs as a subprocess with no shell, a fixed argument list, a timeout and
``--metrics=off``. Only KinetixZero's own rule files are used: configuration found inside
the analyzed repository is never loaded, so a hostile repo can't change the rules.
"""

import json
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from app.models.enums import Confidence, Severity

RULES_DIR = Path(__file__).resolve().parent.parent.parent / "rules"
TIMEOUT_SECONDS = 600

_SEVERITY = {"ERROR": Severity.HIGH, "WARNING": Severity.MEDIUM, "INFO": Severity.LOW}


@dataclass(frozen=True)
class SastMatch:
    rule_id: str
    title: str
    message: str
    severity: Severity
    cwe: str | None
    file_path: str
    line: int
    confidence: Confidence = Confidence.TENTATIVE
    # Where attacker-controlled input enters, for taint findings: "file:line".
    taint_source: str | None = None


def available() -> bool:
    return shutil.which("semgrep") is not None


def parse(output: dict, root: Path) -> list[SastMatch]:
    matches = []
    for r in output.get("results", []):
        extra = r.get("extra", {})
        meta = extra.get("metadata", {}) or {}
        sev = meta.get("kinetix_severity")
        severity = (
            Severity(sev)
            if sev in {s.value for s in Severity}
            else _SEVERITY.get(extra.get("severity", ""), Severity.LOW)
        )
        cwe_raw = meta.get("cwe")
        cwe_first = cwe_raw[0] if isinstance(cwe_raw, list) and cwe_raw else cwe_raw
        cwe = cwe_first.split(":")[0].strip() if isinstance(cwe_first, str) else None
        path = Path(r.get("path", ""))
        try:
            rel = path.resolve().relative_to(root.resolve()).as_posix()
        except ValueError:
            rel = path.as_posix()
        conf = Confidence.FIRM if meta.get("kinetix_confidence") == "firm" else Confidence.TENTATIVE
        source = _taint_source(extra, root) if conf is Confidence.FIRM else None
        message = extra.get("message", "")
        if source:
            message = f"{message}\n\nData-flow: attacker-controlled input enters at {source}."
        matches.append(
            SastMatch(
                # Semgrep prefixes local rule ids with the config path; our ids contain no dots.
                rule_id=str(r.get("check_id", "unknown")).rsplit(".", 1)[-1],
                title=meta.get("title") or extra.get("message", "")[:120],
                message=message,
                severity=severity,
                cwe=cwe if cwe and cwe.startswith("CWE-") else None,
                file_path=rel,
                line=int(r.get("start", {}).get("line", 1)),
                confidence=conf,
                taint_source=source,
            )
        )
    return matches


def _taint_source(extra: dict, root: Path) -> str | None:
    """The 'file:line' where tainted input enters, from Semgrep's dataflow trace."""
    trace = extra.get("dataflow_trace") or {}
    src = trace.get("taint_source") or trace.get("intermediate_vars")

    # taint_source is ["Loc", [ {location...}, "..." ]] in Semgrep JSON; dig out a location.
    def _loc(node: object) -> dict | None:
        if isinstance(node, dict) and "start" in node and "path" in node:
            return node
        if isinstance(node, list):
            for item in node:
                found = _loc(item)
                if found:
                    return found
        return None

    loc = _loc(src)
    if not loc:
        return None
    try:
        rel = Path(loc["path"]).resolve().relative_to(root.resolve()).as_posix()
    except (ValueError, KeyError, TypeError):
        rel = str(loc.get("path", "?"))
    line = loc.get("start", {}).get("line")
    return f"{rel}:{line}" if line else rel


# Replaces Semgrep's defaults, which would skip test/ directories where real issues also live.
KINETIX_SEMGREPIGNORE = "node_modules/\n.git/\ndist/\nbuild/\n*.min.js\n"
_REPO_IGNORE_FILES = (".semgrepignore", ".gitignore")


def run(root: Path) -> list[SastMatch]:
    exe = shutil.which("semgrep")
    if exe is None:
        raise FileNotFoundError("semgrep is not installed")
    # Scan a private copy that has every ignore file from the target removed and KinetixZero's own
    # .semgrepignore at its root. A hostile repository must not be able to hide files from
    # analysis or change which rules run.
    with tempfile.TemporaryDirectory(prefix="kx-sast-") as tmp:
        view = Path(tmp) / "src"
        shutil.copytree(
            root,
            view,
            symlinks=True,
            ignore=shutil.ignore_patterns(*_REPO_IGNORE_FILES, "node_modules", ".git"),
        )
        (view / ".semgrepignore").write_text(KINETIX_SEMGREPIGNORE)
        cmd = [
            exe, "scan", "--json", "--metrics=off", "--disable-version-check", "--quiet",
            "--config", str(RULES_DIR / "javascript.yaml"),
            "--config", str(RULES_DIR / "python.yaml"),
            "--dataflow-traces",
            "--timeout", "30", "--max-target-bytes", "2000000", ".",
        ]  # fmt: skip
        proc = subprocess.run(  # noqa: S603 - fixed argv, no shell
            cmd, capture_output=True, text=True, timeout=TIMEOUT_SECONDS, cwd=view, check=False
        )
        if proc.returncode not in (0, 1):
            raise RuntimeError(f"semgrep failed: {proc.stderr[-500:]}")
        return parse(json.loads(proc.stdout or "{}"), view)
