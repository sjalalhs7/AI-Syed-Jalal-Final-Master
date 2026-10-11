#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
OUT_DIR="${OUT_DIR:-./backups}"
mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$OUT_DIR/alsyed-v39-drill-$STAMP.dump"
pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" > "$FILE"
pg_restore --list "$FILE" >/dev/null
echo "Backup drill artifact verified: $FILE"
