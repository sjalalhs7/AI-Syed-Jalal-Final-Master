#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
out="${1:-./backups}"
mkdir -p "$out"
file="$out/al-syed-jalal-$(date +%Y%m%d-%H%M%S).dump"
pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" > "$file"
echo "Backup written: $file"
