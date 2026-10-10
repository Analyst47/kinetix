"use client";

import clsx from "clsx";
import { ArrowUpRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { createContext, useCallback, useContext, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import { Dialog } from "@/components/dialog";
import { ButtonLink } from "@/components/ui";
import { TRIAGE_NAME, shortDate, usageSummary } from "@/lib/format";
import type { Usage } from "@/lib/types";

const NODE: CSSProperties = { transformBox: "fill-box", transformOrigin: "center" };

/** 0–1 share of the allowance still available (1 for unlimited). */
function remainingShare(usage: Usage): number {
  if (usage.unlimited) return 1;
  if (!usage.searches_limit) return 0;
  return Math.min(1, Math.max(0, (usage.searches_remaining ?? 0) / usage.searches_limit));
}

/** "Owner · unlimited" / "Sponsored · unlimited" for sponsored accounts. */
export function unlimitedLabel(usage: Usage): string {
  if (usage.sponsor === "owner") return "Owner · unlimited";
  if (usage.sponsor === "team") return "Sponsored · unlimited";
  return "Unlimited";
}

/**
 * A figure-eight with a highlight flowing round it. `flow` animates the highlight; the glyph
 * reads as a plain infinity sign with motion reduced.
 */
export function InfinityGlyph({ className, flow = true }: { className?: string; flow?: boolean }) {
  const d =
    "M12 12C10 9.33 8 8 6 8a4 4 0 1 0 0 8c2 0 4-1.33 6-4c2-2.67 4-4 6-4a4 4 0 1 1 0 8c-2 0-4-1.33-6-4Z";
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={clsx("shrink-0", className)}>
      <path d={d} stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" opacity={flow ? 0.35 : 1} />
      {flow ? (
        <path
          d={d}
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="0.24 0.76"
          className="animate-[kx-dash-flow_3.2s_linear_infinite]"
        />
      ) : null}
    </svg>
  );
}

const TICKS = 30;
const SWEEP = 270;

/**
 * Segmented 270° gauge. Lit ticks are the share of runs left; they charge in one after another
 * on mount and again whenever the value changes. Unlimited lights every tick with a slow wave
 * travelling round the ring.
 */
export function TriageGauge({ usage, size = 56 }: { usage: Usage; size?: number }) {
  const share = remainingShare(usage);
  const lit = usage.unlimited
    ? TICKS
    : (usage.searches_remaining ?? 0) > 0
      ? Math.max(1, Math.round(share * TICKS))
      : 0;
  const wave = 3.6;
  return (
    <span
      role="meter"
      aria-label={`${TRIAGE_NAME} runs remaining`}
      aria-valuemin={0}
      aria-valuemax={usage.searches_limit ?? undefined}
      aria-valuenow={usage.searches_remaining ?? undefined}
      aria-valuetext={usageSummary(usage)}
      className="relative inline-grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 60 60" className="absolute inset-0 size-full" aria-hidden>
        {/* key: replay the charge when the value changes (e.g. after a triage run). */}
        <g key={`${lit}-${usage.unlimited}`} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          {Array.from({ length: TICKS }, (_, i) => {
            const angle = -SWEEP / 2 + (i * SWEEP) / (TICKS - 1);
            const on = i < lit;
            return (
              <g key={i} transform={`rotate(${angle} 30 30)`}>
                <line
                  x1="30"
                  y1="3.5"
                  x2="30"
                  y2={i % 5 === 0 ? "9.5" : "8"}
                  opacity={on ? 1 : 0.16}
                  style={
                    on
                      ? {
                          ...NODE,
                          animationDelay: usage.unlimited
                            ? `${-((TICKS - i) / TICKS) * wave}s`
                            : `${0.25 + i * 0.024}s`,
                        }
                      : undefined
                  }
                  className={
                    on
                      ? usage.unlimited
                        ? "animate-[kx-tick-wave_3.6s_ease-in-out_infinite]"
                        : "animate-[kx-pop_0.36s_cubic-bezier(0.34,1.56,0.64,1)_both]"
                      : undefined
                  }
                />
              </g>
            );
          })}
        </g>
      </svg>
      <span className="relative flex flex-col items-center leading-none">
        {usage.unlimited ? (
          <InfinityGlyph className="size-[22px]" />
        ) : (
          <>
            <span className="text-[15px] font-semibold tracking-[-0.02em] tabular-nums">
              {(usage.searches_remaining ?? 0).toLocaleString("en-US")}
            </span>
            <span className="text-muted mt-0.5 font-mono text-[8px] tracking-[0.14em] uppercase">left</span>
          </>
        )}
      </span>
    </span>
  );
}

/** Sidebar card: the gauge, the plan, and the way to get more. */
export function UsageMeter({ usage, org }: { usage: Usage; org: string }) {
  const out = !usage.unlimited && usage.searches_remaining === 0;
  const upsell = !usage.unlimited && (out || usage.plan === "free");
  return (
    <Link
      href={`/${org}/billing`}
      title={usageSummary(usage)}
      className="group/meter border-rule bg-raised/70 hover:border-rule-strong relative flex flex-col gap-2.5 overflow-hidden rounded-2xl border p-3 backdrop-blur-sm transition-colors"
    >
      {usage.unlimited ? (
        // A calm monochrome sheen across the card for unlimited accounts.
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 animate-[kx-shimmer_7s_linear_infinite] bg-[linear-gradient(100deg,transparent_35%,rgb(255_255_255/0.05)_50%,transparent_65%)] bg-[length:200%_100%]"
        />
      ) : null}
      <div className="relative flex items-center gap-3">
        <TriageGauge usage={usage} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className="text-muted font-mono text-[9.5px] font-medium tracking-[0.16em] uppercase">
              {TRIAGE_NAME}
            </span>
            <ArrowUpRight
              aria-hidden
              className="text-muted ml-auto size-3.5 shrink-0 opacity-0 transition-[opacity,translate] duration-200 group-hover/meter:translate-x-0.5 group-hover/meter:-translate-y-0.5 group-hover/meter:opacity-100"
            />
          </div>
          {usage.unlimited ? (
            <>
              <span className="truncate text-[13.5px] font-semibold tracking-[-0.01em]">
                {unlimitedLabel(usage)}
              </span>
              <span className="text-muted truncate text-[11.5px]">
                {usage.sponsor === "team" ? "Sponsored by your workspace owner" : "No quota on your runs"}
              </span>
            </>
          ) : (
            <>
              <span className="truncate text-[13.5px] font-semibold tracking-[-0.01em] tabular-nums">
                {(usage.searches_remaining ?? 0).toLocaleString("en-US")}
                <span className="text-muted font-normal">
                  {" "}
                  / {(usage.searches_limit ?? 0).toLocaleString("en-US")}
                </span>
                <span className="border-rule text-muted ml-1.5 inline-flex h-4 items-center rounded-full border px-1.5 align-[1px] font-mono text-[8.5px] font-medium tracking-[0.12em] uppercase">
                  {usage.plan_name}
                </span>
              </span>
              <span className="text-muted truncate text-[11.5px]">
                {usage.ai_period === "lifetime" ? "free runs left" : "runs left this month"}
                {usage.resets_at ? ` · resets ${shortDate(usage.resets_at)}` : ""}
              </span>
            </>
          )}
        </div>
      </div>
      {upsell ? (
        <span className="border-rule text-ink relative flex items-center justify-between border-t pt-2.5 text-[12px] font-medium">
          {out ? `Upgrade to keep using ${TRIAGE_NAME}` : "Upgrade for more runs"}
          <ArrowUpRight
            aria-hidden
            className="size-3.5 transition-transform group-hover/meter:translate-x-0.5 group-hover/meter:-translate-y-0.5"
          />
        </span>
      ) : null}
    </Link>
  );
}

/** A small progress ring for the top-bar chip. */
function MiniRing({ share }: { share: number }) {
  const pct = Math.round(share * 100);
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0 -rotate-90" aria-hidden>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.18" />
      {pct > 0 ? (
        <circle
          key={pct}
          cx="8"
          cy="8"
          r="6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${pct} 200`}
          style={{ strokeDashoffset: pct + 1 }}
          className="animate-[kx-draw_1s_cubic-bezier(0.2,0.7,0.2,1)_0.2s_forwards]"
        />
      ) : null}
    </svg>
  );
}

/**
 * Top-bar status chip: runs left (or Unlimited) at a glance, with the feature name sliding out
 * on hover. Links to Plan & usage.
 */
export function TriageChip({ usage, org, className }: { usage: Usage; org: string; className?: string }) {
  const out = !usage.unlimited && usage.searches_remaining === 0;
  return (
    <Link
      href={`/${org}/billing`}
      title={usageSummary(usage)}
      aria-label={`${TRIAGE_NAME}: ${usageSummary(usage)}`}
      className={clsx(
        "group/chip border-rule bg-raised text-ink hover:border-rule-strong inline-flex h-9 items-center gap-2 rounded-full border pr-3 pl-2.5 text-[12.5px] font-medium whitespace-nowrap transition-colors",
        out && "border-dashed",
        className,
      )}
    >
      {usage.unlimited ? <InfinityGlyph className="size-4" /> : <MiniRing share={remainingShare(usage)} />}
      <span className="text-muted max-w-0 overflow-hidden opacity-0 transition-[max-width,opacity] duration-300 ease-out group-hover/chip:max-w-[120px] group-hover/chip:opacity-100">
        {TRIAGE_NAME} ·
      </span>
      <span className="tabular-nums">
        {usage.unlimited
          ? usage.sponsor === "team"
            ? "Sponsored"
            : "Unlimited"
          : `${(usage.searches_remaining ?? 0).toLocaleString("en-US")} left`}
      </span>
    </Link>
  );
}

/** The state shown when a user has used all their Agentic Triage runs. */
export function UpgradeDialog({
  open,
  onClose,
  org,
  message,
}: {
  open: boolean;
  onClose: () => void;
  org: string;
  message?: string | null;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="You're out of Agentic Triage runs"
      description={message ?? "Upgrade your plan to keep using Agentic Triage."}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-ink h-8 px-3 text-sm font-medium"
          >
            Not now
          </button>
          <ButtonLink href={`/${org}/billing`} variant="primary" onClick={onClose}>
            See plans <ArrowUpRight />
          </ButtonLink>
        </>
      }
    >
      <ul className="text-muted flex flex-col gap-2 text-[13.5px]">
        <li>Everything else keeps working: findings, scans, labeling, disclosures and exports.</li>
        <li>Paid plans include a monthly allowance of triage runs that resets every billing period.</li>
      </ul>
    </Dialog>
  );
}

const UpgradeContext = createContext<((message?: string | null) => void) | null>(null);

/** Lets any AI action open the shared Upgrade dialog when the quota is exhausted. */
export function UpgradeProvider({ org, children }: { org: string; children: ReactNode }) {
  const [message, setMessage] = useState<string | null | undefined>(undefined);
  const show = useCallback((m?: string | null) => setMessage(m ?? null), []);
  return (
    <UpgradeContext value={show}>
      {children}
      <UpgradeDialog
        open={message !== undefined}
        onClose={() => setMessage(undefined)}
        org={org}
        message={message}
      />
    </UpgradeContext>
  );
}

export function useUpgrade(): (message?: string | null) => void {
  const show = useContext(UpgradeContext);
  return show ?? (() => undefined);
}

export function PlanBadge({ usage, className }: { usage: Usage; className?: string }) {
  return (
    <span
      className={clsx(
        "border-rule text-muted inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium",
        className,
      )}
      title={usageSummary(usage)}
    >
      {usage.unlimited ? (
        <InfinityGlyph className="size-3.5" flow={false} />
      ) : (
        <Sparkles className="size-3" aria-hidden />
      )}
      {usage.unlimited ? "Unlimited" : `${usage.searches_remaining} left`}
    </span>
  );
}
