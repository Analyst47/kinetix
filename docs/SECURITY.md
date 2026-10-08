# Security model

Kinetix stores unreleased vulnerability details and processes code from outside its trust
boundary. It is designed on the assumption that both its users and its inputs can be hostile.

## Assets

1. Unpublished findings, evidence and reproduction steps.
2. The integrity of the research record (who found what, when, and what proves it).
3. The hosts that run analyzers.

## Threats and controls

| Threat | Control | Where |
| --- | --- | --- |
| Cross-tenant data access (IDOR/BOLA) | Membership-checked org context; Postgres RLS on every tenant table; uniform 404s | `deps.py`, initial migration, `tests/test_tenancy.py` |
| Account takeover through password reset | 256-bit single-use tokens stored as SHA-256, 30-minute expiry, voided by any password change; token in the URL fragment (never sent to servers or Referer); identical responses and background sending so neither content nor timing reveals accounts; per-address silent cap and per-IP limit; MFA still required; all sessions revoked; notification email | `routers/passwords.py`, `tests/test_passwords.py` |
| RLS silently bypassed by a privileged DB user | The API connects as a restricted role (no superuser, no BYPASSRLS, owns nothing); migrations run as the owner; the API refuses to start in production if its connection could bypass RLS; tests run as a restricted role too | `app/dbguard.py`, `app_role_grants` migration, `infra/postgres/` |
| Session theft | Opaque 256-bit tokens, only SHA-256 stored, `HttpOnly`, `SameSite=Lax`, server-side revocation, 12 h expiry | `routers/auth.py` |
| CSRF | Double-submit token on every unsafe request, Origin check | `main.py` |
| Credential stuffing | Argon2id, rate limiting per IP and email, timing-equal failures | `security/` |
| Account takeover with a stolen password | TOTP two-step verification: secrets encrypted at rest, codes single-use (replay-protected), 5-attempt challenge lockout, hashed one-time recovery codes; enabling it signs out every other session | `security/mfa.py`, `routers/auth.py` |
| Invitation link forwarding | 256-bit single-use tokens, stored hashed, 7-day expiry, accepted only by the invited email | `routers/members.py` |
| Admin escalation to owner | Only owners can grant, change or remove the owner role; the last owner can't leave or be demoted | `routers/members.py` |
| Report tampering after export | Each export records the SHA-256 of the exact file in the chain of custody | `routers/findings.py` |
| Privilege escalation | Explicit permission sets per role, checked per status transition | `security/permissions.py` |
| Record tampering | Hash-chained, append-only audit log; DB trigger blocks UPDATE/DELETE | `services/audit.py` |
| Evidence tampering | Content addressing by SHA-256, re-verification on demand | `services/storage.py` |
| Stored XSS via evidence | Downloads only, `application/octet-stream`, `nosniff`, `CSP: sandbox`, sanitized filenames | `routers/findings.py` |
| Zip slip, link and device files | Names validated and links rejected before anything is written; writes use `O_EXCL` | `services/archives.py` |
| Zip bombs | Member count, total size and compression-ratio limits; real bytes counted, not headers | `services/archives.py` |
| Repository-controlled analyzer config | Semgrep runs on a copy without the repo's ignore files, with Kinetix rules only, no shell | `scanners/semgrep.py` |
| Secret leakage through findings | Secret values are never stored; redacted previews only | `scanners/secrets.py` |
| Analyzer escape | Worker container: read-only root, no capabilities, no new privileges, memory and PID limits | `docker-compose.yml` |
| SSRF through vendor lookup | Domain-only input, every resolved address must be public, connection pinned to the checked address (no DNS rebinding) with TLS verified for the domain, no redirects, 32 KB cap, timeouts | `services/securitytxt.py` |
| Prompt injection from analyzed code | Untrusted content fenced in nonce-delimited blocks; system rules forbid following it; injection-like lines flagged to the researcher; structured output only; model output can't change state | `ai/context.py`, `ai/prompts.py`, `ai/service.py` |
| Hallucinated evidence | Every citation is matched against the exact lines sent; unmatched citations removed, unsupported claims marked, unsupported confident verdicts downgraded | `ai/service.py` |
| Unreleased details sent to a third party | AI is off per workspace until an owner or admin enables it; nothing is sent without a click; each request's input hash is recorded in custody | `routers/ai.py` |
| Out-of-scope research | Attestation required; expired authorization blocks targets and scans | `routers/projects.py` |

## Database roles

Postgres superusers and roles with `BYPASSRLS` skip row-level security even when it is
forced. Kinetix therefore uses two roles:

- **Owner** (`KINETIX_MIGRATION_DATABASE_URL`): owns the schema and runs migrations.
- **App** (`KINETIX_DATABASE_URL`, default `kinetix_app`): created by the operator with
  `CREATE ROLE kinetix_app LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '...'`, and granted
  data access only, by the `app_role_grants` migration. If the role is created after
  migrating, run `alembic downgrade -1 && alembic upgrade head` as the owner to apply grants.

Docker Compose creates the app role on first start (`infra/postgres/10-app-role.sh`). On a
managed database such as Neon, create it in the console or with SQL before migrating.

## Known gaps

These are tracked on the roadmap and are not yet in place:

- Passkeys (WebAuthn). TOTP is in place.
- Invitation links are copied by hand; there is no email delivery yet.
- Login rate limiting is per process; it moves to Redis for multi-instance deployments.
- Analyzer jobs share a worker container rather than a per-job sandbox (gVisor or
  Firecracker is the plan before any reproduction environments ship).
- Evidence is not encrypted at rest beyond what the storage volume provides.
- No API keys yet; all access is through browser sessions.

## Reporting a vulnerability in Kinetix

Email the maintainer rather than opening a public issue. Include the affected version,
steps to reproduce and impact. Expect an acknowledgement within 3 business days.
