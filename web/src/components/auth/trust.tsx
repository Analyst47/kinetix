"use client";

import clsx from "clsx";
import { KeyRound, Link2, ScanEye, ShieldCheck, UserRoundCheck, type LucideIcon } from "lucide-react";
import { useId, useState } from "react";

const FACTS: { label: string; icon: LucideIcon; detail: string }[] = [
  {
    label: "Read-only analysis",
    icon: ScanEye,
    detail: "Static analysis of code you're authorized to assess. Nothing is run against a live system.",
  },
  {
    label: "Human in the loop",
    icon: UserRoundCheck,
    detail: "Agentic Triage is advisory and cites its lines. Only a researcher confirms a finding.",
  },
  {
    label: "MFA",
    icon: KeyRound,
    detail: "Optional two-step verification with an authenticator app, plus one-time recovery codes.",
  },
  {
    label: "Hash-chained audit",
    icon: Link2,
    detail: "Workspace changes land in a SHA-256 hash-chained audit log, so tampering shows.",
  },
];

const DEFAULT = "HttpOnly session cookies, CSRF-checked requests, and row-level security between workspaces.";

/** Facts about how KinetixZero handles your account and your code. Hover or focus one to read more. */
export function TrustChips({ className }: { className?: string }) {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const detail = active === null ? DEFAULT : FACTS[active]!.detail;
  return (
    <div className={clsx("flex flex-col gap-3", className)}>
      <ul className="flex flex-wrap gap-1.5" aria-label="Security">
        {FACTS.map((f, i) => {
          const Icon = f.icon;
          const on = active === i;
          return (
            <li key={f.label} className="kx-fade-up" style={{ animationDelay: `${260 + i * 70}ms` }}>
              <button
                type="button"
                aria-describedby={id}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                // Hover and focus already select the chip, so a click (or tap) only ever shows it.
                onClick={() => setActive(i)}
                className={clsx(
                  "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] transition-[color,border-color,background-color] duration-200",
                  on ? "border-ink/70 bg-ink/[0.06] text-ink" : "border-rule text-muted hover:text-ink",
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {f.label}
              </button>
            </li>
          );
        })}
      </ul>
      <p id={id} className="text-muted flex min-h-[38px] gap-2 text-[12.5px] leading-[19px]">
        <ShieldCheck className="text-ink/70 mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span key={active ?? "default"} className="kx-fade-up">
          {detail}
        </span>
      </p>
    </div>
  );
}
