#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
OUT_DIR="${OUT_DIR:-./backups/dr-drill}"
mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP="$OUT_DIR/al-syed-jalal-$STAMP.dump"
pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" > "$DUMP"
SIZE="$(du -h "$DUMP" | cut -f1)"
echo "Backup created: $DUMP ($SIZE)"
echo "DR drill checkpoint: create a disposable database, restore with pg_restore, run migrations, then compare record counts."
echo "This script intentionally does not destroy a database automatically. Destructive steps require an operator to target a disposable test database."
