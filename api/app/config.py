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
    database_url: str = "postgresql+psycopg://kinetix:kinetix@localhost:5432/kinetix"
    redis_url: str = "redis://localhost:6379/0"

    # Where evidence and ingested archives are stored. Content-addressed by SHA-256.
    storage_dir: Path = Path("./var/storage")

    session_cookie: str = "kx_session"
    csrf_cookie: str = "kx_csrf"
    session_ttl_hours: int = 12
    # Secure cookies are on everywhere except local development over plain HTTP.
    cookie_secure: bool = False

    # Evidence limits.
    evidence_max_bytes: int = 25 * 1024 * 1024

    # Archive ingestion limits (defense against zip bombs and resource exhaustion).
    archive_max_bytes: int = 200 * 1024 * 1024
    archive_max_files: int = 50_000
    archive_max_unpacked_bytes: int = 1024 * 1024 * 1024
    archive_max_ratio: int = 100

    osv_api_url: str = "https://api.osv.dev/v1"

    # AI assistance. "none" turns it off; "anthropic" uses the Claude API; "openai_compatible"
    # works with any OpenAI-style endpoint, including a local Ollama server (free);
    # "mock" returns canned output for local development and tests.
    ai_provider: str = "none"
    ai_api_key: str | None = None
    ai_model: str = "claude-sonnet-5-5"
    ai_base_url: str | None = None
    ai_timeout_seconds: float = 60.0
    ai_max_context_lines: int = 60

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
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
