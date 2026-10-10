"use client";

import clsx from "clsx";
import { Check, CornerUpLeft, PartyPopper, SkipForward, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { ButtonLink, SeverityMark } from "@/components/ui";
import { ApiError, call } from "@/lib/client";
import { AI_VERDICT_CLASS, AI_VERDICT_LABEL, CONFIDENCE_LABEL } from "@/lib/format";
import type { Finding, SourceExcerpt } from "@/lib/types";

type Label = "vulnerable" | "not_vulnerable";

export function LabelQueue({
  org,
  project,
  items,
  alreadyLabeled,
}: {
  org: string;
  project: string;
  items: Finding[];
  alreadyLabeled: number;
}) {
  const [index, setIndex] = useState(0);
  const [labeled, setLabeled] = useState(alreadyLabeled);
  // Keyed to the finding it belongs to, so switching findings never shows stale code.
  const [fetched, setFetched] = useState<{ id: string; data: SourceExcerpt | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = items[index];
  const total = items.length + alreadyLabeled;

  // Pull the code around the current finding so the reviewer can judge it in place.
  useEffect(() => {
    if (!current?.file_path) return;
    let cancelled = false;
    const id = current.public_id;
    call<SourceExcerpt>("GET", `/orgs/${org}/projects/${project}/findings/${id}/source?context=5`)
      .then((e) => !cancelled && setFetched({ id, data: e }))
      .catch(() => !cancelled && setFetched({ id, data: null }));
    return () => {
      cancelled = true;
    };
  }, [current, org, project]);

  const excerpt = current && fetched?.id === current.public_id ? fetched.data : null;

  const advance = useCallback(() => {
    setError(null);
    setIndex((i) => i + 1);
  }, []);

  const submit = useCallback(
    async (label: Label) => {
      if (!current || busy) return;
      setBusy(true);
      setError(null);
      try {
        await call("POST", `/orgs/${org}/projects/${project}/findings/${current.public_id}/label`, {
          label,
        });
        setLabeled((n) => n + 1);
        advance();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Couldn't save that label. Try again.");
      } finally {
        setBusy(false);
      }
    },
    [current, busy, org, project, advance],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "r") {
        e.preventDefault();
        void submit("vulnerable");
      } else if (k === "f") {
        e.preventDefault();
        void submit("not_vulnerable");
      } else if (k === "s") {
        e.preventDefault();
        advance();
      } else if (k === "arrowleft") {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submit, advance]);

  if (!current) {
    return (
      <div className="border-rule bg-raised mx-auto flex max-w-lg flex-col items-center gap-4 rounded-2xl border p-10 text-center">
        <span className="bg-brand-soft text-brand grid size-12 place-items-center rounded-full">
          <PartyPopper className="size-6" />
        </span>
        <h2 className="display text-ink text-[22px]">Queue cleared</h2>
        <p className="text-muted max-w-[42ch]">
          You&apos;ve labeled {labeled} finding{labeled === 1 ? "" : "s"} for the training corpus. Export the
          dataset from the Findings page whenever you&apos;re ready.
        </p>
        <ButtonLink href={`/${org}/${project}/findings`} variant="primary">
          Back to findings
        </ButtonLink>
      </div>
    );
  }

  const pct = total ? Math.round((labeled / total) * 100) : 0;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="bg-sunken h-2 flex-1 overflow-hidden rounded-full">
          <div className="bg-brand h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-muted text-[13px] tabular-nums">
          {labeled} / {total} labeled
        </span>
      </div>

      {/* Finding card */}
      <div className="border-rule bg-raised flex flex-col overflow-hidden rounded-2xl border">
        <div className="flex items-start gap-3 px-5 py-4">
          <SeverityMark severity={current.severity} />
          <div className="min-w-0 flex-1">
            <Link
              href={`/${org}/${project}/findings/${current.public_id}`}
              className="hover:text-brand text-[15px] font-semibold"
            >
              {current.title}
            </Link>
            <p className="text-muted mono mt-0.5 truncate">
              {current.public_id}
              {current.file_path ? ` · ${current.file_path}${current.line ? `:${current.line}` : ""}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span
              className={clsx(
                "inline-flex h-5 items-center rounded-sm border px-1.5 text-[11px] font-medium",
                current.confidence === "firm"
                  ? "border-brand/40 bg-brand-soft text-brand"
                  : "border-rule bg-sunken text-muted",
              )}
            >
              {CONFIDENCE_LABEL[current.confidence]}
            </span>
            {current.ai_verdict ? (
              <span
                className={clsx(
                  "inline-flex h-5 items-center rounded-sm border px-1.5 text-[11px] font-medium",
                  AI_VERDICT_CLASS[current.ai_verdict],
                )}
              >
                {AI_VERDICT_LABEL[current.ai_verdict]}
              </span>
            ) : null}
          </div>
        </div>

        {/* AI data-flow assessment, when present */}
        {current.ai_assessment ? (
          <div className="border-rule bg-sunken/50 mx-5 mb-4 rounded-lg border px-4 py-3">
            <p className="text-muted mb-2 text-[10.5px] font-semibold tracking-wide uppercase">
              AI assessment
            </p>
            <div className="flex flex-col gap-1.5">
              {(
                [
                  ["Input attacker-controlled", current.ai_assessment.input_controlled],
                  ["Reaches the sink", current.ai_assessment.reaches_sink],
                  ["Effective sanitizer present", current.ai_assessment.sanitized],
                ] as const
              ).map(([label, ans]) => (
                <div key={label} className="flex items-center gap-2 text-[13px]">
                  <span
                    className={clsx(
                      "grid size-4 shrink-0 place-items-center rounded-full",
                      ans === "yes"
                        ? "bg-crit-soft text-crit"
                        : ans === "no"
                          ? "bg-brand-soft text-brand"
                          : "bg-rule text-muted",
                    )}
                  >
                    {ans === "yes" ? (
                      <Check className="size-2.5" />
                    ) : ans === "no" ? (
                      <X className="size-2.5" />
                    ) : (
                      "?"
                    )}
                  </span>
                  <span className="text-ink">{label}</span>
                  <span className="text-muted mono ml-auto">{ans}</span>
                </div>
              ))}
            </div>
            {current.ai_assessment.impact ? (
              <p className="text-muted mt-2 border-t border-dashed border-current/10 pt-2 text-[12.5px] leading-[19px]">
                {current.ai_assessment.impact}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Code excerpt */}
        {excerpt && excerpt.lines.length ? (
          <div className="border-rule bg-sunken/60 mx-5 mb-5 overflow-x-auto rounded-lg border font-mono text-[12px] leading-[1.7]">
            {excerpt.lines.map((ln) => (
              <div
                key={ln.n}
                className={clsx("flex gap-3 px-3", ln.n === excerpt.highlight && "bg-crit-soft/60")}
              >
                <span className="text-muted/70 w-8 shrink-0 text-right select-none">{ln.n}</span>
                <span className="text-ink whitespace-pre">{ln.text || " "}</span>
              </div>
            ))}
          </div>
        ) : current.file_path ? (
          <p className="text-muted mx-5 mb-5 text-[12.5px]">Loading source…</p>
        ) : null}
      </div>

      {error ? <p className="text-crit text-[13px]">{error}</p> : null}

      {/* Verdict actions */}
      <div className="grid grid-cols-3 gap-2.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => submit("vulnerable")}
          className="border-crit/30 bg-crit-soft/40 text-crit hover:bg-crit-soft flex h-12 items-center justify-center gap-2 rounded-xl border text-[14px] font-semibold transition-colors disabled:opacity-60"
        >
          <Check className="size-4" /> Real <Shortcut>R</Shortcut>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => submit("not_vulnerable")}
          className="border-brand/30 bg-brand-soft/50 text-brand hover:bg-brand-soft flex h-12 items-center justify-center gap-2 rounded-xl border text-[14px] font-semibold transition-colors disabled:opacity-60"
        >
          <X className="size-4" /> False positive <Shortcut>F</Shortcut>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={advance}
          className="border-rule bg-raised text-muted hover:bg-sunken hover:text-ink flex h-12 items-center justify-center gap-2 rounded-xl border text-[14px] font-semibold transition-colors disabled:opacity-60"
        >
          <SkipForward className="size-4" /> Skip <Shortcut>S</Shortcut>
        </button>
      </div>

      <div className="text-muted flex items-center justify-between text-[12.5px]">
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="hover:text-ink inline-flex items-center gap-1.5 disabled:opacity-40"
        >
          <CornerUpLeft className="size-3.5" /> Previous
        </button>
        <span>
          Finding {index + 1} of {items.length} in this batch
        </span>
      </div>
    </div>
  );
}

function Shortcut({ children }: { children: string }) {
  return (
    <kbd className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded border border-current/25 px-1 text-[10px] font-semibold opacity-70">
      {children}
    </kbd>
  );
}
