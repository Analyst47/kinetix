"use client";

import clsx from "clsx";
import { useSyncExternalStore } from "react";

/** A single keycap: mono, with a hairline bottom edge for a little physical depth. */
export function KeyCap({ children, className }: { children: string; className?: string }) {
  return (
    <kbd
      className={clsx(
        "border-rule bg-paper text-muted inline-grid h-[18px] min-w-[18px] place-items-center rounded-[5px] border px-1 font-mono text-[10px] leading-none font-medium shadow-[inset_0_-1px_0_var(--rule)]",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/** A key sequence or chord, e.g. ["G", "F"] or ["⌘", "K"]. */
export function KeyCombo({ keys, className }: { keys: string[]; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-0.5", className)}>
      {keys.map((k, i) => (
        <KeyCap key={`${k}-${i}`}>{k}</KeyCap>
      ))}
    </span>
  );
}

const noop = () => () => undefined;

function modKey(): string {
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent) ? "⌘" : "Ctrl";
}

/** "⌘" on Apple platforms, "Ctrl" elsewhere. Renders "⌘" on the server and corrects after hydration. */
export function useModKey(): string {
  return useSyncExternalStore(noop, modKey, () => "⌘");
}

/** True when a key press belongs to a text field and must not trigger a shortcut. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
