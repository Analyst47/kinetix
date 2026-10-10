"use client";

/**
 * Browser state for the New project flow, read through useSyncExternalStore so the server
 * render and hydration agree and nothing impure (clocks, navigator) runs during render.
 */
import { useSyncExternalStore } from "react";

function subscribeNever() {
  return () => {};
}

function subscribeDay(onChange: () => void) {
  const id = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(id);
}

function localDayKey(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Today's local date as noon on that day (null on the server and during hydration). */
export function useToday(): Date | null {
  const key = useSyncExternalStore(subscribeDay, localDayKey, () => null);
  return key ? new Date(`${key}T12:00:00`) : null;
}

/** Whether this browser lets a page read the clipboard on a click (for the Paste button). */
export function useCanReadClipboard(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function",
    () => false,
  );
}

/** "⌘" on Apple platforms, "Ctrl" elsewhere (Ctrl until hydrated). */
export function useModKey(): string {
  return useSyncExternalStore(
    subscribeNever,
    () => (/Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl"),
    () => "Ctrl",
  );
}
