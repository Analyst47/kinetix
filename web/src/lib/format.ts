import type { FindingSource, FindingStatus, Severity, Usage } from "./types";

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
};

export const SEVERITY_COLOR: Record<Severity, string> = {
  critical: "text-crit",
  high: "text-high",
  medium: "text-med",
  low: "text-low",
  info: "text-muted",
};

export const SEVERITY_BG: Record<Severity, string> = {
  critical: "bg-crit",
  high: "bg-high",
  medium: "bg-med",
  low: "bg-low",
  info: "bg-rule-strong",
};

export const STATUS_LABEL: Record<FindingStatus, string> = {
  discovered: "Discovered",
  triage: "Triage",
  needs_validation: "Needs validation",
  confirmed: "Confirmed",
  reported: "Reported",
  vendor_acknowledged: "Vendor acknowledged",
  fix_available: "Fix available",
  public_disclosure: "Public disclosure",
  false_positive: "False positive",
  duplicate: "Duplicate",
  not_a_security_issue: "Not a security issue",
  out_of_scope: "Out of scope",
};

export const LIFECYCLE: FindingStatus[] = [
  "discovered",
  "triage",
  "needs_validation",
  "confirmed",
  "reported",
  "vendor_acknowledged",
  "fix_available",
  "public_disclosure",
];

export const CLOSED: FindingStatus[] = [
  "false_positive",
  "duplicate",
  "not_a_security_issue",
  "out_of_scope",
];

export const SOURCE_LABEL: Record<FindingSource, string> = {
  sast: "SAST",
  dependency: "Dependency",
  secret: "Secrets",
  manual: "Manual",
};

export const CONFIDENCE_LABEL: Record<string, string> = {
  firm: "Firm",
  tentative: "Tentative",
};

export const AI_VERDICT_LABEL: Record<string, string> = {
  likely_vulnerable: "Likely real",
  likely_false_positive: "Likely false positive",
  needs_more_context: "Needs more context",
};

// Tailwind classes for the AI verdict chip.
export const AI_VERDICT_CLASS: Record<string, string> = {
  likely_vulnerable: "border-crit/40 bg-crit-soft text-crit",
  likely_false_positive: "border-rule bg-sunken text-muted",
  needs_more_context: "border-med/40 bg-med/10 text-med",
};

export const AUTHORIZATION_LABEL: Record<string, string> = {
  open_source: "Open-source project",
  bug_bounty: "Bug bounty scope",
  vendor_authorization: "Vendor authorization",
  personal_lab: "Personal or lab environment",
  organization_owned: "Organization-owned asset",
};

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const fullFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });

export function relative(iso: string, now = Date.now()): string {
  const diff = (new Date(iso).getTime() - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return "Just now";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 172800) return "Yesterday";
  return dateFmt.format(new Date(iso));
}

export const fullDate = (iso: string) => fullFmt.format(new Date(iso));
export const shortDate = (iso: string) => dateFmt.format(new Date(iso));
export const clock = (iso: string) => timeFmt.format(new Date(iso));

export function shortHash(hash: string): string {
  return `${hash.slice(0, 4)}…${hash.slice(-4)}`;
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export const EVENT_LABEL: Record<string, string> = {
  notified: "Vendor notified",
  vendor_response: "Vendor responded",
  acknowledged: "Vendor acknowledged",
  fix_released: "Fix released",
  cve_assigned: "CVE assigned",
  extension: "Deadline extended",
  public_disclosure: "Publicly disclosed",
  note: "Note",
};

export const DISCLOSURE_STAGES = [
  { key: "draft", label: "Draft" },
  { key: "notified", label: "Vendor notified" },
  { key: "acknowledged", label: "Acknowledged" },
  { key: "fix_available", label: "Fix available" },
  { key: "published", label: "Published" },
] as const;

export const HEALTH_TEXT: Record<string, string> = {
  draft: "text-muted",
  on_track: "text-ink",
  due_soon: "text-med",
  overdue: "text-crit",
  complete: "text-ok",
};

export function deadlineLabel(days: number | null, health: string): string {
  if (health === "complete") return "Disclosed";
  if (health === "draft" || days === null) return "Not started";
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} overdue`;
  if (days === 0) return "Due today";
  return `${days} day${days === 1 ? "" : "s"} left`;
}

/** "7 of 10 free AI searches left" / "212 of 300 AI searches left this month". */
export function usageSummary(u: Usage): string {
  const of = `${u.searches_remaining.toLocaleString("en-US")} of ${u.searches_limit.toLocaleString("en-US")}`;
  return u.ai_period === "lifetime" ? `${of} free AI searches left` : `${of} AI searches left this month`;
}
