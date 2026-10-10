import clsx from "clsx";
import type { CSSProperties } from "react";

/**
 * Geometry of the KinetixZero mark (24×24 viewBox): a "zero" ring, open where a traced path
 * from a source node breaks out through it to an exit node. Kept in step with the app logo.
 */
export const MARK = {
  ring: "M19.935 8.954 A8.5 8.5 0 1 1 15.046 4.065",
  trace: "M8.6 15.4 L18 6",
  source: { cx: 8.6, cy: 15.4, r: 1.9 },
  exit: { cx: 18, cy: 6, r: 2.6 },
  stroke: 1.9,
} as const;

/** Scale SVG nodes around their own centre. */
export const NODE_ORIGIN: CSSProperties = { transformBox: "fill-box", transformOrigin: "center" };

/**
 * Every drawn stroke uses pathLength={1}. A gap longer than the dash keeps round caps from
 * leaving a dot at the start of an undrawn stroke; kx-draw then animates the offset to 0.
 */
export const HIDDEN_STROKE = { pathLength: 1, strokeDasharray: "1 1.2" } as const;

const POP = "cubic-bezier(0.34,1.56,0.64,1)";

/**
 * The mark, drawing itself: the ring traces round, the source node lands, the path runs out
 * through the gap and the exit node lands with a slow ripple. Pure CSS, so it starts before
 * hydration. `still` renders the finished mark with no motion (pass it for reduced motion);
 * remount it with a new `key` to replay.
 */
export function DrawnMark({
  size,
  className,
  delay = 0,
  still,
  ripple = true,
}: {
  size: number;
  className?: string;
  delay?: number;
  still?: boolean;
  ripple?: boolean;
}) {
  const at = (s: number) => `${(s + delay).toFixed(2)}s`;
  const motion = (css: string): CSSProperties | undefined => (still ? undefined : { animation: css });
  const drawn = (css: string): CSSProperties => (still ? {} : { strokeDashoffset: 1.1, animation: css });
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      overflow="visible"
      className={clsx("shrink-0", className)}
    >
      <g stroke="currentColor" fill="currentColor">
        <path
          d={MARK.ring}
          fill="none"
          strokeWidth={MARK.stroke}
          strokeLinecap="round"
          {...HIDDEN_STROKE}
          style={drawn(`kx-draw 0.95s cubic-bezier(0.65,0,0.35,1) ${at(0)} forwards`)}
        />
        <circle
          {...MARK.source}
          stroke="none"
          style={{ ...NODE_ORIGIN, ...motion(`kx-pop 0.4s ${POP} ${at(0.15)} both`) }}
        />
        <path
          d={MARK.trace}
          fill="none"
          strokeWidth={MARK.stroke}
          strokeLinecap="round"
          {...HIDDEN_STROKE}
          style={drawn(`kx-draw 0.5s cubic-bezier(0.4,0,0.2,1) ${at(0.5)} forwards`)}
        />
        <circle
          {...MARK.exit}
          stroke="none"
          style={{ ...NODE_ORIGIN, ...motion(`kx-pop 0.45s ${POP} ${at(0.92)} both`) }}
        />
        {/* The landing ripple. Invisible at rest, so reduced motion simply never shows it. */}
        {ripple && !still ? (
          <circle
            {...MARK.exit}
            fill="none"
            strokeWidth={0.8}
            style={{
              ...NODE_ORIGIN,
              opacity: 0,
              animation: `kx-pulse-ring 4.8s cubic-bezier(0.2,0.7,0.2,1) ${at(1.1)} infinite`,
            }}
          />
        ) : null}
      </g>
    </svg>
  );
}
