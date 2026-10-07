import { redirect } from "next/navigation";

import { api } from "@/lib/server";
import type { Me, Project } from "@/lib/types";

export default async function Home() {
  const me = await api<Me>("/auth/me");
  const org = me.organizations[0];
  if (!org) redirect("/login");
  const projects = await api<Project[]>(`/orgs/${org.slug}/projects`);
  if (projects.length === 1) redirect(`/${org.slug}/${projects[0]!.slug}/findings`);
  redirect(`/${org.slug}`);
}
