#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
file="${1:?Usage: restore.sh <backup.dump>}"
pg_restore --clean --if-exists --no-owner --no-acl --dbname="$DATABASE_URL" "$file"
echo "Restore completed from: $file"
