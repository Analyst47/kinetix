"use client";

import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import Link, { useLinkStatus } from "next/link";

import { KeyCap } from "@/components/shell/keys";

/** A sweep across the item while its route loads (only shown when navigation actually waits). */
function PendingSweep() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={clsx(
        "pointer-events-none absolute inset-0 rounded-[inherit] bg-[linear-gradient(90deg,transparent_30%,rgb(255_255_255/0.09)_50%,transparent_70%)] bg-[length:200%_100%] transition-opacity duration-200",
        pending ? "animate-[kx-shimmer_1.1s_linear_infinite] opacity-100" : "opacity-0",
      )}
    />
  );
}

/**
 * A sidebar navigation item. Designed for the sidebar's night surface: a lit notch and soft
 * inset fill mark the active page, the icon tips on hover, and the "g" shortcut appears as
 * keycaps. Counts are data and stay tabular.
 */
export function NavLink({
  href,
  label,
  icon: Icon,
  active,
  count,
  onClick,
  shortcut,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
  count?: number;
  onClick?: () => void;
  /** The second key of a "g" sequence, e.g. "f" for G F. */
  shortcut?: string;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "group/nav relative flex h-9 items-center gap-3 rounded-[10px] pr-2 pl-3 text-[13.5px] font-medium transition-[background-color,color,box-shadow] duration-200",
        active
          ? "bg-ink/[0.085] text-ink shadow-[inset_0_0_0_1px_rgb(255_255_255/0.05),inset_0_1px_0_rgb(255_255_255/0.07)]"
          : "text-muted hover:bg-ink/[0.045] hover:text-ink",
      )}
    >
      {active ? (
        <span
          aria-hidden
          className="bg-ink absolute top-1/2 -left-px h-4 w-[3px] -translate-y-1/2 animate-[kx-notch_0.35s_cubic-bezier(0.2,0.7,0.2,1)_both] rounded-r-full"
        />
      ) : null}
      <Icon
        aria-hidden
        strokeWidth={active ? 2.2 : 1.9}
        className={clsx(
          "size-[17px] shrink-0 transition-[color,scale,rotate] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover/nav:scale-110 group-hover/nav:-rotate-[8deg]",
          active ? "text-ink" : "text-muted group-hover/nav:text-ink",
        )}
      />
      <span className="min-w-0 flex-1 truncate transition-transform duration-200 group-hover/nav:translate-x-px">
        {label}
      </span>
      {shortcut ? (
        <span
          aria-hidden
          className="hidden items-center gap-0.5 opacity-0 transition-opacity duration-200 group-hover/nav:opacity-100 group-focus-visible/nav:opacity-100 md:inline-flex"
        >
          <KeyCap>G</KeyCap>
          <KeyCap>{shortcut.toUpperCase()}</KeyCap>
        </span>
      ) : null}
      {count ? (
        <span
          className={clsx(
            "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 font-mono text-[10.5px] font-semibold tabular-nums transition-colors",
            active ? "bg-ink text-paper" : "bg-ink/[0.08] text-ink/75 group-hover/nav:bg-ink/[0.14]",
          )}
        >
          {count > 999 ? "999+" : count}
        </span>
      ) : null}
      <PendingSweep />
    </Link>
  );
}

/** Small uppercase section label above a nav group, trailed by a hairline. */
export function NavSection({ children }: { children: string }) {
  return (
    <p className="text-muted/75 flex items-center gap-2 px-3 pt-1 pb-1.5 font-mono text-[10px] font-medium tracking-[0.16em] uppercase">
      {children}
      <span aria-hidden className="bg-rule h-px flex-1" />
    </p>
  );
}
