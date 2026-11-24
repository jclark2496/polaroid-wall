#!/bin/bash
# Hourly local backup for Polaroid Wall
# Snapshots: SQLite DB (consistent via .backup) + uploads directory
# Retention: keeps last 48 backups (~2 days at hourly cadence)

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/root/polaroid-wall-backups}"
APP_DIR="${APP_DIR:-/opt/polaroid-wall}"
WEB_ROOT="${WEB_ROOT:-/var/www/polaroid-wall}"
TIMESTAMP=$(date -u +%Y%m%d-%H%M%S)
RETENTION=48

mkdir -p "$BACKUP_DIR"

# 1. SQLite hot backup (uses .backup command for consistency, no service interruption)
sqlite3 "$APP_DIR/data/photos.db" ".backup '$BACKUP_DIR/photos-$TIMESTAMP.db'"

# 2. Tar the uploads directory (excludes nothing — full snapshot)
tar -czf "$BACKUP_DIR/uploads-$TIMESTAMP.tar.gz" -C "$WEB_ROOT" uploads

# 3. Prune old backups, keeping only the most recent $RETENTION of each type
ls -1t "$BACKUP_DIR"/photos-*.db 2>/dev/null | tail -n +$((RETENTION + 1)) | xargs -r rm -f
ls -1t "$BACKUP_DIR"/uploads-*.tar.gz 2>/dev/null | tail -n +$((RETENTION + 1)) | xargs -r rm -f

# 4. Log a one-line summary so we can grep cron logs to verify
DB_SIZE=$(du -h "$BACKUP_DIR/photos-$TIMESTAMP.db" | cut -f1)
TAR_SIZE=$(du -h "$BACKUP_DIR/uploads-$TIMESTAMP.tar.gz" | cut -f1)
TOTAL=$(du -sh "$BACKUP_DIR" | cut -f1)
echo "[backup] $TIMESTAMP db=$DB_SIZE uploads=$TAR_SIZE total=$TOTAL"
