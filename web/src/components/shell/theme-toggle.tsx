"use client";

import clsx from "clsx";
import { useId } from "react";
import type { CSSProperties } from "react";

import { toggleTheme, useTheme } from "./theme";

const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
const RAYS = Array.from({ length: 8 }, (_, i) => i * 45);

/**
 * Sun ⇄ moon. The body grows into a disc while a second circle slides in to take a bite out of
 * it, and the rays spin away. Shows the current theme; the label names the action.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useTheme();
  const mask = `kx-moon-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const moon = theme === "dark";
  const t = (props: string, ms = 520): CSSProperties => ({
    transition: `${props} ${ms}ms ${EASE}`,
  });

  return (
    <button
      type="button"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        toggleTheme({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
      }}
      aria-label={moon ? "Use light theme" : "Use dark theme"}
      title={moon ? "Light theme" : "Dark theme"}
      className={clsx(
        "text-muted hover:bg-ink/[0.06] hover:text-ink inline-flex size-9 items-center justify-center rounded-full transition-colors",
        className,
      )}
    >
      {/* Nothing until the theme is known, so hydration never animates a wrong first state. */}
      {theme ? (
        <svg viewBox="0 0 24 24" className="size-[18px] overflow-visible" fill="none" aria-hidden>
          <mask id={mask}>
            <rect x="-4" y="-4" width="32" height="32" fill="#fff" />
            <circle
              cx="17.5"
              cy="7"
              r="6.2"
              fill="#000"
              style={{ ...t("transform"), transform: moon ? "none" : "translate(9px, -9px)" }}
            />
          </mask>
          <circle
            cx="12"
            cy="12"
            r="7.6"
            fill="currentColor"
            mask={`url(#${mask})`}
            style={{
              ...t("transform"),
              transformBox: "fill-box",
              transformOrigin: "center",
              transform: moon ? "rotate(-20deg) scale(1)" : "scale(0.56)",
            }}
          />
          <g
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            style={{
              ...t("transform, opacity"),
              transformOrigin: "12px 12px",
              transform: moon ? "rotate(-90deg) scale(0.5)" : "none",
              opacity: moon ? 0 : 1,
            }}
          >
            {RAYS.map((deg) => (
              <line key={deg} x1="12" y1="2.2" x2="12" y2="4.2" transform={`rotate(${deg} 12 12)`} />
            ))}
          </g>
        </svg>
      ) : (
        <span className="size-[18px]" aria-hidden />
      )}
    </button>
  );
}
