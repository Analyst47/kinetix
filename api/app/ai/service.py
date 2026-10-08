"""AI assistance for findings: analysis, questions and drafting.

Guarantees, regardless of what the model returns:
- Output is advisory. Nothing here changes a finding; applying a suggestion is a separate,
  normal edit made by a person.
- Output must match a schema. Unknown fields are dropped, enums are enforced, text is capped.
- Every citation is checked against the exact lines the model was shown. Citations that don't
  match are removed, and claims left without support are marked unsupported.
- What was sent is fingerprinted (SHA-256) and recorded, together with the result, in the
  finding's chain of custody.
"""

import hashlib
import re
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.ai import budget, prompts
from app.ai import context as ctxmod
from app.ai.providers import Provider
from app.errors import ApiError
from app.models import AiRun, Finding, Project, User
from app.services import audit

SEVERITIES = {"critical", "high", "medium", "low", "info"}
_CWE = re.compile(r"^CWE-\d{1,5}$")


def _text(value: Any, limit: int) -> str:
    return str(value or "").strip()[:limit]


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def verify_citations(raw: Any, lines: dict[tuple[str, int], str]) -> tuple[list[dict], int]:
    valid, dropped = [], 0
    for c in raw if isinstance(raw, list) else []:
        if not isinstance(c, dict):
            dropped += 1
            continue
        path, line, quote = str(c.get("path", "")), c.get("line"), _norm(str(c.get("quote", "")))
        source = lines.get((path, line)) if isinstance(line, int) else None
        if source is not None and len(quote) >= 3 and quote in _norm(source):
            valid.append({"path": path, "line": line, "quote": quote[:120]})
        else:
            dropped += 1
    return valid, dropped


_STEP_QUESTION = {
    "input_controlled": "Input is attacker-controlled",
    "reaches_sink": "Input reaches the flagged operation",
    "sanitized": "An effective sanitizer or guard is on the path",
}


def _step(raw: Any, lines: dict[tuple[str, int], str]) -> tuple[str, list[dict], str, int]:
    """Validate one assessment step. A definitive yes/no needs a verified citation, or it is
    downgraded to 'unclear' — the platform never acts on an uncited claim."""
    raw = raw if isinstance(raw, dict) else {}
    answer = raw.get("answer") if raw.get("answer") in ("yes", "no", "unclear") else "unclear"
    cites, dropped = verify_citations(raw.get("citations"), lines)
    if answer in ("yes", "no") and not cites:
        answer = "unclear"
    return answer, cites, _text(raw.get("explanation"), 400), dropped


def _derive_verdict(controlled: str, reaches: str, sanitized: str) -> str:
    # Any proven reason it can't be exploited makes it a likely false positive.
    if controlled == "no" or reaches == "no" or sanitized == "yes":
        return "likely_false_positive"
    # All three conditions for exploitability met, with evidence.
    if controlled == "yes" and reaches == "yes" and sanitized == "no":
        return "likely_vulnerable"
    return "needs_more_context"


def _validate_analysis(data: dict, lines: dict[tuple[str, int], str]) -> dict:
    steps, dropped = {}, 0
    for key in ("input_controlled", "reaches_sink", "sanitized"):
        answer, cites, explanation, d = _step(data.get(key), lines)
        dropped += d
        steps[key] = {"answer": answer, "citations": cites, "explanation": explanation}

    controlled = steps["input_controlled"]["answer"]
    reaches = steps["reaches_sink"]["answer"]
    sanitized = steps["sanitized"]["answer"]
    verdict = _derive_verdict(controlled, reaches, sanitized)

    # Confidence reflects how well the deciding facts are evidenced.
    if verdict == "needs_more_context":
        confidence = "low"
    elif verdict == "likely_vulnerable":
        both = steps["input_controlled"]["citations"] and steps["reaches_sink"]["citations"]
        confidence = "high" if (both and steps["sanitized"]["citations"]) else "medium"
    else:  # likely_false_positive: the deciding step is whichever ruled it out
        decider = (
            "input_controlled"
            if controlled == "no"
            else "reaches_sink"
            if reaches == "no"
            else "sanitized"
        )
        confidence = "high" if steps[decider]["citations"] else "medium"

    reasoning = [
        {
            "point": f"{_STEP_QUESTION[key]}: {steps[key]['answer']}. {steps[key]['explanation']}",
            "citations": steps[key]["citations"],
            "supported": bool(steps[key]["citations"]),
        }
        for key in ("input_controlled", "reaches_sink", "sanitized")
    ]
    notes = []
    if dropped:
        plural = dropped != 1
        notes.append(
            f"{dropped} citation{'s' if plural else ''} didn't match the code the assistant was "
            f"shown and {'were' if plural else 'was'} removed."
        )
    if "unclear" in (controlled, reaches, sanitized) and verdict == "needs_more_context":
        notes.append(
            "Kinetix derives the verdict from cited answers; an unproven step reads as unclear."
        )
    cwe = data.get("suggested_cwe")
    severity = data.get("suggested_severity")
    return {
        "verdict": verdict,
        "confidence": confidence,
        "summary": _text(data.get("summary"), 1200),
        "assessment": {
            "input_controlled": controlled,
            "reaches_sink": reaches,
            "sanitized": sanitized,
            "impact": _text(data.get("impact"), 600),
        },
        "reasoning": reasoning,
        "checks_before_confirming": [
            _text(c, 300) for c in (data.get("checks_before_confirming") or [])[:5] if c
        ],
        "suggested_cwe": cwe if isinstance(cwe, str) and _CWE.match(cwe) else None,
        "suggested_severity": severity if severity in SEVERITIES else None,
        "validation_notes": notes,
    }


def _validate_answer(data: dict, lines: dict[tuple[str, int], str]) -> dict:
    cites, dropped = verify_citations(data.get("citations"), lines)
    return {
        "answer": _text(data.get("answer"), 3000),
        "confidence": data.get("confidence")
        if data.get("confidence") in ("low", "medium", "high")
        else "low",
        "citations": cites,
        "validation_notes": [f"{dropped} unverifiable citation(s) removed."] if dropped else [],
    }


def _run(
    db: Session,
    *,
    provider: Provider,
    project: Project,
    finding: Finding,
    actor: User,
    kind: str,
    task: str,
    schema: dict,
    tool: str,
    question: str | None = None,
) -> AiRun:
    # Spend safeguard: refuse before spending anything if the monthly budget is used up.
    budget.check()
    ctx = ctxmod.build(db, project, finding)
    user_prompt = f"{ctx.prompt}\n\n{task}"
    digest = hashlib.sha256((prompts.SYSTEM + "\n\n" + user_prompt).encode()).hexdigest()
    raw = provider.complete(system=prompts.SYSTEM, user=user_prompt, schema=schema, tool=tool)
    usage = getattr(provider, "last_usage", None)
    if isinstance(usage, dict):
        budget.add(int(usage.get("input_tokens", 0)) + int(usage.get("output_tokens", 0)))
    if kind == "analysis":
        output = _validate_analysis(raw, ctx.lines)
        # Record the model's read on the finding itself, so a triage pass can rank by it.
        finding.ai_verdict = output["verdict"]
        finding.ai_confidence = output["confidence"]
        finding.ai_assessment = output["assessment"]
        finding.ai_reviewed_at = datetime.now(UTC)
    elif kind == "question":
        output = _validate_answer(raw, ctx.lines)
    else:
        text = _text(raw.get("text"), 4000)
        if not text:
            raise ApiError(
                502, "ai_unavailable", "The assistant returned an empty draft. Try again."
            )
        output = {"text": text}
    output["source_lines_sent"] = ctx.source_line_count
    if isinstance(usage, dict):
        output["usage"] = {
            "input_tokens": int(usage.get("input_tokens", 0)),
            "output_tokens": int(usage.get("output_tokens", 0)),
        }
    signals = [f"{s.path}:{s.line} {s.reason}" for s in ctx.signals]
    run = AiRun(
        org_id=finding.org_id,
        finding_id=finding.id,
        kind=kind,
        question=question,
        output=output,
        provider=provider.name,
        model=provider.model,
        input_sha256=digest,
        injection_signals=signals,
        created_by_id=actor.id,
    )
    db.add(run)
    db.flush()
    audit.record(
        db,
        org_id=finding.org_id,
        actor=actor,
        action=f"ai.{kind}",
        subject_type="finding",
        subject_id=finding.public_id,
        data={
            "provider": provider.name,
            "model": provider.model,
            "input_sha256": digest,
            "source_lines_sent": ctx.source_line_count,
            **({"verdict": output["verdict"]} if kind == "analysis" else {}),
            **({"tokens": output["usage"]} if isinstance(usage, dict) else {}),
            **({"injection_signals": len(signals)} if signals else {}),
        },
    )
    return run


def analyze(
    db: Session, provider: Provider, project: Project, finding: Finding, actor: User
) -> AiRun:
    return _run(
        db, provider=provider, project=project, finding=finding, actor=actor, kind="analysis",
        task=prompts.ANALYZE_TASK, schema=prompts.ANALYSIS_SCHEMA, tool="record_analysis",
    )  # fmt: skip


def ask(
    db: Session, provider: Provider, project: Project, finding: Finding, actor: User, question: str
) -> AiRun:
    return _run(
        db, provider=provider, project=project, finding=finding, actor=actor, kind="question",
        task=prompts.ask_task(question), schema=prompts.ANSWER_SCHEMA, tool="record_answer",
        question=question,
    )  # fmt: skip


def draft(
    db: Session, provider: Provider, project: Project, finding: Finding, actor: User, field: str
) -> AiRun:
    return _run(
        db, provider=provider, project=project, finding=finding, actor=actor, kind=f"draft_{field}",
        task=prompts.DRAFT_TASKS[field], schema=prompts.DRAFT_SCHEMA, tool="record_draft",
    )  # fmt: skip
