"use client";

import clsx from "clsx";
import {
  Bug,
  CalendarClock,
  CircleCheck,
  LayoutGrid,
  MoreHorizontal,
  Rows3,
  ScanLine,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";

import { DeleteProjectDialog, canDeleteProjects } from "@/components/delete-project";
import { useShell } from "@/components/shell-context";
import { AUTHORIZATION_LABEL, SEVERITY_LABEL, SEVERITY_ORDER } from "@/lib/format";
import type { Project } from "@/lib/types";

import { useHydrated, useStoredChoice } from "./hooks";
import { Identicon } from "./identicon";
import {
  REVIEW_WINDOW_DAYS,
  SEVERITY_FILL,
  byRisk,
  countsOf,
  formatDay,
  openOf,
  reviewOf,
  reviewPhrase,
  type Review,
} from "./lib";
import { WorkspaceRadar } from "./workspace-radar";

type View = "grid" | "list";
type Sort = "risk" | "name" | "review" | "newest";
type Filter = "all" | "risk" | "review" | "clear";

const SORT_LABEL: Record<Sort, string> = {
  risk: "Highest risk",
  name: "Name",
  review: "Review date",
  newest: "Newest",
};

function sorter(sort: Sort) {
  return (a: Project, b: Project) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "newest") return b.created_at.localeCompare(a.created_at);
    if (sort === "review") {
      const ra = a.authorization_expires_at ? new Date(a.authorization_expires_at).getTime() : Infinity;
      const rb = b.authorization_expires_at ? new Date(b.authorization_expires_at).getTime() : Infinity;
      return ra - rb || byRisk(a, b);
    }
    return byRisk(a, b);
  };
}

function matchesFilter(p: Project, filter: Filter, now: number): boolean {
  if (filter === "all") return true;
  const c = countsOf(p);
  if (filter === "risk") return c.critical + c.high > 0;
  if (filter === "clear") return openOf(p) === 0;
  const r = reviewOf(p, now);
  return r.kind === "expired" || r.kind === "soon";
}

/**
 * The workspace's projects: the orbital radar on top, then the projects as cards (or a dense
 * list), with search, filters and sorting. Hovering a card lights its node on the radar and
 * hovering a node outlines its card. Owners and admins get "Delete" in each project's menu.
 */
export function ProjectBoard({
  org,
  projects,
  now,
  aside,
}: {
  org: string;
  projects: Project[];
  /** The server's clock when the page rendered, so review dates agree on server and client. */
  now: number;
  /** Rendered beside the project list on wide screens (the activity feed). */
  aside?: ReactNode;
}) {
  const shell = useShell();
  const canDelete = canDeleteProjects(shell.org.role);

  const [focus, setFocus] = useState<string | null>(null);
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useStoredChoice<Sort>(
    "kx.projects.sort",
    ["risk", "name", "review", "newest"],
    "risk",
  );
  const [view, setView] = useStoredChoice<View>("kx.projects.view", ["grid", "list"], "grid");

  // Projects deleted in this session vanish at once; the refreshed server data agrees shortly.
  const live = useMemo(() => projects.filter((p) => !removed.has(p.slug)), [projects, removed]);

  const counts: Record<Filter, number> = useMemo(
    () => ({
      all: live.length,
      risk: live.filter((p) => matchesFilter(p, "risk", now)).length,
      review: live.filter((p) => matchesFilter(p, "review", now)).length,
      clear: live.filter((p) => matchesFilter(p, "clear", now)).length,
    }),
    [live, now],
  );

  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      live
        .filter((p) => matchesFilter(p, filter, now))
        .filter((p) => !q || p.name.toLowerCase().includes(q) || p.slug.includes(q))
        .sort(sorter(sort)),
    [live, filter, q, sort, now],
  );

  const actions = (p: Project) => (
    <RowMenu
      org={org}
      project={p}
      open={menu === p.slug}
      onOpenChange={(o) => setMenu(o ? p.slug : null)}
      onDelete={canDelete ? () => setDeleting(p) : undefined}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      {live.length > 0 ? (
        <WorkspaceRadar
          org={org}
          orgName={shell.org.name}
          projects={live}
          now={now}
          highlight={focus}
          onHighlight={setFocus}
        />
      ) : null}

      <div className={clsx("grid items-start gap-6", aside && "xl:grid-cols-[minmax(0,1fr)_360px]")}>
        <section aria-labelledby="projects-title" className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2
              id="projects-title"
              className="flex items-baseline gap-2 text-[17px] font-semibold tracking-[-0.01em]"
            >
              Projects
              <span className="text-muted font-mono text-[12px] font-normal">{live.length}</span>
            </h2>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <label className="border-rule-strong/70 bg-raised focus-within:border-ink hover:border-rule-strong relative flex h-8 items-center gap-2 rounded-full border pr-1 pl-3 transition-colors">
                <Search className="text-muted size-3.5 shrink-0" aria-hidden />
                <span className="sr-only">Search projects</span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setQuery("");
                  }}
                  placeholder="Search projects"
                  className="placeholder:text-muted w-36 bg-transparent text-[13px] outline-none sm:w-44"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                    className="text-muted hover:text-ink hover:bg-ink/[0.06] grid size-6 place-items-center rounded-full"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : (
                  <span className="w-1" />
                )}
              </label>
              <label className="border-rule-strong/70 bg-raised hover:border-rule-strong focus-within:border-ink relative flex h-8 items-center rounded-full border pr-2 pl-3 text-[13px] transition-colors">
                <span className="text-muted mr-1.5">Sort</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                  className="text-ink cursor-pointer bg-transparent pr-1 font-medium outline-none"
                >
                  {(Object.keys(SORT_LABEL) as Sort[]).map((s) => (
                    <option key={s} value={s}>
                      {SORT_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
              <div
                role="group"
                aria-label="Layout"
                className="border-rule-strong/70 flex h-8 items-center rounded-full border p-0.5"
              >
                {(
                  [
                    ["grid", "Cards", LayoutGrid],
                    ["list", "List", Rows3],
                  ] as const
                ).map(([v, label, Icon]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    aria-label={label}
                    title={label}
                    onClick={() => setView(v)}
                    className={clsx(
                      "grid h-full w-8 place-items-center rounded-full transition-colors",
                      view === v ? "bg-ink text-paper" : "text-muted hover:text-ink",
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div role="group" aria-label="Filter projects" className="flex flex-wrap gap-1.5">
            {(
              [
                ["all", "All"],
                ["risk", "Critical or high"],
                ["review", `Review due · ${REVIEW_WINDOW_DAYS}d`],
                ["clear", "No open findings"],
              ] as const
            ).map(([f, label]) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={clsx(
                  "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors",
                  filter === f
                    ? "border-ink bg-ink text-paper"
                    : "border-rule text-muted hover:border-rule-strong hover:text-ink",
                )}
              >
                {label}
                <span className={clsx("font-mono text-[11px]", filter === f ? "opacity-70" : "opacity-80")}>
                  {counts[f]}
                </span>
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <div className="border-rule text-muted flex flex-col items-start gap-2 rounded-2xl border border-dashed px-5 py-8 text-[13.5px]">
              <p>No projects match {q ? <>&ldquo;{query.trim()}&rdquo;</> : "this filter"}.</p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
                className="text-ink font-medium underline-offset-4 hover:underline"
              >
                Show all projects
              </button>
            </div>
          ) : view === "grid" ? (
            <ul className={clsx("grid gap-3 sm:grid-cols-2", !aside && "xl:grid-cols-3")}>
              {shown.map((p, i) => (
                <li
                  key={p.slug}
                  className="kx-fade-up"
                  style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}
                >
                  <ProjectCard
                    org={org}
                    project={p}
                    now={now}
                    lit={focus === p.slug}
                    onFocusChange={setFocus}
                    actions={actions(p)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <ProjectTable
              org={org}
              projects={shown}
              now={now}
              focus={focus}
              onFocusChange={setFocus}
              actions={actions}
            />
          )}
        </section>

        {aside}
      </div>

      <DeleteProjectDialog
        org={org}
        project={
          deleting ? { slug: deleting.slug, name: deleting.name, openFindings: openOf(deleting) } : null
        }
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onDeleted={(slug) => {
          setRemoved((prev) => new Set(prev).add(slug));
          setFocus(null);
        }}
      />
    </div>
  );
}

/* ── Card ───────────────────────────────────────────────────────────────────────────────── */

function ProjectCard({
  org,
  project: p,
  now,
  lit,
  onFocusChange,
  actions,
}: {
  org: string;
  project: Project;
  now: number;
  lit: boolean;
  onFocusChange: (slug: string | null) => void;
  actions: ReactNode;
}) {
  const open = openOf(p);
  const counts = countsOf(p);
  const review = reviewOf(p, now);
  const hydrated = useHydrated();
  return (
    <article
      onMouseEnter={() => onFocusChange(p.slug)}
      onMouseLeave={() => onFocusChange(null)}
      className={clsx(
        "group bg-raised relative flex h-full flex-col rounded-2xl border transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_32px_-22px_rgb(0_0_0/0.55)]",
        lit ? "border-ink" : "border-rule hover:border-rule-strong",
      )}
    >
      <div className="flex items-start gap-3 p-4 pb-3">
        <Identicon seed={p.slug} size={42} orbit />
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="truncate text-[15px] leading-[22px] font-semibold tracking-[-0.01em]">
            <Link
              href={`/${org}/${p.slug}/findings`}
              onFocus={() => onFocusChange(p.slug)}
              onBlur={() => onFocusChange(null)}
              className="rounded-sm outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-[var(--ink)]"
            >
              {p.name}
            </Link>
          </h3>
          <p className="mono text-muted truncate">{p.slug}</p>
        </div>
        <div className="relative z-10 -mt-1 -mr-1.5">{actions}</div>
      </div>

      <div className="flex flex-col gap-2.5 px-4 pb-4">
        <div className="flex items-baseline gap-2">
          <span className={clsx("display text-[30px] leading-none", open ? "text-ink" : "text-muted")}>
            {open.toLocaleString("en-US")}
          </span>
          <span className="text-muted text-[13px]">open finding{open === 1 ? "" : "s"}</span>
          {open === 0 ? (
            <span className="text-ok ml-auto inline-flex items-center gap-1 text-[12px] font-medium">
              <CircleCheck className="size-3.5" aria-hidden />
              Clear
            </span>
          ) : null}
        </div>
        <SeverityBar counts={counts} total={open} />
        <div className="flex min-h-5 flex-wrap gap-x-3.5 gap-y-1">
          {SEVERITY_ORDER.filter((s) => counts[s] > 0).map((s) => (
            <span key={s} className="text-muted inline-flex items-center gap-1.5 text-[12px]">
              <span aria-hidden className="size-1.5 rounded-full" style={{ background: SEVERITY_FILL[s] }} />
              {SEVERITY_LABEL[s]}
              <span className="text-ink font-medium">{counts[s]}</span>
            </span>
          ))}
          {open === 0 ? (
            <span className="text-muted text-[12px]">Nothing open from the latest analysis.</span>
          ) : null}
        </div>
      </div>

      <footer className="border-rule text-muted mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-4 py-2.5 text-[12px]">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {AUTHORIZATION_LABEL[p.authorization_type] ?? p.authorization_type}
          </span>
        </span>
        <ReviewBadge review={review} local={hydrated} />
      </footer>
    </article>
  );
}

function ReviewBadge({ review, local, compact }: { review: Review; local: boolean; compact?: boolean }) {
  if (review.kind === "none") {
    return compact ? <span className="text-muted">No expiry</span> : null;
  }
  const urgent = review.kind === "expired" || review.kind === "soon";
  return (
    <span
      title={reviewPhrase(review)}
      className={clsx(
        "inline-flex items-center gap-1.5 whitespace-nowrap",
        !compact && "ml-auto",
        review.kind === "expired" && "text-crit font-medium",
        review.kind === "soon" && "text-med font-medium",
      )}
    >
      <CalendarClock className="size-3.5 shrink-0" aria-hidden />
      {urgent ? reviewPhrase(review) : <>Review by {formatDay(review.at, local)}</>}
    </span>
  );
}

/** Open findings as one stacked bar, growing in once the page has hydrated. */
function SeverityBar({ counts, total }: { counts: ReturnType<typeof countsOf>; total: number }) {
  const hydrated = useHydrated();
  return (
    <div
      className="bg-sunken flex h-1.5 w-full gap-px overflow-hidden rounded-full"
      role="img"
      aria-label={
        total
          ? SEVERITY_ORDER.filter((s) => counts[s])
              .map((s) => `${counts[s]} ${SEVERITY_LABEL[s].toLowerCase()}`)
              .join(", ")
          : "No open findings"
      }
    >
      {SEVERITY_ORDER.map((s, i) =>
        counts[s] ? (
          <span
            key={s}
            className="h-full rounded-[1px] transition-[width] duration-700 ease-out"
            style={{
              width: hydrated ? `${(counts[s] / Math.max(1, total)) * 100}%` : "0%",
              background: SEVERITY_FILL[s],
              transitionDelay: `${120 + i * 70}ms`,
            }}
          />
        ) : null,
      )}
    </div>
  );
}

/* ── List ───────────────────────────────────────────────────────────────────────────────── */

function ProjectTable({
  org,
  projects,
  now,
  focus,
  onFocusChange,
  actions,
}: {
  org: string;
  projects: Project[];
  now: number;
  focus: string | null;
  onFocusChange: (slug: string | null) => void;
  actions: (p: Project) => ReactNode;
}) {
  const hydrated = useHydrated();
  return (
    <div className="border-rule bg-raised overflow-x-auto rounded-2xl border">
      <table className="w-full min-w-[760px] border-collapse">
        <thead>
          <tr className="text-muted text-left text-xs leading-4">
            {["Project", "Open findings", "Authorization", "Review by", "Created", ""].map((h, i) => (
              <th key={i} className="border-rule border-b px-4 py-2.5 font-medium">
                {h ? h : <span className="sr-only">Actions</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => {
            const open = openOf(p);
            const counts = countsOf(p);
            return (
              <tr
                key={p.slug}
                onMouseEnter={() => onFocusChange(p.slug)}
                onMouseLeave={() => onFocusChange(null)}
                className={clsx(
                  "border-rule border-b transition-colors last:border-b-0",
                  focus === p.slug ? "bg-ink/[0.035]" : "hover:bg-ink/[0.025]",
                )}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Identicon seed={p.slug} size={32} />
                    <div className="flex min-w-0 flex-col">
                      <Link
                        href={`/${org}/${p.slug}/findings`}
                        onFocus={() => onFocusChange(p.slug)}
                        onBlur={() => onFocusChange(null)}
                        className="text-ink truncate font-medium hover:underline"
                      >
                        {p.name}
                      </Link>
                      <span className="mono text-muted truncate">{p.slug}</span>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex w-[180px] flex-col gap-1.5">
                    <div className="flex items-baseline gap-2">
                      <span className={clsx("font-semibold", open ? "text-ink" : "text-muted")}>{open}</span>
                      <span className="flex gap-2 text-[11.5px]">
                        {SEVERITY_ORDER.filter((s) => s !== "info" && counts[s] > 0).map((s) => (
                          <span key={s} className="text-muted inline-flex items-center gap-1">
                            <span
                              aria-hidden
                              className="size-1.5 rounded-full"
                              style={{ background: SEVERITY_FILL[s] }}
                            />
                            {counts[s]}
                            <span className="sr-only">{SEVERITY_LABEL[s]}</span>
                          </span>
                        ))}
                      </span>
                    </div>
                    <SeverityBar counts={counts} total={open} />
                  </div>
                </td>
                <td className="text-muted px-4 py-3 text-[13px]">
                  {AUTHORIZATION_LABEL[p.authorization_type] ?? p.authorization_type}
                </td>
                <td className="px-4 py-3 text-[13px]">
                  <ReviewBadge review={reviewOf(p, now)} local={hydrated} compact />
                </td>
                <td className="text-muted px-4 py-3 text-[13px] whitespace-nowrap">
                  <time dateTime={p.created_at}>{formatDay(p.created_at, hydrated)}</time>
                </td>
                <td className="w-12 px-2 py-3 text-right">{actions(p)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Actions menu ───────────────────────────────────────────────────────────────────────── */

function RowMenu({
  org,
  project,
  open,
  onOpenChange,
  onDelete,
}: {
  org: string;
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete?: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const menuId = `project-menu-${project.slug}`;
  const close = useEffectEvent(() => onOpenChange(false));

  // While open: focus the first item, and close on an outside press, scroll or resize. The menu
  // is portalled to <body> with fixed positioning, so card transforms and the list's scroll
  // container never clip it.
  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!list.current?.contains(t) && !button.current?.contains(t)) close();
    };
    const onMove = () => close();
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open]);

  const toggle = () => {
    if (open) {
      onOpenChange(false);
      return;
    }
    const r = button.current?.getBoundingClientRect();
    if (r) {
      const width = 232;
      const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
      const roomBelow = window.innerHeight - r.bottom > 220;
      setPlace(roomBelow ? { top: r.bottom + 6, left } : { bottom: window.innerHeight - r.top + 6, left });
    }
    onOpenChange(true);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      onOpenChange(false);
      button.current?.focus();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = (at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      items[e.key === "Home" ? 0 : items.length - 1]?.focus();
    } else if (e.key === "Tab") {
      e.preventDefault();
      onOpenChange(false);
      button.current?.focus();
    }
  };

  const base = `/${org}/${project.slug}`;
  const item =
    "flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13.5px] text-ink outline-none transition-colors hover:bg-ink/[0.06] focus-visible:bg-ink/[0.06] [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted";

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={`Actions for ${project.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={toggle}
        className={clsx(
          "text-muted hover:text-ink hover:bg-ink/[0.06] inline-flex size-8 items-center justify-center rounded-full transition-colors",
          open && "bg-ink/[0.06] text-ink",
        )}
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </button>
      {open && place
        ? createPortal(
            <div
              ref={list}
              id={menuId}
              role="menu"
              aria-label={`${project.name} actions`}
              onKeyDown={onKeyDown}
              style={{ top: place.top, bottom: place.bottom, left: place.left, width: 232 }}
              className="kx-fade-up border-rule bg-raised text-ink fixed z-50 flex flex-col rounded-xl border p-1 text-left shadow-[0_18px_40px_-18px_rgb(0_0_0/0.45)] [animation-duration:180ms]"
            >
              <div className="text-muted truncate px-2.5 pt-1.5 pb-1 font-mono text-[11px] tracking-[0.12em] uppercase">
                {project.slug}
              </div>
              <Link
                role="menuitem"
                href={`${base}/findings`}
                className={item}
                onClick={() => onOpenChange(false)}
              >
                <Bug aria-hidden />
                Findings
              </Link>
              <Link
                role="menuitem"
                href={`${base}/scans`}
                className={item}
                onClick={() => onOpenChange(false)}
              >
                <ScanLine aria-hidden />
                Scans
              </Link>
              <Link
                role="menuitem"
                href={`${base}/scope`}
                className={item}
                onClick={() => onOpenChange(false)}
              >
                <ShieldCheck aria-hidden />
                Scope and authorization
              </Link>
              {onDelete ? (
                <>
                  <div role="separator" className="bg-rule mx-1.5 my-1 h-px" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onOpenChange(false);
                      onDelete();
                    }}
                    className={clsx(item, "hover:text-crit focus-visible:text-crit hover:[&_svg]:text-crit")}
                  >
                    <Trash2 aria-hidden />
                    Delete project…
                  </button>
                </>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
