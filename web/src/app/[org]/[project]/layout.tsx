import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { ShellProvider } from "@/components/shell-context";
import { Sidebar } from "@/components/sidebar";
import { UpgradeProvider } from "@/components/usage";
import { api } from "@/lib/server";
import type { Billing, DependencyPage, Disclosure, FindingPage, Me, Project } from "@/lib/types";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ org: string; project: string }>;
}) {
  const { org, project: slug } = await params;
  const [me, project, findings, deps, disclosures, billing] = await Promise.all([
    api<Me>("/auth/me"),
    api<Project>(`/orgs/${org}/projects/${slug}`),
    api<FindingPage>(`/orgs/${org}/projects/${slug}/findings?limit=1`),
    api<DependencyPage>(`/orgs/${org}/projects/${slug}/dependencies?vulnerable_only=true&limit=1`),
    api<Disclosure[]>(`/orgs/${org}/projects/${slug}/disclosures`),
    api<Billing>("/billing"),
  ]);
  const membership = me.organizations.find((o) => o.slug === org);
  if (!membership) notFound();

  return (
    <ShellProvider
      value={{
        user: { name: me.user.name, email: me.user.email },
        org: membership,
        project: { slug: project.slug, name: project.name },
        usage: billing.usage,
      }}
    >
      <UpgradeProvider org={org}>
        <div className="flex min-h-dvh flex-col md:flex-row">
          <Sidebar
            usage={billing.usage}
            org={org}
            orgName={membership.name}
            role={membership.role}
            organizations={me.organizations}
            project={project}
            openFindings={findings.status_counts.open ?? 0}
            vulnerableDependencies={deps.vulnerable}
            urgentDisclosures={
              disclosures.filter((d) => d.health === "overdue" || d.health === "due_soon").length
            }
            authorizationExpired={isExpired(project.authorization_expires_at)}
            authorizationWindow={authorizationWindow(project.attested_at, project.authorization_expires_at)}
          />
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </div>
      </UpgradeProvider>
    </ShellProvider>
  );
}

function isExpired(iso: string | null): boolean {
  return iso !== null && new Date(iso).getTime() < Date.now();
}

const DAY_MS = 86_400_000;

/** Days until the authorization review date, and how much of the attested window has passed. */
function authorizationWindow(
  attestedAt: string,
  expiresAt: string | null,
): { daysLeft: number; elapsed: number } | null {
  if (!expiresAt) return null;
  const start = new Date(attestedAt).getTime();
  const end = new Date(expiresAt).getTime();
  const now = Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return {
    daysLeft: Math.ceil((end - now) / DAY_MS),
    elapsed: Math.min(1, Math.max(0, (now - start) / (end - start))),
  };
}
