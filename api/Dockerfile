# syntax=docker/dockerfile:1.7
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY --from=ghcr.io/astral-sh/uv:0.8 /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY . .
RUN useradd --system --uid 10001 --home /app kinetix \
 && mkdir -p /data && chown kinetix /data
ENV PATH="/app/.venv/bin:$PATH" KINETIX_STORAGE_DIR=/data
USER kinetix

FROM base AS api
EXPOSE 8000
# No --proxy-headers: the client address comes from app/security/clientip.py, which trusts
# X-Forwarded-For only from KINETIX_TRUSTED_PROXIES.
HEALTHCHECK --interval=5s --timeout=3s --retries=20 \
  CMD ["python", "-c", "import urllib.request,sys; sys.exit(urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2).status != 200)"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-server-header"]

# The worker runs analyzers on untrusted source, so it gets git (for repository targets) and
# Semgrep, and nothing else extra.
FROM base AS worker
USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && uv pip install --python /app/.venv/bin/python semgrep==1.179.0
USER kinetix
CMD ["celery", "-A", "app.worker", "worker", "--loglevel=INFO", "--concurrency=2"]
