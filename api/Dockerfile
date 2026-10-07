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
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]

# The worker runs analyzers on untrusted source, so it gets Semgrep and nothing else extra.
FROM base AS worker
USER root
RUN uv pip install --python /app/.venv/bin/python semgrep==1.179.0
USER kinetix
CMD ["celery", "-A", "app.worker", "worker", "--loglevel=INFO", "--concurrency=2"]
