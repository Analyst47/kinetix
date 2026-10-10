"use client";

import clsx from "clsx";
import {
  ArrowRight,
  CornerDownLeft,
  CreditCard,
  Crosshair,
  FolderKanban,
  Keyboard,
  KeyRound,
  ListTree,
  Package,
  Plus,
  ScanLine,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  SunMoon,
  Tags,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { LogoMark } from "@/components/logo";
import { KeyCap, KeyCombo } from "@/components/shell/keys";
import { goKeys } from "@/components/shell/shortcuts";
import { toggleTheme } from "@/components/shell/theme";
import { call } from "@/lib/client";
import { SEVERITY_BG, SEVERITY_ORDER } from "@/lib/format";
import type { Project } from "@/lib/types";

type Group = "Finding" | "Actions" | "Project" | "Workspace" | "Projects";
const GROUP_ORDER: Group[] = ["Finding", "Actions", "Project", "Workspace", "Projects"];

interface Item {
  id: string;
  label: string;
  group: Group;
  icon: LucideIcon;
  /** Extra words that should match, e.g. "billing" for Plan & usage. */
  keywords?: string;
  keys?: string[];
  hint?: string;
  /** Severity of the top open finding, for a data dot on project rows. */
  severity?: (typeof SEVERITY_ORDER)[number];
  href?: string;
  run?: () => void;
  mono?: boolean;
}

// Projects for the palette, per workspace, kept between openings so results appear instantly.
const projectCache = new Map<string, Project[]>();

function score(item: Item, q: string): number {
  if (!q) return 1;
  const label = item.label.toLowerCase();
  const hay = `${label} ${item.keywords ?? ""} ${item.group}`.toLowerCase();
  if (label.startsWith(q)) return 4;
  if (label.split(/\s+/).some((w) => w.startsWith(q))) return 3;
  if (hay.includes(q)) return 2;
  // Every query word appears somewhere.
  return q.split(/\s+/).every((w) => hay.includes(w)) ? 1 : 0;
}

/**
 * ⌘K. Jump to any page, open a finding by number, switch project, or run an action. Rendered
 * only while open, so each opening starts fresh.
 */
export function CommandPalette({
  open,
  onClose,
  org,
  project,
  canCreate = true,
  onShortcuts,
}: {
  open: boolean;
  onClose: () => void;
  org: string;
  project?: string;
  /** Whether "New project" is offered (the API lets owners, admins and researchers create). */
  canCreate?: boolean;
  onShortcuts?: () => void;
}) {
  if (!open) return null;
  return (
    <Palette onClose={onClose} org={org} project={project} canCreate={canCreate} onShortcuts={onShortcuts} />
  );
}

function Palette({
  onClose,
  org,
  project,
  canCreate,
  onShortcuts,
}: {
  onClose: () => void;
  org: string;
  project?: string;
  canCreate: boolean;
  onShortcuts?: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [projects, setProjects] = useState<Project[] | null>(() => projectCache.get(org) ?? null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let live = true;
    call<Project[]>("GET", `/orgs/${org}/projects`)
      .then((list) => {
        projectCache.set(org, list);
        if (live) setProjects(list);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [org]);

  const groups = useMemo(() => {
    const base = project ? `/${org}/${project}` : `/${org}`;
    const all: Item[] = [];

    const q = query.trim().toLowerCase();
    const num = q.match(/^(?:fnd-?)?0*(\d{1,6})$/i);
    if (project && num) {
      const id = `FND-${num[1]!.padStart(6, "0")}`;
      all.push({
        id: "jump",
        label: `Open ${id}`,
        group: "Finding",
        icon: CornerDownLeft,
        href: `${base}/findings/${id}`,
        hint: "Finding",
        mono: true,
      });
    }

    if (canCreate) {
      all.push({
        id: "new",
        label: "New project",
        group: "Actions",
        icon: Plus,
        keywords: "create add target",
        href: `/${org}/new`,
      });
    }
    all.push({
      id: "theme",
      label: "Toggle theme",
      group: "Actions",
      icon: SunMoon,
      keywords: "dark light mode appearance",
      run: () => toggleTheme(),
    });
    if (onShortcuts) {
      all.push({
        id: "shortcuts",
        label: "Keyboard shortcuts",
        group: "Actions",
        icon: Keyboard,
        keywords: "keys help hotkeys",
        keys: ["?"],
        run: onShortcuts,
      });
    }

    if (project) {
      all.push(
        {
          id: "findings",
          label: "Findings",
          group: "Project",
          icon: Crosshair,
          href: `${base}/findings`,
          keys: goKeys("f"),
        },
        {
          id: "validate",
          label: "Findings that need validation",
          group: "Project",
          icon: Crosshair,
          keywords: "triage review",
          href: `${base}/findings?status=needs_validation`,
        },
        {
          id: "deps",
          label: "Dependencies",
          group: "Project",
          icon: Package,
          keywords: "osv cve packages",
          href: `${base}/dependencies`,
          keys: goKeys("d"),
        },
        {
          id: "scans",
          label: "Scans",
          group: "Project",
          icon: ScanLine,
          keywords: "upload snapshot semgrep",
          href: `${base}/scans`,
          keys: goKeys("s"),
        },
        {
          id: "disclosures",
          label: "Disclosures",
          group: "Project",
          icon: Send,
          keywords: "vendor report cve",
          href: `${base}/disclosures`,
        },
        {
          id: "label",
          label: "Label queue",
          group: "Project",
          icon: Tags,
          keywords: "ground truth dataset",
          href: `${base}/label`,
          keys: goKeys("l"),
        },
        {
          id: "scope",
          label: "Authorization and scope",
          group: "Project",
          icon: ShieldCheck,
          keywords: "in scope out of scope",
          href: `${base}/scope`,
        },
      );
    }

    all.push(
      {
        id: "projects",
        label: "All projects",
        group: "Workspace",
        icon: FolderKanban,
        href: `/${org}`,
        keys: goKeys("p"),
      },
      {
        id: "billing",
        label: "Plan & usage",
        group: "Workspace",
        icon: CreditCard,
        keywords: "billing agentic triage runs quota upgrade",
        href: `/${org}/billing`,
        keys: goKeys("b"),
      },
      {
        id: "ai",
        label: "AI assistance",
        group: "Workspace",
        icon: Sparkles,
        keywords: "agentic triage settings",
        href: `/${org}/settings/ai`,
        keys: goKeys("a"),
      },
      {
        id: "members",
        label: "Members",
        group: "Workspace",
        icon: Users,
        keywords: "team invite",
        href: `/${org}/members`,
        keys: goKeys("m"),
      },
      {
        id: "audit",
        label: "Audit log",
        group: "Workspace",
        icon: ListTree,
        keywords: "history events",
        href: `/${org}/audit`,
      },
      {
        id: "security",
        label: "Security",
        group: "Workspace",
        icon: KeyRound,
        keywords: "password mfa totp account",
        href: `/${org}/settings/security`,
      },
    );

    for (const p of projects ?? []) {
      if (p.slug === project) continue;
      all.push({
        id: `project-${p.slug}`,
        label: p.name,
        group: "Projects",
        icon: ArrowRight,
        keywords: `${p.slug} project switch`,
        href: `/${org}/${p.slug}/findings`,
        hint: `${p.open_findings ?? 0} open`,
        severity: SEVERITY_ORDER.find((s) => (p.severity_counts?.[s] ?? 0) > 0),
      });
    }

    const scored = all
      .map((item) => ({ item, s: item.id === "jump" ? 9 : score(item, q) }))
      .filter((x) => x.s > 0);
    if (q) return scored.sort((a, b) => b.s - a.s).map((x) => x.item);
    // No query: grouped, with the project list capped so pages stay in view.
    return GROUP_ORDER.flatMap((g) => {
      const inGroup = scored.filter((x) => x.item.group === g).map((x) => x.item);
      return g === "Projects" ? inGroup.slice(0, 5) : inGroup;
    });
  }, [org, project, query, projects, canCreate, onShortcuts]);

  const items = groups;
  const current = Math.min(active, Math.max(0, items.length - 1));
  const activeItem = items[current];

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [current, query]);

  function choose(item: Item | undefined) {
    if (!item) return;
    onClose();
    if (item.run) item.run();
    else if (item.href) router.push(item.href);
  }

  const q = query.trim();
  // Group headers only when browsing; search results are ranked across groups.
  const rows = items.map((item, i) => ({
    item,
    header: !q && (i === 0 || items[i - 1]?.group !== item.group) ? item.group : null,
  }));

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => e.target === dialogRef.current && onClose()}
      aria-label="Command palette"
      className="night border-rule-strong/70 mx-auto mt-[12vh] w-[min(640px,calc(100vw-32px))] animate-[kx-menu-in_0.18s_cubic-bezier(0.2,0.7,0.2,1)_both] overflow-hidden rounded-2xl border p-0 shadow-[0_32px_90px_-24px_rgb(0_0_0/0.75)] backdrop:bg-black/55 backdrop:backdrop-blur-[3px]"
    >
      <div className="border-rule relative flex items-center gap-3 border-b px-4">
        <Search className="text-muted size-[18px] shrink-0" aria-hidden />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive(items.length ? (current + 1) % items.length : 0);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive(items.length ? (current - 1 + items.length) % items.length : 0);
            } else if (e.key === "Home" && !q) {
              e.preventDefault();
              setActive(0);
            } else if (e.key === "End" && !q) {
              e.preventDefault();
              setActive(items.length - 1);
            } else if (e.key === "Enter") {
              e.preventDefault();
              choose(activeItem);
            }
          }}
          placeholder={project ? "Jump to a page, project, or finding number…" : "Jump to a page or project…"}
          aria-label="Search commands"
          role="combobox"
          aria-expanded="true"
          aria-autocomplete="list"
          aria-controls={`${uid}-list`}
          aria-activedescendant={activeItem ? `${uid}-${activeItem.id}` : undefined}
          className="placeholder:text-muted h-14 flex-1 bg-transparent text-[15px] outline-none"
        />
        <KeyCap>Esc</KeyCap>
      </div>

      <div
        ref={listRef}
        id={`${uid}-list`}
        role="listbox"
        aria-label="Results"
        className="max-h-[min(56vh,460px)] overflow-y-auto p-2"
      >
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <LogoMark size={28} className="text-muted" />
            <p className="text-ink text-[14px] font-medium">No matches for “{q}”</p>
            <p className="text-muted text-[12.5px]">
              Try a page name{project ? " or a finding number like 127" : ""}.
            </p>
          </div>
        ) : (
          rows.map(({ item, header }, i) => {
            const on = i === current;
            return (
              <div key={item.id}>
                {header ? (
                  <p className="text-muted px-3 pt-2.5 pb-1.5 font-mono text-[10px] font-medium tracking-[0.16em] uppercase first:pt-1">
                    {header === "Projects" ? "Switch project" : header}
                  </p>
                ) : null}
                <div
                  id={`${uid}-${item.id}`}
                  role="option"
                  aria-selected={on}
                  data-active={on}
                  onMouseMove={() => (on ? undefined : setActive(i))}
                  onClick={() => choose(item)}
                  className={clsx(
                    "relative flex h-11 cursor-pointer items-center gap-3 rounded-xl px-2.5 transition-colors duration-100",
                    on ? "bg-ink/[0.08] text-ink" : "text-ink/85",
                  )}
                >
                  {on ? (
                    <span
                      aria-hidden
                      className="bg-ink absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full"
                    />
                  ) : null}
                  <span
                    className={clsx(
                      "grid size-7 shrink-0 place-items-center rounded-lg border transition-colors",
                      on ? "border-rule-strong bg-ink/[0.08]" : "border-rule bg-sunken",
                    )}
                  >
                    <item.icon className={clsx("size-[15px]", on ? "text-ink" : "text-muted")} aria-hidden />
                  </span>
                  <span
                    className={clsx(
                      "min-w-0 flex-1 truncate text-[14px]",
                      item.mono && "font-mono text-[13px]",
                    )}
                  >
                    {item.label}
                  </span>
                  {item.severity ? (
                    <span
                      aria-hidden
                      className={clsx("size-1.5 shrink-0 rounded-full", SEVERITY_BG[item.severity])}
                    />
                  ) : null}
                  {item.hint ? (
                    <span className="text-muted shrink-0 text-[12px] tabular-nums">{item.hint}</span>
                  ) : null}
                  {q && !item.hint ? (
                    <span className="text-muted shrink-0 text-[11.5px]">{item.group}</span>
                  ) : null}
                  {item.keys ? <KeyCombo keys={item.keys} className="shrink-0" /> : null}
                  <CornerDownLeft
                    aria-hidden
                    className={clsx(
                      "size-3.5 shrink-0 transition-opacity",
                      on ? "text-muted opacity-100" : "opacity-0",
                    )}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="border-rule text-muted flex h-10 items-center gap-4 border-t px-4 text-[11.5px]">
        <span className="flex items-center gap-1.5">
          <KeyCombo keys={["↑", "↓"]} /> Move
        </span>
        <span className="flex items-center gap-1.5">
          <KeyCap>↵</KeyCap> Open
        </span>
        <span className="hidden items-center gap-1.5 sm:flex">
          <KeyCap>Esc</KeyCap> Close
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <LogoMark size={13} />
          <span className="font-mono text-[10px] tracking-[0.14em] uppercase">KinetixZero</span>
        </span>
      </div>
    </dialog>
  );
}
