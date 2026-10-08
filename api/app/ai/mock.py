"""Canned responses for KINETIX_AI_PROVIDER=mock. Every output says no model was called."""

import re
from typing import Any

NOTICE = "Mock output for development: no AI model was called."


def _flagged(user: str) -> tuple[str, int, str] | None:
    m = re.search(r'kind="source" path="([^"]+)">', user)
    n = re.search(r"flagged line: (\d+)\)", user)
    if not (m and n):
        return None
    line_no = int(n.group(1))
    row = re.search(rf"^\s*{line_no} \| (.*)$", user, re.M)
    if not row:
        return None
    return m.group(1), line_no, row.group(1)


def _quote(text: str) -> str:
    return text.strip()[:60]


def respond(tool: str, user: str) -> dict[str, Any]:
    flagged = _flagged(user)
    citations = (
        [{"path": flagged[0], "line": flagged[1], "quote": _quote(flagged[2])}] if flagged else []
    )
    if tool == "record_analysis":
        severe = re.search(r"Severity \(current\): (critical|high)", user) is not None
        definite = "yes" if (severe and flagged) else "unclear"
        step = lambda ans: {  # noqa: E731
            "answer": ans,
            "explanation": f"{NOTICE} Shown for wiring and layout checks only.",
            "citations": citations if ans != "unclear" else [],
        }
        return {
            "input_controlled": step(definite),
            "reaches_sink": step(definite),
            "sanitized": step("no" if (severe and flagged) else "unclear"),
            "impact": f"{NOTICE} No real impact assessment was made.",
            "summary": f"{NOTICE} The flagged line is shown for wiring and layout checks only.",
            "checks_before_confirming": [
                "Check whether any middleware or validation runs before this code.",
                "Reproduce on a local, authorized build before confirming.",
            ],
            "suggested_cwe": None,
            "suggested_severity": None,
        }
    if tool == "record_answer":
        return {
            "answer": f"{NOTICE} Connect a model provider to get real answers.",
            "confidence": "low",
            "citations": citations,
        }
    return {
        "text": f"[{NOTICE}]\n\nReplace this draft with your own wording, or connect a model provider."
    }
