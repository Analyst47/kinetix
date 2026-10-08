"use client";

import { FolderKanban, KeyRound, ListTree, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Wordmark } from "@/components/logo";
import { NavLink } from "@/components/nav-link";

export function WorkspaceSidebar({ org, orgName }: { org: string; orgName: string }) {
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
      href: `/${org}/settings/security`,
      label: "Security",
      icon: KeyRound,
      active: pathname.startsWith(`/${org}/settings/security`),
    },
  ];
  return (
    <div className="border-rule bg-sunken w-full shrink-0 border-b md:w-[256px] md:border-r md:border-b-0">
      <aside className="flex flex-col gap-5 px-3.5 py-4 md:sticky md:top-0 md:h-dvh">
        <Link
          href="/app"
          className="focus-visible:ring-vg/40 rounded-md px-1.5 py-1 focus-visible:ring-2 focus-visible:outline-none"
        >
          <Wordmark size={18} interactive />
        </Link>
        <div className="border-rule bg-raised flex items-center gap-2.5 rounded-xl border px-3 py-2.5 shadow-sm">
          <span className="bg-vg-soft text-vg grid size-8 shrink-0 place-items-center rounded-lg text-[13px] font-semibold">
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
      </aside>
    </div>
  );
}
