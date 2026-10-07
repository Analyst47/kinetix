"use client";

import clsx from "clsx";
import { KeyRound, LogOut, Moon, Search, Sun } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState, useSyncExternalStore } from "react";

import { CommandPalette } from "@/components/command-palette";
import { Avatar, Kbd } from "@/components/ui";
import { call } from "@/lib/client";

export interface Crumb {
  label: string;
  href?: string;
  mono?: boolean;
}

export function TopBar({
  crumbs,
  user,
  org,
  project,
}: {
  crumbs: Crumb[];
  user: { name: string; email: string };
  org: string;
  project?: string;
}) {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function signOut() {
    await call("POST", "/auth/logout").catch(() => undefined);
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-rule bg-raised sticky top-0 z-20 flex h-12 items-center gap-3 border-b px-4 md:px-6">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2">
        {crumbs.map((c, i) => (
          <Fragment key={`${c.label}-${i}`}>
            {i > 0 ? (
              <span aria-hidden className="text-muted">
                /
              </span>
            ) : null}
            {c.href && i < crumbs.length - 1 ? (
              <Link href={c.href} className={clsx("text-muted hover:text-ink truncate", c.mono && "mono")}>
                {c.label}
              </Link>
            ) : (
              <span
                aria-current={i === crumbs.length - 1 ? "page" : undefined}
                className={clsx(
                  "truncate",
                  i === crumbs.length - 1 ? "font-medium" : "text-muted",
                  c.mono && "mono",
                )}
              >
                {c.label}
              </span>
            )}
          </Fragment>
        ))}
      </nav>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-rule-strong bg-raised text-muted hover:bg-paper ml-auto hidden h-8 w-[300px] max-w-[40vw] items-center gap-2 rounded-sm border px-2.5 sm:flex"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 text-left">Search or jump to</span>
        <Kbd>⌘K</Kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="hover:bg-rule ml-auto inline-flex size-8 items-center justify-center rounded-md sm:hidden"
      >
        <Search className="size-4" />
      </button>

      <ThemeToggle />

      <div className="relative">
        <button
          type="button"
          onClick={() => setMenu((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menu}
          aria-label="Account"
          className="rounded-full"
        >
          <Avatar name={user.name} />
        </button>
        {menu ? (
          <div
            role="menu"
            className="border-rule bg-raised absolute right-0 mt-2 w-60 rounded-md border p-1 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.35)]"
          >
            <div className="px-2.5 py-2">
              <div className="font-medium">{user.name}</div>
              <div className="text-muted truncate text-xs">{user.email}</div>
            </div>
            <div className="bg-rule my-1 h-px" />
            <Link
              role="menuitem"
              href={`/${org}/settings/security`}
              onClick={() => setMenu(false)}
              className="hover:bg-paper flex h-8 w-full items-center gap-2 rounded-sm px-2.5"
            >
              <KeyRound className="text-muted size-4" aria-hidden />
              Security
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={signOut}
              className="hover:bg-paper flex h-8 w-full items-center gap-2 rounded-sm px-2.5 text-left"
            >
              <LogOut className="text-muted size-4" aria-hidden />
              Sign out
            </button>
          </div>
        ) : null}
      </div>

      <CommandPalette open={open} onClose={() => setOpen(false)} org={org} project={project} />
    </header>
  );
}

function currentTheme(): "dark" | "light" {
  const attr = document.documentElement.dataset.theme;
  if (attr === "dark" || attr === "light") return attr;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribeTheme(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  media.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", onChange);
  };
}

function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => null);
  const dark = theme === "dark";

  function toggle() {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("kx-theme", next);
    } catch {
      // Storage can be unavailable (private mode); the toggle still works for this page.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Use light theme" : "Use dark theme"}
      className="text-muted hover:bg-rule hover:text-ink inline-flex size-8 items-center justify-center rounded-md"
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
