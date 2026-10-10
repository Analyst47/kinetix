"use client";

import { ArrowBigUp } from "lucide-react";
import { useSyncExternalStore } from "react";

let capsOn = false;

function isPasswordFocused() {
  const el = document.activeElement;
  return el instanceof HTMLInputElement && el.type === "password";
}

function subscribe(onChange: () => void) {
  const key = (e: KeyboardEvent) => {
    // getModifierState is missing on synthetic events some password managers dispatch.
    if (typeof e.getModifierState !== "function") return;
    capsOn = e.getModifierState("CapsLock");
    onChange();
  };
  document.addEventListener("keydown", key, true);
  document.addEventListener("keyup", key, true);
  document.addEventListener("focusin", onChange);
  document.addEventListener("focusout", onChange);
  return () => {
    document.removeEventListener("keydown", key, true);
    document.removeEventListener("keyup", key, true);
    document.removeEventListener("focusin", onChange);
    document.removeEventListener("focusout", onChange);
  };
}

/** A small notice on the form's edge while Caps Lock is on and a password field has focus. */
export function CapsLockHint() {
  const on = useSyncExternalStore(
    subscribe,
    () => capsOn && isPasswordFocused(),
    () => false,
  );
  return (
    <div role="status" className="pointer-events-none absolute -top-3 right-6 z-10">
      {on ? (
        <span className="kx-fade-up border-ink/60 bg-paper text-ink inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-[11.5px] font-medium">
          <ArrowBigUp className="size-3.5" aria-hidden />
          Caps Lock is on
        </span>
      ) : null}
    </div>
  );
}
