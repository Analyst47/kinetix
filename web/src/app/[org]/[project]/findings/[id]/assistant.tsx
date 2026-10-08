"use client";

import clsx from "clsx";
import { AlertTriangle, Check, Circle, Minus, Pencil, RefreshCw, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button, Panel, textareaClass } from "@/components/ui";
import { ApiError, call } from "@/lib/client";
import { SEVERITY_LABEL, relative } from "@/lib/format";
import type { AiCitation, AiRun, AiStatus, FindingDetail, Severity } from "@/lib/types";

const PROVIDER_LABEL: Record<string, string> = {
  anthropic: "Anthropic (Claude)",
  gemini: "Google (Gemini API)",
  openai_compatible: "your configured model server",
  mock: "the development stub (no model is called)",
};

const VERDICT_LABEL = {
  likely_vulnerable: "Likely vulnerable",
  likely_false_positive: "Likely a false positive",
  needs_more_context: "Needs more context",
} as const;

function useAi(org: string, project: string, id: string) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const base = `/orgs/${org}/projects/${project}/findings/${id}`;
  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(label);
    setError(null);
    try {
      const r = await fn();
      startTransition(() => router.refresh());
      return r;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The assistant couldn't be reached. Try again.");
      return undefined;
    } finally {
      setBusy(null);
    }
  }
  return { base, run, busy, error };
}

function AssessmentRow({ label, answer }: { label: string; answer: "yes" | "no" | "unclear" }) {
  const icon =
    answer === "yes" ? (
      <Check className="text-crit size-3.5" aria-hidden />
    ) : answer === "no" ? (
      <X className="text-ok size-3.5" aria-hidden />
    ) : (
      <Minus className="text-muted size-3.5" aria-hidden />
    );
  return (
    <div className="flex items-center justify-between gap-3 text-[13px]">
      <span className="flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span
        className={clsx(
          "text-xs font-medium",
          answer === "yes" ? "text-crit" : answer === "no" ? "text-ok" : "text-muted",
        )}
      >
        {answer === "unclear" ? "Unclear" : answer === "yes" ? "Yes" : "No"}
      </span>
    </div>
  );
}

function Citation({ c }: { c: AiCitation }) {
  return (
    <span className="bg-sunken inline-flex max-w-full items-baseline gap-1.5 rounded-sm px-1.5 py-0.5 text-xs">
      <span className="mono text-muted shrink-0 text-[11.5px]">
        {c.path}:{c.line}
      </span>
      <span className="mono truncate text-[11.5px]">{c.quote}</span>
    </span>
  );
}

export function AssistantPanel({
  org,
  project,
  finding,
  status,
  runs,
  canUse,
  canEdit,
  canManage,
}: {
  org: string;
  project: string;
  finding: FindingDetail;
  status: AiStatus;
  runs: AiRun[];
  canUse: boolean;
  canEdit: boolean;
  canManage: boolean;
}) {
  const { base, run, busy, error } = useAi(org, project, finding.public_id);
  const [question, setQuestion] = useState("");
  const analysis = runs.find((r) => r.kind === "analysis");
  const questions = runs
    .filter((r) => r.kind === "question")
    .slice(0, 5)
    .reverse();

  const header = (
    <span className="text-muted flex items-center gap-2 text-xs font-normal">
      Advisory, not a verdict
      {status.model ? (
        <span className="mono border-rule rounded-sm border px-1.5 text-[11px]">{status.model}</span>
      ) : null}
    </span>
  );

  if (!status.available || !status.enabled) {
    return (
      <Panel title="Assistant" aside={header}>
        <div className="flex items-start gap-3 px-4 py-3.5">
          <Sparkles className="text-muted mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="text-muted text-[13px]">
            {!status.available
              ? "AI assistance isn't configured on this server. Set an AI provider to get evidence-cited triage, answers and drafts."
              : "AI assistance is off for this workspace."}{" "}
            {status.available && canManage ? (
              <Link href={`/${org}/settings/ai`} className="text-vg hover:underline">
                Turn it on
              </Link>
            ) : null}
          </p>
        </div>
      </Panel>
    );
  }

  const o = analysis?.output;
  const apply = async (patch: Record<string, string>) => run("apply", () => call("PATCH", base, patch));

  return (
    <Panel title="Assistant" aside={header}>
      <div className="flex flex-col gap-4 px-4 py-3.5">
        {analysis?.injection_signals.length ? (
          <div
            className="border-med/50 text-med flex gap-2.5 rounded-sm border px-3 py-2 text-[13px]"
            role="alert"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold">Possible prompt injection in the analyzed code</span>
              {analysis.injection_signals.map((s) => (
                <span key={s} className="mono text-[11.5px]">
                  {s}
                </span>
              ))}
              <span className="text-ink text-xs">
                The assistant was told to treat this as data. Review these lines yourself.
              </span>
            </div>
          </div>
        ) : null}

        {o ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-semibold">{VERDICT_LABEL[o.verdict ?? "needs_more_context"]}</span>
              <span className="text-muted text-xs">Confidence: {o.confidence}</span>
            </div>
            {o.summary ? <p className="max-w-[76ch]">{o.summary}</p> : null}
            {o.assessment ? (
              <div className="border-rule bg-sunken/40 flex flex-col gap-1.5 rounded-sm border px-3 py-2.5">
                <span className="text-muted text-xs font-medium">Data-flow assessment</span>
                <AssessmentRow label="Input is attacker-controlled" answer={o.assessment.input_controlled} />
                <AssessmentRow
                  label="Input reaches the flagged operation"
                  answer={o.assessment.reaches_sink}
                />
                <AssessmentRow
                  label="An effective sanitizer is on the path"
                  answer={o.assessment.sanitized}
                />
                {o.assessment.impact ? (
                  <p className="text-muted mt-1 text-[13px]">
                    <span className="font-medium">If real:</span> {o.assessment.impact}
                  </p>
                ) : null}
                <p className="text-muted mt-0.5 text-[11.5px]">
                  Kinetix derived the verdict from these cited answers.
                </p>
              </div>
            ) : null}
            {o.reasoning?.length ? (
              <ul className="flex flex-col gap-2.5">
                {o.reasoning.map((r, i) => (
                  <li key={i} className="flex flex-col gap-1">
                    <span className={clsx("text-[13px]", !r.supported && "text-muted")}>{r.point}</span>
                    {r.citations.length ? (
                      <span className="flex flex-wrap gap-1.5">
                        {r.citations.map((c, j) => (
                          <Citation key={j} c={c} />
                        ))}
                      </span>
                    ) : (
                      <span className="text-muted text-xs">
                        No supporting line found in the code it was shown.
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
            {o.checks_before_confirming?.length ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-muted text-xs font-medium">Check before confirming</span>
                <ul className="flex flex-col gap-1">
                  {o.checks_before_confirming.map((c) => (
                    <li key={c} className="flex gap-2 text-[13px]">
                      <Circle className="text-muted mt-1 size-3 shrink-0" aria-hidden />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {canEdit &&
            ((o.suggested_cwe && o.suggested_cwe !== finding.cwe) ||
              (o.suggested_severity && o.suggested_severity !== finding.severity)) ? (
              <div className="border-rule flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-[13px]">
                <span className="text-muted text-xs">Suggestions</span>
                {o.suggested_cwe && o.suggested_cwe !== finding.cwe ? (
                  <span className="flex items-center gap-2">
                    <span className="mono">{o.suggested_cwe}</span>
                    <Button
                      className="h-7 px-2.5 text-[13px]"
                      disabled={!!busy}
                      onClick={() => apply({ cwe: o.suggested_cwe! })}
                    >
                      Apply
                    </Button>
                  </span>
                ) : null}
                {o.suggested_severity && o.suggested_severity !== finding.severity ? (
                  <span className="flex items-center gap-2">
                    <span>{SEVERITY_LABEL[o.suggested_severity as Severity]} severity</span>
                    <Button
                      className="h-7 px-2.5 text-[13px]"
                      disabled={!!busy}
                      onClick={() => apply({ severity: o.suggested_severity! })}
                    >
                      Apply
                    </Button>
                  </span>
                ) : null}
              </div>
            ) : null}
            {o.validation_notes?.length ? (
              <ul className="text-muted flex flex-col gap-0.5 text-xs">
                {o.validation_notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}
            <div className="text-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span>
                {analysis!.model}, {relative(analysis!.created_at).toLowerCase()}, sent{" "}
                {o.source_lines_sent ?? 0} source lines
              </span>
              {canUse ? (
                <button
                  type="button"
                  onClick={() => run("analyze", () => call("POST", `${base}/ai/analyze`))}
                  disabled={!!busy}
                  className="text-vg inline-flex items-center gap-1 hover:underline"
                >
                  <RefreshCw className="size-3" aria-hidden />
                  {busy === "analyze" ? "Analyzing…" : "Run again"}
                </button>
              ) : null}
            </div>
          </div>
        ) : canUse ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-muted max-w-[68ch] text-[13px]">
              Get an evidence-cited read on this finding: how data reaches the flagged line, what to verify
              before confirming, and a suggested CWE. Sends this finding&apos;s details and nearby source to{" "}
              {PROVIDER_LABEL[status.provider ?? ""] ?? status.provider}.
            </p>
            {status.data_notice ? (
              <p className="border-high/40 bg-high/5 max-w-[68ch] rounded-md border px-3 py-2 text-[13px]">
                {status.data_notice}
              </p>
            ) : null}
            <Button
              variant="primary"
              disabled={!!busy}
              onClick={() => run("analyze", () => call("POST", `${base}/ai/analyze`))}
            >
              <Sparkles aria-hidden />
              {busy === "analyze" ? "Analyzing…" : "Analyze finding"}
            </Button>
          </div>
        ) : (
          <p className="text-muted text-[13px]">No analysis yet.</p>
        )}

        {questions.length ? (
          <ol className="border-rule flex flex-col gap-3 border-t pt-3">
            {questions.map((q) => (
              <li key={q.id} className="flex flex-col gap-1">
                <span className="text-[13px] font-medium">{q.question}</span>
                <span className="text-[13px] whitespace-pre-wrap">{q.output.answer}</span>
                {q.output.citations?.length ? (
                  <span className="flex flex-wrap gap-1.5">
                    {q.output.citations.map((c, j) => (
                      <Citation key={j} c={c} />
                    ))}
                  </span>
                ) : null}
                <span className="text-muted text-xs">
                  {q.created_by.name}, {relative(q.created_at).toLowerCase()}, confidence{" "}
                  {q.output.confidence}
                </span>
              </li>
            ))}
          </ol>
        ) : null}

        {canUse ? (
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const q = question.trim();
              if (q.length < 3) return;
              const ok = await run("ask", () => call("POST", `${base}/ai/ask`, { question: q }));
              if (ok !== undefined) setQuestion("");
            }}
          >
            <label htmlFor="ai-q" className="sr-only">
              Ask about this finding
            </label>
            <input
              id="ai-q"
              value={question}
              maxLength={1000}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about this finding, e.g. is the email parameterized anywhere?"
              className="border-rule-strong bg-raised text-ink placeholder:text-muted h-8 flex-1 rounded-sm border px-2.5 text-sm"
            />
            <Button type="submit" disabled={!!busy || question.trim().length < 3}>
              {busy === "ask" ? "Asking…" : "Ask"}
            </Button>
          </form>
        ) : null}
        {error ? <p className="text-crit text-[13px]">{error}</p> : null}
      </div>
    </Panel>
  );
}

export function EditableText({
  org,
  project,
  findingId,
  field,
  title,
  value,
  placeholder,
  fallback,
  canEdit,
  canDraft,
}: {
  org: string;
  project: string;
  findingId: string;
  field: "description" | "remediation";
  title: string;
  value: string;
  placeholder: string;
  fallback?: string | null;
  canEdit: boolean;
  canDraft: boolean;
}) {
  const { base, run, busy, error } = useAi(org, project, findingId);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const [fromAi, setFromAi] = useState(false);

  const draftButton = canDraft ? (
    <Button
      className="h-7 px-2.5 text-[13px]"
      disabled={!!busy}
      onClick={async () => {
        const r = await run("draft", () => call<AiRun>("POST", `${base}/ai/draft`, { field }));
        if (r?.output.text) {
          setText(r.output.text);
          setFromAi(true);
          setEditing(true);
        }
      }}
    >
      <Sparkles aria-hidden />
      {busy === "draft" ? "Drafting…" : "Draft with AI"}
    </Button>
  ) : null;

  return (
    <Panel
      title={title}
      aside={
        canEdit && !editing ? (
          <>
            {draftButton}
            <Button
              variant="ghost"
              className="h-7 px-2.5 text-[13px]"
              onClick={() => {
                setText(value);
                setFromAi(false);
                setEditing(true);
              }}
            >
              <Pencil aria-hidden />
              Edit
            </Button>
          </>
        ) : null
      }
    >
      <div className="flex max-w-[80ch] flex-col gap-2.5 px-4 py-3.5">
        {editing ? (
          <>
            {fromAi ? (
              <p className="text-med text-xs">
                AI draft. Check every claim against the evidence before you save it.
              </p>
            ) : null}
            <label htmlFor={`edit-${field}`} className="sr-only">
              {title}
            </label>
            <textarea
              id={`edit-${field}`}
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={placeholder}
              className={textareaClass}
            />
            <div className="flex gap-2">
              <Button
                variant="primary"
                disabled={!!busy}
                onClick={async () => {
                  const ok = await run("save", () => call("PATCH", base, { [field]: text }));
                  if (ok !== undefined) setEditing(false);
                }}
              >
                Save
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </>
        ) : value ? (
          value.split(/\n{2,}/).map((p, i) => (
            <p key={i} className="whitespace-pre-wrap">
              {p}
            </p>
          ))
        ) : fallback ? (
          <>
            <p className="text-muted">{fallback}</p>
            <p className="text-muted text-xs">
              General guidance for this weakness. Edit to make it specific.
            </p>
          </>
        ) : (
          <p className="text-muted">Nothing written yet.</p>
        )}
        {error ? <p className="text-crit text-[13px]">{error}</p> : null}
      </div>
    </Panel>
  );
}
