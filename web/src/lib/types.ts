export type Role = "owner" | "admin" | "researcher" | "reviewer" | "viewer";
export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type FindingSource = "sast" | "dependency" | "secret" | "manual";
export type FindingStatus =
  | "discovered"
  | "triage"
  | "needs_validation"
  | "confirmed"
  | "reported"
  | "vendor_acknowledged"
  | "fix_available"
  | "public_disclosure"
  | "false_positive"
  | "duplicate"
  | "not_a_security_issue"
  | "out_of_scope";

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Me {
  user: User;
  organizations: { slug: string; name: string; role: Role }[];
}

export interface Project {
  id: string;
  slug: string;
  name: string;
  description: string;
  authorization_type: string;
  in_scope: string;
  out_of_scope: string;
  authorization_reference: string | null;
  attestation_text: string;
  attested_at: string;
  authorization_expires_at: string | null;
  attested_by: User;
  created_at: string;
  open_findings?: number;
  severity_counts?: Partial<Record<Severity, number>>;
}

export interface Finding {
  id: string;
  public_id: string;
  number: number;
  title: string;
  description: string;
  severity: Severity;
  status: FindingStatus;
  source: FindingSource;
  cwe: string | null;
  cvss_vector: string | null;
  cvss_score: string | null;
  file_path: string | null;
  line: number | null;
  rule_id: string | null;
  reference: string | null;
  reproduction: string;
  remediation: string;
  assignee: User | null;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
}

export interface FindingDetail extends Finding {
  allowed_transitions: FindingStatus[];
  remediation_guidance: string | null;
  readiness: { key: string; label: string; done: boolean; detail: string | null }[];
  evidence_count: number;
}

export interface FindingPage {
  items: Finding[];
  total: number;
  status_counts: Record<string, number>;
  severity_counts: Partial<Record<Severity, number>>;
}

export interface Evidence {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  sha256: string;
  note: string;
  uploaded_by: User;
  created_at: string;
}

export interface AuditEvent {
  seq: number;
  actor_label: string;
  action: string;
  subject_type: string;
  subject_id: string;
  data: Record<string, unknown>;
  created_at: string;
  prev_hash: string;
  hash: string;
}

export interface Chain {
  verified: boolean;
  entries: number;
  first_broken_seq: number | null;
  reason: string | null;
}

export interface SourceExcerpt {
  path: string;
  commit: string | null;
  highlight: number;
  lines: { n: number; text: string }[];
}

export interface Advisory {
  id: string;
  display_id: string;
  aliases: string[];
  summary: string;
  severity: Severity | null;
  cwe_ids: string[];
  affected_range: string;
  fixed_version: string | null;
}

export interface Dependency {
  id: string;
  ecosystem: string;
  name: string;
  version: string;
  direct: boolean;
  license: string | null;
  manifest: string;
  max_severity: Severity | null;
  fixed_version: string | null;
  finding_public_id: string | null;
  advisories: Advisory[];
}

export interface DependencyPage {
  items: Dependency[];
  total: number;
  vulnerable: number;
}

export interface Target {
  id: string;
  kind: string;
  name: string;
  locator: string;
  version: string | null;
  commit: string | null;
  archive_sha256: string | null;
  created_at: string;
}

export interface Scan {
  id: string;
  number: number;
  target_id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  analyzers: string[];
  stats: Record<string, Record<string, unknown>>;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

export type DisclosureHealth = "draft" | "on_track" | "due_soon" | "overdue" | "complete";

export interface DisclosureEvent {
  id: string;
  kind: string;
  occurred_at: string;
  note: string;
  data: Record<string, unknown>;
  created_by: User;
  created_at: string;
}

export interface Disclosure {
  id: string;
  finding_public_id: string;
  finding_title: string;
  severity: Severity;
  vendor_name: string;
  contact: string;
  contact_source: string;
  channel: string;
  policy_url: string | null;
  deadline_days: number;
  notified_at: string | null;
  deadline_at: string | null;
  days_remaining: number | null;
  health: DisclosureHealth;
  stage: "draft" | "notified" | "acknowledged" | "fix_available" | "published";
  cve_id: string | null;
  advisory_url: string | null;
  events: DisclosureEvent[];
  allowed_events: string[];
}

export interface AiStatus {
  available: boolean;
  enabled: boolean;
  provider: string | null;
  model: string | null;
}

export interface AiCitation {
  path: string;
  line: number;
  quote: string;
}

export interface AiRun {
  id: string;
  kind: "analysis" | "question" | "draft_description" | "draft_remediation";
  question: string | null;
  output: {
    verdict?: "likely_vulnerable" | "likely_false_positive" | "needs_more_context";
    confidence?: "low" | "medium" | "high";
    summary?: string;
    reasoning?: { point: string; citations: AiCitation[]; supported: boolean }[];
    checks_before_confirming?: string[];
    suggested_cwe?: string | null;
    suggested_severity?: Severity | null;
    validation_notes?: string[];
    answer?: string;
    citations?: AiCitation[];
    text?: string;
    source_lines_sent?: number;
  };
  provider: string;
  model: string;
  input_sha256: string;
  injection_signals: string[];
  created_by: User;
  created_at: string;
}
