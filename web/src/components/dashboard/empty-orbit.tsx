"use client";

import { ArrowRight, GitBranch, ScanLine, ShieldCheck } from "lucide-react";

import { useShell } from "@/components/shell-context";
import { canCreateProjects } from "@/components/shell/switcher";
import { StarField } from "@/components/sky";
import { ButtonLink } from "@/components/ui";

import { useReducedMotion } from "./hooks";

const STEPS = [
  {
    icon: GitBranch,
    title: "Paste a repository",
    body: "A public GitHub URL you're authorized to analyze. It's fetched read-only, pinned to one commit.",
  },
  {
    icon: ScanLine,
    title: "Static analysis runs",
    body: "Taint rules, dependency advisories and secret detection. Nothing executes and no live system is touched.",
  },
  {
    icon: ShieldCheck,
    title: "You validate",
    body: "Findings land in triage with cited evidence. You confirm, reproduce and disclose.",
  },
];

/** The first-run state: an empty orbit waiting for its first project. */
export function EmptyOrbit({ org }: { org: string }) {
  const { org: membership } = useShell();
  const canCreate = canCreateProjects(membership.role);
  const reduceMotion = useReducedMotion();
  const initial = membership.name.trim().slice(0, 1).toUpperCase() || "W";
  return (
    <section
      aria-labelledby="empty-title"
      className="night border-rule relative isolate overflow-hidden rounded-3xl border"
    >
      <StarField density={0.6} />
      <div className="relative grid items-center gap-8 p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="kx-fade-up flex flex-col gap-6">
          <span className="eyebrow text-muted">Your workspace is ready</span>
          <h2 id="empty-title" className="display text-ink max-w-[16ch] text-[36px] sm:text-[46px]">
            Paste a GitHub repository to start.
          </h2>
          <p className="text-muted max-w-[52ch] text-[15px] leading-[24px]">
            Each project is one authorized research target with its own scope. KinetixZero analyzes the source
            statically and puts every finding in front of you to validate.
          </p>
          {canCreate ? (
            <div className="flex flex-wrap items-center gap-3">
              <ButtonLink variant="primary" href={`/${org}/new`} className="h-10 px-5 text-[14.5px]">
                New project
                <ArrowRight aria-hidden />
              </ButtonLink>
              <span className="text-muted font-mono text-[11px] tracking-[0.12em] uppercase">
                Takes under a minute
              </span>
            </div>
          ) : (
            <p className="border-rule text-muted rounded-xl border px-4 py-3 text-[13.5px]">
              Ask a workspace owner, admin or researcher to create the first project.
            </p>
          )}
          <ol className="grid gap-3 pt-2 sm:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <li
                key={title}
                className="kx-fade-up border-rule bg-raised/60 flex flex-col gap-2 rounded-2xl border p-4"
                style={{ animationDelay: `${200 + i * 90}ms` }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-muted font-mono text-[11px]">0{i + 1}</span>
                  <Icon className="text-ink size-4" aria-hidden />
                </div>
                <h3 className="text-ink text-[14px] font-semibold">{title}</h3>
                <p className="text-muted text-[12.5px] leading-[19px]">{body}</p>
              </li>
            ))}
          </ol>
        </div>

        <svg viewBox="-260 -260 520 520" className="mx-auto w-full max-w-[420px]" aria-hidden>
          {[110, 170, 230].map((r, i) => (
            <circle
              key={r}
              r={r}
              fill="none"
              stroke="#fff"
              strokeOpacity={0.12 - i * 0.025}
              strokeDasharray={i === 2 ? "3 8" : undefined}
            />
          ))}
          {/* A ghost project, waiting on the outer ring. */}
          <g className={reduceMotion ? undefined : "kx-spin-slow origin-center [transform-box:view-box]"}>
            <g transform="translate(0 -170)">
              <circle r="24" fill="#000" stroke="#fff" strokeOpacity="0.5" strokeDasharray="3 5" />
              <path
                d="M-8 0 H8 M0 -8 V8"
                stroke="#fff"
                strokeOpacity="0.8"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </g>
          </g>
          {!reduceMotion ? (
            <circle
              r="56"
              fill="none"
              stroke="#fff"
              strokeOpacity="0.3"
              className="kx-pulse-ring origin-center [transform-box:fill-box]"
            />
          ) : null}
          <circle r="56" fill="#000" stroke="#fff" strokeOpacity="0.55" />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-white font-sans text-[40px] font-semibold tracking-[-0.04em]"
          >
            {initial}
          </text>
        </svg>
      </div>
    </section>
  );
}
