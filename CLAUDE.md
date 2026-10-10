# KinetixZero — context for Claude Code

KinetixZero is an **AI-assisted application-security platform** for authorized vulnerability
research and responsible disclosure. A researcher points it at source they're allowed to
analyze; it runs static analysis, correlates with public vulnerability intelligence, uses AI
to help validate findings with cited evidence, and produces responsible-disclosure packages.

## Non-negotiable positioning & guardrails
- **Read-only, human-in-the-loop, authorized targets only.** It performs static analysis; it
  does **not** autonomously exploit or attack live systems. The researcher validates and
  reproduces findings. Never write copy, features, or UI that claim autonomous attacking.
- The AI layer is **advisory**: it produces hypotheses with verified citations and never
  confirms a finding, changes state, or contacts anyone on its own.
- "KinetixZero" is the **display name only**. Do **not** rename internal identifiers: the
  `KINETIX_` env prefix, the `kinetix_app` / `kinetix` DB roles, `kinetix-*` docker images,
  the `kinetix` CLI, or the GitHub repo (`Analyst47/kinetix`).
- Never commit secrets. `.env` is gitignored; copy `.env.example`. Keys are read server-side
  only and never sent to the browser, logged, or committed.

## Repo layout
- `web/` — Next.js **16** (App Router, React 19, Tailwind **v4**, standalone output).
  - Design tokens: `web/src/app/globals.css`. Shared UI: `web/src/components/`.
  - Marketing (public): `web/src/app/(marketing)`. Auth: `web/src/app/(auth)`.
  - Signed-in app: `web/src/app/[org]` (workspace) and `web/src/app/[org]/[project]`.
  - API calls: server-side via `web/src/lib/server.ts`, browser via `web/src/lib/client.ts`
    (CSRF-aware). The browser only talks to this origin; `/api/*` is proxied to the backend.
  - `web/AGENTS.md`: this Next.js version has breaking changes — check
    `node_modules/next/dist/docs/` before using unfamiliar APIs.
- `api/` — FastAPI + SQLAlchemy 2 (sync) + psycopg 3 + Postgres 16 (**row-level security**)
  + Alembic + Celery/Redis.
  - Routers: `api/app/routers/`. Models: `api/app/models/`. Services: `api/app/services/`.
  - AI: `api/app/ai/` (providers, service, prompts, context, budget) and
    `api/app/routers/ai.py`. Plans & quotas: `api/app/billing/` + `api/app/routers/billing.py`. Scanners: `api/app/scanners/` + `rules/` (Semgrep taint rules).
  - Migrations: `api/migrations/versions/` — **required for any schema change**; they run
    automatically before the API starts on deploy. Remember RLS grants for new columns/tables.
- `docs/` — DEPLOY.md, ARCHITECTURE.md, SECURITY.md. `scripts/` — setup/deploy/ops.

## Run / build / test
Frontend (`cd web`):
```
npm install
npm run dev                 # local dev
npm run build               # production build (must pass)
npm run lint                # eslint (must pass)
npx tsc --noEmit            # typecheck (must pass)
```
Backend (`cd api`, needs Postgres + Redis running locally):
```
.venv/bin/python -m pytest              # full suite (must pass)
ruff check app/ tests/                  # lint (must pass)
ruff format app/ tests/                 # format
.venv/bin/alembic upgrade head          # apply migrations (owner DB role)
```
Tests build a fresh test DB from all migrations and run as the restricted `kinetix_app_test`
role, so they catch RLS and migration problems. Demo data: `python -c "from app.seed import seed; seed()"`
seeds the `demo` workspace (demo@kinetix.dev / kinetix-demo-2026).

## Architecture notes
- **Tenancy & security:** Postgres row-level security with a restricted app role that cannot
  bypass RLS; a startup guard refuses to serve in production on a bypass-capable connection.
  Argon2id passwords, opaque session cookies (HttpOnly, SameSite=Lax), CSRF double-submit +
  Origin check, optional TOTP MFA, hash-chained audit log.
- **Findings lifecycle:** `discovered → triage → needs_validation → confirmed → reported → …`
  plus closed states. `confirmed` requires evidence/reproduction (see
  `api/app/services/findings.py`). Confidence = `firm` (taint-verified / matched CVE) vs
  `tentative`.
- **AI (current):** providers are Anthropic (default) / Gemini / OpenAI-compatible / Mock
  (`api/app/ai/providers.py`). All AI runs on the **server's own key** (managed mode,
  `KINETIX_AI_MANAGED_ENABLED`, on by default; Claude key from `ANTHROPIC_API_KEY`). There is no
  bring-your-own-key. Usage is **metered per user**: each model call is one "Agentic Triage run" (user-facing name;
  API fields still say `searches_*`), charged by
  `billing/entitlements.consume()` inside the request transaction (failed calls roll back);
  free = `KINETIX_AI_FREE_SEARCHES` (10, one-time), paid plans reset monthly; exhausted →
  `402 ai_limit_reached` → Upgrade UI. Owner accounts (`KINETIX_OWNER_EMAILS`) and members of
  workspaces they own are sponsored: unlimited, no hourly rate limit (`entitlements.sponsor_of`). Plan rows live in `user_plans` (RLS on `app.user_id`).
  The monthly token budget (`budget.py`) is a server-wide backstop. Stripe isn't wired yet —
  see `docs/BILLING.md`. Current Claude models reject a forced `tool_choice`; the adapter uses
  `auto` and the system prompt tells the model to call the result tool. The model answers input_controlled / reaches_sink / sanitized
  with cited lines and KinetixZero **derives** the verdict server-side; uncited claims are
  downgraded. Providers retry transient 429/500/503/529 with backoff.
- **Scanners:** Semgrep taint rules (JS/TS + Python) → findings; dependency lockfiles → OSV;
  redacted secret detection. Git targets are fetched hardened (HTTPS, pinned IP, no hooks/
  submodules/LFS, symlinks flattened).
- **Exports:** CVE Record 5.1, OSV, server-generated PDF, and a JSONL training dataset.
- **Labeling queue** (`web/src/app/[org]/[project]/label`): one-keypress ground-truth verdicts
  (R real / F false-positive / S skip) feeding the dataset export; the `ground_truth` label is
  separate from the disclosure status.

## Design system
- **Monochrome.** Tokens are CSS variables in `globals.css` (`paper`, `raised`, `sunken`, `rule`,
  `ink`, `muted`, `brand`…), redefined for dark mode and for the pinned true-black `.night`
  surface (marketing + auth). `brand` is black in the light app and white on dark surfaces.
  No neon accent, glows, gradients or grid backgrounds. Severity/status colors (`crit`, `high`,
  `med`, `low`, `ok`) are for **data only** (badges, counts, charts, the radar) — never chrome.
- Geist for headings/body, Geist Mono for code and uppercase `eyebrow` labels. Pill buttons:
  solid `brand` primary, thin-outline secondary. Logo: `components/logo.tsx` (ring + traced
  path); favicon `app/icon.svg`. Night-sky backdrop: `components/sky.tsx`.
- Homepage centerpiece: `components/marketing/orbital-radar.tsx` (data in `orbital-data.ts`) —
  pipeline view describes shipped behaviour; the infrastructure view is labelled illustrative.
- Keep both light and dark themes working in the app.

## Deploy
One Docker Compose stack behind a Caddy edge; only the edge is public. `sudo kinetix update`
pulls `main`, runs migrations, and rebuilds. See `docs/DEPLOY.md`. Do not change the compose
service names, env prefix, or DB roles.

## When you finish a change
Run the web build + lint + typecheck and the api tests, apply/verify migrations, and
summarize what changed, any new env vars, and remaining manual steps. Keep commits focused.
