import clsx from "clsx";

import {
  EXIT,
  RING_PATH,
  SOURCE,
  STROKE,
  TILE_TRANSFORM,
  TRACE_PATH,
} from "@/components/shell/logo-geometry";
import { AnimatedLogoMark } from "@/components/shell/logo-motion";

/**
 * The KinetixZero mark: a "zero" ring, and a traced path from a source node inside it out to a
 * node that breaks through the ring. It is the product in one glyph — following untrusted input
 * to the point where it escapes. Drawn in currentColor so it is white on the black public site
 * and in dark mode, and black in the light app theme; `tile` renders the white-on-black app icon.
 *
 * Static by default. `animated` draws the mark in on mount, lands the exit node with a soft
 * ring that repeats every few seconds, and replays when the surrounding link is hovered.
 */
export function LogoMark({
  size = 22,
  className,
  tile,
  animated,
}: {
  size?: number;
  className?: string;
  tile?: boolean;
  animated?: boolean;
}) {
  if (animated) return <AnimatedLogoMark size={size} className={className} tile={tile} />;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={clsx("shrink-0", className)}
    >
      {tile ? <rect width="24" height="24" rx="6" fill="#000" /> : null}
      <g
        stroke={tile ? "#fff" : "currentColor"}
        fill={tile ? "#fff" : "currentColor"}
        transform={tile ? TILE_TRANSFORM : undefined}
      >
        {/* The ring, open where the path breaks through it. */}
        <path d={RING_PATH} fill="none" strokeWidth={STROKE} strokeLinecap="round" />
        {/* The traced path, source to exit. */}
        <path d={TRACE_PATH} fill="none" strokeWidth={STROKE} strokeLinecap="round" />
        <circle cx={SOURCE.cx} cy={SOURCE.cy} r={SOURCE.r} stroke="none" />
        <circle cx={EXIT.cx} cy={EXIT.cy} r={EXIT.r} stroke="none" />
      </g>
    </svg>
  );
}

/**
 * The mark plus the name.
 *
 * - `variant="classic"` (default): the original lockup, "Kinetix" semibold with "Zero" muted.
 * - `variant="split"`: the crafted app lockup — a heavy, tightly tracked "Kinetix" against a
 *   hairline "Zero" that firms up when the surrounding link is hovered.
 * - `badge`: an optional small mono tag after the name (e.g. "Console").
 * - `animated`: animates the mark (see LogoMark).
 */
export function Wordmark({
  size = 15,
  markSize,
  className,
  animated,
  variant = "classic",
  badge,
}: {
  size?: number;
  markSize?: number;
  className?: string;
  animated?: boolean;
  variant?: "classic" | "split";
  badge?: string;
}) {
  return (
    <span className={clsx("group/wordmark inline-flex items-center gap-2.5", className)}>
      <LogoMark size={markSize ?? Math.round(size * 1.45)} animated={animated} />
      {variant === "split" ? (
        <span className="font-display inline-flex items-baseline" style={{ fontSize: size, lineHeight: 1 }}>
          <span className="font-[750] tracking-[-0.05em]">Kinetix</span>
          <span className="text-muted group-hover/wordmark:text-ink font-[320] tracking-[-0.025em] transition-[color,font-weight] duration-500 ease-out group-hover/wordmark:font-[440]">
            Zero
          </span>
        </span>
      ) : (
        <span
          className="font-display font-semibold tracking-[-0.03em]"
          style={{ fontSize: size, lineHeight: 1 }}
        >
          Kinetix<span className="text-muted">Zero</span>
        </span>
      )}
      {badge ? (
        <span className="border-rule-strong text-muted inline-flex h-[17px] items-center rounded-full border px-1.5 font-mono text-[9px] leading-none font-medium tracking-[0.16em] uppercase">
          {badge}
        </span>
      ) : null}
    </span>
  );
}
