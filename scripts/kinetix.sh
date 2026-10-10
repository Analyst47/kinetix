#!/usr/bin/env bash
# Day-to-day commands for a KinetixZero server.
set -euo pipefail
cd /opt/kinetix
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)
case "${1:-status}" in
  status)  "${COMPOSE[@]}" ps ;;
  logs)    shift; "${COMPOSE[@]}" logs -f --tail 200 "$@" ;;
  restart) "${COMPOSE[@]}" restart ;;
  backup)  sh scripts/backup.sh ;;
  update)
    git pull --ff-only
    install -m 0755 scripts/kinetix-setup.sh /usr/local/bin/kinetix-setup
    install -m 0755 scripts/kinetix.sh /usr/local/bin/kinetix
    "${COMPOSE[@]}" up -d --build
    docker image prune -f >/dev/null
    ;;
  *) echo "Usage: kinetix status | logs [service] | update | backup | restart"; exit 2 ;;
esac
