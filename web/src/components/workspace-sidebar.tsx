"use client";

import { CreditCard, FolderKanban, KeyRound, ListTree, Sparkles, Users } from "lucide-react";
import { usePathname } from "next/navigation";

import { NavLink, NavSection } from "@/components/nav-link";
import { SidebarFrame } from "@/components/shell/sidebar-frame";
import { Switcher, canReadAudit } from "@/components/shell/switcher";
import { UsageMeter } from "@/components/usage";
import type { Role, Usage } from "@/lib/types";

export function WorkspaceSidebar({
  org,
  orgName,
  usage,
  role,
  organizations,
}: {
  org: string;
  orgName: string;
  usage: Usage;
  role?: Role;
  organizations?: { slug: string; name: string; role: Role }[];
}) {
  const pathname = usePathname();
  const at = (path: string) => pathname.startsWith(`/${org}${path}`);
  const workspace = [
    {
      href: `/${org}`,
      label: "Projects",
      icon: FolderKanban,
      shortcut: "p",
      active: pathname === `/${org}` || pathname === `/${org}/new`,
    },
    { href: `/${org}/members`, label: "Members", icon: Users, shortcut: "m", active: at("/members") },
    ...(canReadAudit(role)
      ? [{ href: `/${org}/audit`, label: "Audit log", icon: ListTree, active: at("/audit") }]
      : []),
  ];
  const account = [
    {
      href: `/${org}/settings/ai`,
      label: "AI assistance",
      icon: Sparkles,
      shortcut: "a",
      active: at("/settings/ai"),
    },
    {
      href: `/${org}/billing`,
      label: "Plan & usage",
      icon: CreditCard,
      shortcut: "b",
      active: at("/billing"),
    },
    {
      href: `/${org}/settings/security`,
      label: "Security",
      icon: KeyRound,
      active: at("/settings/security"),
    },
  ];

  return (
    <SidebarFrame
      label="Workspace"
      switcher={<Switcher org={org} orgName={orgName} role={role} organizations={organizations} />}
      footer={<UsageMeter usage={usage} org={org} />}
    >
      <nav aria-label="Workspace" className="flex flex-col gap-0.5">
        <NavSection>Workspace</NavSection>
        {workspace.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}
      </nav>
      <nav aria-label="Settings" className="flex flex-col gap-0.5">
        <NavSection>Settings</NavSection>
        {account.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}
      </nav>
    </SidebarFrame>
  );
}
