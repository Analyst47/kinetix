"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";
import type { ReactNode } from "react";

import { Wordmark } from "@/components/logo";
import { Horizon, StarField } from "@/components/sky";

/** A sparse star-field and a faint ridge line at the foot of the sidebar. Decorative only. */
function SidebarSky() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <StarField density={0.5} className="opacity-70" />
      <div className="absolute inset-x-0 bottom-0 hidden h-[190px] overflow-hidden md:block">
        {/* Wider than the sidebar so the ridges keep the landing page's proportions. */}
        <div className="absolute bottom-0 left-1/2 h-[430px] w-[1000px] -translate-x-1/2 opacity-80">
          <Horizon />
        </div>
      </div>
    </div>
  );
}

/** Two bars that fold into an X. */
function MenuGlyph({ open }: { open: boolean }) {
  const bar = "absolute left-0 h-[1.6px] w-full rounded-full bg-current transition-transform duration-300";
  return (
    <span aria-hidden className="relative block h-3 w-4">
      <span className={clsx(bar, "top-[3px]", open && "translate-y-[2.2px] rotate-45")} />
      <span className={clsx(bar, "bottom-[3px]", open && "-translate-y-[2.2px] -rotate-45")} />
    </span>
  );
}

/**
 * The app sidebar's frame: an always-dark night surface in both themes, with the animated
 * wordmark on top. From md up it is a full-height sticky column; below md it is a compact
 * strip whose menu button reveals the same contents. The menu closes itself on navigation
 * (it is open only for the path it was opened on).
 */
export function SidebarFrame({
  label,
  switcher,
  children,
  footer,
}: {
  label: string;
  switcher: ReactNode;
  children: ReactNode;
  footer: ReactNode;
}) {
  const pathname = usePathname();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const panel = useId();

  return (
    <div className="night border-rule relative w-full shrink-0 border-b md:w-[264px] md:border-r md:border-b-0">
      <div className="relative md:sticky md:top-0 md:h-dvh">
        <SidebarSky />
        <aside
          aria-label={label}
          className="relative flex h-full [scrollbar-width:thin] flex-col px-3 py-2.5 md:overflow-y-auto md:px-3.5 md:py-4"
        >
          <div className="flex h-10 items-center gap-2 px-1.5">
            <Link href="/app" aria-label="KinetixZero home" className="-mx-1 rounded-lg px-1 py-1">
              <Wordmark size={17} animated variant="split" />
            </Link>
            <button
              type="button"
              onClick={() => setOpenAt(open ? null : pathname)}
              aria-expanded={open}
              aria-controls={panel}
              aria-label={open ? "Close navigation" : "Open navigation"}
              className="text-ink hover:bg-ink/[0.08] ml-auto grid size-9 place-items-center rounded-full transition-colors md:hidden"
            >
              <MenuGlyph open={open} />
            </button>
          </div>
          <div
            id={panel}
            className={clsx(
              "mt-3 flex-1 flex-col gap-5 pb-2 md:mt-4 md:flex md:pb-0",
              open ? "flex animate-[kx-fade-up_0.25s_ease-out_both] md:animate-none" : "hidden",
            )}
          >
            {switcher}
            {children}
            <div className="mt-auto flex flex-col gap-2.5 pt-2">{footer}</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
