"use client";

import clsx from "clsx";
import {
  ChevronsUpDown,
  Crosshair,
  ListTree,
  Package,
  ScanLine,
  Send,
  ShieldCheck,
  ShieldAlert,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Wordmark } from "@/components/logo";
import { NavLink, NavSection } from "@/components/nav-link";
import { UsageMeter } from "@/components/usage";
import { AUTHORIZATION_LABEL, shortDate } from "@/lib/format";
import type { Usage } from "@/lib/types";

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
  urgentDisclosures: number;
  authorizationExpired: boolean;
  usage: Usage;
}

export function Sidebar({
  org,
  orgName,
  project,
  openFindings,
  vulnerableDependencies,
  urgentDisclosures,
  authorizationExpired: expired,
  usage,
}: Props) {
  const pathname = usePathname();
  const base = `/${org}/${project.slug}`;
  const nav = [
    { href: `${base}/findings`, label: "Findings", icon: Crosshair, count: openFindings },
    { href: `${base}/dependencies`, label: "Dependencies", icon: Package, count: vulnerableDependencies },
    { href: `${base}/disclosures`, label: "Disclosures", icon: Send, count: urgentDisclosures },
    { href: `${base}/scans`, label: "Scans", icon: ScanLine },
  ];
  const expires = project.authorization_expires_at;

  return (
    <div className="border-rule bg-sunken w-full shrink-0 border-b md:w-[256px] md:border-r md:border-b-0">
      <aside className="flex flex-col gap-5 px-3.5 py-4 md:sticky md:top-0 md:h-dvh md:overflow-y-auto">
        <Link
          href="/app"
          className="rounded-md px-1.5 py-1"
        >
          <Wordmark size={17} />
        </Link>

        <Link
          href={`/${org}`}
          className="border-rule bg-raised hover:border-rule-strong group flex items-center justify-between gap-2 rounded-2xl border px-3.5 py-2.5 transition-colors"
        >
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[14px] font-semibold">{project.name}</span>
            <span className="text-muted truncate text-xs">{orgName}</span>
          </span>
          <ChevronsUpDown className="text-muted group-hover:text-ink size-4 shrink-0 transition-colors" aria-hidden />
        </Link>

        <nav aria-label="Project" className="flex flex-col gap-1">
          {nav.map(({ href, label, icon, count }) => (
            <NavLink
              key={href}
              href={href}
              label={label}
              icon={icon}
              count={count}
              active={pathname.startsWith(href)}
            />
          ))}
        </nav>

        <nav aria-label="Workspace" className="mt-auto flex flex-col gap-1">
          <NavSection>Workspace</NavSection>
          <NavLink href={`/${org}/members`} label="Members" icon={Users} />
          <NavLink href={`/${org}/audit`} label="Audit log" icon={ListTree} />
        </nav>

        <UsageMeter usage={usage} org={org} />

        <div
          className={clsx(
            "flex flex-col gap-1 rounded-2xl border px-3.5 py-3",
            expired ? "border-crit/40" : "border-rule bg-raised",
          )}
        >
          <div
            className={clsx(
              "flex items-center gap-2 text-[13px] font-semibold",
              expired ? "text-crit" : "text-ink",
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
          <Link
            href={`/${org}/${project.slug}/scope`}
            className="text-ink mt-1 text-xs font-medium hover:underline"
          >
            View scope →
          </Link>
        </div>
      </aside>
    </div>
  );
}
