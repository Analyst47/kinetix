"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { EXIT, RING_PATH, SOURCE, STROKE, TILE_TRANSFORM, TRACE_PATH } from "./logo-geometry";

// Scale SVG nodes around their own centre.
const NODE: CSSProperties = { transformBox: "fill-box", transformOrigin: "center" };
// Every stroke uses pathLength="1". A gap longer than the dash keeps round caps from leaving a
// dot at the start of an undrawn stroke; kx-draw then animates the offset to 0.
const HIDDEN_STROKE: CSSProperties = { strokeDashoffset: 1.1 };

/**
 * The mark, alive: the ring draws itself, the source node lands, the path traces out through
 * the gap and the exit node lands with a soft ring that repeats every few seconds. Hovering the
 * nearest link or button (or the mark itself) replays it. All CSS, so it starts before
 * hydration; reduced motion shows the finished mark.
 */
export function AnimatedLogoMark({
  size,
  className,
  tile,
}: {
  size: number;
  className?: string;
  tile?: boolean;
}) {
  const [run, setRun] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const host: Element = svg.closest("a, button, [data-logo-host]") ?? svg;
    let last = performance.now();
    const replay = () => {
      const now = performance.now();
      // Let a draw finish before another hover restarts it.
      if (now - last < 1400) return;
      last = now;
      setRun((n) => n + 1);
    };
    host.addEventListener("pointerenter", replay);
    return () => host.removeEventListener("pointerenter", replay);
  }, []);

  const fg = tile ? "#fff" : "currentColor";
  return (
    <svg
      ref={svgRef}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      overflow="visible"
      className={clsx("shrink-0", className)}
    >
      {tile ? <rect width="24" height="24" rx="6" fill="#000" /> : null}
      <g key={run} stroke={fg} fill={fg} transform={tile ? TILE_TRANSFORM : undefined}>
        <path
          d={RING_PATH}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1 1.2"
          style={HIDDEN_STROKE}
          className="animate-[kx-draw_0.95s_cubic-bezier(0.65,0,0.35,1)_forwards]"
        />
        <circle
          cx={SOURCE.cx}
          cy={SOURCE.cy}
          r={SOURCE.r}
          stroke="none"
          style={NODE}
          className="animate-[kx-pop_0.4s_cubic-bezier(0.34,1.56,0.64,1)_0.15s_both]"
        />
        <path
          d={TRACE_PATH}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1 1.2"
          style={HIDDEN_STROKE}
          className="animate-[kx-draw_0.5s_cubic-bezier(0.4,0,0.2,1)_0.5s_forwards]"
        />
        <circle
          cx={EXIT.cx}
          cy={EXIT.cy}
          r={EXIT.r}
          stroke="none"
          style={NODE}
          className="animate-[kx-pop_0.45s_cubic-bezier(0.34,1.56,0.64,1)_0.92s_both]"
        />
        {/* The landing ring. Invisible at rest, so reduced motion simply never shows it. */}
        <circle
          cx={EXIT.cx}
          cy={EXIT.cy}
          r={EXIT.r}
          fill="none"
          strokeWidth={0.9}
          style={{ ...NODE, opacity: 0 }}
          className="animate-[kx-logo-ping_4.8s_cubic-bezier(0.2,0.7,0.2,1)_1.05s_infinite]"
        />
      </g>
    </svg>
  );
}
