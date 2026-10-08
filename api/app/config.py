import os
from functools import lru_cache
from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, read from environment variables prefixed KINETIX_."""

    model_config = SettingsConfigDict(env_prefix="KINETIX_", env_file=".env", extra="ignore")

    env: str = "development"
    # Encrypts MFA secrets at rest. Must be set to a long random value outside development.
    secret_key: str = "dev-only-insecure-secret-key-change-me"  # noqa: S105 - dev default, rejected elsewhere
    app_url: str = "http://localhost:3000"
    # The API and worker connect as a restricted role that row-level security applies to.
    database_url: str = "postgresql+psycopg://kinetix_app:kinetix_app@localhost:5432/kinetix"
    # Migrations connect as the schema owner. Empty means database_url (single-role setups).
    migration_database_url: str | None = None
    # The role migrations grant table access to. It must not be a superuser or have BYPASSRLS.
    db_app_role: str = "kinetix_app"
    redis_url: str = "redis://localhost:6379/0"
    # "redis" shares rate limits across API processes; "memory" keeps them per process.
    rate_limit_backend: str = "memory"
    # Reverse proxies whose X-Forwarded-For is believed (CIDRs). Empty: use the socket peer.
    trusted_proxies: list[str] = Field(default_factory=list)
    client_ip_header: str = "x-forwarded-for"

    # Where evidence and ingested archives are stored. Content-addressed by SHA-256.
    storage_dir: Path = Path("./var/storage")

    session_cookie: str = "kx_session"
    csrf_cookie: str = "kx_csrf"
    session_ttl_hours: int = 12
    # Secure cookies: off for local development over plain HTTP, always on in production.
    cookie_secure: bool = False

    # Evidence limits.
    evidence_max_bytes: int = 25 * 1024 * 1024

    # Archive ingestion limits (defense against zip bombs and resource exhaustion).
    archive_max_bytes: int = 200 * 1024 * 1024
    archive_max_files: int = 50_000
    archive_max_unpacked_bytes: int = 1024 * 1024 * 1024
    archive_max_ratio: int = 100

    osv_api_url: str = "https://api.osv.dev/v1"

    # AI assistance. "none" turns it off; "anthropic" uses the Claude API; "gemini" uses the
    # Gemini API; "openai_compatible" works with any OpenAI-style endpoint, including a local
    # Ollama server (free); "mock" returns canned output for local development and tests.
    ai_provider: str = "none"
    ai_api_key: str | None = None
    # The built-in ("managed") AI serves every workspace from the server's own key above and
    # bills the operator. It stays OFF until billing is in place; users bring their own key.
    ai_managed_enabled: bool = False
    # Empty means the provider's default model.
    ai_model: str | None = None
    ai_base_url: str | None = None
    # Gemini's free tier lets Google use prompts to improve its products, with human review.
    # Set to "paid" only when the key's project has billing enabled.
    ai_gemini_tier: str = "free"
    ai_timeout_seconds: float = 60.0
    ai_max_context_lines: int = 60
    # Cap on tokens the model may generate per request.
    ai_max_output_tokens: int = 2048
    # Transient-error retries (429/500/503/529) with exponential backoff, per request.
    ai_max_retries: int = 4
    # Optional spend safeguard: refuse AI calls once this many total tokens (input + output)
    # have been used in the current UTC month. None disables the cap. Tracked in Redis.
    ai_monthly_token_budget: int | None = None
    # Which workspaces may use the server's AI key (by workspace slug). Empty = every
    # workspace may (single-tenant default). Set this on a public deployment so only your
    # own workspaces can spend your API credits; all others see AI as unavailable.
    ai_allowed_orgs: list[str] = Field(default_factory=list)

    # Outgoing email: "console" prints messages (development), "resend" sends through Resend
    # (free tier: 3,000 a month), "none" drops them.
    email_backend: str = "console"
    email_from: str = "Kinetix <no-reply@localhost>"
    resend_api_key: str | None = None
    password_reset_minutes: int = 30
    # On a public demo, this shared account can't change its password, request resets or turn
    # on two-step verification, so no visitor can lock the others out.
    demo_account_email: str | None = None

    # "celery" hands scans to the worker; "inline" runs them in-process (local dev, tests).
    scan_mode: str = "inline"

    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])

    @property
    def is_production(self) -> bool:
        return self.env == "production"

    @model_validator(mode="after")
    def _require_secret_outside_dev(self) -> "Settings":
        if self.env not in ("development", "test") and (
            self.secret_key.startswith("dev-only") or len(self.secret_key) < 32
        ):
            raise ValueError("KINETIX_SECRET_KEY must be set to at least 32 random characters.")
        if self.env == "production":
            # Never send session cookies over plain HTTP in production, whatever was configured.
            self.cookie_secure = True
        # Accept the conventional ANTHROPIC_API_KEY as a fallback when using the Claude API,
        # so operators can reuse their existing Anthropic environment variable unchanged.
        if self.ai_provider == "anthropic" and not self.ai_api_key:
            self.ai_api_key = os.environ.get("ANTHROPIC_API_KEY") or None
        if self.ai_provider == "anthropic" and not self.ai_model:
            self.ai_model = os.environ.get("ANTHROPIC_MODEL") or None
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
