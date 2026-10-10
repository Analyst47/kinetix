"use client";

/**
 * Browser-state hooks for the dashboard. Everything goes through useSyncExternalStore, so the
 * server render and the first client render agree (no hydration mismatch) and the real value
 * arrives in the commit right after hydration.
 */
import { useCallback, useSyncExternalStore } from "react";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia(REDUCED_MOTION);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

function subscribeNever() {
  return () => {};
}

/** False during the server render and hydration, true afterwards. Drives entry transitions. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}

function subscribeMinute(onChange: () => void) {
  const id = window.setInterval(onChange, 15_000);
  return () => window.clearInterval(id);
}

/** The browser's clock, floored to the minute (null on the server). */
export function useMinute(): number | null {
  return useSyncExternalStore(
    subscribeMinute,
    () => Math.floor(Date.now() / 60_000) * 60_000,
    () => null,
  );
}

const storeListeners = new Set<() => void>();
// In-memory fallback so a choice still sticks for this visit when storage is blocked.
const memory = new Map<string, string>();

function subscribeStore(onChange: () => void) {
  storeListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    storeListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readStored(key: string): string | null {
  try {
    return memory.get(key) ?? window.localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

/** A per-viewer preference (such as grid vs. list) remembered in localStorage when available. */
export function useStoredChoice<T extends string>(
  key: string,
  options: readonly T[],
  fallback: T,
): [T, (value: T) => void] {
  const raw = useSyncExternalStore(
    subscribeStore,
    () => readStored(key),
    () => null,
  );
  const value = raw !== null && (options as readonly string[]).includes(raw) ? (raw as T) : fallback;
  const set = useCallback(
    (next: T) => {
      memory.set(key, next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Storage blocked (private mode): the in-memory copy covers this visit.
      }
      storeListeners.forEach((l) => l());
    },
    [key],
  );
  return [value, set];
}
