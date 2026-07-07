#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/backups/arjun-glass-house}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-postgres}"
DB_USER="${DB_USER:-postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$BACKUP_DIR/${DB_NAME}-${STAMP}.dump"

PGPASSWORD="${DB_PASSWORD:-}" pg_dump \
  --host "$DB_HOST" \
  --port "$DB_PORT" \
  --username "$DB_USER" \
  --format custom \
  --file "$FILE" \
  "$DB_NAME"

gzip "$FILE"
find "$BACKUP_DIR" -type f -name "*.dump.gz" -mtime +"$RETENTION_DAYS" -delete

echo "Backup created: ${FILE}.gz"

