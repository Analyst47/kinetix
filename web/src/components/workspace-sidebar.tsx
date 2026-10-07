"use client";

import clsx from "clsx";
import { FolderKanban, KeyRound, ListTree, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Wordmark } from "@/components/logo";

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
      href: `/${org}/settings/security`,
      label: "Security",
      icon: KeyRound,
      active: pathname.startsWith(`/${org}/settings`),
    },
  ];
  return (
    <div className="border-rule bg-sunken w-full shrink-0 border-b md:w-[232px] md:border-r md:border-b-0">
      <aside className="flex flex-col gap-4 px-3 py-3.5 md:sticky md:top-0 md:h-dvh">
        <Link href="/" className="rounded-md px-1.5 py-0.5">
          <Wordmark />
        </Link>
        <div className="px-2.5">
          <div className="truncate font-semibold">{orgName}</div>
          <div className="text-muted text-xs">Workspace</div>
        </div>
        <nav aria-label="Workspace" className="flex flex-col gap-0.5">
          {items.map(({ href, label, icon: Icon, active }) => (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "flex h-8 items-center gap-2.5 rounded-md px-2.5 font-medium",
                active ? "bg-vg-soft" : "hover:bg-rule",
              )}
            >
              <Icon className={clsx("size-4", active ? "text-vg" : "text-muted")} aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
      </aside>
    </div>
  );
}
