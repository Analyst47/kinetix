"use client";

import clsx from "clsx";
import { ArrowUpRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";

import { Dialog } from "@/components/dialog";
import { ButtonLink } from "@/components/ui";
import { shortDate, usageSummary } from "@/lib/format";
import type { Usage } from "@/lib/types";

/** Compact meter for the sidebar: plan, remaining searches, and the way to get more. */
export function UsageMeter({ usage, org }: { usage: Usage; org: string }) {
  const pct = usage.searches_limit ? (usage.searches_remaining / usage.searches_limit) * 100 : 0;
  const out = usage.searches_remaining === 0;
  return (
    <Link
      href={`/${org}/billing`}
      className="border-rule bg-raised hover:border-rule-strong group flex flex-col gap-2.5 rounded-2xl border px-3.5 py-3 transition-colors"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="text-muted size-3.5" aria-hidden />
        <span className="text-[13px] font-semibold">AI searches</span>
        <span className="text-muted border-rule ml-auto rounded-full border px-2 py-px font-mono text-[10px] tracking-[0.1em] uppercase">
          {usage.plan_name}
        </span>
      </div>
      <div
        className="bg-ink/[0.08] h-1.5 overflow-hidden rounded-full"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={usage.searches_limit}
        aria-valuenow={usage.searches_remaining}
        aria-label="AI searches remaining"
      >
        <div className="bg-ink h-full rounded-full transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-muted text-xs">
        <span className="text-ink font-medium">{usage.searches_remaining}</span> of {usage.searches_limit}{" "}
        {usage.ai_period === "lifetime" ? "free left" : "left this month"}
        {usage.resets_at ? ` · resets ${shortDate(usage.resets_at)}` : ""}
      </p>
      {out || usage.plan === "free" ? (
        <span className="text-ink inline-flex items-center gap-1 text-xs font-medium group-hover:underline">
          {out ? "Upgrade to keep using AI" : "Upgrade for more"} <ArrowUpRight className="size-3" />
        </span>
      ) : null}
    </Link>
  );
}

/** The state shown when a user has used all their AI searches. */
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
      title="You're out of AI searches"
      description={message ?? "Upgrade your plan to keep using AI assistance."}
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
        <li>Paid plans include a monthly AI allowance that resets every billing period.</li>
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
      <Sparkles className="size-3" aria-hidden />
      {usage.searches_remaining} left
    </span>
  );
}
