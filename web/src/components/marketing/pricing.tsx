import clsx from "clsx";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

import type { Plan } from "@/lib/types";

import { DotGlyph } from "./ui";

// What each tier adds. Prices and AI quotas come from the API's plan catalog
// (api/app/billing/plans.py) so the pricing page, the app and the quota gate never disagree.
const COPY: Record<
  string,
  { badge: string; lead: string; features: string[]; cta: { label: string; href: string } }
> = {
  free: {
    badge: "Free forever",
    lead: "What's included:",
    features: [
      "The full research workflow: scope, analyze, validate, disclose",
      "Taint-tracked SAST, OSV dependency matching, secret detection",
      "CVE 5.1, OSV and PDF exports with chain-of-custody hashes",
      "Labeling queue and JSONL dataset export",
      "Hash-chained audit log, MFA, row-level tenant isolation",
    ],
    cta: { label: "Get started", href: "/register" },
  },
  pro: {
    badge: "Everything in Community, and",
    lead: "Everything in Community, and:",
    features: [
      "A monthly AI allowance that resets every billing period",
      "Batch AI triage across whole projects",
      "AI drafting for descriptions, impact and remediation",
      "Usage visible in the app at all times",
    ],
    cta: { label: "Upgrade to Pro", href: "/billing" },
  },
  team: {
    badge: "Everything in Pro, and",
    lead: "Everything in Pro, and:",
    features: [
      "AI volume sized to your team",
      "Multiple researchers with roles and shared workspaces",
      "Shared findings, disclosures and audit trail",
      "Help deploying on your own infrastructure",
    ],
    cta: { label: "Contact us", href: "/billing?plan=team" },
  },
};

function searches(p: Plan) {
  const n = p.ai_searches.toLocaleString("en-US");
  return p.ai_period === "lifetime"
    ? `${n} Agentic Triage runs included`
    : `${n} Agentic Triage runs / month`;
}

export function Pricing({ plans }: { plans: Plan[] | null }) {
  if (!plans?.length) {
    return (
      <p className="text-muted border-rule rounded-2xl border p-8 text-center">
        Pricing is temporarily unavailable. Please check back shortly.
      </p>
    );
  }
  return (
    <div className="grid items-stretch gap-4 lg:grid-cols-3">
      {plans.map((p) => {
        const copy = COPY[p.key];
        if (!copy) return null;
        const featured = p.key === "pro";
        return (
          <div
            key={p.key}
            className={clsx(
              "flex flex-col rounded-3xl border p-7 sm:p-8",
              featured ? "border-white bg-white text-black" : "border-rule bg-raised/40 text-ink",
            )}
          >
            <h3 className="display text-[clamp(30px,3.2vw,40px)]">{p.name}</h3>
            <span
              className={clsx(
                "eyebrow mt-3 self-start rounded-full border px-2.5 py-1 text-[10.5px]",
                featured ? "border-black/20 text-black" : "border-rule-strong text-ink",
              )}
            >
              {copy.badge}
            </span>
            <p className={clsx("mt-4 text-[15px]", featured ? "text-black/70" : "text-muted")}>{p.tagline}</p>

            <div className="mt-8 flex flex-col gap-2">
              <div className="flex items-baseline gap-1.5">
                <span className="display text-[clamp(40px,4vw,54px)] leading-none">
                  {p.price_monthly_usd === null
                    ? "Let's talk"
                    : p.price_monthly_usd === 0
                      ? "Free"
                      : `$${p.price_monthly_usd}`}
                </span>
                {p.price_monthly_usd ? (
                  <span className={clsx("text-[15px]", featured ? "text-black/60" : "text-muted")}>
                    per month
                  </span>
                ) : null}
              </div>
              <span className={clsx("eyebrow text-[10.5px]", featured ? "text-black/55" : "text-muted")}>
                {p.price_monthly_usd === null
                  ? "Tailored to your scope"
                  : p.price_yearly_usd
                    ? `Or $${p.price_yearly_usd.toLocaleString("en-US")} billed yearly`
                    : "No card required"}
              </span>
            </div>

            <div
              className={clsx(
                "mt-6 flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-[14px] font-medium",
                featured ? "border-black/15 bg-black/[0.04]" : "border-rule bg-ink/[0.03]",
              )}
            >
              <DotGlyph variant={1} className="size-3.5" />
              {p.key === "team" ? "Custom Agentic Triage volume" : searches(p)}
            </div>

            <Link
              href={copy.cta.href}
              className={clsx(
                "mt-6 inline-flex h-11 items-center justify-between rounded-full border px-5 transition-colors [&_svg]:size-4",
                featured
                  ? "border-black bg-black text-white hover:bg-black/85"
                  : "border-rule-strong text-ink hover:border-ink hover:bg-ink/[0.04]",
              )}
            >
              <span className="eyebrow">{copy.cta.label}</span>
              <ArrowRight />
            </Link>

            <div className={clsx("mt-8 border-t pt-6", featured ? "border-black/10" : "border-rule")}>
              <p className="text-[14.5px] font-medium">{copy.lead}</p>
              <ul className="mt-4 flex flex-col gap-3">
                {copy.features.map((f) => (
                  <li key={f} className="flex gap-3 text-[14px] leading-[21px]">
                    <DotGlyph
                      variant={2}
                      className={clsx("mt-[3px] size-3.5", featured ? "text-black" : "text-muted")}
                    />
                    <span className={featured ? "text-black/85" : "text-ink/85"}>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );
      })}
    </div>
  );
}
