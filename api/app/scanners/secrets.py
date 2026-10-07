"""Built-in secret detection. Uses gitleaks when it is installed; this is the fallback.

Matches are reported by location and rule only. The secret value itself is never
stored: findings and audit events carry a short redacted preview.
"""

import re
from dataclasses import dataclass
from pathlib import Path

from app.models.enums import Severity

MAX_FILE_BYTES = 2 * 1024 * 1024
SKIP_DIRS = {".git", "node_modules", "vendor", "dist", "build", ".venv", "venv"}
TEST_HINTS = ("test/", "tests/", "spec/", "__tests__/", "fixtures/", "testdata/", "examples/")


@dataclass(frozen=True)
class Rule:
    id: str
    title: str
    pattern: re.Pattern[str]
    severity: Severity
    cwe: str


RULES = [
    Rule(
        "private-key",
        "Hard-coded private key",
        re.compile(
            r"-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----"
        ),
        Severity.HIGH,
        "CWE-321",
    ),
    Rule(
        "aws-access-key",
        "AWS access key ID",
        re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"),
        Severity.HIGH,
        "CWE-798",
    ),
    Rule(
        "github-token",
        "GitHub token",
        re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{82}\b"),
        Severity.HIGH,
        "CWE-798",
    ),
    Rule(
        "slack-token",
        "Slack token",
        re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,72}\b"),
        Severity.MEDIUM,
        "CWE-798",
    ),
    Rule(
        "stripe-secret",
        "Stripe secret key",
        re.compile(r"\b(?:sk|rk)_live_[A-Za-z0-9]{24,99}\b"),
        Severity.HIGH,
        "CWE-798",
    ),
]


@dataclass(frozen=True)
class SecretMatch:
    rule: Rule
    file_path: str
    line: int
    preview: str


def _redact(text: str) -> str:
    text = text.strip()
    return (text[:6] + "…" + text[-2:]) if len(text) > 10 else "…"


def scan(root: Path) -> list[SecretMatch]:
    matches = []
    for path in sorted(root.rglob("*")):
        rel = path.relative_to(root)
        if any(p in SKIP_DIRS for p in rel.parts[:-1]) or not path.is_file() or path.is_symlink():
            continue
        if path.stat().st_size > MAX_FILE_BYTES:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for lineno, line in enumerate(text.splitlines(), start=1):
            for rule in RULES:
                m = rule.pattern.search(line)
                if m:
                    matches.append(SecretMatch(rule, rel.as_posix(), lineno, _redact(m.group(0))))
    return matches


def looks_like_test(path: str) -> bool:
    p = path.lower()
    return any(hint in p for hint in TEST_HINTS)
