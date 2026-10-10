"""The plan catalog: what each tier costs and how many AI searches it includes.

This is the single source of truth the API serves to the pricing page and the billing page.
Quotas come from settings (env-configurable); prices are placeholders until Stripe is wired.

TODO(billing): finalize prices, then create matching Stripe Products/Prices and put their IDs
in ``stripe_price_*``. Once Stripe is live its Price objects are authoritative for what is
charged; keep these display amounts in sync with them.

Margin check behind the placeholders (default model claude-sonnet-5-5 at $2 / $10 per million
input / output tokens): one search sends roughly 4-6k input tokens and returns ~1-2k output
tokens including reasoning, so it costs about $0.02-0.03, and ~$0.05 in a bad case. Pro's 300
searches a month therefore cost ~$6-9 typical and ~$15 at worst against a $29 price — a 2x+
margin even when every search is expensive, before payment fees. The free allowance (10 one-time
searches) costs well under $0.50 per signup. Re-run this math if you change the model.
"""

from dataclasses import dataclass

from app.config import get_settings


@dataclass(frozen=True)
class Plan:
    key: str
    name: str
    tagline: str
    # Display prices in USD. None means "talk to us" (custom contract).
    price_monthly_usd: int | None
    price_yearly_usd: int | None
    ai_searches: int
    # "lifetime": a one-time allowance that never resets. "month": resets each billing period.
    ai_period: str
    self_serve: bool
    stripe_price_monthly: str | None = None
    stripe_price_yearly: str | None = None


# TODO(billing): placeholder prices — finalize before enabling billing.
PRO_PRICE_MONTHLY_USD = 29
PRO_PRICE_YEARLY_USD = 290  # two months free


def catalog() -> dict[str, Plan]:
    s = get_settings()
    return {
        "free": Plan(
            key="free",
            name="Community",
            tagline="Run the full workflow on your own repositories.",
            price_monthly_usd=0,
            price_yearly_usd=0,
            ai_searches=s.ai_free_searches,
            ai_period="lifetime",
            self_serve=True,
        ),
        "pro": Plan(
            key="pro",
            name="Pro",
            tagline="For independent researchers and consultants.",
            price_monthly_usd=PRO_PRICE_MONTHLY_USD,
            price_yearly_usd=PRO_PRICE_YEARLY_USD,
            ai_searches=s.ai_pro_monthly_searches,
            ai_period="month",
            self_serve=True,
        ),
        "team": Plan(
            key="team",
            name="Custom",
            tagline="For security teams, MSSPs and research groups.",
            price_monthly_usd=None,
            price_yearly_usd=None,
            ai_searches=s.ai_team_monthly_searches,
            ai_period="month",
            self_serve=False,
        ),
    }


def get_plan(key: str) -> Plan:
    plans = catalog()
    return plans.get(key, plans["free"])
