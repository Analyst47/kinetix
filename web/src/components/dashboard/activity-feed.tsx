import {
  ArrowRight,
  ArrowRightLeft,
  Bug,
  Database,
  FileDown,
  FolderPlus,
  GitBranch,
  History,
  Paperclip,
  PencilLine,
  ScanLine,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  AI_VERDICT_LABEL,
  SEVERITY_LABEL,
  STATUS_LABEL,
  TRIAGE_NAME,
  fullDate,
  relative,
} from "@/lib/format";
import type { AuditEvent, FindingStatus, Severity } from "@/lib/types";

import { SEVERITY_FILL } from "./lib";

type Icon = typeof Bug;

interface Line {
  icon: Icon;
  /** What happened, after the actor's name. */
  text: ReactNode;
  /** A short extra detail line. */
  detail?: string;
  severity?: Severity;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const Subject = ({ children }: { children: ReactNode }) => (
  <span className="text-ink font-mono text-[12.5px]">{children}</span>
);

/** A human sentence for an audit entry; unknown actions fall back to the raw action name. */
function describe(e: AuditEvent): Line {
  const d = e.data ?? {};
  const subject = <Subject>{e.subject_id}</Subject>;
  switch (e.action) {
    case "project.created":
      return { icon: FolderPlus, text: <>created project {subject}</> };
    case "project.deleted": {
      const findings = num(d.findings);
      return {
        icon: Trash2,
        text: <>deleted project {str(d.name) ? <Subject>{String(d.name)}</Subject> : subject}</>,
        detail: findings !== null ? `${findings} finding${findings === 1 ? "" : "s"} removed` : undefined,
      };
    }
    case "target.added":
      return {
        icon: GitBranch,
        text: <>added target {<Subject>{str(d.name) ?? "source"}</Subject>}</>,
        detail: str(d.url) ?? (str(d.kind) === "archive" ? "Source archive" : undefined),
      };
    case "target.fetched":
      return {
        icon: GitBranch,
        text: <>fetched {<Subject>{str(d.url)?.replace(/^https:\/\//, "") ?? "a repository"}</Subject>}</>,
      };
    case "target.fetch_failed":
      return {
        icon: GitBranch,
        text: <>couldn&apos;t fetch a repository</>,
        detail: str(d.error) ?? undefined,
      };
    case "scan.started":
      return {
        icon: ScanLine,
        text: <>started scan {subject}</>,
        detail: str(d.target) ? `on ${String(d.target)}` : undefined,
      };
    case "scan.finished":
      return {
        icon: ScanLine,
        text: (
          <>
            scan {subject} {str(d.status) === "failed" ? "failed" : "finished"}
          </>
        ),
      };
    case "finding.created": {
      const sev = str(d.severity) as Severity | null;
      return {
        icon: Bug,
        text: <>logged finding {subject}</>,
        detail: str(d.title) ?? undefined,
        severity: sev && sev in SEVERITY_FILL ? sev : undefined,
      };
    }
    case "finding.status_changed": {
      const to = str(d.to) as FindingStatus | null;
      return {
        icon: ArrowRightLeft,
        text: (
          <>
            moved {subject} to{" "}
            <span className="text-ink">{to ? (STATUS_LABEL[to] ?? to) : "a new status"}</span>
          </>
        ),
      };
    }
    case "finding.updated":
      return { icon: PencilLine, text: <>edited finding {subject}</> };
    case "finding.labeled":
      return {
        icon: Tag,
        text: (
          <>
            labelled {subject} as{" "}
            <span className="text-ink">{str(d.label) === "vulnerable" ? "real" : "a false positive"}</span>
          </>
        ),
      };
    case "evidence.attached":
      return { icon: Paperclip, text: <>attached evidence to {subject}</> };
    case "report.exported":
      return {
        icon: FileDown,
        text: <>exported a report for {subject}</>,
        detail: str(d.format)?.toUpperCase(),
      };
    case "dataset.exported":
      return {
        icon: Database,
        text: <>exported the training dataset for {subject}</>,
        detail: num(d.findings) !== null ? `${d.findings} records` : undefined,
      };
    case "disclosure.started":
      return { icon: Send, text: <>started a disclosure for {subject}</> };
    case "disclosure.updated":
      return { icon: Send, text: <>updated the disclosure for {subject}</> };
    case "ai.analysis": {
      const verdict = str(d.verdict);
      return {
        icon: Sparkles,
        text: (
          <>
            ran {TRIAGE_NAME} on {subject}
          </>
        ),
        detail: verdict ? `Suggested: ${AI_VERDICT_LABEL[verdict] ?? verdict}` : undefined,
      };
    }
    case "ai.triage": {
      const reviewed = num(d.reviewed);
      return {
        icon: Sparkles,
        text: (
          <>
            ran {TRIAGE_NAME} across {subject}
          </>
        ),
        detail: reviewed !== null ? `${reviewed} finding${reviewed === 1 ? "" : "s"} reviewed` : undefined,
      };
    }
    case "ai.question":
      return {
        icon: Sparkles,
        text: (
          <>
            asked {TRIAGE_NAME} about {subject}
          </>
        ),
      };
    case "ai.draft_description":
      return {
        icon: Sparkles,
        text: (
          <>
            drafted a description for {subject} with {TRIAGE_NAME}
          </>
        ),
      };
    case "ai.draft_remediation":
      return {
        icon: Sparkles,
        text: (
          <>
            drafted remediation for {subject} with {TRIAGE_NAME}
          </>
        ),
      };
    case "ai.settings_changed":
      return {
        icon: Settings2,
        text: <>turned AI assistance {d.enabled ? "on" : "off"}</>,
      };
    case "member.invited":
      return {
        icon: UserPlus,
        text: <>invited {subject}</>,
        detail: str(d.role) ? `as ${d.role}` : undefined,
      };
    case "member.joined":
      return {
        icon: UserCheck,
        text: <>joined the workspace</>,
        detail: str(d.role) ? `as ${d.role}` : undefined,
      };
    case "member.role_changed":
      return {
        icon: ShieldCheck,
        text: (
          <>
            changed {subject}&apos;s role to <span className="text-ink">{str(d.to) ?? "a new role"}</span>
          </>
        ),
      };
    case "member.invite_revoked":
      return { icon: UserX, text: <>revoked the invite for {subject}</> };
    default:
      return {
        icon: History,
        text: (
          <>
            <span className="text-ink font-mono text-[12.5px]">{e.action}</span>
            {e.subject_id ? <> · {subject}</> : null}
          </>
        ),
      };
  }
}

/**
 * The last few audit-log entries as a readable timeline. Only rendered for roles that can read
 * the audit log (owner, admin, reviewer).
 */
export function ActivityFeed({ org, events, now }: { org: string; events: AuditEvent[]; now: number }) {
  return (
    <section
      aria-labelledby="activity-title"
      className="border-rule bg-raised flex flex-col rounded-2xl border xl:sticky xl:top-20"
    >
      <header className="border-rule flex items-center gap-2 border-b px-5 py-3.5">
        <h2 id="activity-title" className="text-[14.5px] leading-[22px] font-semibold tracking-[-0.01em]">
          Recent activity
        </h2>
        <Link
          href={`/${org}/audit`}
          className="text-muted hover:text-ink ml-auto inline-flex items-center gap-1 text-[12.5px] font-medium transition-colors"
        >
          Audit log
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </header>
      {events.length === 0 ? (
        <p className="text-muted px-5 py-8 text-[13.5px]">
          Nothing recorded yet. Changes in this workspace show up here.
        </p>
      ) : (
        <ol className="flex flex-col px-5 py-4">
          {events.map((e, i) => {
            const line = describe(e);
            const Icon = line.icon;
            const last = i === events.length - 1;
            return (
              <li
                key={e.seq}
                className="kx-fade-up relative flex gap-3 pb-4 last:pb-0"
                style={{ animationDelay: `${120 + i * 55}ms` }}
              >
                {!last ? (
                  <span aria-hidden className="bg-rule absolute top-8 bottom-0 left-[13.5px] w-px" />
                ) : null}
                <span className="border-rule bg-paper text-muted relative grid size-7 shrink-0 place-items-center rounded-full border">
                  <Icon className="size-3.5" aria-hidden />
                  {line.severity ? (
                    <span
                      aria-hidden
                      className="ring-raised absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2"
                      style={{ background: SEVERITY_FILL[line.severity] }}
                    />
                  ) : null}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
                  <p className="text-muted text-[13px] leading-5 break-words">
                    <span className="text-ink font-medium">{e.actor_label}</span> {line.text}
                    {line.severity ? (
                      <span className="sr-only"> ({SEVERITY_LABEL[line.severity]})</span>
                    ) : null}
                  </p>
                  <p className="text-muted flex min-w-0 gap-1.5 text-[12px] leading-4">
                    <time dateTime={e.created_at} title={fullDate(e.created_at)} className="shrink-0">
                      {relative(e.created_at, now)}
                    </time>
                    {line.detail ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className="truncate">{line.detail}</span>
                      </>
                    ) : null}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <footer className="border-rule text-muted mt-auto flex items-center gap-2 border-t px-5 py-3 font-mono text-[10.5px] tracking-[0.14em] uppercase">
        <ShieldCheck className="size-3.5" aria-hidden />
        Hash-chained, tamper-evident log
      </footer>
    </section>
  );
}
