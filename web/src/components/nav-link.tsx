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
        "group/nav relative flex h-9 items-center gap-3 rounded-full pr-3 pl-3.5 text-[14px] font-medium transition-colors duration-150",
        active ? "bg-ink/[0.07] text-ink" : "text-muted hover:bg-ink/[0.04] hover:text-ink",
      )}
    >
      <Icon
        className={clsx(
          "size-[17px] shrink-0 transition-colors",
          active ? "text-ink" : "text-muted group-hover/nav:text-ink",
        )}
        aria-hidden
      />
      <span className="truncate">{label}</span>
      {count ? (
        <span
          className={clsx(
            "ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
            active ? "bg-ink text-paper" : "bg-ink/[0.07] text-muted",
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
    <p className="text-muted/80 px-3.5 pt-1 pb-1 font-mono text-[10.5px] font-medium tracking-[0.14em] uppercase">
      {children}
    </p>
  );
}
