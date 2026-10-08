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
