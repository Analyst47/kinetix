import { ShieldAlert, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { PageBar } from "@/components/shell-context";
import { EmptyState, PageHeader } from "@/components/ui";
import { fullDate, shortHash } from "@/lib/format";
import { api } from "@/lib/server";
import type { AuditEvent, Chain } from "@/lib/types";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const [events, chain] = await Promise.all([
    api<AuditEvent[]>(`/orgs/${org}/audit?limit=200`),
    api<Chain>(`/orgs/${org}/audit/verify`),
  ]);

  return (
    <>
      <PageBar crumbs={[{ label: "Audit log" }]} />
      <main className="flex w-full max-w-[1200px] flex-col gap-5 p-4 md:p-6">
        <PageHeader
          title="Audit log"
          description="Every change in this workspace. Each entry's hash covers the one before it, so editing history breaks the chain."
        />
        <div
          className={`flex flex-wrap items-center gap-3 rounded-md border px-4 py-3 ${chain.verified ? "border-rule bg-raised" : "border-crit/40 bg-crit-soft"}`}
          role="status"
        >
          {chain.verified ? (
            <>
              <ShieldCheck className="text-ok size-5" aria-hidden />
              <span className="text-ok font-semibold">Chain verified</span>
              <span className="text-muted">
                All {chain.entries} entries recomputed from the first one. Nothing has been altered.
              </span>
            </>
          ) : (
            <>
              <ShieldAlert className="text-crit size-5" aria-hidden />
              <span className="text-crit font-semibold">Chain broken at entry {chain.first_broken_seq}</span>
              <span className="text-crit">
                {chain.reason}. Entries from that point on can&apos;t be trusted.
              </span>
            </>
          )}
        </div>
        <section className="border-rule bg-raised overflow-x-auto rounded-md border">
          {events.length === 0 ? (
            <EmptyState title="Nothing recorded yet" />
          ) : (
            <table className="w-full min-w-[860px] border-collapse">
              <thead>
                <tr className="text-muted text-left text-xs leading-4">
                  {["#", "When", "Actor", "Action", "Subject", "Hash"].map((h) => (
                    <th key={h} className="border-rule border-b px-3 py-2.5 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.seq} className="border-rule border-b last:border-b-0">
                    <td className="mono text-muted px-3 py-2">{e.seq}</td>
                    <td className="text-muted px-3 py-2 whitespace-nowrap">{fullDate(e.created_at)}</td>
                    <td className="px-3 py-2">{e.actor_label}</td>
                    <td className="mono px-3 py-2">{e.action}</td>
                    <td className="mono text-muted px-3 py-2">{e.subject_id.slice(0, 36)}</td>
                    <td className="mono text-muted px-3 py-2" title={e.hash}>
                      {shortHash(e.hash)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </>
  );
}
