#!/usr/bin/env bash
# Create a single-database PostgreSQL archive; this is NOT a restore test.
set -euo pipefail

if [[ $# -ne 1 || -z "$1" ]]; then
  echo 'Usage: bash scripts/backup.sh /existing/private/directory-outside-the-repository' >&2
  echo 'Configure an explicit PostgreSQL PGSERVICE and a protected password file first.' >&2
  exit 2
fi
if [[ -z "${PGSERVICE:-}" ]]; then
  echo 'PGSERVICE is required. Configure a named PostgreSQL service for the intended database.' >&2
  echo 'DATABASE_URL is deliberately not passed on the command line. See docs/PRODUCTION-DATABASE-SAFETY.md.' >&2
  exit 2
fi
if [[ ! -d "$1" ]]; then
  echo 'The output directory must already exist outside the repository on appropriately protected storage.' >&2
  exit 2
fi
for tool in pg_dump pg_restore mktemp git; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Required tool is missing: $tool. No database operation was run." >&2
    exit 2
  fi
done

# Resolve symlinks before the repository checks. Never default to ./backups.
output=$(cd -- "$1" && pwd -P)
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
app=$(cd -- "$here/.." && pwd -P)
repo=$(git -C "$here" rev-parse --show-toplevel 2>/dev/null || printf '%s' "$app")
repo=$(cd -- "$repo" && pwd -P)
if [[ $(git -C "$output" rev-parse --is-inside-work-tree 2>/dev/null || true) == true ]]; then
  echo 'Refusing to place sensitive database backups inside a Git working tree.' >&2
  exit 2
fi
case "$output/" in
  "$app/"*|"$repo/"*)
    echo 'Refusing to place sensitive database backups inside the application or repository.' >&2
    exit 2
    ;;
esac

# Restrict newly created files; randomized private directories avoid clobbering
# prior backups even if two runs start in the same second.
umask 077
folder=$(mktemp -d "$output/aj-backup-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXXXX")
archive="$folder/database.dump"
complete=false
cleanup() {
  if [[ "$complete" != true ]]; then
    if ! rm -f -- "$archive"; then
      echo 'Warning: could not remove the partial archive; protect and remove it manually.' >&2
    fi
    if ! rmdir -- "$folder" 2>/dev/null; then
      echo 'Warning: the incomplete backup directory remains; inspect it securely.' >&2
    fi
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# libpq uses PGSERVICE (and usually PGPASSFILE), not a secret in argv. Do not
# let an unrelated inherited application DATABASE_URL enter the child process.
if ! (unset DATABASE_URL; pg_dump --format=custom --no-password > "$archive"); then
  echo 'pg_dump failed. Attempting to remove the incomplete archive.' >&2
  exit 1
fi
if ! (unset DATABASE_URL; pg_restore --list "$archive" >/dev/null); then
  echo 'Archive listing failed. Attempting to remove the unusable archive.' >&2
  exit 1
fi
complete=true
printf 'Archive created for one database: %s\n' "$archive"
printf '%s\n' \
  'The archive is not encrypted by this script. Keep it on approved protected storage.' \
  'Archive listing succeeded; no restore was performed or verified.' \
  'Other databases, cluster-wide roles and external files require separate coverage.' \
  'Verify permissions and an isolated restore before relying on this archive or repairing production.'
