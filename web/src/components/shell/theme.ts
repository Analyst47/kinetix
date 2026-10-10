"use client";

import { useSyncExternalStore } from "react";

export type Theme = "dark" | "light";

const DARK = "(prefers-color-scheme: dark)";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function currentTheme(): Theme {
  const attr = document.documentElement.dataset.theme;
  if (attr === "dark" || attr === "light") return attr;
  return window.matchMedia(DARK).matches ? "dark" : "light";
}

function subscribeTheme(onChange: () => void) {
  const media = window.matchMedia(DARK);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  media.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", onChange);
  };
}

/** The resolved app theme, or null during server rendering and hydration. */
export function useTheme(): Theme | null {
  return useSyncExternalStore(subscribeTheme, currentTheme, () => null);
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void>; finished: Promise<void> };
};

/**
 * Flip between light and dark and remember the choice. Where the browser supports view
 * transitions (and motion is allowed) the new theme is revealed as a circle growing from
 * `origin` — usually the toggle that was clicked.
 */
export function toggleTheme(origin?: { x: number; y: number }) {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  const root = document.documentElement;
  const apply = () => {
    root.dataset.theme = next;
    try {
      localStorage.setItem("kx-theme", next);
    } catch {
      // Storage can be unavailable (private mode); the toggle still works for this page.
    }
  };

  const doc = document as ViewTransitionDocument;
  if (!doc.startViewTransition || window.matchMedia(REDUCED_MOTION).matches) {
    apply();
    return;
  }
  const x = origin?.x ?? window.innerWidth - 48;
  const y = origin?.y ?? 28;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  root.classList.add("kx-theme-reveal");
  try {
    const transition = doc.startViewTransition(apply);
    transition.ready
      .then(() => {
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          {
            duration: 560,
            easing: "cubic-bezier(0.4, 0, 0.2, 1)",
            pseudoElement: "::view-transition-new(root)",
          },
        );
      })
      .catch(() => undefined);
    transition.finished.finally(() => root.classList.remove("kx-theme-reveal")).catch(() => undefined);
  } catch {
    root.classList.remove("kx-theme-reveal");
    apply();
  }
}
