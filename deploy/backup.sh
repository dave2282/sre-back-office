#!/usr/bin/env bash
# Nightly backup of the database + uploaded files. Add to cron:  0 2 * * * /opt/agent-portal/deploy/backup.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DATA_DIR="${DATA_DIR:-./data}"
DEST="${BACKUP_DIR:-./backups}"
mkdir -p "$DEST"
STAMP=$(date +%F)
sqlite3 "$DATA_DIR/app.db" ".backup '$DEST/app-$STAMP.db'"   # consistent copy while running
tar -czf "$DEST/uploads-$STAMP.tgz" -C "$DATA_DIR" uploads
find "$DEST" -type f -mtime +30 -delete                      # keep 30 days
