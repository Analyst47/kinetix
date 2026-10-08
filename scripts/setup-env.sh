#!/bin/sh
# Creates .env for a production deployment, with strong random secrets.
# Never overwrites an existing .env. Run from the repository root:
#   sh scripts/setup-env.sh kinetix.example.com
set -eu

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  echo "Usage: sh scripts/setup-env.sh <domain>" >&2
  echo "  e.g. sh scripts/setup-env.sh kinetix.example.com" >&2
  exit 2
fi
case "$DOMAIN" in
  http://*|https://*|*/*) echo "Give the bare domain, like kinetix.example.com" >&2; exit 2 ;;
esac
if [ -e .env ]; then
  echo ".env already exists; leaving it alone. Edit it by hand, or move it away first." >&2
  exit 1
fi

rand() { head -c "$1" /dev/urandom | base64 | tr -d '\n/+=' | cut -c1-"$2"; }

umask 077
cat > .env <<ENV
# Kinetix production settings. Keep this file private: it holds your secrets.
# Created $(date -u +%Y-%m-%dT%H:%M:%SZ) by scripts/setup-env.sh

KINETIX_SITE_ADDRESS=$DOMAIN
KINETIX_APP_URL=https://$DOMAIN

# Random secrets. Changing KINETIX_SECRET_KEY later breaks existing two-step verification.
KINETIX_SECRET_KEY=$(rand 64 64)
POSTGRES_PASSWORD=$(rand 48 40)
KINETIX_DB_APP_PASSWORD=$(rand 48 40)

# Public demo workspace with a shared login (1 = on). Visitors can change its data.
KINETIX_DEMO=0

# Email (Resend). Until set, emails are dropped in production.
KINETIX_EMAIL_BACKEND=resend
KINETIX_RESEND_API_KEY=
KINETIX_EMAIL_FROM=Kinetix <security@$DOMAIN>

# AI assistance (optional): gemini | anthropic | openai_compatible | none
KINETIX_AI_PROVIDER=none
KINETIX_AI_API_KEY=
KINETIX_AI_GEMINI_TIER=free

# Behind Cloudflare Tunnel instead of open ports: set both, and start with --profile tunnel.
KINETIX_EDGE_TRUST=none
CLOUDFLARE_TUNNEL_TOKEN=
ENV

echo "Created .env for https://$DOMAIN (permissions 600)."
echo "Next: add your Resend and AI keys to .env, then follow docs/DEPLOY.md."
