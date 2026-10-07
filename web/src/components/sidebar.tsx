"use client";

import clsx from "clsx";
import {
  ChevronsUpDown,
  Crosshair,
  ListTree,
  Package,
  ScanLine,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Wordmark } from "@/components/logo";
import { AUTHORIZATION_LABEL, shortDate } from "@/lib/format";

interface Props {
  org: string;
  orgName: string;
  project: {
    slug: string;
    name: string;
    authorization_type: string;
    authorization_expires_at: string | null;
  };
  openFindings: number;
  vulnerableDependencies: number;
  authorizationExpired: boolean;
}

export function Sidebar({
  org,
  orgName,
  project,
  openFindings,
  vulnerableDependencies,
  authorizationExpired: expired,
}: Props) {
  const pathname = usePathname();
  const base = `/${org}/${project.slug}`;
  const nav = [
    { href: `${base}/findings`, label: "Findings", icon: Crosshair, count: openFindings },
    { href: `${base}/dependencies`, label: "Dependencies", icon: Package, count: vulnerableDependencies },
    { href: `${base}/scans`, label: "Scans", icon: ScanLine },
  ];
  const expires = project.authorization_expires_at;

  return (
    <div className="border-rule bg-sunken w-full shrink-0 border-b md:w-[232px] md:border-r md:border-b-0">
      <aside className="flex flex-col gap-4 px-3 py-3.5 md:sticky md:top-0 md:h-dvh">
        <Link href="/" className="rounded-md px-1.5 py-0.5">
          <Wordmark />
        </Link>

        <Link
          href={`/${org}`}
          className="border-rule-strong bg-raised hover:bg-paper flex items-center justify-between gap-2 rounded-md border px-2.5 py-2"
        >
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-semibold">{project.name}</span>
            <span className="text-muted truncate text-xs">{orgName}</span>
          </span>
          <ChevronsUpDown className="text-muted size-4 shrink-0" aria-hidden />
        </Link>

        <nav aria-label="Project" className="flex flex-col gap-0.5">
          {nav.map(({ href, label, icon: Icon, count }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "text-ink flex h-8 items-center gap-2.5 rounded-md px-2.5 font-medium",
                  active ? "bg-vg-soft" : "hover:bg-rule",
                )}
              >
                <Icon className={clsx("size-4", active ? "text-vg" : "text-muted")} aria-hidden />
                {label}
                {count ? <span className="text-muted ml-auto text-xs">{count}</span> : null}
              </Link>
            );
          })}
        </nav>

        <nav aria-label="Workspace" className="mt-auto flex flex-col gap-0.5">
          <Link
            href={`/${org}/audit`}
            aria-current={pathname.startsWith(`/${org}/audit`) ? "page" : undefined}
            className="text-ink hover:bg-rule flex h-8 items-center gap-2.5 rounded-md px-2.5 font-medium"
          >
            <ListTree className="text-muted size-4" aria-hidden />
            Audit log
          </Link>
        </nav>

        <div className="border-rule bg-raised flex flex-col gap-1 rounded-md border px-3 py-2.5">
          <div
            className={clsx(
              "flex items-center gap-2 text-[13px] font-semibold",
              expired ? "text-crit" : "text-ok",
            )}
          >
            {expired ? (
              <ShieldAlert className="size-4" aria-hidden />
            ) : (
              <ShieldCheck className="size-4" aria-hidden />
            )}
            {expired ? "Authorization expired" : "Authorized target"}
          </div>
          <p className="text-muted text-xs">
            {AUTHORIZATION_LABEL[project.authorization_type] ?? project.authorization_type}
          </p>
          {expires ? (
            <p className="text-muted text-xs">
              {expired ? "Expired" : "Review by"} {shortDate(expires)}
            </p>
          ) : null}
          <Link href={`/${org}/${project.slug}/scope`} className="text-vg mt-0.5 text-xs hover:underline">
            View scope
          </Link>
        </div>
      </aside>
    </div>
  );
}
