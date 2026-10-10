/**
 * Pure helpers for the New project flow: repository-URL validation (mirroring the API's
 * gitfetch.parse_repo_url), name and URL-name suggestions, and the scope / review presets.
 * No React here, so everything is deterministic and safe to call during render.
 */

// ── Repository URLs ───────────────────────────────────────────────────────────

export interface Repo {
  /** Canonical URL sent to the API: https://host/path (trailing slashes removed). */
  url: string;
  host: string;
  /** "/owner/repo" or "/owner/repo.git", as the API stores it. */
  path: string;
  owner: string | null;
  /** The repository's own name, without a trailing ".git". */
  name: string;
  /** "owner/repo" for display (".git" dropped). */
  display: string;
  github: boolean;
}

export type RepoCheck =
  | { state: "empty" }
  | { state: "invalid"; message: string; fix: string | null }
  | { state: "valid"; repo: Repo };

// The same patterns the API uses (gitfetch._PATH and securitytxt._LABEL).
const PATH_RE = /^\/[A-Za-z0-9._~\-/]{1,300}$/;
const LABEL_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const SPLIT_RE = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?(?:#([\s\S]*))?$/;

const MSG = {
  https: "Use the repository's HTTPS URL, like https://github.com/owner/repo.",
  scheme: "Only HTTPS repository URLs are supported.",
  credentials: "Remove the credentials from the URL. Only public repositories work.",
  port: "Only the standard HTTPS port is supported.",
  query: "Remove the query string or fragment from the URL.",
  host: "The URL needs a public host name, like github.com.",
  path: "That doesn't look like a repository path.",
} as const;

function toAsciiHost(host: string): string | null {
  if (/^[\x00-\x7f]*$/.test(host)) return host;
  try {
    return new URL(`https://${host}/`).hostname;
  } catch {
    return null;
  }
}

/** Mirrors securitytxt.normalize_domain: a public, multi-label DNS name (no IPs, no local names). */
function publicHost(raw: string): string | null {
  let value = raw.trim().toLowerCase();
  if (value.includes("@") || value.includes(":") || value.includes("[")) return null;
  value = value.replace(/\.+$/, "");
  const ascii = toAsciiHost(value);
  if (!ascii) return null;
  const labels = ascii.split(".");
  if (ascii.length > 253 || labels.length < 2 || !labels.every((l) => LABEL_RE.test(l))) return null;
  if (/^\d+$/.test(labels[labels.length - 1]!)) return null;
  if (ascii === "localhost" || /\.(localhost|local|internal|lan)$/.test(ascii)) return null;
  return ascii;
}

/** The API's rules, in the API's order. Returns host + path, or the API's own message. */
function serverCheck(input: string): { host: string; path: string } | { error: string } {
  const raw = input.trim();
  if (raw.startsWith("git@") || !raw.includes("://")) return { error: MSG.https };
  const m = SPLIT_RE.exec(raw);
  if (!m || m[1]!.toLowerCase() !== "https") return { error: MSG.scheme };
  const netloc = m[2]!;
  if (netloc.includes("@")) return { error: MSG.credentials };
  let hostPart = netloc;
  if (!netloc.startsWith("[")) {
    const colon = netloc.indexOf(":");
    if (colon !== -1) {
      const port = netloc.slice(colon + 1);
      if (port !== "" && port !== "443" && !/^0*443$/.test(port)) return { error: MSG.port };
      hostPart = netloc.slice(0, colon);
    }
  }
  if ((m[4] ?? "") !== "" || (m[5] ?? "") !== "") return { error: MSG.query };
  const host = publicHost(hostPart);
  if (!host) return { error: MSG.host };
  const path = m[3]!.replace(/\/+$/, "");
  if (!PATH_RE.test(path) || path.split("/").includes("..")) return { error: MSG.path };
  return { host, path };
}

const GITHUB_SUBPAGES = new Set([
  "tree",
  "blob",
  "commit",
  "commits",
  "pull",
  "pulls",
  "issues",
  "releases",
  "tags",
  "actions",
  "wiki",
  "security",
  "settings",
  "branches",
  "compare",
]);

function strictCheck(input: string): RepoCheck {
  if (!input.trim()) return { state: "empty" };
  const base = serverCheck(input);
  if ("error" in base) return { state: "invalid", message: base.error, fix: null };
  const { host, path } = base;
  const segments = path.split("/").filter(Boolean);
  if (host === "www.github.com") {
    return { state: "invalid", message: "Use github.com without the www.", fix: null };
  }
  const github = host === "github.com";
  if (github) {
    if (segments.length < 2) {
      return {
        state: "invalid",
        message:
          segments.length === 0
            ? "Add the owner and repository: github.com/owner/repository."
            : `Add the repository name: github.com/${segments[0]}/…`,
        fix: null,
      };
    }
    if (segments.length > 2 || path !== `/${segments.join("/")}`) {
      const inside = GITHUB_SUBPAGES.has(segments[2] ?? "");
      return {
        state: "invalid",
        message: inside
          ? "That link points inside the repository. Use the repository itself."
          : "GitHub repository links look like github.com/owner/repository.",
        fix: null,
      };
    }
  }
  const last = segments[segments.length - 1] ?? "";
  const name = last.replace(/\.git$/i, "") || host;
  const owner = segments.length >= 2 ? segments[segments.length - 2]! : null;
  const display = [...segments.slice(0, -1), name].join("/");
  return {
    state: "valid",
    repo: { url: `https://${host}${path}`, host, path, owner, name, display, github },
  };
}

/** Turn a near-miss (SSH remote, http://, missing scheme, deep link, query string…) into a repo URL. */
function candidateFix(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  const scp = /^(?:ssh:\/\/)?git@([^:/\s]+)[:/](.+)$/.exec(s);
  if (scp) s = `https://${scp[1]}/${scp[2]}`;
  else if (/^http:\/\//i.test(s)) s = `https://${s.slice(7)}`;
  else if (!s.includes("://")) {
    if (/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+\/?$/.test(s)) {
      s = `https://github.com/${s}`;
    } else if (/^[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?::\d+)?\//.test(s)) {
      s = `https://${s}`;
    } else return null;
  }
  const m = SPLIT_RE.exec(s);
  if (!m) return null;
  let host = m[2]!.replace(/^.*@/, "").replace(/:\d*$/, "").toLowerCase();
  if (host === "www.github.com") host = "github.com";
  let path = m[3]!.replace(/\/+$/, "");
  if (host === "github.com") {
    const segments = path.split("/").filter(Boolean);
    if (segments.length < 2) return null;
    path = `/${segments[0]}/${segments[1]}`;
  }
  return `https://${host}${path}`;
}

/** Validate a repository URL as the API would, plus GitHub-specific guidance and a one-click fix. */
export function checkRepoUrl(input: string): RepoCheck {
  const result = strictCheck(input);
  if (result.state !== "invalid") return result;
  const fix = candidateFix(input);
  const usable = fix && fix !== input.trim() && strictCheck(fix).state === "valid" ? fix : null;
  return { ...result, fix: usable };
}

// ── Names and URL names ───────────────────────────────────────────────────────

const ACRONYMS: Record<string, string> = {
  ai: "AI",
  api: "API",
  aws: "AWS",
  cli: "CLI",
  cms: "CMS",
  css: "CSS",
  db: "DB",
  gcp: "GCP",
  grpc: "gRPC",
  html: "HTML",
  http: "HTTP",
  io: "IO",
  ios: "iOS",
  js: "JS",
  json: "JSON",
  jwt: "JWT",
  ml: "ML",
  oauth: "OAuth",
  owasp: "OWASP",
  php: "PHP",
  sdk: "SDK",
  sql: "SQL",
  ts: "TS",
  ui: "UI",
  url: "URL",
  xml: "XML",
};

function titleWord(word: string): string {
  const lower = word.toLowerCase();
  if (ACRONYMS[lower]) return ACRONYMS[lower];
  // Keep deliberate casing ("NodeGoat", "OWASP"); capitalise plain lowercase words.
  return word === lower ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

export function titleCase(s: string): string {
  return s
    .replace(/\.git$/i, "")
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map(titleWord)
    .join(" ");
}

/** Up to four project names derived from the repository; the first is the default. */
export function nameSuggestions(repo: Repo): string[] {
  const repoTitle = titleCase(repo.name);
  const owner = repo.owner;
  const raw = [
    repoTitle,
    owner && owner.toLowerCase() !== repo.name.toLowerCase() ? `${titleCase(owner)} ${repoTitle}` : null,
    repo.name,
    owner ? `${owner}/${repo.name}` : null,
  ];
  const out: string[] = [];
  for (const s of raw) {
    const v = s?.trim();
    if (v && v.length <= 120 && !out.includes(v)) out.push(v);
  }
  return out.slice(0, 4);
}

export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "new",
  "audit",
  "settings",
  "members",
  "api",
  "billing",
]);
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 64)
    .replace(/-+$/, "");
}

/** The automatic URL name: slugified, never reserved, and unique among the workspace's projects. */
export function autoSlug(name: string, fallback: string, taken: ReadonlySet<string>): string {
  let base = slugify(name) || slugify(fallback) || "project";
  if (RESERVED_SLUGS.has(base)) base = `${base}-project`;
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const suffix = `-${i}`;
    const candidate = `${base.slice(0, 64 - suffix.length).replace(/-+$/, "")}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return base;
}

/** Light clean-up while the URL name is typed: lowercase, hyphens for anything else. */
export function cleanSlugInput(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 64);
}

export function slugProblem(slug: string, taken: ReadonlySet<string>): string | null {
  if (!slug) return "Enter a URL name.";
  if (!SLUG_RE.test(slug)) {
    return "Use lowercase letters, numbers and hyphens, starting and ending with a letter or number.";
  }
  if (RESERVED_SLUGS.has(slug)) return `"${slug}" is reserved. Choose another URL name.`;
  if (taken.has(slug)) return "A project in this workspace already uses that URL name.";
  return null;
}

// ── Authorization, scope and review presets ──────────────────────────────────

export type AuthType =
  "open_source" | "bug_bounty" | "vendor_authorization" | "personal_lab" | "organization_owned";

export const AUTH_HINT: Record<AuthType, string> = {
  open_source: "Public source you analyze locally.",
  bug_bounty: "A program that lists this asset as in scope.",
  vendor_authorization: "Written permission from the owner.",
  personal_lab: "Systems you own and run.",
  organization_owned: "Your employer's system, with approval.",
};

export const AUTH_TYPES = Object.keys(AUTH_HINT) as AuthType[];

export const needsProgramLink = (t: AuthType) => t === "bug_bounty" || t === "vendor_authorization";

export type InScope = "source" | "source_deps" | "custom";
export type OutScope = "hosted" | "third_party" | "outside" | "custom";

export function inScopeText(choice: Exclude<InScope, "custom">, repo: Repo | null): string {
  if (repo) {
    return choice === "source"
      ? `Source code of ${repo.display} on the default branch, analyzed locally.`
      : `Source code and third-party dependencies of ${repo.display}, analyzed locally.`;
  }
  return choice === "source"
    ? "Source code I upload as an archive, analyzed locally."
    : "Source code and third-party dependencies in the archives I upload, analyzed locally.";
}

export function outScopeText(choice: Exclude<OutScope, "custom">, repo: Repo | null): string {
  if (choice === "hosted") return "Any hosted or production instance not run by me.";
  if (choice === "third_party") return "Third-party services, infrastructure and their users.";
  return repo ? "Everything outside the repository source." : "Everything outside the uploaded source.";
}

export type Review = "30d" | "90d" | "6m" | "1y" | "none";

export const REVIEW_LABEL: Record<Review, string> = {
  "30d": "30 days",
  "90d": "90 days",
  "6m": "6 months",
  "1y": "1 year",
  none: "No expiry",
};

export const REVIEWS = Object.keys(REVIEW_LABEL) as Review[];

/** The review-by moment for a choice: the end of that local day, or null for no expiry. */
export function reviewDate(choice: Review, from: Date): Date | null {
  if (choice === "none") return null;
  const d = new Date(from.getTime());
  if (choice === "30d") d.setDate(d.getDate() + 30);
  else if (choice === "90d") d.setDate(d.getDate() + 90);
  else if (choice === "6m") d.setMonth(d.getMonth() + 6);
  else d.setFullYear(d.getFullYear() + 1);
  d.setHours(23, 59, 59, 0);
  return d;
}

/** The API accepts a reference only when it starts with https:// (case-sensitive). */
export function isHttpsLink(s: string): boolean {
  if (!s.startsWith("https://")) return false;
  try {
    return Boolean(new URL(s).hostname);
  } catch {
    return false;
  }
}
