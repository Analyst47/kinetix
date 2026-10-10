import clsx from "clsx";
import { Check, Clock } from "lucide-react";
import type { Metadata } from "next";

import { PageBar } from "@/components/shell-context";
import { Button, PageHeader, Panel } from "@/components/ui";
import { shortDate, usageSummary } from "@/lib/format";
import { api } from "@/lib/server";
import type { Billing, Plan } from "@/lib/types";

export const metadata: Metadata = { title: "Plan & usage" };

function price(p: Plan) {
  if (p.price_monthly_usd === null) return "Custom";
  if (p.price_monthly_usd === 0) return "Free";
  return `$${p.price_monthly_usd} / month`;
}

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const [{ plan: wanted }, billing] = await Promise.all([searchParams, api<Billing>("/billing")]);
  const { usage, plans } = billing;
  const pct = usage.searches_limit ? (usage.searches_used / usage.searches_limit) * 100 : 0;

  return (
    <>
      <PageBar crumbs={[{ label: "Plan & usage" }]} />
      <main className="flex w-full max-w-[980px] flex-col gap-5 p-4 md:p-6">
        <PageHeader
          title="Plan & usage"
          description="Your AI allowance is personal: it follows you across every workspace you belong to."
        />

        {!usage.billing_enabled ? (
          <div className="border-rule bg-raised flex items-start gap-3 rounded-2xl border px-4 py-3.5">
            <Clock className="text-muted mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="flex flex-col gap-0.5">
              <p className="text-[13.5px] font-semibold">Billing is coming soon</p>
              <p className="text-muted text-[13px]">
                Paid plans can&apos;t be purchased yet. Everything except AI assistance keeps working when
                your free searches run out, and your usage is kept when billing opens.
              </p>
            </div>
          </div>
        ) : null}

        <Panel
          title="Your plan"
          aside={
            <span className="border-rule text-muted rounded-full border px-2.5 py-0.5 font-mono text-[11px] tracking-[0.1em] uppercase">
              {usage.plan_name}
            </span>
          }
        >
          <div className="flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-col gap-1">
                <span className="display text-[34px] leading-none">
                  {usage.searches_remaining.toLocaleString("en-US")}
                </span>
                <span className="text-muted text-[13px]">{usageSummary(usage)}</span>
              </div>
              <span className="text-muted text-[13px]">
                {usage.ai_period === "lifetime"
                  ? "One-time free allowance"
                  : usage.resets_at
                    ? `Resets ${shortDate(usage.resets_at)}`
                    : "Resets monthly"}
              </span>
            </div>
            <div
              className="bg-ink/[0.08] h-2 overflow-hidden rounded-full"
              role="meter"
              aria-label="AI searches used"
              aria-valuemin={0}
              aria-valuemax={usage.searches_limit}
              aria-valuenow={usage.searches_used}
            >
              <div className="bg-ink h-full rounded-full" style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
            <p className="text-muted text-[13px]">
              {usage.searches_used.toLocaleString("en-US")} used of{" "}
              {usage.searches_limit.toLocaleString("en-US")}. One search is one AI model call: an Analyze, Ask
              or Draft, or one finding reviewed in a triage pass. Searches that fail on our side aren&apos;t
              counted.
            </p>
          </div>
        </Panel>

        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((p) => {
            const current = p.key === usage.plan;
            const highlight = wanted ? p.key === wanted : p.key === "pro";
            return (
              <section
                key={p.key}
                className={clsx(
                  "bg-raised flex flex-col gap-4 rounded-2xl border p-5",
                  highlight ? "border-ink" : "border-rule",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-[16px] font-semibold">{p.name}</h2>
                  {current ? (
                    <span className="text-muted inline-flex items-center gap-1 text-xs font-medium">
                      <Check className="size-3.5" /> Current plan
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1">
                  <span className="display text-[26px] leading-none">{price(p)}</span>
                  <span className="text-muted text-[13px]">{p.tagline}</span>
                </div>
                <p className="border-rule border-t pt-3 text-[13.5px]">
                  {p.key === "team"
                    ? "Custom AI search volume"
                    : p.ai_period === "lifetime"
                      ? `${p.ai_searches.toLocaleString("en-US")} AI searches, one-time`
                      : `${p.ai_searches.toLocaleString("en-US")} AI searches every month`}
                </p>
                <div className="mt-auto">
                  {current ? (
                    <Button disabled className="w-full">
                      Your plan
                    </Button>
                  ) : (
                    <Button
                      variant={highlight ? "primary" : "secondary"}
                      disabled={!usage.billing_enabled}
                      className="w-full"
                      title={usage.billing_enabled ? undefined : "Billing is coming soon"}
                    >
                      {usage.billing_enabled
                        ? p.self_serve
                          ? `Upgrade to ${p.name}`
                          : "Contact us"
                        : "Coming soon"}
                    </Button>
                  )}
                </div>
              </section>
            );
          })}
        </div>
        <p className="text-muted text-xs">Prices are shown in USD and may change before billing launches.</p>
      </main>
    </>
  );
}
