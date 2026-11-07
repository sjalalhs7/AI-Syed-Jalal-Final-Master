#!/usr/bin/env bash
set -euo pipefail
if [[ $# -gt 1 ]]; then
  echo 'Usage: bash scripts/production-drill.sh /existing/private/directory-outside-the-repository' >&2
  exit 2
fi
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
echo 'This makes an archive only; it is not a restore drill.' >&2
exec bash "$here/backup.sh" "${1:-${OUT_DIR:-}}"
