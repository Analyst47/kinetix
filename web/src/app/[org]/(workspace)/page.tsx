import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";

import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { EmptyOrbit } from "@/components/dashboard/empty-orbit";
import { DashboardHeader } from "@/components/dashboard/header";
import { KpiRow, summarySentence, workspaceStats } from "@/components/dashboard/kpis";
import { ProjectBoard } from "@/components/dashboard/project-board";
import { PageBar } from "@/components/shell-context";
import { api } from "@/lib/server";
import type { AuditEvent, Project } from "@/lib/types";

export const metadata: Metadata = { title: "Projects" };

/** Recent audit entries, or null when this member's role can't read the audit log. */
async function recentActivity(org: string): Promise<AuditEvent[] | null> {
  try {
    return await api<AuditEvent[]>(`/orgs/${org}/audit?limit=8`);
  } catch (err) {
    unstable_rethrow(err);
    return null;
  }
}

/** The request's clock, read once so every review date on the page agrees. */
function requestTime(): number {
  return Date.now();
}

export default async function ProjectsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const [projects, activity] = await Promise.all([
    api<Project[]>(`/orgs/${org}/projects`),
    recentActivity(org),
  ]);
  const now = requestTime();
  const stats = workspaceStats(projects, now);
  const feed = activity ? <ActivityFeed org={org} events={activity} now={now} /> : null;

  return (
    <>
      <PageBar crumbs={[{ label: "Projects" }]} />
      <main className="flex w-full max-w-[1320px] flex-col gap-6 p-4 md:p-6 lg:gap-7 lg:p-8">
        <DashboardHeader summary={summarySentence(stats)} />
        {projects.length === 0 ? (
          <>
            <EmptyOrbit org={org} />
            {activity?.length ? <div className="max-w-[560px]">{feed}</div> : null}
          </>
        ) : (
          <>
            <KpiRow projects={projects} stats={stats} />
            <ProjectBoard org={org} projects={projects} now={now} aside={feed} />
          </>
        )}
      </main>
    </>
  );
}
