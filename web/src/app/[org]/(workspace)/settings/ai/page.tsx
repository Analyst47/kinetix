import { ArrowUpRight, Sparkles } from "lucide-react";
import type { Metadata } from "next";

import { PageBar } from "@/components/shell-context";
import { ButtonLink, PageHeader, Panel } from "@/components/ui";
import { usageSummary } from "@/lib/format";
import { api } from "@/lib/server";
import type { AiStatus, Me } from "@/lib/types";

import { AiToggle } from "./toggle";

export const metadata: Metadata = { title: "AI assistance" };

const PROVIDER_LABEL: Record<string, string> = {
  anthropic: "Claude (Anthropic)",
  gemini: "Gemini (Google)",
  openai_compatible: "Self-hosted model server",
  mock: "Development stub",
};

export default async function AiSettingsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const [status, me] = await Promise.all([api<AiStatus>(`/orgs/${org}/ai`), api<Me>("/auth/me")]);
  const role = me.organizations.find((o) => o.slug === org)?.role;
  const canManage = role === "owner" || role === "admin";

  return (
    <>
      <PageBar crumbs={[{ label: "Settings" }, { label: "AI assistance" }]} />
      <main className="flex w-full max-w-[860px] flex-col gap-5 p-4 md:p-6">
        <PageHeader
          title="AI assistance"
          description="Evidence-cited analysis, answers and drafting on findings — advisory only, and always yours to confirm."
        />

        {/* Workspace allow-switch (admins). */}
        <Panel
          title="This workspace"
          aside={
            <span className={`text-[13px] font-semibold ${status.enabled ? "text-ink" : "text-muted"}`}>
              {status.enabled ? "On" : "Off"}
            </span>
          }
        >
          <div className="flex flex-col gap-3 p-4">
            <p className="text-[13px]">
              Sending a finding&apos;s context to a model is a policy decision, so AI assistance stays off
              until an owner or admin turns it on for this workspace. Each member&apos;s Agentic Triage runs
              then count against their own plan.
            </p>
            {canManage ? (
              <AiToggle org={org} enabled={status.enabled} />
            ) : (
              <p className="text-muted text-[13px]">An owner or admin controls this switch.</p>
            )}
          </div>
        </Panel>

        <Panel
          title={
            <span className="flex items-center gap-2">
              <Sparkles className="text-muted size-4" /> Your Agentic Triage
            </span>
          }
          aside={
            <span className="text-muted font-mono text-[11px] tracking-[0.1em] uppercase">
              {status.usage.plan_name}
            </span>
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-[13px]">
              <span className="font-semibold">{usageSummary(status.usage)}.</span>{" "}
              <span className="text-muted">
                One run is one model call: an Analyze, Ask or Draft, or one finding in a triage pass.
              </span>
            </p>
            <ButtonLink href={`/${org}/billing`} variant="secondary">
              Plan & usage <ArrowUpRight />
            </ButtonLink>
          </div>
        </Panel>

        <Panel title="Model">
          <div className="flex flex-col gap-2 p-4 text-[13px]">
            {status.configured ? (
              <p>
                Runs on{" "}
                <span className="font-semibold">
                  {PROVIDER_LABEL[status.provider ?? ""] ?? status.provider}
                </span>
                {status.model ? (
                  <>
                    {" "}
                    · <span className="mono">{status.model}</span>
                  </>
                ) : null}
                , using KinetixZero&apos;s managed key. No API key is needed from you, and the key never
                reaches your browser.
              </p>
            ) : (
              <p className="text-muted">
                AI isn&apos;t configured on this server yet. An administrator needs to set the AI provider key
                in the server environment.
              </p>
            )}
            {status.data_notice ? <p className="text-muted">{status.data_notice}</p> : null}
            {canManage && status.monthly_token_budget ? (
              <p className="text-muted">
                Server spend cap: {(status.tokens_used_this_month ?? 0).toLocaleString("en-US")} of{" "}
                {status.monthly_token_budget.toLocaleString("en-US")} tokens used this month.
              </p>
            ) : null}
          </div>
        </Panel>

        <Panel title="What it sends and what it can do">
          <ul className="flex list-disc flex-col gap-2 py-4 pr-4 pl-8 text-[13px]">
            <li>
              Each request sends one finding&apos;s details and up to 60 lines of nearby source to the model.
              Nothing is sent until someone clicks Analyze, Ask, Draft or Triage.
            </li>
            <li>
              The assistant only advises. It can&apos;t change a finding, confirm it, or contact anyone.
              Suggestions take effect only when a person applies them.
            </li>
            <li>
              Code from the analyzed target is fenced off as untrusted data, and lines that try to instruct
              the model are flagged for you.
            </li>
            <li>
              Every citation is checked against the exact lines the assistant was shown, and each request is
              recorded in the finding&apos;s chain of custody with the SHA-256 of what was sent.
            </li>
          </ul>
        </Panel>
      </main>
    </>
  );
}
