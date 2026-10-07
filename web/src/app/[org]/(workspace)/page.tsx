import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageBar } from "@/components/shell-context";
import { ButtonLink, EmptyState, PageHeader, SeverityMark } from "@/components/ui";
import { AUTHORIZATION_LABEL, SEVERITY_ORDER, shortDate } from "@/lib/format";
import { api } from "@/lib/server";
import type { Project } from "@/lib/types";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const projects = await api<Project[]>(`/orgs/${org}/projects`);

  return (
    <>
      <PageBar crumbs={[{ label: "Projects" }]} />
      <main className="flex w-full max-w-[1200px] flex-col gap-5 p-4 md:p-6">
        <PageHeader
          title="Projects"
          description="Each project is one authorized research target with its own scope."
          actions={
            <ButtonLink variant="primary" href={`/${org}/new`}>
              <Plus aria-hidden />
              New project
            </ButtonLink>
          }
        />
        <section className="border-rule bg-raised overflow-x-auto rounded-md border">
          {projects.length === 0 ? (
            <EmptyState
              title="Start your first project"
              action={
                <ButtonLink variant="primary" href={`/${org}/new`}>
                  New project
                </ButtonLink>
              }
            >
              Define what you are authorized to analyze, then upload a source snapshot to scan.
            </EmptyState>
          ) : (
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="text-muted text-left text-xs leading-4">
                  {["Project", "Authorization", "Open findings", "Review by"].map((h) => (
                    <th key={h} className="border-rule border-b px-4 py-2.5 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} className="border-rule hover:bg-paper border-b last:border-b-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/${org}/${p.slug}/findings`}
                        className="text-ink font-medium hover:underline"
                      >
                        {p.name}
                      </Link>
                      <div className="mono text-muted">{p.slug}</div>
                    </td>
                    <td className="text-muted px-4 py-3">{AUTHORIZATION_LABEL[p.authorization_type]}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-4">
                        {SEVERITY_ORDER.filter((s) => p.severity_counts?.[s]).map((s) => (
                          <SeverityMark key={s} severity={s} count={p.severity_counts?.[s]} />
                        ))}
                        {!p.open_findings ? <span className="text-muted">None</span> : null}
                      </div>
                    </td>
                    <td className="text-muted px-4 py-3">
                      {p.authorization_expires_at ? shortDate(p.authorization_expires_at) : "No expiry"}
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
