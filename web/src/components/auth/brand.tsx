"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { DrawnMark } from "./mark";
import { useReducedMotion } from "./media";

/**
 * The sign-in lockup: the mark drawing itself inside a hairline orbit with a slow satellite,
 * a heavy "Kinetix" against a hairline "Zero" that firms up on hover. Hovering replays the draw.
 */
export function AuthBrand() {
  const reduced = useReducedMotion();
  const [run, setRun] = useState(0);
  const last = useRef(0);

  function replay() {
    if (reduced) return;
    const now = performance.now();
    // Let a draw finish before another hover restarts it.
    if (now - last.current < 1500) return;
    last.current = now;
    setRun((n) => n + 1);
  }

  return (
    <Link
      href="/"
      aria-label="KinetixZero home"
      onPointerEnter={replay}
      className="group/brand inline-flex items-center gap-3 rounded-full"
    >
      <span aria-hidden className="relative grid size-10 shrink-0 place-items-center">
        <span className="border-rule-strong group-hover/brand:border-ink/60 absolute inset-0 rounded-full border transition-colors duration-500" />
        {/* A satellite on the orbit. */}
        <span className="absolute inset-0 animate-[kx-spin_14s_linear_infinite]">
          <span className="bg-ink absolute -top-[2.5px] left-1/2 size-[5px] -translate-x-1/2 rounded-full" />
        </span>
        <DrawnMark key={run} size={22} still={reduced} className="text-ink relative" />
      </span>
      <span className="font-display text-ink inline-flex items-baseline text-[19px] leading-none">
        <span className="font-[750] tracking-[-0.05em]">Kinetix</span>
        <span className="text-muted group-hover/brand:text-ink font-[320] tracking-[-0.025em] transition-[color,font-weight] duration-500 ease-out group-hover/brand:font-[460]">
          Zero
        </span>
      </span>
    </Link>
  );
}
