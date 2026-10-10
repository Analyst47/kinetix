/**
 * Content for the orbital "attack-surface radar" on the homepage.
 *
 * Pipeline mode describes what KinetixZero actually does, stage by stage — every claim here maps
 * to shipped behaviour. Infrastructure mode is an illustrative sample assessment: it shows how
 * findings from static analysis map onto a target's components and the paths untrusted input
 * could take between them. It is not a live scan and touches no system.
 */

export type Severity = "critical" | "high" | "medium" | "low";

export interface OrbitNode {
  id: string;
  label: string;
  eyebrow: string;
  title: string;
  body: string;
  checks: string[];
  glyph: 0 | 1 | 2 | 3;
  counts?: Partial<Record<Severity, number>>;
}

export interface Ring {
  radius: number;
  /** Degrees per second; sign sets direction. */
  speed: number;
  label: string;
  nodes: OrbitNode[];
}

export interface Edge {
  from: string;
  to: string;
  label: string;
  severity: Severity;
}

export const PIPELINE: Ring[] = [
  {
    radius: 165,
    speed: 2.2,
    label: "Scope",
    nodes: [
      {
        id: "scope",
        label: "Authorized scope",
        eyebrow: "01 · Scope",
        title: "Authorization comes first",
        body: "Every project records an authorization attestation and in/out-of-scope boundaries before any analysis runs. Scope travels with every finding and export.",
        checks: [
          "Attestation type, who attested, and when",
          "Authorization expiry, flagged in the app",
          "In-scope and out-of-scope boundaries",
        ],
        glyph: 0,
      },
      {
        id: "git",
        label: "Hardened fetch",
        eyebrow: "01 · Source",
        title: "Fetch source without trusting it",
        body: "Git targets are cloned read-only over HTTPS with the resolved public IP pinned, so a repository can't execute anything on the host.",
        checks: [
          "No redirects, hooks, submodules or LFS",
          "Symlinks flattened to plain files",
          "Private and internal addresses refused",
        ],
        glyph: 1,
      },
      {
        id: "archive",
        label: "Archive ingest",
        eyebrow: "01 · Source",
        title: "Uploads, defused",
        body: "Source archives are unpacked under strict limits and stored content-addressed by SHA-256, so evidence can be verified later.",
        checks: [
          "Size, file-count and unpacked-size caps",
          "Compression-ratio limit against zip bombs",
          "SHA-256 content addressing",
        ],
        glyph: 2,
      },
    ],
  },
  {
    radius: 290,
    speed: -1.4,
    label: "Analyze",
    nodes: [
      {
        id: "taint-js",
        label: "Taint · JS/TS",
        eyebrow: "02 · Analyze",
        title: "Source-to-sink taint rules for JS & TS",
        body: "16 Semgrep taint and pattern rules follow request input to dangerous sinks in JavaScript and TypeScript.",
        checks: [
          "SQL & NoSQL injection, command & code injection",
          "Path traversal, SSRF, open redirect, reflected XSS",
          "Prototype pollution, ReDoS, JWT and CORS misuse",
        ],
        glyph: 3,
      },
      {
        id: "taint-py",
        label: "Taint · Python",
        eyebrow: "02 · Analyze",
        title: "Taint rules for Python",
        body: "12 rules trace request data through Python code to the operations that make it exploitable.",
        checks: [
          "SQL built from strings, shell=True, command injection",
          "Unsafe YAML / pickle deserialization, XXE",
          "SSRF, path traversal, SSTI, weak hashing",
        ],
        glyph: 0,
      },
      {
        id: "lockfiles",
        label: "Lockfiles",
        eyebrow: "02 · Analyze",
        title: "Resolve the real dependency tree",
        body: "Exact versions come from lockfiles, not ranges, so advisories match what actually ships.",
        checks: [
          "npm package-lock and shrinkwrap (v1–v3)",
          "Pinned Python requirements",
          "Direct vs. transitive packages",
        ],
        glyph: 1,
      },
      {
        id: "osv",
        label: "OSV match",
        eyebrow: "02 · Analyze",
        title: "Known vulnerabilities, matched",
        body: "Each resolved package version is checked against the OSV database, with the fixed version mapped for remediation.",
        checks: [
          "Advisory IDs and aliases (CVE, GHSA)",
          "Affected ranges vs. the installed version",
          "First fixed version, when one exists",
        ],
        glyph: 2,
      },
      {
        id: "secrets",
        label: "Secrets",
        eyebrow: "02 · Analyze",
        title: "Exposed credentials, redacted",
        body: "Credential patterns are flagged where they appear in source. The secret value itself is redacted and never stored.",
        checks: [
          "Common API-key and token formats",
          "Private-key material in the tree",
          "Redacted before anything is saved",
        ],
        glyph: 3,
      },
    ],
  },
  {
    radius: 415,
    speed: 0.9,
    label: "Validate & disclose",
    nodes: [
      {
        id: "confidence",
        label: "Confidence",
        eyebrow: "03 · Validate",
        title: "Firm before Tentative",
        body: "Every finding is ranked: Firm for a taint-verified path or a matched advisory, Tentative for a pattern match that needs a human look.",
        checks: [
          "Taint-verified source-to-sink path",
          "Matched advisory for the installed version",
          "Pattern-only matches kept, but ranked lower",
        ],
        glyph: 0,
      },
      {
        id: "ai",
        label: "AI review",
        eyebrow: "03 · Validate",
        title: "An advisory second read, with citations",
        body: "Claude answers three questions — is the input attacker-controlled, does it reach the sink, is it sanitized — citing exact lines. KinetixZero verifies each citation and derives the verdict itself. It never confirms a finding.",
        checks: [
          "Citations checked against the lines it was shown",
          "Uncited yes/no answers downgraded to unclear",
          "Prompt-injection in analyzed code flagged",
        ],
        glyph: 1,
      },
      {
        id: "triage",
        label: "Triage",
        eyebrow: "03 · Validate",
        title: "A ranked shortlist, not a wall of alerts",
        body: "Batch triage reviews open findings and records each advisory verdict, so you spend time on the likely-real ones first.",
        checks: [
          "Likely vulnerable vs. likely false positive",
          "Severity-ordered, unreviewed first",
          "Nothing changes state without you",
        ],
        glyph: 2,
      },
      {
        id: "label",
        label: "Labeling",
        eyebrow: "03 · Validate",
        title: "Your verdict is the ground truth",
        body: "A one-keypress labeling queue records real / false positive / skip, kept separate from disclosure status and exportable as a dataset.",
        checks: ["R, F, S keyboard verdicts", "Ground truth separate from status", "JSONL dataset export"],
        glyph: 3,
      },
      {
        id: "disclosure",
        label: "Disclosure",
        eyebrow: "04 · Disclose",
        title: "Tracked to a deadline",
        body: "Confirmed findings become a disclosure with a vendor timeline, health indicators and the program's own rules — filed by you.",
        checks: [
          "Notified, acknowledged, fixed, published",
          "Due-soon and overdue health",
          "security.txt contact lookup",
        ],
        glyph: 0,
      },
      {
        id: "exports",
        label: "Exports",
        eyebrow: "04 · Disclose",
        title: "Standards-first outputs",
        body: "Generate the formats the ecosystem consumes, built from the finding's own fields with evidence attached.",
        checks: ["CVE Record Format 5.1", "OSV JSON", "Server-generated PDF report"],
        glyph: 1,
      },
      {
        id: "audit",
        label: "Audit chain",
        eyebrow: "04 · Disclose",
        title: "Every step, verifiable",
        body: "Sensitive actions — including every AI run, with a SHA-256 of what was sent — land in an append-only, hash-chained audit log.",
        checks: [
          "Hash-chained, append-only events",
          "Evidence and chain-of-custody hashes",
          "Verifiable end to end",
        ],
        glyph: 2,
      },
    ],
  },
];

/** Illustrative sample assessment of a fictional web application. */
export const INFRA: Ring[] = [
  {
    radius: 165,
    speed: 0.8,
    label: "Internet-facing",
    nodes: [
      {
        id: "web",
        label: "Web app",
        eyebrow: "Internet-facing",
        title: "Web application",
        body: "Request handlers, templates and client code — where untrusted input enters.",
        checks: [
          "Request parameters reaching SQL, shell or file APIs",
          "Reflected XSS and template injection",
          "Open redirects in auth flows",
        ],
        glyph: 0,
        counts: { critical: 2, high: 4, medium: 3, low: 1 },
      },
      {
        id: "api",
        label: "Public API",
        eyebrow: "Internet-facing",
        title: "Public API",
        body: "JSON endpoints consumed by the app and partners.",
        checks: [
          "NoSQL injection through query objects",
          "SSRF from user-supplied URLs",
          "JWT verification without pinned algorithms",
        ],
        glyph: 1,
        counts: { critical: 1, high: 2, medium: 2 },
      },
      {
        id: "upload",
        label: "File uploads",
        eyebrow: "Internet-facing",
        title: "File uploads",
        body: "User-supplied files and their names, written to storage.",
        checks: ["Path traversal in file names", "Unsafe archive extraction", "Content-type trust"],
        glyph: 2,
        counts: { high: 1, medium: 1 },
      },
    ],
  },
  {
    radius: 290,
    speed: 0.8,
    label: "Services & data",
    nodes: [
      {
        id: "db",
        label: "Database",
        eyebrow: "Data",
        title: "Database",
        body: "Where injection paths end. KinetixZero shows which handlers reach raw queries and whether anything parameterizes the input on the way.",
        checks: ["Raw queries built from request data", "Missing parameterization", "ORM escape hatches"],
        glyph: 3,
        counts: { critical: 3, high: 2, medium: 1 },
      },
      {
        id: "storage",
        label: "Object storage",
        eyebrow: "Data",
        title: "Object storage",
        body: "Uploaded and generated files.",
        checks: ["Writes outside the intended directory", "Predictable, user-controlled keys"],
        glyph: 0,
        counts: { high: 1, low: 1 },
      },
      {
        id: "jobs",
        label: "Workers",
        eyebrow: "Services",
        title: "Background workers",
        body: "Queued jobs that fetch URLs and process data later, out of the request path.",
        checks: [
          "SSRF from queued URLs",
          "Unsafe deserialization of job payloads",
          "Shell commands built from job data",
        ],
        glyph: 1,
        counts: { high: 2, medium: 2 },
      },
      {
        id: "admin",
        label: "Admin panel",
        eyebrow: "Services",
        title: "Admin panel",
        body: "Privileged routes behind authentication.",
        checks: ["Code injection via eval-style helpers", "Weak session or token randomness"],
        glyph: 2,
        counts: { medium: 2, low: 1 },
      },
    ],
  },
  {
    radius: 415,
    speed: 0.8,
    label: "Supply chain & config",
    nodes: [
      {
        id: "deps",
        label: "Dependencies",
        eyebrow: "Supply chain",
        title: "Third-party packages",
        body: "Resolved from the lockfile and matched against OSV advisories for the exact installed versions.",
        checks: [
          "Known advisories for installed versions",
          "Fixed version available",
          "Direct vs. transitive",
        ],
        glyph: 3,
        counts: { critical: 1, high: 5, medium: 4, low: 2 },
      },
      {
        id: "config",
        label: "Config & secrets",
        eyebrow: "Config",
        title: "Configuration and secrets",
        body: "Settings files and environment templates checked into the repository.",
        checks: [
          "Committed credentials (redacted)",
          "CORS wildcard with credentials",
          "Weak hashing settings",
        ],
        glyph: 0,
        counts: { high: 1, medium: 2 },
      },
      {
        id: "ci",
        label: "CI pipeline",
        eyebrow: "Supply chain",
        title: "Build pipeline",
        body: "Build and deploy scripts that run with the project's credentials.",
        checks: ["Secrets in scripts", "Shell commands built from inputs"],
        glyph: 1,
        counts: { medium: 1, low: 1 },
      },
      {
        id: "hooks",
        label: "Webhooks",
        eyebrow: "Integrations",
        title: "Inbound webhooks",
        body: "Third-party callbacks that enter the system outside the main app.",
        checks: ["Unverified payloads reaching workers", "SSRF through callback URLs"],
        glyph: 2,
        counts: { high: 1, medium: 1 },
      },
    ],
  },
];

export const INFRA_EDGES: Edge[] = [
  { from: "web", to: "db", label: "SQL injection path", severity: "critical" },
  { from: "api", to: "db", label: "NoSQL injection path", severity: "critical" },
  { from: "upload", to: "storage", label: "Path traversal", severity: "high" },
  { from: "api", to: "jobs", label: "SSRF via queued URL", severity: "high" },
  { from: "hooks", to: "jobs", label: "Unverified payload", severity: "high" },
  { from: "deps", to: "web", label: "Vulnerable package in request path", severity: "critical" },
  { from: "web", to: "admin", label: "Open redirect into admin session", severity: "medium" },
  { from: "config", to: "admin", label: "Committed admin credential", severity: "high" },
  { from: "ci", to: "config", label: "Secret exposed to build", severity: "medium" },
];

export const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];

export const SEVERITY_VAR: Record<Severity, string> = {
  critical: "var(--crit)",
  high: "var(--high)",
  medium: "var(--med)",
  low: "var(--low)",
};

export function topSeverity(counts?: OrbitNode["counts"]): Severity | null {
  if (!counts) return null;
  return SEVERITIES.find((s) => (counts[s] ?? 0) > 0) ?? null;
}

export function total(counts?: OrbitNode["counts"]): number {
  return counts ? SEVERITIES.reduce((n, s) => n + (counts[s] ?? 0), 0) : 0;
}
