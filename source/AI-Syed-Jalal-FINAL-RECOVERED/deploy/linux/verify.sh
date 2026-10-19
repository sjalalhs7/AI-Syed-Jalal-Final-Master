#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT"
curl -fsS http://127.0.0.1:8787/api/health >/dev/null
curl -fsS http://127.0.0.1:8787/api/ready >/dev/null
(cd backend && npm run audit:current)
: "${E2E_PASSWORD:?Set E2E_PASSWORD to seeded admin password}"
(cd backend && E2E_PASSWORD="$E2E_PASSWORD" npm run e2e:runtime)
if [ "${RUN_BROWSER_E2E:-0}" = 1 ]; then node tests/browser-e2e.mjs http://127.0.0.1:8080/; fi
if [ "${RUN_AI_E2E:-0}" = 1 ]; then (cd backend && npm run e2e:ai); fi
echo 'Deployment verification completed.'
