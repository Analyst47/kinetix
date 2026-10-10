"use client";

import { CreditCard, FolderKanban, KeyRound, ListTree, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Wordmark } from "@/components/logo";
import { NavLink } from "@/components/nav-link";
import { UsageMeter } from "@/components/usage";
import type { Usage } from "@/lib/types";

export function WorkspaceSidebar({ org, orgName, usage }: { org: string; orgName: string; usage: Usage }) {
  const pathname = usePathname();
  const items = [
    {
      href: `/${org}`,
      label: "Projects",
      icon: FolderKanban,
      active: pathname === `/${org}` || pathname === `/${org}/new`,
    },
    {
      href: `/${org}/members`,
      label: "Members",
      icon: Users,
      active: pathname.startsWith(`/${org}/members`),
    },
    {
      href: `/${org}/audit`,
      label: "Audit log",
      icon: ListTree,
      active: pathname.startsWith(`/${org}/audit`),
    },
    {
      href: `/${org}/settings/ai`,
      label: "AI assistance",
      icon: Sparkles,
      active: pathname.startsWith(`/${org}/settings/ai`),
    },
    {
      href: `/${org}/billing`,
      label: "Plan & usage",
      icon: CreditCard,
      active: pathname.startsWith(`/${org}/billing`),
    },
    {
      href: `/${org}/settings/security`,
      label: "Security",
      icon: KeyRound,
      active: pathname.startsWith(`/${org}/settings/security`),
    },
  ];
  return (
    <div className="border-rule bg-sunken w-full shrink-0 border-b md:w-[256px] md:border-r md:border-b-0">
      <aside className="flex flex-col gap-5 px-3.5 py-4 md:sticky md:top-0 md:h-dvh md:overflow-y-auto">
        <Link href="/app" className="rounded-md px-1.5 py-1">
          <Wordmark size={17} />
        </Link>
        <div className="border-rule bg-raised flex items-center gap-2.5 rounded-2xl border px-3 py-2.5">
          <span className="bg-ink text-paper grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-semibold">
            {orgName.slice(0, 1).toUpperCase()}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[14px] font-semibold">{orgName}</span>
            <span className="text-muted text-xs">Workspace</span>
          </span>
        </div>
        <nav aria-label="Workspace" className="flex flex-col gap-1">
          {items.map(({ href, label, icon, active }) => (
            <NavLink key={href} href={href} label={label} icon={icon} active={active} />
          ))}
        </nav>
        <div className="mt-auto">
          <UsageMeter usage={usage} org={org} />
        </div>
      </aside>
    </div>
  );
}
