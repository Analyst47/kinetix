import { useCallback, useSyncExternalStore } from "react";

/**
 * Subscribe to a CSS media query. The server (and the hydration pass) sees `serverValue`, then
 * the real value takes over, so there is never a hydration mismatch.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

export const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/** True when the visitor asked for reduced motion. JS-driven motion checks this; CSS is collapsed globally. */
export function useReducedMotion(): boolean {
  return useMediaQuery(REDUCED_MOTION);
}
