import clsx from "clsx";
import { CalendarClock, FolderKanban, Layers } from "lucide-react";
import type { ReactNode } from "react";

import { SEVERITY_LABEL, SEVERITY_ORDER } from "@/lib/format";
import type { Project } from "@/lib/types";

import { CountUp } from "./count-up";
import {
  REVIEW_WINDOW_DAYS,
  SEVERITY_FILL,
  byRisk,
  countsOf,
  openOf,
  reviewOf,
  reviewPhrase,
  sumCounts,
  topSeverityOf,
  truncate,
} from "./lib";

export interface WorkspaceStats {
  projects: number;
  open: number;
  critical: number;
  high: number;
  withCritical: number;
  withHigh: number;
  withOpen: number;
  due: { project: Project; phrase: string; expired: boolean }[];
}

export function workspaceStats(projects: Project[], now: number): WorkspaceStats {
  const totals = sumCounts(projects);
  const due = projects
    .map((project) => ({ project, review: reviewOf(project, now) }))
    .filter(({ review }) => review.kind === "expired" || review.kind === "soon")
    .sort((a, b) => ("days" in a.review ? a.review.days : 0) - ("days" in b.review ? b.review.days : 0))
    .map(({ project, review }) => ({
      project,
      phrase: reviewPhrase(review),
      expired: review.kind === "expired",
    }));
  return {
    projects: projects.length,
    open: SEVERITY_ORDER.reduce((n, s) => n + totals[s], 0),
    critical: totals.critical,
    high: totals.high,
    withCritical: projects.filter((p) => countsOf(p).critical > 0).length,
    withHigh: projects.filter((p) => countsOf(p).high > 0).length,
    withOpen: projects.filter((p) => openOf(p) > 0).length,
    due,
  };
}

/** One line for under the greeting, from the same numbers as the KPI row. */
export function summarySentence(s: WorkspaceStats): string {
  if (s.projects === 0) return "No projects in this workspace yet. Your first one takes under a minute.";
  const parts: string[] = [];
  if (s.withCritical) {
    parts.push(
      `${s.withCritical} project${s.withCritical === 1 ? " has" : "s have"} open critical findings to validate`,
    );
  } else if (s.withHigh) {
    parts.push(`${s.withHigh} project${s.withHigh === 1 ? " has" : "s have"} open high-severity findings`);
  } else if (s.open) {
    parts.push(
      `No critical or high findings open across ${s.projects} project${s.projects === 1 ? "" : "s"}`,
    );
  } else {
    parts.push(`Nothing open across ${s.projects} project${s.projects === 1 ? "" : "s"}`);
  }
  if (s.due.length) {
    parts.push(`${s.due.length} authorization${s.due.length === 1 ? "" : "s"} due for review`);
  }
  return `${parts.join(", and ")}.`;
}

function Tile({
  label,
  icon,
  children,
  caption,
  footer,
  index,
}: {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
  caption: ReactNode;
  footer?: ReactNode;
  index: number;
}) {
  return (
    <div
      className={clsx(
        "kx-fade-up border-rule bg-raised hover:border-rule-strong flex min-w-0 flex-col gap-3 rounded-2xl border p-4 transition-colors xl:col-span-1",
        // Two per row on phones (the fifth spans both), 3 + 2 on tablets, one row of five on desktop.
        index < 3 ? "md:col-span-2" : "md:col-span-3",
        index === 4 && "col-span-2",
      )}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="text-muted flex items-center justify-between gap-2">
        <span className="eyebrow text-[10.5px]">{label}</span>
        {icon}
      </div>
      <div className="flex flex-col gap-1">
        <div className="display text-[34px] leading-none">{children}</div>
        <p className="text-muted min-h-[18px] truncate text-[12.5px]">{caption}</p>
      </div>
      {footer ? <div className="mt-auto">{footer}</div> : null}
    </div>
  );
}

/**
 * The KPI row. Numbers count up the first time they come into view; severity numbers use the
 * data colours, everything else stays monochrome.
 */
export function KpiRow({ projects, stats }: { projects: Project[]; stats: WorkspaceStats }) {
  const totals = sumCounts(projects);
  const constellation = [...projects].sort(byRisk).slice(0, 28);
  const nextDue = stats.due[0];
  return (
    <section aria-label="Workspace summary" className="grid grid-cols-2 gap-3 md:grid-cols-6 xl:grid-cols-5">
      <Tile
        index={0}
        label="Projects"
        icon={<FolderKanban className="size-4" aria-hidden />}
        caption={`${stats.withOpen} with open findings`}
        footer={
          <div className="flex flex-wrap gap-1" aria-hidden>
            {constellation.map((p) => {
              const sev = topSeverityOf(p);
              return (
                <span
                  key={p.slug}
                  title={p.name}
                  className="size-2 rounded-full"
                  style={
                    sev && sev !== "info"
                      ? { background: SEVERITY_FILL[sev] }
                      : { boxShadow: "inset 0 0 0 1px var(--rule-strong)" }
                  }
                />
              );
            })}
          </div>
        }
      >
        <CountUp value={stats.projects} />
      </Tile>

      <Tile
        index={1}
        label="Open findings"
        icon={<Layers className="size-4" aria-hidden />}
        caption={
          stats.open
            ? `Across ${stats.withOpen} project${stats.withOpen === 1 ? "" : "s"}`
            : "Nothing open to validate"
        }
        footer={
          <div
            className="bg-sunken flex h-1.5 gap-px overflow-hidden rounded-full"
            role="img"
            aria-label={SEVERITY_ORDER.map((s) => `${totals[s]} ${SEVERITY_LABEL[s].toLowerCase()}`).join(
              ", ",
            )}
          >
            {SEVERITY_ORDER.map((s) =>
              totals[s] ? (
                <span
                  key={s}
                  className="h-full"
                  style={{
                    width: `${(totals[s] / Math.max(1, stats.open)) * 100}%`,
                    background: SEVERITY_FILL[s],
                  }}
                />
              ) : null,
            )}
          </div>
        }
      >
        <CountUp value={stats.open} delay={60} />
      </Tile>

      <SeverityTile
        index={2}
        label="Critical"
        value={stats.critical}
        projects={stats.withCritical}
        share={stats.open ? stats.critical / stats.open : 0}
        severity="critical"
      />
      <SeverityTile
        index={3}
        label="High"
        value={stats.high}
        projects={stats.withHigh}
        share={stats.open ? stats.high / stats.open : 0}
        severity="high"
      />

      <Tile
        index={4}
        label="Due for review"
        icon={<CalendarClock className="size-4" aria-hidden />}
        caption={
          nextDue ? (
            <>
              <span className="text-ink">{truncate(nextDue.project.name, 22)}</span>
              {" · "}
              <span className={nextDue.expired ? "text-crit" : "text-med"}>{nextDue.phrase}</span>
            </>
          ) : (
            "Nothing due soon"
          )
        }
        footer={
          <p className="text-muted text-[11.5px] leading-4">
            Authorizations ending within {REVIEW_WINDOW_DAYS} days, or already ended.
          </p>
        }
      >
        <span className={clsx(stats.due.some((d) => d.expired) && "text-crit")}>
          <CountUp value={stats.due.length} delay={240} />
        </span>
      </Tile>
    </section>
  );
}

function SeverityTile({
  index,
  label,
  value,
  projects,
  share,
  severity,
}: {
  index: number;
  label: string;
  value: number;
  projects: number;
  share: number;
  severity: "critical" | "high";
}) {
  return (
    <Tile
      index={index}
      label={label}
      icon={
        <span
          aria-hidden
          className="h-3.5 w-[3px] rounded-sm"
          style={{ background: SEVERITY_FILL[severity] }}
        />
      }
      caption={value ? `In ${projects} project${projects === 1 ? "" : "s"}` : "None open"}
      footer={
        <div className="flex items-center gap-2">
          <div className="bg-sunken h-1.5 flex-1 overflow-hidden rounded-full">
            <span
              className="block h-full rounded-full"
              style={{ width: `${Math.round(share * 100)}%`, background: SEVERITY_FILL[severity] }}
            />
          </div>
          <span className="text-muted font-mono text-[11px]">{Math.round(share * 100)}%</span>
        </div>
      }
    >
      <span className={value ? (severity === "critical" ? "text-crit" : "text-high") : "text-muted"}>
        <CountUp value={value} delay={index * 60} />
      </span>
    </Tile>
  );
}
