"use client";

import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

/** A single sidebar navigation item, shared across the app for a consistent, premium feel. */
export function NavLink({
  href,
  label,
  icon: Icon,
  active,
  count,
  onClick,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
  count?: number;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "group/nav relative flex h-10 items-center gap-3 rounded-lg pr-3 pl-3.5 text-[14.5px] font-medium transition-all duration-150",
        active
          ? "bg-raised text-ink shadow-sm ring-1 ring-rule/70"
          : "text-muted hover:bg-rule/50 hover:text-ink",
      )}
    >
      {active ? (
        <span
          aria-hidden
          className="bg-vg absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-full"
        />
      ) : null}
      <Icon
        className={clsx(
          "size-[18px] shrink-0 transition-colors",
          active ? "text-vg" : "text-muted group-hover/nav:text-ink",
        )}
        aria-hidden
      />
      <span className="truncate">{label}</span>
      {count ? (
        <span
          className={clsx(
            "ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
            active ? "bg-vg-soft text-vg" : "bg-rule text-muted",
          )}
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}

/** Small uppercase section label used above a nav group. */
export function NavSection({ children }: { children: string }) {
  return (
    <p className="text-muted/80 px-3.5 pt-1 pb-1 text-[11px] font-semibold tracking-[0.08em] uppercase">
      {children}
    </p>
  );
}
