#!/usr/bin/env bash
# First-boot setup for a fresh Ubuntu 24.04 server (Amazon Lightsail, EC2, or any VPS).
# Paste this as the launch script / user data, or run it as root:
#   curl -fsSL https://raw.githubusercontent.com/Analyst47/kinetix/main/scripts/server-bootstrap.sh | sudo bash
#
# It installs Docker, adds swap (small servers need it to build), fetches KinetixZero into
# /opt/kinetix, builds the images, schedules daily backups and installs two commands:
#   sudo kinetix-setup   asks for your domain and keys, then starts KinetixZero
#   sudo kinetix         status | logs | update | backup | restart
# It never asks for or stores secrets; kinetix-setup does that on the server itself.
set -euo pipefail

LOG=/var/log/kinetix-bootstrap.log
exec > >(tee -a "$LOG") 2>&1
echo "== KinetixZero bootstrap started $(date -u)"

REPO="${KINETIX_REPO:-https://github.com/Analyst47/kinetix.git}"
DIR=/opt/kinetix
export DEBIAN_FRONTEND=noninteractive

# Swap: a 2 GB server can't build the web app without it.
if ! swapon --show | grep -q .; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10
  echo 'vm.swappiness=10' > /etc/sysctl.d/90-kinetix-swap.conf
fi

apt-get update -y
apt-get install -y ca-certificates curl git python3 unattended-upgrades

if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull --ff-only
else
  git clone --depth 1 "$REPO" "$DIR"
fi
cd "$DIR"

install -m 0755 scripts/kinetix-setup.sh /usr/local/bin/kinetix-setup
install -m 0755 scripts/kinetix.sh /usr/local/bin/kinetix

# Build now, so kinetix-setup only has to start things. Base config: no secrets needed.
docker compose pull postgres redis edge
docker compose build

# Daily backups at 03:15 UTC, kept 14 days (scripts/backup.sh).
cat > /etc/cron.d/kinetix-backup <<CRON
15 3 * * * root cd $DIR && [ -f .env ] && mkdir -p backups && sh scripts/backup.sh >> $DIR/backups/backup.log 2>&1
CRON

touch "$DIR/.bootstrap-done"
echo "== KinetixZero bootstrap finished $(date -u). Next: sudo kinetix-setup"
