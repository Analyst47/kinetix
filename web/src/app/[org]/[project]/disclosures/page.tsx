import clsx from "clsx";
import type { Metadata } from "next";
import Link from "next/link";

import { PageBar } from "@/components/shell-context";
import { EmptyState, PageHeader, SeverityMark } from "@/components/ui";
import { DISCLOSURE_STAGES, HEALTH_TEXT, deadlineLabel, shortDate } from "@/lib/format";
import { api } from "@/lib/server";
import type { Disclosure } from "@/lib/types";

export const metadata: Metadata = { title: "Disclosures" };

const STAGE_LABEL = Object.fromEntries(DISCLOSURE_STAGES.map((s) => [s.key, s.label]));

export default async function DisclosuresPage({
  params,
}: {
  params: Promise<{ org: string; project: string }>;
}) {
  const { org, project } = await params;
  const items = await api<Disclosure[]>(`/orgs/${org}/projects/${project}/disclosures`);
  const urgent = items.filter((d) => d.health === "overdue" || d.health === "due_soon").length;

  return (
    <>
      <PageBar crumbs={[{ label: "Disclosures" }]} />
      <main className="flex w-full max-w-[1400px] flex-col gap-4 p-4 md:p-6">
        <PageHeader
          title="Disclosures"
          description={
            items.length
              ? `${items.length} coordinated disclosure${items.length === 1 ? "" : "s"}. ${
                  urgent
                    ? `${urgent} need${urgent === 1 ? "s" : ""} attention.`
                    : "None are close to their deadline."
                }`
              : "Track each confirmed finding from vendor notification to public advisory."
          }
        />
        <section className="border-rule bg-raised overflow-x-auto rounded-md border">
          {items.length === 0 ? (
            <EmptyState title="No disclosures yet">
              Open a confirmed finding and start a disclosure from its Disclosure tab.
            </EmptyState>
          ) : (
            <table className="w-full min-w-[920px] border-collapse">
              <thead>
                <tr className="text-muted text-left text-xs leading-4">
                  {["Finding", "Vendor", "Stage", "Notified", "Deadline", "CVE"].map((h) => (
                    <th key={h} className="border-rule border-b px-3 py-2.5 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((d) => (
                  <tr key={d.id} className="border-rule hover:bg-paper border-b last:border-b-0">
                    <td className="min-w-[320px] px-3 py-2.5 align-top">
                      <div className="flex items-center gap-3">
                        <SeverityMark severity={d.severity} />
                        <Link
                          href={`/${org}/${project}/findings/${d.finding_public_id}?tab=disclosure`}
                          className="mono text-ink hover:underline"
                        >
                          {d.finding_public_id}
                        </Link>
                      </div>
                      <div className="mt-0.5 font-medium">{d.finding_title}</div>
                    </td>
                    <td className="px-3 py-2.5 align-top">{d.vendor_name}</td>
                    <td className="px-3 py-2.5 align-top">{STAGE_LABEL[d.stage]}</td>
                    <td className="text-muted px-3 py-2.5 align-top whitespace-nowrap">
                      {d.notified_at ? shortDate(d.notified_at) : "—"}
                    </td>
                    <td className="px-3 py-2.5 align-top whitespace-nowrap">
                      <div className={clsx("font-semibold", HEALTH_TEXT[d.health])}>
                        {deadlineLabel(d.days_remaining, d.health)}
                      </div>
                      {d.deadline_at ? (
                        <div className="text-muted text-xs">{shortDate(d.deadline_at)}</div>
                      ) : null}
                    </td>
                    <td className="mono px-3 py-2.5 align-top">{d.cve_id ?? "—"}</td>
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
