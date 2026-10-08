#!/bin/sh
# Backs up the database and the evidence/source store into ./backups, keeping 14 days.
# Run from the repository root, e.g. daily from cron:
#   15 3 * * * cd /opt/kinetix && sh scripts/backup.sh >> backups/backup.log 2>&1
set -eu

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DEST=backups
mkdir -p "$DEST"
umask 077

# A consistent snapshot of the database, as the owner role, compressed.
$COMPOSE exec -T postgres pg_dump -U kinetix --format=custom kinetix > "$DEST/db-$STAMP.dump"

# Evidence and source snapshots are content-addressed files: a plain archive is enough.
$COMPOSE run --rm --no-deps -T --entrypoint tar -v "$PWD/$DEST:/backup" api \
  -czf "/backup/storage-$STAMP.tar.gz" -C /data .

find "$DEST" -name 'db-*.dump' -mtime +14 -delete
find "$DEST" -name 'storage-*.tar.gz' -mtime +14 -delete
echo "Backed up to $DEST/db-$STAMP.dump and $DEST/storage-$STAMP.tar.gz"
