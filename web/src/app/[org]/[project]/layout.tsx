import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { ShellProvider } from "@/components/shell-context";
import { Sidebar } from "@/components/sidebar";
import { api } from "@/lib/server";
import type { DependencyPage, Disclosure, FindingPage, Me, Project } from "@/lib/types";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ org: string; project: string }>;
}) {
  const { org, project: slug } = await params;
  const [me, project, findings, deps, disclosures] = await Promise.all([
    api<Me>("/auth/me"),
    api<Project>(`/orgs/${org}/projects/${slug}`),
    api<FindingPage>(`/orgs/${org}/projects/${slug}/findings?limit=1`),
    api<DependencyPage>(`/orgs/${org}/projects/${slug}/dependencies?vulnerable_only=true&limit=1`),
    api<Disclosure[]>(`/orgs/${org}/projects/${slug}/disclosures`),
  ]);
  const membership = me.organizations.find((o) => o.slug === org);
  if (!membership) notFound();

  return (
    <ShellProvider
      value={{
        user: { name: me.user.name, email: me.user.email },
        org: membership,
        project: { slug: project.slug, name: project.name },
      }}
    >
      <div className="flex min-h-dvh flex-col md:flex-row">
        <Sidebar
          org={org}
          orgName={membership.name}
          project={project}
          openFindings={findings.status_counts.open ?? 0}
          vulnerableDependencies={deps.vulnerable}
          urgentDisclosures={
            disclosures.filter((d) => d.health === "overdue" || d.health === "due_soon").length
          }
          authorizationExpired={isExpired(project.authorization_expires_at)}
        />
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </ShellProvider>
  );
}

function isExpired(iso: string | null): boolean {
  return iso !== null && new Date(iso).getTime() < Date.now();
}
