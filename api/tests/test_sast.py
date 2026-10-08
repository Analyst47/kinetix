import shutil
from pathlib import Path

import pytest

from app.scanners import semgrep

FIXTURES = Path(__file__).parent / "fixtures" / "sast"

pytestmark = pytest.mark.skipif(not semgrep.available(), reason="semgrep is not installed")


def _hits(root: Path) -> set[tuple[str, str, int]]:
    return {(m.rule_id, m.file_path, m.line) for m in semgrep.run(root)}


def test_rule_pack_finds_known_weaknesses_and_ignores_safe_code():
    hits = _hits(FIXTURES)
    assert ("kinetix-js-sqli-raw-query", "routes/login.ts", 6) in hits
    assert ("kinetix-js-path-traversal-request", "routes/fileServer.ts", 7) in hits
    assert ("kinetix-js-path-traversal-request", "routes/fileServer.ts", 12) in hits
    assert ("kinetix-js-weak-hash", "routes/login.ts", 17) in hits
    assert ("kinetix-js-open-redirect", "routes/fileServer.ts", 16) in hits
    assert ("kinetix-py-sqli-string-build", "py/app.py", 6) in hits
    assert ("kinetix-py-shell-true", "py/app.py", 10) in hits
    assert ("kinetix-py-unsafe-yaml", "py/app.py", 14) in hits
    # Parameterized queries and safe loaders are not reported.
    assert not {
        h
        for h in hits
        if (h[1], h[2]) in {("routes/login.ts", 13), ("py/app.py", 18), ("py/app.py", 19)}
    }


def test_target_cannot_hide_files_with_its_own_ignore_files(tmp_path):
    target = tmp_path / "repo"
    shutil.copytree(FIXTURES, target)
    (target / ".semgrepignore").write_text("routes/\npy/\n")
    (target / ".gitignore").write_text("*\n")
    assert ("kinetix-js-sqli-raw-query", "routes/login.ts", 6) in _hits(target)


def test_taint_findings_are_firm_with_a_dataflow_source_and_pattern_findings_tentative():
    from app.models.enums import Confidence

    by_rule = {m.rule_id: m for m in semgrep.run(FIXTURES)}
    # A verified source->sink data-flow path (taint mode) is firm.
    for rule in (
        "kinetix-js-path-traversal-request",
        "kinetix-js-command-injection",
        "kinetix-js-open-redirect",
    ):
        if rule in by_rule:
            assert by_rule[rule].confidence is Confidence.FIRM, rule
    # When Semgrep reports a multi-step flow, the source location is captured and surfaced.
    traced = [m for m in by_rule.values() if m.taint_source]
    for m in traced:
        assert ":" in m.taint_source and "Data-flow" in m.message
    # A syntactic pattern match (no flow analysis) stays tentative for a human to confirm.
    assert by_rule["kinetix-js-sqli-raw-query"].confidence is Confidence.TENTATIVE
    assert by_rule["kinetix-js-weak-hash"].confidence is Confidence.TENTATIVE


# Expanded rule pack: taint-verified (firm) coverage across more bug classes.
EXPECTED_FIRM = {
    ("kinetix-js-ssrf-request", "routes/vuln.ts", 8),
    ("kinetix-js-ssti-template", "routes/vuln.ts", 13),
    ("kinetix-js-reflected-xss", "routes/vuln.ts", 18),
    ("kinetix-js-nosql-injection", "routes/vuln.ts", 23),
    ("kinetix-js-prototype-pollution", "routes/vuln.ts", 27),
    ("kinetix-js-redos-request", "routes/vuln.ts", 31),
    ("kinetix-py-ssrf-request", "py/web.py", 12),
    ("kinetix-py-command-injection-taint", "py/web.py", 17),
    ("kinetix-py-path-traversal-request", "py/web.py", 23),
    ("kinetix-py-ssti-request", "py/web.py", 28),
    ("kinetix-py-code-injection-request", "py/web.py", 33),
    ("kinetix-py-open-redirect-request", "py/web.py", 38),
}
EXPECTED_TENTATIVE = {
    ("kinetix-js-jwt-no-algorithms", "config/auth.ts", 5),
    ("kinetix-js-cors-wildcard-credentials", "config/auth.ts", 12),
    ("kinetix-js-insecure-randomness", "config/auth.ts", 15),
    ("kinetix-py-xxe-lxml", "py/web.py", 43),
    ("kinetix-py-weak-hash", "py/web.py", 47),
}


def _matches():
    return list(semgrep.run(FIXTURES))


def test_expanded_rule_pack_detects_more_bug_classes():
    from app.models.enums import Confidence

    seen = {(m.rule_id, m.file_path, m.line): m.confidence for m in _matches()}
    for key in EXPECTED_FIRM:
        assert seen.get(key) is Confidence.FIRM, f"missing firm: {key}"
    for key in EXPECTED_TENTATIVE:
        assert seen.get(key) is Confidence.TENTATIVE, f"missing tentative: {key}"


def test_constant_and_pinned_values_do_not_false_positive():
    hits = {(m.rule_id, m.file_path, m.line) for m in _matches()}
    # A constant URL is not SSRF; a JWT verify that pins algorithms is not flagged.
    assert ("kinetix-js-ssrf-request", "routes/vuln.ts", 36) not in hits
    assert ("kinetix-py-ssrf-request", "py/web.py", 51) not in hits
    assert not any(h[0] == "kinetix-js-jwt-no-algorithms" and h[2] == 9 for h in hits)
