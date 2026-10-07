import type { Metadata } from "next";

import { PageBar } from "@/components/shell-context";

import { NewProjectForm } from "./form";

export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  return (
    <>
      <PageBar crumbs={[{ label: "Projects", href: `/${org}` }, { label: "New project" }]} />
      <main className="flex w-full max-w-[760px] flex-col gap-6 p-4 md:p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em]">New project</h1>
          <p className="text-muted max-w-[64ch]">
            A project is one target you are authorized to analyze. The authorization you record here is stored
            with the project and shown on every report it produces.
          </p>
        </div>
        <NewProjectForm org={org} />
      </main>
    </>
  );
}
