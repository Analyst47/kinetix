"use client";

import clsx from "clsx";
import type { CSSProperties } from "react";

import { HIDDEN_STROKE, MARK, NODE_ORIGIN } from "./mark";
import { useReducedMotion } from "./media";

const HAIR = 0.075;
const POP = "cubic-bezier(0.34,1.56,0.64,1)";

// Dial ticks round the mark, every 7.5°; every fourth one is longer.
const TICKS = Array.from({ length: 48 }, (_, i) => {
  const a = (i / 48) * Math.PI * 2;
  const major = i % 4 === 0;
  const r1 = major ? 11.05 : 11.3;
  const r2 = 11.5;
  return {
    x1: +(12 + Math.cos(a) * r1).toFixed(3),
    y1: +(12 + Math.sin(a) * r1).toFixed(3),
    x2: +(12 + Math.cos(a) * r2).toFixed(3),
    y2: +(12 + Math.sin(a) * r2).toFixed(3),
    major,
  };
});

// A short reticle round the source node.
const RETICLE = [45, 135, 225, 315].map((deg) => {
  const a = (deg * Math.PI) / 180;
  const { cx, cy } = MARK.source;
  return {
    x1: +(cx + Math.cos(a) * 2.5).toFixed(3),
    y1: +(cy + Math.sin(a) * 2.5).toFixed(3),
    x2: +(cx + Math.cos(a) * 3.1).toFixed(3),
    y2: +(cy + Math.sin(a) * 3.1).toFixed(3),
  };
});

/**
 * The KinetixZero mark at scene scale, drawn in hairlines over a faint silhouette of the solid
 * logo: an instrument dial turns slowly round it, the ring and the traced path draw themselves,
 * and a small comet runs from the source node out through the gap to the exit node, which
 * ripples. Decorative; reduced motion shows the finished mark, still.
 */
export function HeroMark({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  const motion = (css: string): CSSProperties => (reduced ? {} : { animation: css });
  const drawn = (css: string): CSSProperties => (reduced ? {} : { strokeDashoffset: 1.1, animation: css });

  return (
    <div aria-hidden className={clsx("pointer-events-none absolute", className)}>
      <svg viewBox="0 0 24 24" fill="none" overflow="visible" className="absolute inset-0 size-full">
        {/* Instrument dial */}
        <g style={{ ...NODE_ORIGIN, ...motion("kx-spin 160s linear infinite") }}>
          <circle cx={12} cy={12} r={11.75} stroke="#fff" strokeOpacity={0.08} strokeWidth={0.03} />
          {TICKS.map((t, i) => (
            <line
              key={i}
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              stroke="#fff"
              strokeOpacity={t.major ? 0.3 : 0.12}
              strokeWidth={0.04}
            />
          ))}
        </g>
        <g style={{ ...NODE_ORIGIN, ...motion("kx-spin 240s linear infinite reverse") }}>
          <circle
            cx={12}
            cy={12}
            r={10.15}
            stroke="#fff"
            strokeOpacity={0.09}
            strokeWidth={0.035}
            strokeDasharray="1.6 0.7"
          />
        </g>

        {/* The mark: a faint solid silhouette under crisp hairlines, drawn together. */}
        <g stroke="#fff" strokeLinecap="round">
          <path
            d={MARK.ring}
            strokeWidth={MARK.stroke}
            strokeOpacity={0.065}
            {...HIDDEN_STROKE}
            style={drawn("kx-draw 2.2s cubic-bezier(0.65,0,0.35,1) 0.25s forwards")}
          />
          <path
            d={MARK.ring}
            strokeWidth={HAIR}
            strokeOpacity={0.6}
            {...HIDDEN_STROKE}
            style={drawn("kx-draw 2.2s cubic-bezier(0.65,0,0.35,1) 0.25s forwards")}
          />
          <path
            d={MARK.trace}
            strokeWidth={MARK.stroke}
            strokeOpacity={0.065}
            {...HIDDEN_STROKE}
            style={drawn("kx-draw 0.9s cubic-bezier(0.4,0,0.2,1) 1.75s forwards")}
          />
          <path
            d={MARK.trace}
            strokeWidth={HAIR}
            strokeOpacity={0.8}
            {...HIDDEN_STROKE}
            style={drawn("kx-draw 0.9s cubic-bezier(0.4,0,0.2,1) 1.75s forwards")}
          />
        </g>

        {/* Source node and its reticle */}
        <g style={{ ...NODE_ORIGIN, ...motion(`kx-pop 0.6s ${POP} 1.2s both`) }}>
          <circle
            {...MARK.source}
            fill="#fff"
            fillOpacity={0.05}
            stroke="#fff"
            strokeOpacity={0.55}
            strokeWidth={HAIR}
          />
          <circle cx={MARK.source.cx} cy={MARK.source.cy} r={0.42} fill="#fff" />
        </g>
        <g
          stroke="#fff"
          strokeOpacity={0.4}
          strokeWidth={0.05}
          strokeLinecap="round"
          style={{ ...NODE_ORIGIN, ...motion("kx-spin 28s linear infinite") }}
        >
          {RETICLE.map((r, i) => (
            <line key={i} {...r} />
          ))}
        </g>

        {/* Exit node: where the traced input breaks out */}
        <g style={{ ...NODE_ORIGIN, ...motion(`kx-pop 0.7s ${POP} 2.55s both`) }}>
          <circle
            {...MARK.exit}
            fill="#fff"
            fillOpacity={0.09}
            stroke="#fff"
            strokeOpacity={0.85}
            strokeWidth={HAIR}
          />
          <circle cx={MARK.exit.cx} cy={MARK.exit.cy} r={0.78} fill="#fff" />
        </g>

        {reduced ? null : (
          <>
            {[2.9, 4.7].map((delay) => (
              <circle
                key={delay}
                {...MARK.exit}
                stroke="#fff"
                strokeOpacity={0.5}
                strokeWidth={0.05}
                style={{
                  ...NODE_ORIGIN,
                  opacity: 0,
                  animation: `kx-pulse-ring 3.6s cubic-bezier(0.2,0.7,0.2,1) ${delay}s infinite`,
                }}
              />
            ))}
            {/* A small comet running source → exit along the traced path. */}
            {[
              { r: 0.34, o: 1, lag: 0 },
              { r: 0.24, o: 0.45, lag: 0.07 },
              { r: 0.16, o: 0.2, lag: 0.14 },
            ].map(({ r, o, lag }) => (
              <circle key={lag} r={r} fill="#fff" opacity={0}>
                <animateMotion
                  path={MARK.trace}
                  dur="2.6s"
                  begin={`${3.2 + lag}s`}
                  repeatCount="indefinite"
                  calcMode="spline"
                  keyTimes="0;1"
                  keySplines="0.45 0 0.25 1"
                />
                <animate
                  attributeName="opacity"
                  values={`0;${o};${o};0;0`}
                  keyTimes="0;0.1;0.55;0.62;1"
                  dur="2.6s"
                  begin={`${3.2 + lag}s`}
                  repeatCount="indefinite"
                />
              </circle>
            ))}
          </>
        )}
      </svg>

      {/* Callouts, hidden on narrow panels where they would meet the headline. */}
      <span
        className="absolute hidden xl:block"
        style={{ left: `${(MARK.source.cx / 24) * 100}%`, top: `${((MARK.source.cy + 3.6) / 24) * 100}%` }}
      >
        <span
          className="kx-fade-up flex -translate-x-1/2 flex-col items-center gap-1 text-center"
          style={{ animationDelay: "1.7s" }}
        >
          <span className="h-4 w-px bg-white/25" />
          <span className="eyebrow text-ink/80 text-[10px]">Source</span>
          <span className="text-muted font-mono text-[10.5px]">untrusted input</span>
        </span>
      </span>
      <span
        className="absolute hidden xl:block"
        style={{
          right: `${100 - ((MARK.exit.cx - MARK.exit.r - 0.9) / 24) * 100}%`,
          top: `${(MARK.exit.cy / 24) * 100}%`,
        }}
      >
        <span
          className="kx-fade-up flex -translate-y-1/2 items-center gap-2.5"
          style={{ animationDelay: "2.9s" }}
        >
          <span className="flex flex-col items-end">
            <span className="eyebrow text-ink/80 text-[10px]">Sink</span>
            <span className="text-muted font-mono text-[10.5px]">where it escapes</span>
          </span>
          <span className="h-px w-6 bg-white/25" />
        </span>
      </span>
    </div>
  );
}
