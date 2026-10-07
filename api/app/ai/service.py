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
from typing import Any

from sqlalchemy.orm import Session

from app.ai import context as ctxmod
from app.ai import prompts
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


def _validate_analysis(data: dict, lines: dict[tuple[str, int], str]) -> dict:
    verdict = data.get("verdict")
    if verdict not in ("likely_vulnerable", "likely_false_positive", "needs_more_context"):
        verdict = "needs_more_context"
    confidence = (
        data.get("confidence") if data.get("confidence") in ("low", "medium", "high") else "low"
    )
    reasoning, dropped, supported = [], 0, 0
    for item in (data.get("reasoning") or [])[:6]:
        if not isinstance(item, dict):
            continue
        cites, d = verify_citations(item.get("citations"), lines)
        dropped += d
        supported += bool(cites)
        reasoning.append(
            {"point": _text(item.get("point"), 600), "citations": cites, "supported": bool(cites)}
        )
    notes = []
    if dropped:
        plural = dropped != 1
        notes.append(
            f"{dropped} citation{'s' if plural else ''} didn't match the code the assistant was "
            f"shown and {'were' if plural else 'was'} removed."
        )
    # A confident verdict with nothing to point at is not trustworthy.
    if verdict != "needs_more_context" and supported == 0:
        confidence = "low"
        notes.append(
            "The assistant didn't cite any line it was shown, so its confidence was lowered."
        )
    cwe = data.get("suggested_cwe")
    severity = data.get("suggested_severity")
    return {
        "verdict": verdict,
        "confidence": confidence,
        "summary": _text(data.get("summary"), 1200),
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
    ctx = ctxmod.build(db, project, finding)
    user_prompt = f"{ctx.prompt}\n\n{task}"
    digest = hashlib.sha256((prompts.SYSTEM + "\n\n" + user_prompt).encode()).hexdigest()
    raw = provider.complete(system=prompts.SYSTEM, user=user_prompt, schema=schema, tool=tool)
    if kind == "analysis":
        output = _validate_analysis(raw, ctx.lines)
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
