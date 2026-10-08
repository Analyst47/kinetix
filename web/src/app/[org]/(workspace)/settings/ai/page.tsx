import { Clock, KeyRound } from "lucide-react";
import type { Metadata } from "next";

import { PageBar } from "@/components/shell-context";
import { PageHeader, Panel } from "@/components/ui";
import { api } from "@/lib/server";
import type { AiStatus, Me } from "@/lib/types";

import { AiKeyForm } from "./ai-key-form";
import { AiToggle } from "./toggle";

export const metadata: Metadata = { title: "AI assistance" };

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
          description="Evidence-cited triage, answers and drafting on findings. You bring your own provider key — it's never shared and never billed to anyone else."
        />

        {/* Workspace allow-switch (admins). */}
        <Panel
          title="This workspace"
          aside={
            <span className={`text-[13px] font-semibold ${status.enabled ? "text-ok" : "text-muted"}`}>
              {status.enabled ? "On" : "Off"}
            </span>
          }
        >
          <div className="flex flex-col gap-3 p-4">
            <p className="text-[13px]">
              Turn this on to allow AI assistance in this workspace. Each member then adds their own
              API key below to use it.
            </p>
            {canManage ? (
              <AiToggle org={org} enabled={status.enabled} />
            ) : (
              <p className="text-muted text-[13px]">An owner or admin controls this switch.</p>
            )}
          </div>
        </Panel>

        {/* Bring your own key (per user, per session). */}
        <Panel
          title={
            <span className="flex items-center gap-2">
              <KeyRound className="text-vg size-4" /> Your API key
            </span>
          }
          aside={
            <span className={`text-[13px] font-semibold ${status.key_set ? "text-ok" : "text-muted"}`}>
              {status.key_set ? "Key set" : "No key"}
            </span>
          }
        >
          <div className="flex flex-col gap-3 p-4">
            {status.enabled ? (
              <AiKeyForm org={org} status={status} />
            ) : (
              <p className="text-muted text-[13px]">
                Turn on AI assistance for this workspace first, then add your key here.
              </p>
            )}
          </div>
        </Panel>

        {/* Built-in AI — pay-as-you-go, coming soon. */}
        {!status.managed_available ? (
          <Panel
            title={
              <span className="flex items-center gap-2">
                Built-in AI
                <span className="border-med/40 bg-med/10 text-med inline-flex h-5 items-center gap-1 rounded-sm border px-1.5 text-[11px] font-medium">
                  <Clock className="size-3" /> Coming soon
                </span>
              </span>
            }
          >
            <div className="p-4">
              <p className="text-muted text-[13px]">
                Pay-as-you-go AI with no key to manage is on the way. Until then, bring your own
                provider key above — it&apos;s free to use and bills to your own account.
              </p>
            </div>
          </Panel>
        ) : null}

        <Panel title="What it sends and what it can do">
          <ul className="flex flex-col gap-2 p-4 text-[13px]">
            <li>
              Each request sends one finding&apos;s details and up to 60 lines of nearby source to the
              provider your key points to. Nothing is sent until someone clicks Analyze, Ask or Draft.
            </li>
            <li>
              Your key is held only for your current session, encrypted, never written to our
              database, and cleared when you log out.
            </li>
            <li>
              The assistant only advises. It can&apos;t change a finding, confirm it, or contact anyone.
              Suggestions take effect only when a person applies them.
            </li>
            <li>
              Code from the analyzed target is fenced off as untrusted data, and lines that try to
              instruct the model are flagged for you.
            </li>
            <li>
              Every citation is checked against the exact lines the assistant was shown, and each
              request is recorded in the finding&apos;s chain of custody with the SHA-256 of what was
              sent.
            </li>
          </ul>
        </Panel>
      </main>
    </>
  );
}
