#!/bin/sh
# Kinetix one-command install, for a computer with Docker, published through Cloudflare
# Tunnel (no open ports, no router changes). Paste into Terminal:
#
#   curl -fsSL https://raw.githubusercontent.com/Analyst47/kinetix/main/scripts/quickstart.sh | sh
#
# Run it again any time to update Kinetix; your settings and data are kept.
# Add or change the email and AI keys later with:
#
#   sh ~/kinetix/scripts/quickstart.sh --keys
#
# Non-interactive use (CI): set KINETIX_DOMAIN and CLOUDFLARE_TUNNEL_TOKEN (and optionally
# KINETIX_RESEND_API_KEY, KINETIX_AI_API_KEY); KINETIX_SRC=<dir> installs from a local copy.
set -eu

DIR="${KINETIX_HOME:-$HOME/kinetix}"
REPO_TARBALL="https://codeload.github.com/Analyst47/kinetix/tar.gz/refs/heads/main"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

# Reads from the keyboard even when this script itself arrives through a pipe.
ask() {  # ask <prompt> <var> [secret]
  if [ -r /dev/tty ]; then
    printf '%s' "$1" > /dev/tty
    if [ "${3:-}" = secret ]; then stty -echo < /dev/tty; fi
    IFS= read -r _answer < /dev/tty || _answer=""
    if [ "${3:-}" = secret ]; then stty echo < /dev/tty; printf '\n' > /dev/tty; fi
  else
    _answer=""
  fi
  eval "$2=\$_answer"
}

set_env() {  # set_env KEY VALUE: replace or append one line of .env, portably
  _tmp="$DIR/.env.tmp"
  awk -v k="$1" -v v="$2" 'BEGIN{done=0} $0 ~ "^"k"=" {print k"="v; done=1; next} {print} END{if(!done) print k"="v}' \
    "$DIR/.env" > "$_tmp"
  chmod 600 "$_tmp" && mv "$_tmp" "$DIR/.env"
}

rand() { head -c "$1" /dev/urandom | base64 | tr -d '\n/+=' | cut -c1-"$2"; }

compose() {
  (cd "$DIR" && docker compose -f docker-compose.yml -f docker-compose.prod.yml \
    -f docker-compose.tunnel.yml "$@")
}

ask_keys() {
  say "Email (optional). Paste your Resend API key (starts with re_), or press Enter to skip:"
  resend=""
  ask "> " resend secret
  if [ -n "${resend:-}" ]; then
    case "$resend" in re_*) set_env KINETIX_RESEND_API_KEY "$resend" ;; *) echo "That doesn't look like a Resend key; skipped." ;; esac
  fi
  say "AI (optional). Paste your Gemini API key (starts with AIza), or press Enter to skip:"
  gemini=""
  ask "> " gemini secret
  if [ -n "${gemini:-}" ]; then
    case "$gemini" in
      AIza*) set_env KINETIX_AI_PROVIDER gemini; set_env KINETIX_AI_API_KEY "$gemini" ;;
      *) echo "That doesn't look like a Gemini key; skipped." ;;
    esac
  fi
}

# ── 1. Docker ────────────────────────────────────────────────────────────────
command -v docker > /dev/null 2>&1 || fail "Docker isn't installed. Install Docker Desktop from https://www.docker.com/products/docker-desktop/, open it once, then run this again."
docker info > /dev/null 2>&1 || fail "Docker isn't running. Open Docker Desktop, wait until it says it's running, then run this again."
docker compose version > /dev/null 2>&1 || fail "Docker Compose is missing. Update Docker Desktop, then run this again."

if [ "${1:-}" = "--keys" ]; then
  [ -f "$DIR/.env" ] || fail "Kinetix isn't installed yet. Run the install command first."
  ask_keys
  say "Restarting with the new keys..."
  compose up -d
  say "Done."
  exit 0
fi

# ── 2. Code ──────────────────────────────────────────────────────────────────
say "Getting the latest Kinetix into $DIR ..."
mkdir -p "$DIR"
if [ -n "${KINETIX_SRC:-}" ]; then
  (cd "$KINETIX_SRC" && tar --exclude ./.env --exclude ./backups --exclude ./.git \
    --exclude node_modules --exclude .venv --exclude .next -cf - .) | (cd "$DIR" && tar -xf -)
else
  _tgz="$(mktemp)"
  curl -fsSL "$REPO_TARBALL" -o "$_tgz" || fail "Couldn't download Kinetix. Check your internet connection."
  # The archive has one top-level folder; strip it. .env and backups/ are never in it.
  tar -xzf "$_tgz" -C "$DIR" --strip-components 1
  rm -f "$_tgz"
fi

# ── 3. Settings (first run only) ─────────────────────────────────────────────
if [ ! -f "$DIR/.env" ]; then
  domain="${KINETIX_DOMAIN:-}"
  if [ -z "$domain" ]; then
    say "Your domain for Kinetix (for example kinetix.example.com or example.com):"
    ask "> " domain
  fi
  domain="$(printf '%s' "$domain" | tr '[:upper:]' '[:lower:]' | sed -e 's#^https*://##' -e 's#/.*$##')"
  case "$domain" in *.*) ;; *) fail "That isn't a domain. Run this again and enter something like example.com." ;; esac

  token="${CLOUDFLARE_TUNNEL_TOKEN:-}"
  if [ -z "$token" ]; then
    say "Paste the install command (or just the token) from your Cloudflare tunnel page, then press Enter."
    echo "It's hidden as you paste. It starts with 'cloudflared' or 'eyJ'."
    pasted=""
    ask "> " pasted secret
    token="$(printf '%s' "$pasted" | tr ' ' '\n' | grep -E '^eyJ[A-Za-z0-9_=-]+' | head -n 1 || true)"
  fi
  case "$token" in eyJ*) ;; *) fail "Couldn't find a tunnel token in that. Copy the whole install command from Cloudflare and run this again." ;; esac

  umask 077
  cat > "$DIR/.env" <<ENV
# Kinetix settings. Private: this file holds your secrets. Created by quickstart.sh.
KINETIX_APP_URL=https://$domain
KINETIX_SITE_ADDRESS=:80
KINETIX_EDGE_TRUST=cloudflared
CLOUDFLARE_TUNNEL_TOKEN=$token

KINETIX_SECRET_KEY=$(rand 64 64)
POSTGRES_PASSWORD=$(rand 48 40)
KINETIX_DB_APP_PASSWORD=$(rand 48 40)

KINETIX_DEMO=0
KINETIX_EMAIL_BACKEND=resend
KINETIX_RESEND_API_KEY=
KINETIX_EMAIL_FROM=Kinetix <security@$domain>
KINETIX_AI_PROVIDER=none
KINETIX_AI_API_KEY=
KINETIX_AI_GEMINI_TIER=free
ENV
  if [ -n "${KINETIX_RESEND_API_KEY:-}" ]; then set_env KINETIX_RESEND_API_KEY "$KINETIX_RESEND_API_KEY"; fi
  if [ -n "${KINETIX_AI_API_KEY:-}" ]; then set_env KINETIX_AI_PROVIDER gemini; set_env KINETIX_AI_API_KEY "$KINETIX_AI_API_KEY"; fi
  if [ -z "${KINETIX_DOMAIN:-}" ]; then ask_keys; fi
else
  say "Keeping your existing settings in $DIR/.env."
fi

# ── 4. Start ─────────────────────────────────────────────────────────────────
say "Building and starting Kinetix. The first time takes about 5 to 10 minutes..."
compose up -d --build --remove-orphans

say "Waiting for Kinetix to be ready..."
i=0
until compose exec -T edge wget -qO- http://127.0.0.1/api/health 2> /dev/null | grep -q '"ok"'; do
  i=$((i + 1))
  [ "$i" -gt 120 ] && fail "Kinetix didn't come up. See what went wrong with: cd $DIR && docker compose logs --tail 50"
  sleep 5
done

url="$(grep '^KINETIX_APP_URL=' "$DIR/.env" | cut -d= -f2-)"
say "Kinetix is running."
cat <<DONE
  Open:      $url/register   (create your account, then turn on two-step verification)
  Update:    run the same install command again
  Keys:      sh $DIR/scripts/quickstart.sh --keys
  Stop:      cd $DIR && docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.tunnel.yml down
  Your data stays in Docker volumes; your settings are in $DIR/.env (keep it private).
DONE
