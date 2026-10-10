import clsx from "clsx";

import { identiconCells } from "./lib";

/** SVG rects for a project's identicon, drawn in currentColor on a 5×5 grid. */
export function IdenticonCells({ seed }: { seed: string }) {
  return (
    <g fill="currentColor">
      {identiconCells(seed).map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" rx="0.18" />
      ))}
    </g>
  );
}

/**
 * A project's mark: its identicon inside a ring. The same glyph sits on the project's radar
 * node, so a card and its orbit read as one object. With `orbit`, a dashed ring turns slowly
 * while the surrounding `.group` is hovered.
 */
export function Identicon({
  seed,
  size = 40,
  orbit,
  className,
}: {
  seed: string;
  size?: number;
  orbit?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={clsx("relative inline-grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
    >
      {orbit ? (
        <svg
          viewBox="0 0 40 40"
          className="kx-spin-slow text-rule-strong absolute inset-0 size-full opacity-0 transition-opacity duration-300 [animation-play-state:paused] group-hover:opacity-100 group-hover:[animation-play-state:running]"
        >
          <circle cx="20" cy="20" r="19.25" fill="none" stroke="currentColor" strokeDasharray="2 4" />
        </svg>
      ) : null}
      <span
        className="border-rule bg-sunken text-ink grid place-items-center rounded-full border"
        style={{ width: size - 6, height: size - 6 }}
      >
        <svg viewBox="-0.5 -0.5 6 6" style={{ width: (size - 6) * 0.48, height: (size - 6) * 0.48 }}>
          <IdenticonCells seed={seed} />
        </svg>
      </span>
    </span>
  );
}
