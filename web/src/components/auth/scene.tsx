"use client";

import clsx from "clsx";
import { useRef, type CSSProperties, type ReactNode } from "react";

import { Horizon, StarField } from "@/components/sky";

import { HeroMark } from "./hero-mark";
import { REDUCED_MOTION } from "./media";

/** Shift a layer against the pointer; deeper layers (larger px) move further. */
function depth(px: number): CSSProperties {
  return {
    transform: `translate3d(calc(var(--kx-px, 0) * ${-px}px), calc(var(--kx-py, 0) * ${-px}px), 0)`,
  };
}

/** Deterministic PRNG so the server and client place the same near stars. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NEAR = (() => {
  const rand = rng(4065);
  return Array.from({ length: 18 }, () => ({
    x: +(rand() * 1600).toFixed(1),
    y: +(rand() * 620).toFixed(1),
    r: +(1.1 + rand() * 0.9).toFixed(2),
    delay: +(rand() * 6).toFixed(2),
  }));
})();

/** A handful of brighter, nearer stars, so the parallax has a foreground to move against. */
function NearStars() {
  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full">
      {NEAR.map((s, i) => (
        <circle
          key={i}
          cx={s.x}
          cy={s.y}
          r={s.r}
          fill="#fff"
          className="kx-twinkle"
          style={{ animationDelay: `${s.delay}s` }}
        />
      ))}
    </svg>
  );
}

/**
 * The sign-in brand panel's living backdrop: a star-field in two depths, the horizon, and the
 * KinetixZero mark at scene scale. Moving a mouse over the panel drifts the layers at different
 * depths (a few pixels, eased); touch, pen and reduced motion leave it still.
 */
export function AuthScene({
  children,
  className,
  contentClassName,
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const root = useRef<HTMLDivElement>(null);

  function move(e: React.PointerEvent<HTMLDivElement>) {
    const el = root.current;
    if (!el || e.pointerType !== "mouse" || window.matchMedia(REDUCED_MOTION).matches) return;
    const box = el.getBoundingClientRect();
    el.style.setProperty("--kx-px", ((e.clientX - box.left) / box.width - 0.5).toFixed(3));
    el.style.setProperty("--kx-py", ((e.clientY - box.top) / box.height - 0.5).toFixed(3));
  }

  function settle() {
    root.current?.style.setProperty("--kx-px", "0");
    root.current?.style.setProperty("--kx-py", "0");
  }

  return (
    <div
      ref={root}
      onPointerMove={move}
      onPointerLeave={settle}
      className={clsx("relative isolate overflow-hidden", className)}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -inset-8 transition-transform duration-[1400ms] ease-out" style={depth(8)}>
          <StarField />
        </div>
        <div
          className="absolute -inset-8 opacity-70 transition-transform duration-[1200ms] ease-out"
          style={depth(20)}
        >
          <NearStars />
        </div>
        <Horizon />
        <div className="absolute inset-0 transition-transform duration-[1600ms] ease-out" style={depth(26)}>
          <HeroMark className="top-[-50px] right-[-36px] size-[320px] xl:top-[-46px] xl:right-[-64px] xl:size-[420px] 2xl:size-[500px]" />
        </div>
      </div>
      <div className={clsx("relative z-10 flex flex-1 flex-col", contentClassName)}>{children}</div>
    </div>
  );
}
