"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import { TopBar, type Crumb } from "@/components/topbar";
import type { Role } from "@/lib/types";

interface Shell {
  user: { name: string; email: string };
  org: { slug: string; name: string; role: Role };
  project?: { slug: string; name: string };
}

const ShellContext = createContext<Shell | null>(null);

export function ShellProvider({ value, children }: { value: Shell; children: ReactNode }) {
  return <ShellContext value={value}>{children}</ShellContext>;
}

export function useShell(): Shell {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used inside ShellProvider");
  return ctx;
}

/** The page's top bar. Breadcrumbs start at the project (or workspace) automatically. */
export function PageBar({ crumbs }: { crumbs: Crumb[] }) {
  const { user, org, project } = useShell();
  const root: Crumb[] = project
    ? [{ label: project.name, href: `/${org.slug}/${project.slug}/findings` }]
    : [{ label: org.name, href: `/${org.slug}` }];
  return <TopBar crumbs={[...root, ...crumbs]} user={user} org={org.slug} project={project?.slug} />;
}
