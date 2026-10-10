"use client";

import clsx from "clsx";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";

import { CommandPalette } from "@/components/command-palette";
import { AccountMenu } from "@/components/shell/account-menu";
import { KeyCombo, useModKey } from "@/components/shell/keys";
import { GoHud, ShortcutsDialog, useShellKeys } from "@/components/shell/shortcuts";
import { canCreateProjects } from "@/components/shell/switcher";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { TriageChip } from "@/components/usage";
import type { Role, Usage } from "@/lib/types";

export interface Crumb {
  label: string;
  href?: string;
  mono?: boolean;
}

/** A thin forward slash between crumbs. */
function Slash() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="text-rule-strong size-4 shrink-0">
      <path d="M10.2 2.8 5.8 13.2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  const last = crumbs.length - 1;
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center text-[13.5px]">
        {crumbs.map((c, i) => {
          const current = i === last;
          // On phones only the root and the current page show.
          const middle = i > 0 && !current;
          return (
            <li
              key={`${c.label}-${i}`}
              className={clsx(
                "flex min-w-0 items-center",
                middle && "hidden sm:flex",
                current ? "shrink" : "shrink-[2]",
              )}
            >
              {i > 0 ? <Slash /> : null}
              {c.href && !current ? (
                <Link
                  href={c.href}
                  className={clsx(
                    "text-muted hover:text-ink hover:bg-ink/[0.05] flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 transition-colors",
                    c.mono && "font-mono text-[12.5px]",
                  )}
                >
                  {i === 0 ? (
                    <span
                      aria-hidden
                      className="border-rule-strong bg-raised text-ink grid size-5 shrink-0 place-items-center rounded-md border font-mono text-[10px] font-semibold"
                    >
                      {(c.label.trim()[0] ?? "?").toUpperCase()}
                    </span>
                  ) : null}
                  {/* On phones the root shows as its initial tile only, leaving room for the page. */}
                  <span className={clsx("max-w-[22ch] truncate", i === 0 && "max-sm:sr-only")}>
                    {c.label}
                  </span>
                </Link>
              ) : (
                <span
                  aria-current={current ? "page" : undefined}
                  className={clsx(
                    "truncate px-1.5 py-1",
                    current ? "text-ink kx-fade-up font-semibold tracking-[-0.01em]" : "text-muted",
                    c.mono && "font-mono text-[12.5px]",
                  )}
                >
                  {c.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function TopBar({
  crumbs,
  user,
  org,
  project,
  usage,
  role,
}: {
  crumbs: Crumb[];
  user: { name: string; email: string };
  org: string;
  project?: string;
  usage?: Usage;
  role?: Role;
}) {
  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const mod = useModKey();
  const togglePalette = useCallback(() => setPalette((v) => !v), []);
  const openShortcuts = useCallback(() => setShortcuts(true), []);
  const awaitingGo = useShellKeys({ org, project, onPalette: togglePalette, onShortcuts: openShortcuts });
  const canCreate = role === undefined || canCreateProjects(role);

  return (
    <>
      <header className="border-rule bg-paper/95 supports-[backdrop-filter]:bg-paper/85 sticky top-0 z-30 border-b backdrop-blur-xl backdrop-saturate-150">
        <div className="flex h-14 items-center gap-2 px-4 md:px-6">
          <Breadcrumbs crumbs={crumbs} />

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPalette(true)}
              aria-keyshortcuts="Meta+K Control+K"
              className="group/search border-rule bg-raised text-muted hover:border-rule-strong hover:text-ink relative hidden h-9 w-[clamp(190px,24vw,320px)] items-center gap-2.5 overflow-hidden rounded-full border pr-1.5 pl-3.5 text-[13px] transition-colors sm:flex"
            >
              <Search
                className="size-[15px] shrink-0 transition-transform duration-300 group-hover/search:scale-110 group-hover/search:-rotate-12"
                aria-hidden
              />
              <span className="flex-1 truncate text-left">Search or jump to…</span>
              <KeyCombo keys={[mod, "K"]} className="shrink-0" />
            </button>
            <button
              type="button"
              onClick={() => setPalette(true)}
              aria-label="Search"
              className="text-muted hover:bg-ink/[0.06] hover:text-ink inline-flex size-9 items-center justify-center rounded-full transition-colors sm:hidden"
            >
              <Search className="size-[18px]" aria-hidden />
            </button>

            {usage ? <TriageChip usage={usage} org={org} className="hidden lg:inline-flex" /> : null}

            {canCreate ? (
              <Link
                href={`/${org}/new`}
                aria-label="New project"
                className="group/new bg-brand text-on-brand hidden h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-opacity hover:opacity-90 md:inline-flex xl:px-3.5"
              >
                <Plus
                  className="size-4 shrink-0 transition-transform duration-300 group-hover/new:rotate-90"
                  aria-hidden
                />
                <span className="hidden xl:inline">New project</span>
              </Link>
            ) : null}

            <span aria-hidden className="bg-rule mx-1 hidden h-5 w-px sm:block" />
            <ThemeToggle />
            <AccountMenu user={user} org={org} role={role} usage={usage} onShortcuts={openShortcuts} />
          </div>
        </div>

        {/* A single soft sweep along the bottom edge each time a page arrives. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -bottom-px h-px animate-[kx-shimmer_1.6s_cubic-bezier(0.4,0,0.2,1)_both] bg-[linear-gradient(90deg,transparent,var(--ink),transparent)] bg-[length:40%_100%] bg-no-repeat opacity-25"
        />

        <CommandPalette
          open={palette}
          onClose={() => setPalette(false)}
          org={org}
          project={project}
          canCreate={canCreate}
          onShortcuts={openShortcuts}
        />
        <ShortcutsDialog open={shortcuts} onClose={() => setShortcuts(false)} project={project} />
      </header>
      {/* Outside the header: its backdrop filter would otherwise contain this fixed element. */}
      {awaitingGo ? <GoHud org={org} project={project} /> : null}
    </>
  );
}
