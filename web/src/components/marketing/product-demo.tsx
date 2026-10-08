"use client";

import clsx from "clsx";
import { Check, FileText, Minus, ShieldCheck, X } from "lucide-react";
import { useState } from "react";

import { SeverityMark } from "@/components/ui";
import { AI_VERDICT_CLASS, AI_VERDICT_LABEL, CONFIDENCE_LABEL } from "@/lib/format";
import type { Severity } from "@/lib/types";

type Verdict = keyof typeof AI_VERDICT_LABEL;

interface DemoFinding {
  id: string;
  title: string;
  severity: Severity;
  file: string;
  confidence: "firm" | "tentative";
  verdict: Verdict;
  source: string;
}

// Clearly fictional sample findings. Never live data; shown only to illustrate the interface.
const FINDINGS: DemoFinding[] = [
  {
    id: "KX-1042",
    title: "Unsanitized path joins into fs.readFile (path traversal)",
    severity: "high",
    file: "src/routes/files.ts:58",
    confidence: "firm",
    verdict: "likely_vulnerable",
    source: "SAST · taint",
  },
  {
    id: "KX-1039",
    title: "Server-side request forgery in webhook fetch",
    severity: "high",
    file: "src/jobs/webhook.ts:21",
    confidence: "firm",
    verdict: "likely_vulnerable",
    source: "SAST · taint",
  },
  {
    id: "KX-1051",
    title: "lodash 4.17.19 — prototype pollution (CVE-2020-8203)",
    severity: "medium",
    file: "package-lock.json",
    confidence: "firm",
    verdict: "needs_more_context",
    source: "Dependency",
  },
  {
    id: "KX-1033",
    title: "Reflected value in response — possible XSS",
    severity: "medium",
    file: "src/views/search.tsx:44",
    confidence: "tentative",
    verdict: "likely_false_positive",
    source: "SAST",
  },
  {
    id: "KX-1028",
    title: "Hardcoded credential pattern in config loader",
    severity: "low",
    file: "src/config/env.ts:12",
    confidence: "tentative",
    verdict: "likely_false_positive",
    source: "Secrets",
  },
];

const TABS = [
  { key: "findings", label: "Findings" },
  { key: "validation", label: "Validation" },
  { key: "disclosure", label: "Disclosure" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return (
    <span
      className={clsx(
        "inline-flex h-5 items-center rounded-sm border px-1.5 text-[11px] font-medium whitespace-nowrap",
        AI_VERDICT_CLASS[verdict],
      )}
    >
      {AI_VERDICT_LABEL[verdict]}
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence: "firm" | "tentative" }) {
  return (
    <span
      className={clsx(
        "inline-flex h-5 items-center rounded-sm border px-1.5 text-[11px] font-medium",
        confidence === "firm"
          ? "border-vg/40 bg-vg-soft text-vg"
          : "border-rule bg-sunken text-muted",
      )}
    >
      {CONFIDENCE_LABEL[confidence]}
    </span>
  );
}

function FindingsTab() {
  return (
    <div className="divide-rule divide-y">
      {FINDINGS.map((f) => (
        <div key={f.id} className="flex items-start gap-3 px-4 py-3">
          <SeverityMark severity={f.severity} />
          <div className="min-w-0 flex-1">
            <p className="text-ink truncate text-[13.5px] font-medium">{f.title}</p>
            <p className="text-muted mono mt-0.5 truncate">
              {f.id} · {f.file} · {f.source}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <VerdictBadge verdict={f.verdict} />
            <ConfidenceBadge confidence={f.confidence} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Step({ answer, label }: { answer: "yes" | "no"; label: string }) {
  const bad = answer === "yes";
  return (
    <div className="flex items-center gap-3 py-2">
      <span
        className={clsx(
          "grid size-5 shrink-0 place-items-center rounded-full",
          bad ? "bg-crit-soft text-crit" : "bg-vg-soft text-vg",
        )}
      >
        {bad ? <Check className="size-3.5" /> : <X className="size-3.5" />}
      </span>
      <span className="text-ink text-[13.5px]">{label}</span>
      <span className="text-muted mono ml-auto">{answer}</span>
    </div>
  );
}

function ValidationTab() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-start gap-3">
        <SeverityMark severity="high" />
        <div>
          <p className="text-ink text-[13.5px] font-medium">
            Unsanitized path joins into fs.readFile
          </p>
          <p className="text-muted mono mt-0.5">KX-1042 · src/routes/files.ts:58</p>
        </div>
        <span className="ml-auto">
          <VerdictBadge verdict="likely_vulnerable" />
        </span>
      </div>

      <div className="border-rule bg-sunken/60 rounded-md border px-4 py-2">
        <p className="text-muted mb-1 text-[11px] font-semibold tracking-wide uppercase">
          Source → sink reachability
        </p>
        <Step answer="yes" label="User input reaches the operation" />
        <Step answer="yes" label="Input is attacker-controlled (req.query.name)" />
        <Step answer="no" label="An effective sanitizer guards the path" />
      </div>

      <div className="border-rule rounded-md border px-4 py-3">
        <p className="text-muted mb-1 text-[11px] font-semibold tracking-wide uppercase">
          Impact
        </p>
        <p className="text-ink text-[13px] leading-[20px]">
          A request such as{" "}
          <code className="mono text-signal">?file=../../etc/passwd</code> is joined to the serve
          root without normalization, allowing reads outside the intended directory.
        </p>
      </div>

      <p className="text-muted flex items-center gap-1.5 text-[12px]">
        <ShieldCheck className="text-vg size-3.5" />
        Every cited line is verified against the exact code the assistant was shown.
      </p>
    </div>
  );
}

function DisclosureTab() {
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <FileText className="text-muted size-4" />
        <p className="text-ink text-[13.5px] font-medium">Responsible-disclosure package</p>
      </div>
      <div className="border-rule bg-sunken/60 mono rounded-md border p-4 text-[12px] leading-[20px]">
        <p className="text-muted"># CVE Record (5.1) · draft</p>
        <p className="text-ink mt-2">title: Path traversal in file-serving route</p>
        <p className="text-ink">cwe: CWE-22</p>
        <p className="text-ink">cvss: 7.5 (AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N)</p>
        <p className="text-ink">
          state: <span className="text-med">validated · awaiting vendor notice</span>
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {["CVE 5.1 JSON", "OSV", "PDF report", "Markdown"].map((x) => (
          <span
            key={x}
            className="border-rule bg-raised text-muted inline-flex h-6 items-center rounded-sm border px-2 text-[11px] font-medium"
          >
            {x}
          </span>
        ))}
      </div>
      <div className="text-muted flex items-center gap-2 text-[12px]">
        <Minus className="size-3.5" />
        Timeline, evidence and chain-of-custody hashes travel with the export.
      </div>
    </div>
  );
}

export function ProductDemo() {
  const [tab, setTab] = useState<TabKey>("findings");
  return (
    <div className="border-rule bg-raised/80 w-full overflow-hidden rounded-xl border shadow-2xl shadow-black/40 backdrop-blur">
      {/* Window chrome */}
      <div className="border-rule bg-sunken/70 flex items-center gap-2 border-b px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="bg-rule-strong/60 size-2.5 rounded-full" />
          <span className="bg-rule-strong/60 size-2.5 rounded-full" />
          <span className="bg-rule-strong/60 size-2.5 rounded-full" />
        </div>
        <span className="text-muted mono ml-2 truncate text-[11px]">
          kinetix · acme-web · assessment #7
        </span>
        <span className="border-signal/30 bg-signal/10 text-signal ml-auto hidden rounded-sm border px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase sm:inline">
          Illustrative preview
        </span>
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Product preview"
        className="border-rule flex items-center gap-1 border-b px-3"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              "relative -mb-px px-3 py-2.5 text-[13px] font-medium transition-colors",
              tab === t.key
                ? "text-ink border-signal border-b-2"
                : "text-muted hover:text-ink border-b-2 border-transparent",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-[316px]">
        {tab === "findings" ? <FindingsTab /> : null}
        {tab === "validation" ? <ValidationTab /> : null}
        {tab === "disclosure" ? <DisclosureTab /> : null}
      </div>
    </div>
  );
}
