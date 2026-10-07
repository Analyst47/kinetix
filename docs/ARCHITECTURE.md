# Architecture

```
Browser ──► Next.js (web) ──/api/*──► FastAPI (api) ──► PostgreSQL (RLS)
                                         │
                                         ├──► Redis ──► Celery worker ──► analyzers
                                         │                                 ├─ lockfiles → OSV
                                         │                                 ├─ secrets
                                         │                                 └─ Semgrep
                                         └──► content-addressed storage (evidence, archives, sources)
```

## Request path

The browser only talks to the web origin. Next.js rewrites `/api/*` to the API, so the
session cookie is first-party, `HttpOnly` and `SameSite=Lax`. Server components read data by
forwarding the cookie; client components mutate through `lib/client.ts`, which attaches the
CSRF token.

## Tenancy

Every request that touches research data goes through `org_context`:

1. Resolve the session to a user.
2. Load the organization by slug **joined to the user's membership**. Not a member and
   nonexistent return the same 404.
3. Bind the database transaction to the organization with `set_config('app.org_id', …, true)`.
   The binding is re-applied at the start of every transaction (`after_begin`), and is
   transaction-local so pooled connections never carry it across requests.

Row-level security policies on all tenant tables compare `org_id` to that setting, with
`FORCE ROW LEVEL SECURITY` so the owning role is subject to them too.

## Findings

A finding's status only changes through `services/findings.transition`, which enforces the
state machine, the confirmation gate and role permissions, and writes the audit event in the
same transaction. Human-readable numbers (`FND-000127`) come from a per-organization counter
taken under a row lock.

## Audit chain

`services/audit.record` locks the organization row, reads the last event, and stores
`hash = SHA-256(prev_hash ‖ canonical_json(event))`. Canonical JSON uses sorted keys, compact
separators and microsecond UTC timestamps, so verification is deterministic. A trigger makes
the table append-only.

## Scans

`POST /scans` records a queued scan and either hands it to Celery or runs it in-process.
`scanners/pipeline.run_scan` runs each analyzer inside a savepoint: one analyzer failing is
recorded in the scan's stats and rolled back alone.

- **Dependencies.** Lockfiles are parsed without executing anything. OSV `querybatch`
  matches packages; each advisory is fetched once, normalized (severity, CWE, affected range,
  fixed version) and cached in the shared `advisories` table.
- **Secrets.** Regex rules run over text files under 2 MB. Only a redacted preview is kept.
  Matches under test or fixture paths are downgraded to Info.
- **SAST.** Semgrep runs on a private copy of the source with the target's own ignore files
  removed and Kinetix's rules only, so a repository can't hide code or change the rules.

## Data model

`organizations`, `users`, `memberships`, `auth_sessions` are global. `projects`, `targets`,
`scans`, `findings`, `evidence`, `dependencies`, `dependency_advisories` and `audit_events`
are tenant tables. `advisories` is shared public intelligence.
