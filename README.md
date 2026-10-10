# KinetixZero

A vulnerability research and responsible-disclosure platform.

KinetixZero takes a software target you are authorized to analyze, finds candidate
vulnerabilities in its code and dependencies, and walks a human researcher from
"potential" to a defensible, evidence-backed finding. Every step is recorded in a
tamper-evident chain of custody.

> **Scope.** KinetixZero assists research on authorized targets. It never attacks third-party
> systems, and it never marks a finding as confirmed on its own: a person confirms, and only
> after evidence, reproduction steps and a CVSS assessment exist.

## What works today

- **Authorization boundary.** A project can't exist without a recorded attestation, scope
  and optional expiry. Expired authorizations block new targets and scans.
- **Repository targets.** Paste a public HTTPS Git URL and a branch, tag or commit. The
  worker fetches exactly one commit and pins its SHA, so findings always point at exact
  code. The remote is treated as hostile: one pinned public address, no redirects, hooks,
  submodules, LFS or non-HTTPS protocols, symlinks written as plain files, every object
  verified, and the same size limits as uploads.
- **Hostile-input ingestion.** Source archives are validated before a byte is written:
  path traversal, absolute paths, symlinks, hardlinks, device files, zip bombs and
  `.git/hooks` are all rejected or skipped.
- **Analysis pipeline.** npm and PyPI lockfiles are matched against [OSV](https://osv.dev);
  a built-in secret detector redacts what it finds; a KinetixZero Semgrep rule pack (28 rules
  for JavaScript/TypeScript and Python) covers SQL injection, SSRF, SSTI, reflected XSS,
  NoSQL injection, command injection, path traversal, prototype pollution, ReDoS, open
  redirect, insecure deserialization, XXE, weak JWT verification, insecure CORS and weak
  crypto. Findings are de-duplicated by fingerprint across scans.
- **Confidence ranking.** Each finding is **firm** or **tentative**. Firm means a Semgrep
  taint-mode rule proved attacker input flows into the sink, or a dependency matched a known
  CVE — the leads worth a researcher's time first. Everything else is a pattern match a human
  still has to confirm. When AI analysis runs, it also sees where the flagged function is
  called, to judge reachability.
- **Finding lifecycle.** Discovered → Triage → Needs validation → Confirmed → Reported →
  Vendor acknowledged → Fix available → Public disclosure, plus four closed states. The
  state machine is enforced server-side, per role.
- **Evidence vault.** Content-addressed storage, SHA-256 at upload, on-demand
  re-verification, always served as a download with `nosniff` and a sandbox CSP.
- **Chain of custody.** An append-only audit log where each entry's hash covers the
  previous one. The database rejects updates and deletes; tampering by someone who can
  bypass that is detected and pinpointed.
- **Multi-tenancy.** Every tenant table carries `org_id` and is protected by Postgres
  row-level security, so a missing filter in application code still can't leak data.
- **CVSS 4.0 and 3.1** scoring, validated server-side.
- **Two-step verification.** TOTP with encrypted secrets, replay protection and one-time
  recovery codes. Session list with remote sign-out.
- **Password reset.** Single-use, 30-minute links that never reveal whether an account
  exists, don't bypass two-step verification, and sign out every session. Security emails
  when a password changes or two-step verification is turned off.
- **Members.** Single-use invitation links, emailed to the invitee and bound to their email,
  role management with owner safeguards.
- **Coordinated disclosure.** Vendor contact lookup through `security.txt` (RFC 9116), a
  drafted notification, a deadline clock (90 days by default) with extensions, CVE and
  advisory tracking. Recording vendor milestones moves the finding through Reported,
  Vendor acknowledged, Fix available and Public disclosure, so the two never disagree.
- **AI assistance.** Evidence-cited triage, questions and drafting on a finding, served from
  the server's own Claude key and metered per user (10 free AI searches, larger monthly
  allowances on paid plans). Gemini or a local Ollama model also work. The assistant only advises:
  analyzed code is fenced off as untrusted data, injection attempts are flagged, every
  citation is checked against the lines it was shown, and each request is recorded in the
  chain of custody. Off until a workspace owner or admin turns it on.
- **Hardened edge.** Only Caddy is public (automatic HTTPS with your domain). The web app
  ships a per-request nonce Content Security Policy; rate limits are shared across API
  processes through Redis and keyed on the real client address, which can't be spoofed.
  An independent penetration test found no critical, high or medium issues.
- **Exports.** Per finding: a server-generated **PDF** disclosure report, a **CVE Record
  Format 5.1** JSON ready to submit to a CNA, an **OSV** advisory record, a printable report, and Markdown
  — each export recorded in the chain of custody with its SHA-256.
- **Training dataset.** Export a project's findings as JSONL (the scanner's features plus the
  researcher's verdict) to train a model such as Aegis.
  export, each export recorded in the chain of custody with its SHA-256.

## Run it

**With Docker** (Postgres, Redis, API, worker and web):

```bash
docker compose up --build
```

Open http://localhost:3000 and sign in with the demo account
(`demo@kinetix.dev` / `kinetix-demo-2026`), pre-filled on the sign-in page.

**Without Docker**, you need Postgres 16 and Python 3.12+ with [uv](https://docs.astral.sh/uv/):

```bash
# Database roles: an owner for migrations, a restricted role for the app (see docs/SECURITY.md)
psql -c "CREATE ROLE kinetix_app LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD 'kinetix_app'"
cp .env.example api/.env

# API
cd api
uv sync
uv run alembic upgrade head        # runs as KINETIX_MIGRATION_DATABASE_URL (the owner)
uv run python -m app.seed          # demo workspace: OWASP Juice Shop
uv run uvicorn app.main:app --reload

# Web (another terminal)
cd web
npm install
KINETIX_DEMO=1 npm run dev
```

Scans run in-process by default (`KINETIX_SCAN_MODE=inline`). Install Semgrep
(`uv tool install semgrep`) to enable the SAST analyzer.

## Deploy

One Docker Compose stack on a single machine, free apart from the domain: an Oracle Cloud
Always Free VM with automatic HTTPS, or any computer behind Cloudflare Tunnel with no open
ports. Step-by-step guide: [docs/DEPLOY.md](docs/DEPLOY.md).

```bash
sh scripts/setup-env.sh kinetix.yourdomain.com     # private .env with random secrets
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
python3 scripts/smoke.py https://kinetix.yourdomain.com
```

Every push runs the same stack in CI and smoke-tests it through the edge, with live GitHub,
OSV and security.txt lookups.

## AI assistance

AI runs on **the server's own provider key** — users never paste a key. Set it on the API
(environment variables, or `.env`); it is read server-side only and never reaches the browser:

```bash
# Claude API (default provider)
ANTHROPIC_API_KEY=sk-ant-...           # or KINETIX_AI_API_KEY
KINETIX_AI_MODEL=claude-sonnet-5-5     # optional; this is the default
KINETIX_AI_EFFORT=medium               # optional; low | medium | high — lower is cheaper

# Alternatives
KINETIX_AI_PROVIDER=gemini             # KINETIX_AI_API_KEY=AIza..., KINETIX_AI_GEMINI_TIER=free|paid
KINETIX_AI_PROVIDER=openai_compatible  # KINETIX_AI_BASE_URL=http://localhost:11434/v1, KINETIX_AI_MODEL=...
KINETIX_AI_PROVIDER=mock               # development stub; no model is called
```

Then a workspace owner or admin turns it on under **AI assistance** in the sidebar.

**Metering.** Each AI "search" — one model call: an Analyze, Ask or Draft, or one finding
reviewed by a triage pass — is charged to the user who ran it. Every user gets a one-time free
allowance (`KINETIX_AI_FREE_SEARCHES`, default 10); paid plans get a monthly allowance that
resets each period. A failed call isn't charged. When the allowance runs out the app shows an
Upgrade prompt; everything except AI keeps working. Usage is shown in the sidebar and under
**Plan & usage**, and every run records the charge in the audit log. Plans, prices and quotas
are defined in `api/app/billing/plans.py`; Stripe wiring is described in
[docs/BILLING.md](docs/BILLING.md). `KINETIX_AI_MONTHLY_TOKEN_BUDGET` remains as a server-wide
spend backstop.

On Gemini's free tier, Google may use prompts and responses to improve its products, and
human reviewers may read them ([Gemini API terms](https://ai.google.dev/gemini-api/terms)).
KinetixZero shows that notice to admins and researchers. Don't use the free tier on
confidential engagements; use Claude, Gemini's paid tier, or a local model.

## Email

Without configuration, emails (reset links, invitations, security notices) are printed to
the API log, which is all you need locally. To send real email, use
[Resend](https://resend.com) (free tier: 3,000 emails a month, 100 a day, one domain):

```bash
KINETIX_EMAIL_BACKEND=resend
KINETIX_RESEND_API_KEY=re_...
KINETIX_EMAIL_FROM="KinetixZero <security@yourdomain.com>"   # a domain verified in Resend
KINETIX_APP_URL=https://yourdomain.com                    # used to build links in emails
```

In production, the console backend drops messages instead of logging them, because they
contain sign-in links. On a public demo, set `KINETIX_DEMO_ACCOUNT_EMAIL` so the shared
account can't change its password or turn on two-step verification.

## Tests

```bash
cd api && uv run pytest        # 120+ tests against a real Postgres (kinetix_test database)
cd web && npm run lint && npm run typecheck && npm run build
```

## Layout

```
api/            FastAPI service, SQLAlchemy models, Alembic migrations
  app/routers   HTTP endpoints
  app/services  audit chain, findings lifecycle, storage, archive extraction, CVSS
  app/scanners  lockfiles, OSV client, secrets, Semgrep adapter, scan pipeline
  rules/        KinetixZero Semgrep rule pack
  tests/
web/            Next.js app (App Router, TypeScript, Tailwind)
docs/           Architecture, security model, roadmap
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/SECURITY.md](docs/SECURITY.md) and
[docs/ROADMAP.md](docs/ROADMAP.md).

## Demo data

The demo workspace analyzes [OWASP Juice Shop](https://github.com/juice-shop/juice-shop), an
intentionally insecure application published for security training. Its source excerpts are
used under the MIT License. Demo advisories are a hand-picked sample; real scans pull
advisories from OSV.
