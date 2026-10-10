#!/usr/bin/env bash
# Interactive setup on the server: your domain and keys go into /opt/kinetix/.env here,
# never anywhere else. Safe to run again later to change keys.
set -euo pipefail

DIR=${KINETIX_DIR:-/opt/kinetix}
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)
bold() { printf '\033[1m%s\033[0m\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "Run it with sudo: sudo kinetix-setup"; exit 1
fi
cd "$DIR"

if [ ! -f .bootstrap-done ]; then
  bold "The server is still installing KinetixZero (this takes about 15-20 minutes)."
  echo "Waiting for it to finish... (Ctrl+C to stop waiting; progress: /var/log/kinetix-bootstrap.log)"
  until [ -f .bootstrap-done ]; do sleep 10; printf '.'; done; echo
fi

# Set KEY=value in .env, replacing any existing line. Values are written literally.
set_env() {
  python3 - "$1" "$2" <<'PY'
import sys, pathlib
key, value = sys.argv[1], sys.argv[2]
p = pathlib.Path(".env")
lines = p.read_text().splitlines()
out, done = [], False
for line in lines:
    if line.split("=", 1)[0] == key:
        out.append(f"{key}={value}"); done = True
    else:
        out.append(line)
if not done:
    out.append(f"{key}={value}")
p.write_text("\n".join(out) + "\n")
PY
}
get_env() { grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2- || true; }

PUBLIC_IP=$(curl -fsS --max-time 5 https://checkip.amazonaws.com || true)

bold "1. Your web address"
CURRENT=$(get_env KINETIX_SITE_ADDRESS)
echo "The name people will open, like kinetix-fahim.duckdns.org (no https://)."
read -r -p "Domain${CURRENT:+ [$CURRENT]}: " DOMAIN
DOMAIN=${DOMAIN:-$CURRENT}
DOMAIN=${DOMAIN#https://}; DOMAIN=${DOMAIN#http://}; DOMAIN=${DOMAIN%%/*}
if ! [[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
  echo "That doesn't look like a domain name."; exit 1
fi
RESOLVED=$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)
if [ -n "$PUBLIC_IP" ] && [ "$RESOLVED" != "$PUBLIC_IP" ]; then
  echo
  echo "Heads up: $DOMAIN points to '${RESOLVED:-nothing}', but this server is $PUBLIC_IP."
  echo "HTTPS can't be set up until they match. Fix it in DuckDNS (or your DNS), then rerun."
  read -r -p "Continue anyway? [y/N] " ok; [ "${ok,,}" = y ] || exit 1
fi

if [ ! -f .env ]; then
  sh scripts/setup-env.sh "$DOMAIN" >/dev/null
else
  set_env KINETIX_SITE_ADDRESS "$DOMAIN"
  set_env KINETIX_APP_URL "https://$DOMAIN"
fi

bold "2. AI assistance (runs on your server's key; each user gets a metered free allowance)"
echo "  1) Claude API  — recommended, billed to your Anthropic account (console.anthropic.com)"
echo "  2) Gemini API  — free key from aistudio.google.com/apikey"
echo "  3) Skip — AI features report \"not configured\" until you add a key"
read -r -p "Choose a provider [1/2/3]: " AICHOICE
case "$AICHOICE" in
  1)
    read -r -s -p "Anthropic API key (sk-ant-…; typing is hidden): " CLAUDE; echo
    if [ -n "$CLAUDE" ]; then
      set_env KINETIX_AI_PROVIDER anthropic
      set_env KINETIX_AI_API_KEY "$CLAUDE"
      read -r -p "Model [claude-sonnet-5-5]: " AIMODEL
      set_env KINETIX_AI_MODEL "${AIMODEL:-claude-sonnet-5-5}"
      echo "Saved. Requests bill to your Anthropic account; each user's searches are metered."
      echo "Workspace admins turn AI on under AI assistance."
    fi
    ;;
  2)
    read -r -s -p "Gemini API key (Enter to skip; typing is hidden): " GEMINI; echo
    if [ -n "$GEMINI" ]; then
      set_env KINETIX_AI_PROVIDER gemini
      set_env KINETIX_AI_API_KEY "$GEMINI"
      echo "Saved. Turn it on in KinetixZero under AI assistance."
    fi
    ;;
  *)
    set_env KINETIX_AI_PROVIDER none
    echo "Skipped. Set ANTHROPIC_API_KEY in .env later to turn AI on."
    ;;
esac

bold "3. Email with Resend (optional, free key from resend.com)"
echo "Without your own domain, Resend only delivers to the email you signed up to Resend with."
read -r -s -p "Resend API key (Enter to skip; typing is hidden): " RESEND; echo
if [ -n "$RESEND" ]; then
  set_env KINETIX_EMAIL_BACKEND resend
  set_env KINETIX_RESEND_API_KEY "$RESEND"
  FROM_DEFAULT="KinetixZero <onboarding@resend.dev>"
  read -r -p "Send from [$FROM_DEFAULT]: " FROM
  set_env KINETIX_EMAIL_FROM "${FROM:-$FROM_DEFAULT}"
elif [ -z "$(get_env KINETIX_RESEND_API_KEY)" ]; then
  set_env KINETIX_EMAIL_BACKEND console
fi

bold "4. Public demo workspace"
echo "Adds the OWASP Juice Shop demo with a shared login on the sign-in page. Visitors can edit it."
read -r -p "Turn on the demo? [y/N] " DEMO
set_env KINETIX_DEMO "$([ "${DEMO,,}" = y ] && echo 1 || echo 0)"

chmod 600 .env
bold "Starting KinetixZero..."
"${COMPOSE[@]}" up -d --build

printf 'Waiting for HTTPS on https://%s ' "$DOMAIN"
for _ in $(seq 1 60); do
  if curl -fsS --max-time 5 "https://$DOMAIN/api/health" >/dev/null 2>&1; then
    echo; bold "KinetixZero is live: https://$DOMAIN"
    echo "Create your account at https://$DOMAIN/register, then turn on two-step verification"
    echo "under Security. Useful commands: sudo kinetix status | logs | update | backup"
    exit 0
  fi
  printf '.'; sleep 5
done
echo
echo "KinetixZero started, but https://$DOMAIN isn't answering yet."
echo "Usually that's DNS or the firewall: check that the domain points to $PUBLIC_IP and"
echo "that ports 80 and 443 are open. Then: sudo kinetix logs edge"
exit 1
