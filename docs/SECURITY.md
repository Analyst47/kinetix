# Security model

KinetixZero stores unreleased vulnerability details and processes code from outside its trust
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
| SSRF or code execution through a Git URL | HTTPS only, public hosts only; DNS resolved once, checked and pinned with `http.curloptResolve`; no redirects, credentials, custom ports or other protocols (`protocol.allow=never`); refs validated so they can't become options; system and user git config ignored; no hooks, submodules, LFS or fsmonitor; symlinks checked out as plain files; `fsckObjects`; depth 1 with time and low-speed limits; regular files copied under upload limits; runs in the sandboxed worker | `services/gitfetch.py`, `tests/test_git_targets.py` |
| RLS silently bypassed by a privileged DB user | The API connects as a restricted role (no superuser, no BYPASSRLS, owns nothing); migrations run as the owner; the API refuses to start in production if its connection could bypass RLS; tests run as a restricted role too | `app/dbguard.py`, `app_role_grants` migration, `infra/postgres/` |
| Session theft | Opaque 256-bit tokens, only SHA-256 stored, `HttpOnly`, `SameSite=Lax`, server-side revocation, 12 h expiry | `routers/auth.py` |
| CSRF | Double-submit token on every unsafe request, Origin check | `main.py` |
| Credential stuffing | Argon2id; limits per IP and email and per account from anywhere, shared across API processes through Redis (keys hashed); timing-equal failures | `security/ratelimit.py` |
| Spoofed client address defeating per-IP limits | Only the edge (Caddy) is public; it discards client-sent `X-Forwarded-For` and records the real address; the API reads that header only from addresses in `KINETIX_TRUSTED_PROXIES`, right to left | `infra/caddy/Caddyfile`, `security/clientip.py` |
| XSS in the web app | React escaping everywhere; a per-request nonce CSP with `strict-dynamic` (no inline scripts or event handlers, no `eval`), `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, same-origin connections only | `web/src/proxy.ts` |
| Session cookies over plain HTTP | `Secure` is forced on in production regardless of configuration; HSTS on HTTPS | `config.py`, `main.py`, `web/src/proxy.ts` |
| API surface mapping | Interactive docs and the OpenAPI schema aren't served in production | `main.py` |
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
| Repository-controlled analyzer config | Semgrep runs on a copy without the repo's ignore files, with KinetixZero rules only, no shell | `scanners/semgrep.py` |
| Secret leakage through findings | Secret values are never stored; redacted previews only | `scanners/secrets.py` |
| Analyzer escape | Worker container: read-only root, no capabilities, no new privileges, memory and PID limits | `docker-compose.yml` |
| SSRF through vendor lookup | Domain-only input, every resolved address must be public, connection pinned to the checked address (no DNS rebinding) with TLS verified for the domain, no redirects, 32 KB cap, timeouts | `services/securitytxt.py` |
| Prompt injection from analyzed code | Untrusted content fenced in nonce-delimited blocks; system rules forbid following it; injection-like lines flagged to the researcher; structured output only; model output can't change state | `ai/context.py`, `ai/prompts.py`, `ai/service.py` |
| Hallucinated evidence | Every citation is matched against the exact lines sent; unmatched citations removed, unsupported claims marked, unsupported confident verdicts downgraded | `ai/service.py` |
| Unreleased details sent to a third party | AI is off per workspace until an owner or admin enables it; nothing is sent without a click; each request's input hash is recorded in custody | `routers/ai.py` |
| AI spend abuse / quota bypass | AI runs only on the server key; every model call is charged to the caller's plan row, locked for the transaction so concurrent requests can't overspend; failed calls roll back; a server-wide monthly token budget backstops it. Unlimited access only for configured owner emails and members of workspaces those accounts *created* and still own (joining, or being made an owner of, someone else's workspace grants nothing); a startup warning flags listed owner emails that no account has registered yet | `billing/entitlements.py`, `ai/budget.py` |
| Accidental or unauthorized project deletion | Owners/admins only (`project:delete`), never the shared demo account; the caller must repeat the project's URL name, and the deletion is written to the hash-chained audit log before the cascade. Fetched source trees are removed (including one a fetch finishes after the delete); content-addressed evidence and archive blobs may be shared and are not unlinked | `routers/projects.py` |
| One user reading or changing another's plan | `user_plans` is isolated by row-level security on `app.user_id`, bound only after the session cookie is verified; the app role can't bypass it | `deps.py`, migration `7e3f9b2c4d18` |
| Out-of-scope research | Attestation required; expired authorization blocks targets and scans | `routers/projects.py` |

## Database roles

Postgres superusers and roles with `BYPASSRLS` skip row-level security even when it is
forced. KinetixZero therefore uses two roles:

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
- If the worker sends traffic through an HTTP proxy, the proxy resolves repository hosts
  itself, so the DNS pin no longer applies. Block private address ranges at the network
  level for the worker too (defense in depth).
- Analyzer jobs share a worker container rather than a per-job sandbox (gVisor or
  Firecracker is the plan before any reproduction environments ship).
- Evidence is not encrypted at rest beyond what the storage volume provides.
- No API keys yet; all access is through browser sessions.

## Accepted risks

- **Registration reveals whether an email has an account** (`409 email_taken`). Login and
  password reset don't. Hiding it would need email verification before an account exists;
  registration is rate limited per IP, which keeps bulk probing slow.
- **Memberships and invitations aren't under row-level security.** They're read before a
  tenant is known (resolving which workspaces a user belongs to, or an invitation by its
  token), so they're protected by application checks: every query is scoped by user or by
  a hashed single-use token, and tenant tables stay under RLS.

## Independent testing

An independent white-box penetration test (October 2026) attacked tenant isolation, role
escalation, invitations, MFA and password reset, CSRF, SSRF through security.txt and Git
URLs, archive extraction, header injection, stored XSS, audit-log integrity and AI output
handling, dynamically against a running instance. It found no critical, high or medium
issues. The low and informational findings (cookie `Secure` not forced in production, API
docs published in production, Windows device names in download filenames) are fixed; the
remaining one is listed under accepted risks.

## Reporting a vulnerability in KinetixZero

Email the maintainer rather than opening a public issue. Include the affected version,
steps to reproduce and impact. Expect an acknowledgement within 3 business days.
