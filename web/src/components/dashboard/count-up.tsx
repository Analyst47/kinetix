"use client";

import { useEffect, useRef } from "react";

import { useReducedMotion } from "./hooks";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * A number that counts up from zero the first time it scrolls into view. The server renders
 * the final value (so it reads correctly without JavaScript and for assistive tech); the
 * animation only rewrites the visible text, and never runs under prefers-reduced-motion.
 */
export function CountUp({
  value,
  className,
  duration = 1100,
  delay = 0,
}: {
  value: number;
  className?: string;
  duration?: number;
  delay?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const played = useRef(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce || played.current || value === 0) return;
    let raf = 0;
    const run = () => {
      const start = performance.now() + delay;
      const step = (t: number) => {
        const k = Math.min(1, Math.max(0, (t - start) / duration));
        // easeOutExpo: quick to start, settles gently on the final value.
        const eased = k === 1 ? 1 : 1 - Math.pow(2, -10 * k);
        el.textContent = fmt(value * eased);
        if (k < 1) raf = requestAnimationFrame(step);
      };
      el.textContent = fmt(0);
      raf = requestAnimationFrame(step);
    };
    const io = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      io.disconnect();
      played.current = true;
      run();
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      // React has already committed the latest value to data-value; never leave a partial count.
      el.textContent = el.dataset.value ?? el.textContent;
    };
  }, [value, reduce, duration, delay]);

  return (
    <span ref={ref} data-value={fmt(value)} className={className}>
      {fmt(value)}
    </span>
  );
}
