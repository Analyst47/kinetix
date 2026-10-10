import clsx from "clsx";
import { ArrowRight, Check, FileText, GitCommitHorizontal, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

/*
 * Realistic, illustrative product visuals rendered as light "screenshots" that float on the
 * dark marketing surface. They use a fixed light palette (not the theme tokens) on purpose, so
 * they always read as product UI. The data is clearly fictional and labelled.
 */

function Window({
  path,
  children,
  className,
  tag = "Illustrative",
}: {
  path: string;
  children: ReactNode;
  className?: string;
  tag?: string;
}) {
  return (
    <div
      className={clsx(
        "overflow-hidden rounded-xl border border-black/10 bg-white text-[#16201c] shadow-2xl shadow-black/40 ring-1 ring-white/5",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-black/[0.07] bg-[#f6f7f5] px-3.5 py-2.5">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-black/15" />
          <span className="size-2.5 rounded-full bg-black/15" />
          <span className="size-2.5 rounded-full bg-black/15" />
        </span>
        <span className="ml-1 truncate font-mono text-[11px] text-[#5b6b63]">{path}</span>
        <span className="ml-auto shrink-0 rounded-full border border-[#0d6b5d]/20 bg-[#0d6b5d]/[0.06] px-2 py-0.5 text-[10px] font-medium tracking-wide text-[#0b6a5c] uppercase">
          {tag}
        </span>
      </div>
      {children}
    </div>
  );
}

function Sev({ level }: { level: "high" | "medium" | "critical" }) {
  const map = {
    critical: ["#b91c1c", "Critical"],
    high: ["#b4530a", "High"],
    medium: ["#8a6d0b", "Medium"],
  } as const;
  const [color, label] = map[level];
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color }}>
      <span className="h-3.5 w-[3px] rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

function Tag({ children, tone }: { children: ReactNode; tone: "teal" | "muted" | "red" }) {
  const styles = {
    teal: "border-[#0d6b5d]/25 bg-[#0d6b5d]/[0.07] text-[#0b6a5c]",
    muted: "border-black/10 bg-black/[0.03] text-[#5b6b63]",
    red: "border-[#b91c1c]/25 bg-[#b91c1c]/[0.06] text-[#b91c1c]",
  } as const;
  return (
    <span
      className={clsx(
        "inline-flex h-5 items-center rounded-[5px] border px-1.5 text-[11px] font-medium whitespace-nowrap",
        styles[tone],
      )}
    >
      {children}
    </span>
  );
}

/* ── Hero / data-flow validation ─────────────────────────────────────────── */
export function AttackAnalysisCard({ className }: { className?: string }) {
  return (
    <Window path="kinetix · acme-web · KX-1042" className={className}>
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <Sev level="high" />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold">Path traversal in file-serving route</p>
            <p className="mt-0.5 font-mono text-[11px] text-[#5b6b63]">src/routes/files.ts:58</p>
          </div>
          <Tag tone="red">Likely real</Tag>
        </div>

        <div className="rounded-lg border border-black/[0.07] bg-[#f7f8f6]">
          <p className="border-b border-black/[0.06] px-3 py-2 text-[10.5px] font-semibold tracking-wide text-[#5b6b63] uppercase">
            Data flow · source → sink
          </p>
          <ol className="flex flex-col">
            {[
              ["Source", "req.query.file", "attacker-controlled", true],
              ["Flow", "path.join(ROOT, file)", "no normalization", true],
              ["Sink", "fs.readFile(path)", "arbitrary file read", true],
            ].map(([k, code, note], i, arr) => (
              <li key={k as string} className="relative flex items-center gap-3 px-3 py-2">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#0d6b5d]/10 text-[#0b6a5c]">
                  <Check className="size-3" />
                </span>
                <span className="w-12 shrink-0 text-[11px] font-medium text-[#5b6b63]">{k}</span>
                <code className="truncate font-mono text-[12px] text-[#16201c]">{code}</code>
                <span className="ml-auto shrink-0 text-[11px] text-[#5b6b63]">{note}</span>
                {i < arr.length - 1 ? (
                  <span className="absolute top-[30px] left-[21px] h-[14px] w-px bg-[#0d6b5d]/25" />
                ) : null}
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-lg border border-black/[0.07] bg-[#0f1512] p-3 font-mono text-[11.5px] leading-[1.7] text-[#d7e2db]">
          <p className="text-[#7f8c85]">$ reproduce</p>
          <p className="text-[#d7e2db]">
            curl &apos;/download?file=<span className="text-[#f0a35e]">../../../../etc/passwd</span>&apos;
          </p>
          <p className="text-[#6fcbb3]">root:x:0:0:root:/root:/bin/bash …</p>
        </div>

        <div className="flex items-center gap-2 text-[11.5px] text-[#5b6b63]">
          <ShieldCheck className="size-3.5 text-[#0b6a5c]" />
          Every cited line verified against the exact source shown.
          <Tag tone="muted">CWE-22</Tag>
        </div>
      </div>
    </Window>
  );
}

/* ── Findings list / confidence + verdicts ───────────────────────────────── */
export function FindingsCard({ className }: { className?: string }) {
  const rows: [string, "high" | "medium" | "critical", string, "teal" | "muted", string, "red" | "muted"][] = [
    ["SSRF in webhook fetch", "high", "Firm", "teal", "Likely real", "red"],
    ["Path traversal in file route", "high", "Firm", "teal", "Likely real", "red"],
    ["lodash 4.17.19 · CVE-2020-8203", "medium", "Firm", "teal", "Needs context", "muted"],
    ["Reflected value — possible XSS", "medium", "Tentative", "muted", "False positive", "muted"],
    ["Hardcoded credential pattern", "high", "Tentative", "muted", "False positive", "muted"],
  ];
  return (
    <Window path="kinetix · acme-web · findings" className={className}>
      <div className="flex flex-col divide-y divide-black/[0.06]">
        {rows.map(([title, sev, conf, confTone, verdict, vTone]) => (
          <div key={title} className="flex items-center gap-3 px-4 py-2.5">
            <Sev level={sev} />
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{title}</span>
            <Tag tone={confTone}>{conf}</Tag>
            <span className="hidden sm:block">
              <Tag tone={vTone}>{verdict}</Tag>
            </span>
          </div>
        ))}
      </div>
    </Window>
  );
}

/* ── Human in the loop / you confirm ─────────────────────────────────────── */
export function ConfirmCard({ className }: { className?: string }) {
  return (
    <Window path="kinetix · validate KX-1039" className={className}>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          <Sev level="high" />
          <p className="flex-1 text-[13px] font-semibold">Server-side request forgery in webhook fetch</p>
          <Tag tone="red">Likely real</Tag>
        </div>
        <p className="text-[12.5px] leading-[1.6] text-[#4c5a52]">
          KinetixZero won&apos;t mark this confirmed for you. Review the evidence, reproduce it, then
          record your verdict.
        </p>
        <div className="flex flex-col gap-2">
          <p className="text-[10.5px] font-semibold tracking-wide text-[#5b6b63] uppercase">Your call</p>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#0d6b5d] px-3 text-[12.5px] font-medium text-white">
              <Check className="size-3.5" /> Confirm real
            </span>
            <span className="inline-flex h-8 items-center rounded-md border border-black/15 px-3 text-[12.5px] font-medium text-[#16201c]">
              False positive
            </span>
            <span className="inline-flex h-8 items-center rounded-md border border-black/15 px-3 text-[12.5px] font-medium text-[#16201c]">
              Needs work
            </span>
          </div>
        </div>
      </div>
    </Window>
  );
}

/* ── Remediation draft (diff) ────────────────────────────────────────────── */
export function RemediationCard({ className }: { className?: string }) {
  return (
    <Window path="kinetix · remediation draft" className={className} tag="Draft">
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <GitCommitHorizontal className="size-4 text-[#0b6a5c]" />
          <p className="text-[13px] font-semibold">Suggested fix · you review before applying</p>
        </div>
        <div className="overflow-hidden rounded-lg border border-black/[0.07] font-mono text-[11.5px] leading-[1.9]">
          <div className="bg-[#fbeceb] px-3 text-[#9b2c2c]">
            <span className="mr-2 text-[#c98a8a]">-</span>const p = path.join(ROOT, req.query.file)
          </div>
          <div className="bg-[#e9f6ee] px-3 text-[#1b6b3a]">
            <span className="mr-2 text-[#7cc295]">+</span>const p = path.normalize(path.join(ROOT, req.query.file))
          </div>
          <div className="bg-[#e9f6ee] px-3 text-[#1b6b3a]">
            <span className="mr-2 text-[#7cc295]">+</span>if (!p.startsWith(ROOT)) throw new ForbiddenError()
          </div>
        </div>
        <p className="text-[11.5px] text-[#5b6b63]">
          KinetixZero drafts the patch and the CWE-mapped guidance; applying it stays a human edit.
        </p>
      </div>
    </Window>
  );
}

/* ── Disclosure package ──────────────────────────────────────────────────── */
export function DisclosureCard({ className }: { className?: string }) {
  return (
    <Window path="kinetix · disclosure" className={className}>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-[#5b6b63]" />
          <p className="text-[13px] font-semibold">Responsible-disclosure package</p>
          <Tag tone="muted">Validated</Tag>
        </div>
        <div className="rounded-lg border border-black/[0.07] bg-[#0f1512] p-3 font-mono text-[11px] leading-[1.8] text-[#d7e2db]">
          <p className="text-[#7f8c85]"># CVE Record 5.1 · draft</p>
          <p>title: Path traversal in file-serving route</p>
          <p>cwe: CWE-22 · cvss: 7.5 (AV:N/AC:L/PR:N/UI:N)</p>
          <p className="text-[#f0a35e]">state: awaiting vendor notice</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["CVE 5.1 JSON", "OSV", "PDF report", "Markdown"].map((x) => (
            <Tag key={x} tone="muted">
              {x}
            </Tag>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-[11.5px] text-[#5b6b63]">
          <ArrowRight className="size-3.5" /> Evidence and chain-of-custody hashes travel with every
          export.
        </div>
      </div>
    </Window>
  );
}

/* ── Compact mini visuals for the methodology row ────────────────────────── */
export function MiniAnalyze() {
  return (
    <div className="rounded-lg border border-black/[0.07] bg-white p-3 text-[#16201c] shadow-md">
      {[
        ["src/routes/files.ts", "high"],
        ["package-lock.json", "medium"],
        ["src/config/env.ts", "high"],
      ].map(([f, s]) => (
        <div key={f} className="flex items-center gap-2 py-1">
          <Sev level={s as "high" | "medium"} />
          <code className="font-mono text-[11px] text-[#5b6b63]">{f}</code>
        </div>
      ))}
    </div>
  );
}

export function MiniValidate() {
  return (
    <div className="rounded-lg border border-black/[0.07] bg-white p-3 text-[#16201c] shadow-md">
      {[
        ["input controlled", "yes"],
        ["reaches sink", "yes"],
        ["sanitized", "no"],
      ].map(([k, v]) => (
        <div key={k} className="flex items-center gap-2 py-1 text-[11.5px]">
          <span className="grid size-4 place-items-center rounded-full bg-[#0d6b5d]/10 text-[#0b6a5c]">
            <Check className="size-2.5" />
          </span>
          <span className="text-[#5b6b63]">{k}</span>
          <span className="ml-auto font-mono text-[#16201c]">{v}</span>
        </div>
      ))}
    </div>
  );
}

export function MiniDisclose() {
  return (
    <div className="flex flex-wrap gap-1.5 rounded-lg border border-black/[0.07] bg-white p-3 shadow-md">
      {["CVE 5.1", "OSV", "PDF", "Markdown", "Dataset"].map((x) => (
        <Tag key={x} tone="muted">
          {x}
        </Tag>
      ))}
    </div>
  );
}
