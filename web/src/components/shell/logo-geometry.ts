/** Shared geometry for the KinetixZero mark (24×24 viewBox), so the static and animated marks match. */

/** The "zero" ring, open where the traced path breaks through it. */
export const RING_PATH = "M19.935 8.954 A8.5 8.5 0 1 1 15.046 4.065";
/** The traced path, from the source node to the exit node. */
export const TRACE_PATH = "M8.6 15.4 L18 6";
export const SOURCE = { cx: 8.6, cy: 15.4, r: 1.9 } as const;
export const EXIT = { cx: 18, cy: 6, r: 2.6 } as const;
export const STROKE = 1.9;
export const TILE_TRANSFORM = "translate(2.4 2.4) scale(0.8)";
