"use client";

import { useShell } from "@/components/shell-context";
import type { Role } from "@/lib/types";

import { useMinute } from "./hooks";
import { firstName } from "./lib";

const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  researcher: "Researcher",
  reviewer: "Reviewer",
  viewer: "Viewer",
};

function phraseFor(hour: number): string {
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  if (hour < 22) return "Good evening";
  return "Working late";
}

const dayFmt = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

/**
 * The dashboard greeting. The time-of-day phrase, date and clock come from the viewer's own
 * browser clock (read through useSyncExternalStore), so the server render never guesses a
 * time zone; until hydration it says "Welcome back".
 */
export function DashboardHeader({ summary }: { summary: string }) {
  const { user, org: membership } = useShell();
  const minute = useMinute();
  const now = minute === null ? null : new Date(minute);
  const phrase = now ? phraseFor(now.getHours()) : "Welcome back";
  const name = firstName(user.name);

  return (
    <header className="flex min-w-0 flex-col gap-2.5">
      <p className="eyebrow text-muted flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
        <span className="relative inline-flex size-2" aria-hidden>
          <span className="kx-pulse-ring bg-ink absolute inset-0 rounded-full" />
          <span className="bg-ink relative size-2 rounded-full" />
        </span>
        <span className="text-ink">{membership.name}</span>
        <span aria-hidden>·</span>
        <span>{ROLE_LABEL[membership.role]}</span>
        {now ? (
          <>
            <span aria-hidden>·</span>
            <span className="kx-fade-up">
              {dayFmt.format(now)} · <time dateTime={now.toISOString()}>{timeFmt.format(now)}</time>
            </span>
          </>
        ) : null}
      </p>
      <h1 className="display text-ink text-[32px] leading-[1.05] sm:text-[40px]">
        <span key={phrase} className={now ? "kx-fade-up inline-block" : "inline-block"}>
          {phrase}
        </span>
        , {name}.
      </h1>
      <p className="text-muted max-w-[62ch] text-[15px] leading-[23px]">{summary}</p>
    </header>
  );
}
