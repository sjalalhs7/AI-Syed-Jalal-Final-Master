#!/usr/bin/env bash
set -euo pipefail

# The old version passed the application DATABASE_URL directly to pg_restore
# with --clean. A mistaken target could destroy existing production objects.
# A script cannot prove a Neon branch is isolated or authorize an overwrite.
cat >&2 <<'MESSAGE'
The legacy restore script is disabled: its --clean operation was destructive.
No database operation was run.
Ask the database owner to follow an approved restore procedure on an isolated
non-production target. A live restore needs separate explicit authorization.
See docs/PRODUCTION-DATABASE-SAFETY.md; do not paste credentials into chat.
MESSAGE
exit 2
