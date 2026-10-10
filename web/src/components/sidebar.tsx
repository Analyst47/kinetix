"use client";

import clsx from "clsx";
import {
  ArrowRight,
  Crosshair,
  FolderKanban,
  ListTree,
  Package,
  ScanLine,
  Send,
  ShieldAlert,
  ShieldCheck,
  Tags,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { NavLink, NavSection } from "@/components/nav-link";
import { SidebarFrame } from "@/components/shell/sidebar-frame";
import { Switcher } from "@/components/shell/switcher";
import { UsageMeter } from "@/components/usage";
import { AUTHORIZATION_LABEL, shortDate } from "@/lib/format";
import type { Role, Usage } from "@/lib/types";

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
  role?: Role;
  organizations?: { slug: string; name: string; role: Role }[];
  /** Computed on the server: days until review (negative once expired) and the share of the window used. */
  authorizationWindow?: { daysLeft: number; elapsed: number } | null;
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
  role,
  organizations,
  authorizationWindow,
}: Props) {
  const pathname = usePathname();
  const base = `/${org}/${project.slug}`;
  const nav = [
    { href: `${base}/findings`, label: "Findings", icon: Crosshair, count: openFindings, shortcut: "f" },
    {
      href: `${base}/dependencies`,
      label: "Dependencies",
      icon: Package,
      count: vulnerableDependencies,
      shortcut: "d",
    },
    { href: `${base}/disclosures`, label: "Disclosures", icon: Send, count: urgentDisclosures },
    { href: `${base}/scans`, label: "Scans", icon: ScanLine, shortcut: "s" },
    { href: `${base}/label`, label: "Label queue", icon: Tags, shortcut: "l" },
  ];

  return (
    <SidebarFrame
      label="Project"
      switcher={
        <Switcher
          org={org}
          orgName={orgName}
          role={role}
          organizations={organizations}
          project={{ slug: project.slug, name: project.name }}
        />
      }
      footer={
        <>
          <AuthorizationCard
            org={org}
            project={project}
            expired={expired}
            review={authorizationWindow ?? null}
          />
          <UsageMeter usage={usage} org={org} />
        </>
      }
    >
      <nav aria-label="Project" className="flex flex-col gap-0.5">
        <NavSection>Project</NavSection>
        {nav.map((item) => (
          <NavLink key={item.href} {...item} active={pathname.startsWith(item.href)} />
        ))}
      </nav>

      <nav aria-label="Workspace" className="flex flex-col gap-0.5">
        <NavSection>Workspace</NavSection>
        <NavLink href={`/${org}`} label="All projects" icon={FolderKanban} shortcut="p" />
        <NavLink href={`/${org}/members`} label="Members" icon={Users} shortcut="m" />
        <NavLink href={`/${org}/audit`} label="Audit log" icon={ListTree} />
      </nav>
    </SidebarFrame>
  );
}

/** The project's authorization, restyled for the night surface, with its review window as a bar. */
function AuthorizationCard({
  org,
  project,
  expired,
  review,
}: {
  org: string;
  project: Props["project"];
  expired: boolean;
  review: { daysLeft: number; elapsed: number } | null;
}) {
  const expires = project.authorization_expires_at;
  const days = review?.daysLeft ?? null;
  return (
    <Link
      href={`/${org}/${project.slug}/scope`}
      className={clsx(
        "group/auth bg-raised/70 flex flex-col gap-2 rounded-2xl border p-3 backdrop-blur-sm transition-colors",
        expired ? "border-crit/40 hover:border-crit/70" : "border-rule hover:border-rule-strong",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={clsx(
            "grid size-6 shrink-0 place-items-center rounded-full border",
            expired ? "border-crit/40 text-crit" : "border-rule-strong text-ink",
          )}
        >
          {expired ? (
            <ShieldAlert className="size-3.5" aria-hidden />
          ) : (
            <ShieldCheck className="size-3.5" aria-hidden />
          )}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className={clsx("text-[12.5px] leading-4 font-semibold", expired ? "text-crit" : "text-ink")}>
            {expired ? "Authorization expired" : "Authorized target"}
          </span>
          <span className="text-muted truncate text-[11px] leading-4">
            {AUTHORIZATION_LABEL[project.authorization_type] ?? project.authorization_type}
          </span>
        </span>
        {!expired ? (
          <span aria-hidden className="relative ml-auto grid size-2 shrink-0 place-items-center">
            <span className="kx-pulse-ring bg-ink/50 absolute inset-0 rounded-full" />
            <span className="bg-ink relative size-1.5 rounded-full" />
          </span>
        ) : null}
      </div>

      {expires && review ? (
        <div className="flex flex-col gap-1.5">
          <div
            className="bg-ink/[0.09] h-1 overflow-hidden rounded-full"
            role="meter"
            aria-label="Authorization window used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(review.elapsed * 100)}
          >
            <div
              className={clsx(
                "h-full origin-left animate-[kx-grow-x_1s_cubic-bezier(0.2,0.7,0.2,1)_0.3s_both] rounded-full",
                expired ? "bg-crit" : "bg-ink/80",
              )}
              style={{ width: `${Math.max(3, Math.round(review.elapsed * 100))}%` }}
            />
          </div>
          <div className="text-muted flex items-center justify-between font-mono text-[10.5px] tabular-nums">
            <span>
              {expired ? "Expired" : "Review by"} {shortDate(expires)}
            </span>
            {days !== null && !expired ? <span className="text-ink/80">{days}d left</span> : null}
          </div>
        </div>
      ) : expires ? (
        <p className="text-muted font-mono text-[10.5px]">
          {expired ? "Expired" : "Review by"} {shortDate(expires)}
        </p>
      ) : null}

      <span className="text-ink/90 inline-flex items-center gap-1 text-[12px] font-medium">
        View scope
        <ArrowRight
          aria-hidden
          className="size-3.5 transition-transform duration-200 group-hover/auth:translate-x-0.5"
        />
      </span>
    </Link>
  );
}
