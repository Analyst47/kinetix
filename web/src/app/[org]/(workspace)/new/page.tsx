import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";

import { PageBar } from "@/components/shell-context";
import { api } from "@/lib/server";
import type { Project } from "@/lib/types";

import { NewProjectForm } from "./form";

export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  // Existing URL names, so the automatic one never collides. Optional: the API still checks.
  let taken: string[] = [];
  try {
    taken = (await api<Project[]>(`/orgs/${org}/projects`)).map((p) => p.slug);
  } catch (err) {
    unstable_rethrow(err);
  }
  return (
    <>
      <PageBar crumbs={[{ label: "Projects", href: `/${org}` }, { label: "New project" }]} />
      <main className="flex w-full max-w-[1200px] flex-col gap-10 p-4 pb-0 md:p-6 md:pb-0 lg:p-8 lg:pb-8">
        <header className="kx-fade-up flex flex-col gap-3">
          <p className="eyebrow text-muted flex items-center gap-2.5 text-[11px]">
            <span className="relative inline-flex size-2" aria-hidden>
              <span className="kx-pulse-ring bg-ink absolute inset-0 rounded-full" />
              <span className="bg-ink relative size-2 rounded-full" />
            </span>
            New project
          </p>
          <h1 className="display text-ink text-[34px] leading-[1.04] sm:text-[44px]">
            Paste a repo. <span className="text-muted">Confirm the boundary.</span> Scan.
          </h1>
          <p className="text-muted max-w-[66ch] text-[15px] leading-[23px]">
            KinetixZero fetches one commit of a public repository and runs read-only static analysis on it.
            You confirm what you&apos;re authorized to analyze; nothing is run against live systems.
          </p>
        </header>
        <NewProjectForm org={org} taken={taken} />
      </main>
    </>
  );
}
