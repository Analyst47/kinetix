/**
 * Pure helpers for the workspace dashboard: severity roll-ups, risk tiers, authorization review
 * state and the per-project identicon. No React, no browser APIs — safe on the server and client.
 */
import { SEVERITY_ORDER } from "@/lib/format";
import type { Project, Severity } from "@/lib/types";

export const DAY_MS = 86_400_000;
/** Authorizations ending within this many days are "due for review". */
export const REVIEW_WINDOW_DAYS = 14;

/** CSS colour for each severity. Data only: counts, bars, badges and radar nodes. */
export const SEVERITY_FILL: Record<Severity, string> = {
  critical: "var(--crit)",
  high: "var(--high)",
  medium: "var(--med)",
  low: "var(--low)",
  info: "var(--rule-strong)",
};

export type Counts = Record<Severity, number>;

export function countsOf(p: Project): Counts {
  const c = p.severity_counts ?? {};
  return {
    critical: c.critical ?? 0,
    high: c.high ?? 0,
    medium: c.medium ?? 0,
    low: c.low ?? 0,
    info: c.info ?? 0,
  };
}

export function openOf(p: Project): number {
  const c = countsOf(p);
  return p.open_findings ?? SEVERITY_ORDER.reduce((n, s) => n + c[s], 0);
}

export function topSeverityOf(p: Project): Severity | null {
  const c = countsOf(p);
  return SEVERITY_ORDER.find((s) => c[s] > 0) ?? null;
}

export function sumCounts(projects: Project[]): Counts {
  const out: Counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const p of projects) {
    const c = countsOf(p);
    for (const s of SEVERITY_ORDER) out[s] += c[s];
  }
  return out;
}

/** Radar rings, inside out: open critical findings, open high findings, everything else. */
export type Tier = 0 | 1 | 2;

export const TIER_LABEL: Record<Tier, string> = {
  0: "Critical",
  1: "High",
  2: "Medium, low or clear",
};

export function tierOf(p: Project): Tier {
  const c = countsOf(p);
  if (c.critical > 0) return 0;
  if (c.high > 0) return 1;
  return 2;
}

/** A sortable risk score: critical outranks any number of highs, and so on down. */
export function riskScore(p: Project): number {
  const c = countsOf(p);
  return c.critical * 1e9 + c.high * 1e6 + c.medium * 1e3 + c.low * 10 + c.info;
}

export function byRisk(a: Project, b: Project): number {
  return riskScore(b) - riskScore(a) || a.name.localeCompare(b.name);
}

export type Review = { kind: "none" } | { kind: "expired" | "soon" | "ok"; days: number; at: string };

/** Where a project's authorization stands relative to `now` (pass the server's clock). */
export function reviewOf(p: Project, now: number): Review {
  const at = p.authorization_expires_at;
  if (!at) return { kind: "none" };
  const ms = new Date(at).getTime() - now;
  const days = Math.ceil(ms / DAY_MS);
  if (ms <= 0) return { kind: "expired", days, at };
  if (days <= REVIEW_WINDOW_DAYS) return { kind: "soon", days, at };
  return { kind: "ok", days, at };
}

export function reviewPhrase(r: Review): string {
  if (r.kind === "none") return "No expiry set";
  if (r.kind === "expired") {
    const ago = -r.days;
    return ago <= 0 ? "Expired today" : `Expired ${ago} day${ago === 1 ? "" : "s"} ago`;
  }
  if (r.days <= 1) return "Ends within a day";
  return `Ends in ${r.days} days`;
}

/** 32-bit FNV-1a: a stable seed from a project slug. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * A mirrored 5×5 identicon (the same pixel language as the logo's dotted glyphs). Returns the
 * filled cells as [x, y] pairs. Deterministic per seed, never empty, never solid.
 */
export function identiconCells(seed: string): [number, number][] {
  let bits = hashString(seed);
  const extra = hashString(`${seed}·kx`);
  const cells: [number, number][] = [];
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      const on = (bits & 1) === 1;
      bits >>>= 1;
      if (!on) continue;
      cells.push([x, y]);
      if (x < 2) cells.push([4 - x, y]);
    }
  }
  // Too sparse to read as a mark: fall back to a second pattern with the centre spine lit.
  if (cells.length < 7) {
    for (let y = 0; y < 5; y++) {
      if ((extra >>> y) & 1 || y === 2) cells.push([2, y]);
      if ((extra >>> (y + 5)) & 1) cells.push([1, y], [3, y]);
    }
  }
  const seen = new Set<string>();
  return cells.filter(([x, y]) => {
    const k = `${x}-${y}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const dayLocal = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const dayUtc = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * "Oct 14, 2026". Client components pass `local = useHydrated()`: the server render and
 * hydration use UTC so they agree, then the date switches to the viewer's own time zone.
 */
export function formatDay(iso: string, local = true): string {
  return (local ? dayLocal : dayUtc).format(new Date(iso));
}

export function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
