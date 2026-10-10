# Billing and AI quotas

KinetixZero meters AI per user and is structured so Stripe can be dropped in without touching
the quota logic. This document describes what exists today and the exact steps to wire Stripe.

## What exists today

| Piece | Where | What it does |
| --- | --- | --- |
| Plan catalog | `api/app/billing/plans.py` | Free ("Community"), Pro and Custom ("team") tiers: display prices, Agentic Triage quotas, period (`lifetime` or `month`), and empty `stripe_price_*` slots. Single source of truth for the pricing page, the app and the gate. |
| Per-user plan row | `user_plans` table (`api/app/models/billing.py`, migration `7e3f9b2c4d18`) | `plan`, `status`, `ai_searches_used`, `period_start`, `period_end`, `stripe_customer_id`, `stripe_subscription_id`. Isolated per user by row-level security on `app.user_id`. |
| Quota gate | `api/app/billing/entitlements.py` | `consume()` charges one Agentic Triage run inside the request's transaction (row-locked, so no overspend; rolled back if the AI call fails). `usage()` is the read-only view. `apply_subscription()` is the hook a Stripe webhook calls. |
| API | `api/app/routers/billing.py` | `GET /api/v1/billing/plans` (public catalog), `GET /api/v1/billing` (the user's usage + catalog). AI endpoints return `402 ai_limit_reached` when the allowance is used up. |
| UI | `web/src/components/usage.tsx`, `web/src/app/[org]/(workspace)/billing/page.tsx`, `web/src/components/marketing/pricing.tsx` | Sidebar meter, Upgrade dialog, Plan & usage page ("billing coming soon"), pricing section. |

**What counts as a run:** one AI model call — an Analyze, an Ask, a Draft, or one finding
reviewed by a triage pass (a triage batch is capped at the runs the user has left). A call
that fails (provider error, overload, the server spend cap) is not charged.

**Rules:** the free allowance is one-time and never resets. A paid plan grants its quota only
while `status` is `active` or `trialing`; otherwise the user falls back to the free allowance.
Paid quotas reset when a new period starts — following `period_end` when Stripe has set it,
else calendar months from `period_start`.

**Owner accounts:** emails in `KINETIX_OWNER_EMAILS` are sponsored: they, and every member of a
workspace one of them created (and still owns), are never charged or limited (no quota, no hourly
AI rate limit, triage batches uncapped). Sponsorship follows `organizations.created_by_id`, not the
owner role: other owners of a workspace can grant that role, so being made an owner of someone
else's workspace sponsors nobody. Their runs are still audited
(`quota: {plan: "owner", unlimited: true}`), and the server-wide monthly token budget still applies.
Stripe never sees these accounts. Sign-up doesn't verify email, so register an owner address before
listing it; the API logs a warning at startup while a listed address has no account.

### Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `KINETIX_AI_FREE_SEARCHES` | `10` | One-time free allowance per user |
| `KINETIX_AI_PRO_MONTHLY_SEARCHES` | `300` | Pro allowance per billing period |
| `KINETIX_AI_TEAM_MONTHLY_SEARCHES` | `2000` | Custom/team allowance per period |
| `KINETIX_OWNER_EMAILS` | unset | Owner accounts (comma-separated); they and their workspaces' members are unlimited |
| `KINETIX_BILLING_ENABLED` | `false` | Turns the Upgrade buttons from "Coming soon" into live actions |
| `KINETIX_AI_MONTHLY_TOKEN_BUDGET` | unset | Server-wide token backstop, independent of plans |

### Pricing placeholders

`PRO_PRICE_MONTHLY_USD = 29` and `PRO_PRICE_YEARLY_USD = 290` in `plans.py` are placeholders
(marked `TODO(billing)`). The margin math is in that file's docstring: with the default model
(`claude-haiku-5-5`, $0.10 / $0.50 per million input / output tokens) a run costs roughly
$0.001–0.002 (under $1 a month for Pro's 300 runs). On `claude-sonnet-5-5` ($2 / $10) a run is
$0.02–0.03 and about $0.05 in a bad case, so Pro's 300 runs cost ~$6–9 typical and ~$15 at
worst against $29. Re-run the math if you change the model, effort, or quotas.

## Wiring Stripe

1. **Products and prices.** In the Stripe dashboard create a "KinetixZero Pro" product with a
   monthly and a yearly recurring price. Finalize the amounts in `plans.py` to match, and put the
   Stripe price IDs in the plan's `stripe_price_monthly` / `stripe_price_yearly` (read them from
   new settings such as `KINETIX_STRIPE_PRICE_PRO_MONTHLY`, so IDs differ per environment).

2. **Secrets.** Add `stripe_secret_key` and `stripe_webhook_secret` to `api/app/config.py`
   (`KINETIX_STRIPE_SECRET_KEY`, `KINETIX_STRIPE_WEBHOOK_SECRET`), pass them through
   `docker-compose.yml` like the other `KINETIX_*` variables, and add the `stripe` package to
   `api/pyproject.toml`. Never expose either to the browser.

3. **Checkout endpoint.** Add `POST /api/v1/billing/checkout` (`{plan, interval}`) that creates a
   Checkout Session in `subscription` mode for the plan's price, with
   `client_reference_id = user.id`, `subscription_data.metadata.user_id = user.id`, the user's
   email, and success/cancel URLs back to `/{org}/billing`. Reuse `stripe_customer_id` when the
   row already has one. Return the session URL; in `billing/page.tsx`, make the Upgrade button
   (currently disabled unless `billing_enabled`) POST to it and redirect to the URL.

4. **Webhook endpoint.** Add `POST /api/v1/billing/webhook`:
   - Exempt exactly this path from the CSRF/Origin check in `api/app/main.py` — Stripe can't send
     the CSRF token. Authenticate it instead with
     `stripe.Webhook.construct_event(raw_body, stripe-signature header, webhook secret)` and
     reject anything that fails verification.
   - Handle `checkout.session.completed`, `customer.subscription.created|updated|deleted`:
     map the subscription's price ID to a plan key, take `user_id` from the metadata, and call
     `entitlements.apply_subscription(db, user_id, plan=..., status=subscription.status,
     period_start=..., period_end=..., stripe_customer_id=..., stripe_subscription_id=...)`,
     then commit. `apply_subscription` binds `app.user_id` itself, so row-level security holds.
     On `deleted`, set `plan="free"`.
   - Record an audit event for each plan change, and make the handler idempotent (Stripe
     retries); a small `stripe_events(id primary key)` table is the simplest guard.

5. **Customer portal.** Add `POST /api/v1/billing/portal` that opens a Billing Portal session for
   `stripe_customer_id`, so users can change plans, update cards and cancel. Link it from the
   Plan & usage page.

6. **Turn it on.** Set `KINETIX_BILLING_ENABLED=true`. Test locally with
   `stripe listen --forward-to localhost:8000/api/v1/billing/webhook` and Stripe's test cards
   before switching to live keys.

The Custom tier stays sales-led: set `plan="team"` for a user with `apply_subscription` (for
example from an admin script) once a contract is in place.
