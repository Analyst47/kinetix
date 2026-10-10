import type { Metadata } from "next";

import { PageBar } from "@/components/shell-context";
import { PageHeader } from "@/components/ui";
import { api } from "@/lib/server";
import type { FindingPage } from "@/lib/types";

import { LabelQueue } from "./label-queue";

export const metadata: Metadata = { title: "Label queue" };

export default async function LabelPage({ params }: { params: Promise<{ org: string; project: string }> }) {
  const { org, project } = await params;
  const base = `/orgs/${org}/projects/${project}/findings`;
  const [unlabeled, labeled] = await Promise.all([
    api<FindingPage>(`${base}?labeled=no&status=all&limit=100`),
    api<FindingPage>(`${base}?labeled=yes&status=all&limit=1`),
  ]);

  return (
    <>
      <PageBar
        crumbs={[{ label: "Findings", href: `/${org}/${project}/findings` }, { label: "Label queue" }]}
      />
      <main className="flex w-full flex-col gap-6 p-4 md:p-6">
        <PageHeader
          title="Label queue"
          description="Record a fast ground-truth verdict on each finding to build your training corpus. Use R (real), F (false positive) or S (skip)."
        />
        <LabelQueue org={org} project={project} items={unlabeled.items} alreadyLabeled={labeled.total} />
      </main>
    </>
  );
}
