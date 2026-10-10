"use client";

import clsx from "clsx";
import { Check, ChevronsUpDown, FolderKanban, Plus } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import { call } from "@/lib/client";
import { SEVERITY_BG, SEVERITY_ORDER } from "@/lib/format";
import type { Project, Role } from "@/lib/types";

import {
  MENU_PANEL,
  MenuDivider,
  MenuLabel,
  MenuLink,
  onMenuKeyDown,
  useDismiss,
  useFocusFirstItem,
} from "./menu";

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  researcher: "Researcher",
  reviewer: "Reviewer",
  viewer: "Viewer",
};

/** Roles the API lets create projects. */
export function canCreateProjects(role?: Role): boolean {
  return role === "owner" || role === "admin" || role === "researcher";
}

function initial(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase();
}

/** A square initial tile; solid for a workspace, outlined for a project. */
export function Tile({
  name,
  kind,
  size = "md",
  className,
}: {
  name: string;
  kind: "workspace" | "project";
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={clsx(
        "grid shrink-0 place-items-center font-semibold",
        size === "md" ? "size-9 rounded-[10px] text-[14px]" : "size-6 rounded-[7px] text-[11px]",
        kind === "workspace"
          ? "bg-ink text-paper"
          : "border-rule-strong bg-sunken text-ink border font-mono shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]",
        className,
      )}
    >
      {initial(name)}
    </span>
  );
}

/** The highest severity with open findings, as a data dot. */
function SeverityDot({ project }: { project: Project }) {
  const top = SEVERITY_ORDER.find((s) => (project.severity_counts?.[s] ?? 0) > 0);
  return (
    <span
      aria-hidden
      className={clsx("size-1.5 shrink-0 rounded-full", top ? SEVERITY_BG[top] : "bg-rule-strong/60")}
    />
  );
}

// The last project list per workspace, shown instantly while a fresh one loads.
const projectCache = new Map<string, Project[]>();

/**
 * The workspace / project switcher card at the top of the sidebar. Its menu lists the
 * workspace's projects (fetched on open, with their open-finding counts) and every
 * workspace the user belongs to.
 */
export function Switcher({
  org,
  orgName,
  role,
  organizations,
  project,
}: {
  org: string;
  orgName: string;
  role?: Role;
  organizations?: { slug: string; name: string; role: Role }[];
  project?: { slug: string; name: string };
}) {
  const pathname = usePathname();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const [projects, setProjects] = useState<Project[] | null>(() => projectCache.get(org) ?? null);
  const [failed, setFailed] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpenAt(null), []);
  useDismiss(open, close, container, trigger);
  useFocusFirstItem(open, menu);

  function toggle() {
    if (open) {
      close();
      return;
    }
    setOpenAt(pathname);
    // Show the last list at once, then refresh it (projects may have been added or deleted).
    setFailed(false);
    call<Project[]>("GET", `/orgs/${org}/projects`)
      .then((list) => {
        projectCache.set(org, list);
        setProjects(list);
      })
      .catch(() => setFailed(true));
  }

  const roleLabel = role ? ROLE_LABEL[role] : null;
  const title = project ? project.name : orgName;
  const subtitle = project
    ? [orgName, roleLabel].filter(Boolean).join(" · ")
    : [roleLabel, "Workspace"].filter(Boolean).join(" · ");
  const workspaces = organizations ?? [{ slug: org, name: orgName, role: role ?? "viewer" }];

  return (
    <div ref={container} className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        className={clsx(
          "group/sw bg-raised/70 hover:border-rule-strong flex w-full items-center gap-2.5 rounded-2xl border p-2 pr-2.5 text-left backdrop-blur-sm transition-colors",
          open ? "border-rule-strong" : "border-rule",
        )}
      >
        <Tile
          key={project?.slug ?? org}
          name={title}
          kind={project ? "project" : "workspace"}
          className="animate-[kx-pop_0.4s_cubic-bezier(0.34,1.56,0.64,1)_both]"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="truncate text-[13.5px] leading-[18px] font-semibold tracking-[-0.01em]">
            {title}
          </span>
          <span className="text-muted truncate text-[11.5px] leading-4">{subtitle}</span>
        </span>
        <ChevronsUpDown
          aria-hidden
          className={clsx(
            "size-4 shrink-0 transition-[color,scale] duration-200 group-hover/sw:scale-110",
            open ? "text-ink" : "text-muted group-hover/sw:text-ink",
          )}
        />
      </button>

      {open ? (
        <div
          ref={menu}
          role="menu"
          aria-label="Switch project or workspace"
          onKeyDown={onMenuKeyDown}
          className={clsx(
            MENU_PANEL,
            "top-[calc(100%+6px)] right-0 left-0 max-h-[min(70vh,520px)] origin-top overflow-y-auto",
          )}
        >
          <MenuLabel>Projects</MenuLabel>
          {projects ? (
            projects.length === 0 ? (
              <p className="text-muted px-2.5 py-2 text-[12.5px]">No projects yet.</p>
            ) : (
              projects.map((p) => (
                <MenuLink
                  key={p.id}
                  href={`/${org}/${p.slug}/findings`}
                  onSelect={close}
                  aside={
                    p.slug === project?.slug ? (
                      <Check className="text-ink size-4" aria-label="Current project" />
                    ) : (
                      <>
                        <span className="font-mono text-[11px] tabular-nums">{p.open_findings ?? 0}</span>
                        <SeverityDot project={p} />
                      </>
                    )
                  }
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Tile name={p.name} kind="project" size="sm" />
                    <span className="min-w-0 truncate">{p.name}</span>
                  </span>
                </MenuLink>
              ))
            )
          ) : failed ? (
            <p className="text-muted px-2.5 py-2 text-[12.5px]">Couldn&apos;t load projects.</p>
          ) : (
            <div className="flex flex-col gap-1 px-1 py-1" aria-busy="true" aria-label="Loading projects">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-7 animate-[kx-shimmer_1.4s_linear_infinite] rounded-lg bg-[linear-gradient(90deg,var(--brand-soft)_30%,var(--rule)_50%,var(--brand-soft)_70%)] bg-[length:200%_100%]"
                />
              ))}
            </div>
          )}
          <MenuLink href={`/${org}`} icon={FolderKanban} onSelect={close}>
            All projects
          </MenuLink>
          {canCreateProjects(role) ? (
            <MenuLink href={`/${org}/new`} icon={Plus} onSelect={close}>
              New project
            </MenuLink>
          ) : null}

          <MenuDivider />
          <MenuLabel>Workspaces</MenuLabel>
          {workspaces.map((w) => (
            <MenuLink
              key={w.slug}
              href={`/${w.slug}`}
              onSelect={close}
              aside={
                w.slug === org ? (
                  <Check className="text-ink size-4" aria-label="Current workspace" />
                ) : (
                  <span className="font-mono text-[10px] tracking-[0.08em] uppercase">
                    {ROLE_LABEL[w.role]}
                  </span>
                )
              }
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <Tile name={w.name} kind="workspace" size="sm" />
                <span className="min-w-0 truncate">{w.name}</span>
              </span>
            </MenuLink>
          ))}
        </div>
      ) : null}
    </div>
  );
}
