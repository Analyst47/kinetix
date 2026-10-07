import type { Metadata } from "next";

import { PageBar } from "@/components/shell-context";
import { PageHeader, Panel } from "@/components/ui";
import { api } from "@/lib/server";
import type { AiStatus, Me } from "@/lib/types";

import { AiToggle } from "./toggle";

export const metadata: Metadata = { title: "AI assistance" };

const PROVIDER: Record<string, string> = {
  anthropic: "Anthropic Claude API",
  openai_compatible: "OpenAI-compatible server (for example, a local Ollama instance)",
  mock: "Development stub. No model is called.",
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
          description="Evidence-cited triage, answers and drafting on findings. Off until you turn it on."
        />
        <Panel
          title="This workspace"
          aside={
            <span className={`text-[13px] font-semibold ${status.enabled ? "text-ok" : "text-muted"}`}>
              {status.enabled ? "On" : "Off"}
            </span>
          }
        >
          <div className="flex flex-col gap-3 p-4">
            <dl className="grid grid-cols-[140px_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px]">
              <dt className="text-muted text-xs leading-5">Provider</dt>
              <dd>
                {status.provider
                  ? (PROVIDER[status.provider] ?? status.provider)
                  : "Not configured on this server"}
              </dd>
              <dt className="text-muted text-xs leading-5">Model</dt>
              <dd className="mono">{status.model ?? "—"}</dd>
            </dl>
            {canManage && status.available ? <AiToggle org={org} enabled={status.enabled} /> : null}
            {!status.available ? (
              <p className="text-muted text-[13px]">
                The server administrator sets <span className="mono">KINETIX_AI_PROVIDER</span> and related
                settings. See the README.
              </p>
            ) : null}
          </div>
        </Panel>
        <Panel title="What it sends and what it can do">
          <ul className="flex flex-col gap-2 p-4 text-[13px]">
            <li>
              Each request sends one finding&apos;s details and up to 60 lines of nearby source to the
              provider above. Nothing is sent until someone clicks Analyze, Ask or Draft.
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
              Every citation is checked against the exact lines the assistant was shown. Claims it can&apos;t
              back up are marked.
            </li>
            <li>
              Each request is recorded in the finding&apos;s chain of custody with the SHA-256 of what was
              sent.
            </li>
          </ul>
        </Panel>
      </main>
    </>
  );
}
