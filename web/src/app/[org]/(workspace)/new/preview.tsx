import clsx from "clsx";
import { GitCommitHorizontal, ListChecks, ScanSearch } from "lucide-react";
import type { ReactNode } from "react";

import { AUTHORIZATION_LABEL, TRIAGE_NAME } from "@/lib/format";

import type { AuthType, Repo } from "./repo";

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

/**
 * The project's mark while it is being set up: a dashed orbit that turns while it waits for a
 * repository, then — echoing the KinetixZero logo — the ring closes, a path is traced from the
 * source node and an exit node lands just outside it.
 */
function OrbitMark({ seed }: { seed: string | null }) {
  return (
    <svg viewBox="0 0 48 48" className="text-ink size-12 shrink-0" aria-hidden fill="none">
      {seed ? (
        <g key={seed}>
          <path
            d="M40.45 14.5 A19 19 0 1 1 33.5 7.55"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset="1"
            className="animate-[kx-draw_0.9s_cubic-bezier(0.65,0,0.35,1)_forwards]"
          />
          <path
            d="M24 24 L38 10"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset="1"
            className="animate-[kx-draw_0.5s_cubic-bezier(0.4,0,0.2,1)_0.55s_forwards]"
          />
          <circle
            cx="38"
            cy="10"
            r="3.4"
            fill="currentColor"
            className="animate-[kx-pop_0.45s_cubic-bezier(0.34,1.56,0.64,1)_0.95s_both]"
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          />
        </g>
      ) : (
        <circle
          cx="24"
          cy="24"
          r="19"
          stroke="currentColor"
          strokeOpacity="0.4"
          strokeWidth="1.5"
          strokeDasharray="2 4.5"
          className="kx-spin-slow"
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
      )}
      <circle cx="24" cy="24" r="2.6" fill="currentColor" />
    </svg>
  );
}

function Row({
  label,
  done,
  children,
  sub,
}: {
  label: string;
  done: boolean;
  children: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="min-w-0 px-5 py-3">
      <dt className="text-muted flex items-center gap-3 font-mono text-[10.5px] leading-4 font-medium tracking-[0.14em] uppercase">
        <span
          aria-hidden
          className={clsx(
            "size-[9px] shrink-0 rounded-full transition-colors duration-300",
            done ? "bg-ink" : "border-rule-strong border-[1.5px] border-dashed",
          )}
        />
        {label}
      </dt>
      <dd className="mt-1 min-w-0 pl-[21px] text-[13.5px] leading-5">{children}</dd>
      {sub ? <dd className="text-muted mt-0.5 min-w-0 pl-[21px] text-xs leading-4">{sub}</dd> : null}
    </div>
  );
}

/**
 * Text that fades up whenever a choice changes it, so every pick visibly lands in the record.
 * Typed text passes `typed` so it doesn't re-animate on every keystroke.
 */
function Live({ value, typed, className }: { value: string; typed?: boolean; className?: string }) {
  return (
    <span key={typed ? "typed" : value} className={clsx("kx-fade-up block", className)}>
      {value}
    </span>
  );
}

const Pending = ({ children }: { children: ReactNode }) => <span className="text-muted">{children}</span>;

export function Preview({
  org,
  name,
  slug,
  mode,
  repo,
  revealed,
  authType,
  reference,
  inScope,
  outScope,
  expires,
  noExpiry,
  today,
  attest,
  userName,
  ready,
  total,
  typed,
}: {
  org: string;
  name: string;
  slug: string;
  mode: "repo" | "none";
  repo: Repo | null;
  revealed: boolean;
  authType: AuthType;
  reference: string | null;
  inScope: string;
  outScope: string;
  expires: Date | null;
  noExpiry: boolean;
  today: Date | null;
  attest: boolean;
  userName: string;
  ready: number;
  total: number;
  /** Which values are being typed (rather than picked). */
  typed: { name: boolean; inScope: boolean; outScope: boolean };
}) {
  const days = expires && today ? Math.floor((expires.getTime() - today.getTime()) / 86_400_000) : null;
  const complete = ready === total;
  return (
    <div className="border-rule bg-raised overflow-hidden rounded-2xl border shadow-[0_1px_0_rgb(0_0_0/0.03),0_24px_60px_-40px_rgb(0_0_0/0.5)]">
      <div className="border-rule border-b px-5 pt-5 pb-4">
        <div className="flex items-center gap-2">
          <p className="eyebrow text-muted text-[10.5px]">What will be recorded</p>
          <p className="text-muted ml-auto font-mono text-[11px]">
            <span className="text-ink">{ready}</span>/{total} ready
          </p>
        </div>
        <div className="mt-4 flex items-center gap-3.5">
          <OrbitMark seed={repo?.url ?? (mode === "none" && revealed ? "none" : null)} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] leading-6 font-semibold tracking-[-0.015em]">
              {name.trim() ? (
                <Live value={name.trim()} typed={typed.name} className="truncate" />
              ) : (
                <Pending>Untitled project</Pending>
              )}
            </p>
            <p className="text-muted truncate font-mono text-[12px] leading-5">
              /{org}/{name.trim() ? <span className="text-ink">{slug}</span> : "…"}
            </p>
          </div>
        </div>
        <div className="bg-rule mt-4 h-[3px] overflow-hidden rounded-full" aria-hidden>
          <div
            className="bg-ink h-full origin-left rounded-full transition-transform duration-500 ease-[cubic-bezier(0.2,0.7,0.2,1)]"
            style={{ transform: `scaleX(${ready / total})` }}
          />
        </div>
      </div>

      <dl className="divide-rule divide-y">
        <Row
          label="Repository"
          done={mode === "none" || repo !== null}
          sub={repo ? `${repo.host} · default branch · one commit` : undefined}
        >
          {repo ? (
            <Live value={repo.display} className="font-mono text-[12.5px] break-all" />
          ) : mode === "none" ? (
            <Live value="None yet — upload a .zip or .tar.gz after creating" />
          ) : (
            <Pending>Waiting for a repository link</Pending>
          )}
        </Row>
        <Row
          label="Authorization"
          done={revealed}
          sub={
            revealed && reference ? (
              <span className="block truncate font-mono text-[11.5px]">
                {reference.replace(/^https:\/\//, "")}
              </span>
            ) : undefined
          }
        >
          {revealed ? <Live value={AUTHORIZATION_LABEL[authType] ?? authType} /> : <Pending>—</Pending>}
        </Row>
        <Row label="In scope" done={revealed && inScope.trim().length >= 3}>
          {revealed && inScope.trim() ? (
            <Live value={inScope.trim()} typed={typed.inScope} className="line-clamp-3" />
          ) : (
            <Pending>—</Pending>
          )}
        </Row>
        <Row label="Out of scope" done={revealed}>
          {revealed ? (
            <Live
              value={outScope.trim() || "Nothing listed"}
              typed={typed.outScope}
              className="line-clamp-3"
            />
          ) : (
            <Pending>—</Pending>
          )}
        </Row>
        <Row
          label="Review by"
          done={revealed}
          sub={
            revealed && days !== null
              ? `In ${days} days — new scans pause after this until you renew`
              : revealed && noExpiry
                ? "Scans stay allowed until you set a date"
                : undefined
          }
        >
          {!revealed ? (
            <Pending>—</Pending>
          ) : noExpiry ? (
            <Live value="No expiry set" />
          ) : expires ? (
            <Live value={dateFmt.format(expires)} />
          ) : (
            <Pending>…</Pending>
          )}
        </Row>
        <Row
          label="Attestation"
          done={attest}
          sub={attest ? "Stored with your name and the time you create the project" : undefined}
        >
          {attest ? <Live value={`Confirmed by ${userName}`} /> : <Pending>Not confirmed yet</Pending>}
        </Row>
      </dl>

      <div className="border-rule bg-sunken border-t px-5 py-4">
        <p className="eyebrow text-muted text-[10.5px]">{complete ? "Ready — then" : "What happens next"}</p>
        <ol className="mt-3 flex flex-col gap-2.5">
          {[
            {
              icon: GitCommitHorizontal,
              text: "One commit is fetched over HTTPS — no hooks, submodules or LFS.",
            },
            {
              icon: ScanSearch,
              text: "Read-only static analysis: taint rules, dependency advisories, secret detection.",
            },
            {
              icon: ListChecks,
              text: `Findings land in your queue. ${TRIAGE_NAME} drafts cited hypotheses; you decide.`,
            },
          ].map(({ icon: Icon, text }, i) => (
            <li key={text} className="flex items-start gap-2.5 text-[12.5px] leading-[18px]">
              <span
                className={clsx(
                  "border-rule bg-raised grid size-6 shrink-0 place-items-center rounded-full border transition-colors duration-300",
                  complete && "border-ink text-ink",
                  !complete && "text-muted",
                )}
                style={{ transitionDelay: complete ? `${i * 120}ms` : "0ms" }}
              >
                <Icon className="size-3.5" aria-hidden />
              </span>
              <span className={complete ? "text-ink" : "text-muted"}>{text}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
