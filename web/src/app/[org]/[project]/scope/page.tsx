import type { Metadata } from "next";

import { PageBar } from "@/components/shell-context";
import { PageHeader, Panel } from "@/components/ui";
import { AUTHORIZATION_LABEL, fullDate } from "@/lib/format";
import { api } from "@/lib/server";
import type { Project } from "@/lib/types";

export const metadata: Metadata = { title: "Scope" };

export default async function ScopePage({ params }: { params: Promise<{ org: string; project: string }> }) {
  const { org, project } = await params;
  const p = await api<Project>(`/orgs/${org}/projects/${project}`);
  return (
    <>
      <PageBar crumbs={[{ label: "Authorization and scope" }]} />
      <main className="flex w-full max-w-[860px] flex-col gap-5 p-4 md:p-6">
        <PageHeader title="Authorization and scope" description="Recorded when the project was created." />
        <Panel title="Authorization">
          <dl className="grid grid-cols-[140px_minmax(0,1fr)] gap-x-4 gap-y-3 p-4">
            <dt className="text-muted text-xs leading-5">Basis</dt>
            <dd>{AUTHORIZATION_LABEL[p.authorization_type]}</dd>
            {p.authorization_reference ? (
              <>
                <dt className="text-muted text-xs leading-5">Reference</dt>
                <dd>
                  <a
                    href={p.authorization_reference}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-brand break-all hover:underline"
                  >
                    {p.authorization_reference}
                  </a>
                </dd>
              </>
            ) : null}
            <dt className="text-muted text-xs leading-5">Attested by</dt>
            <dd>
              {p.attested_by.name}, {fullDate(p.attested_at)}
            </dd>
            <dt className="text-muted text-xs leading-5">Review by</dt>
            <dd>{p.authorization_expires_at ? fullDate(p.authorization_expires_at) : "No expiry set"}</dd>
          </dl>
        </Panel>
        <Panel title="Scope">
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <h3 className="text-muted text-xs font-medium">In scope</h3>
              <p className="whitespace-pre-wrap">{p.in_scope}</p>
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="text-muted text-xs font-medium">Out of scope</h3>
              <p className="whitespace-pre-wrap">{p.out_of_scope || "Nothing listed."}</p>
            </div>
          </div>
        </Panel>
        <Panel title="Attestation">
          <blockquote className="border-rule-strong text-muted m-4 border-l-2 pl-3.5 text-[13px] leading-5">
            {p.attestation_text}
          </blockquote>
        </Panel>
      </main>
    </>
  );
}
