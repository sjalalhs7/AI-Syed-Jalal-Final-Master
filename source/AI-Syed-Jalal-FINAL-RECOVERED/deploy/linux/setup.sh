#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT"
echo 'Al-Syed Jalal AI V76 - Linux VPS deployment setup'
command -v docker >/dev/null || { echo 'Docker is required/recommended. Install Docker Engine + Compose plugin, then rerun.'; exit 2; }
command -v docker compose >/dev/null || { echo 'Docker Compose plugin is required.'; exit 2; }
if [ ! -f .env ]; then
  cp .env.deploy.example .env
  python3 - <<'PY'
from pathlib import Path
import secrets
p=Path('.env'); s=p.read_text()
s=s.replace('REPLACE_WITH_STRONG_DB_PASSWORD', secrets.token_urlsafe(24))
s=s.replace('REPLACE_WITH_32_PLUS_RANDOM_BYTES', secrets.token_urlsafe(48), 1)
s=s.replace('REPLACE_WITH_32_PLUS_RANDOM_BYTES', secrets.token_urlsafe(48), 1)
s=s.replace('REPLACE_WITH_STRONG_ADMIN_PASSWORD', secrets.token_urlsafe(20))
p.write_text(s)
PY
  chmod 600 .env
  echo 'Created .env with generated DB/auth secrets. Set provider API keys if live AI is required.'
fi
docker compose up --build -d
docker compose exec -T api node scripts/migrate.mjs
docker compose exec -T api node scripts/seed.mjs
for i in {1..30}; do curl -fsS http://127.0.0.1:8787/api/health >/dev/null && break; sleep 2; done
curl -fsS http://127.0.0.1:8787/api/health >/dev/null
echo 'API health: PASS'
curl -fsS http://127.0.0.1:8787/api/ready >/dev/null
echo 'PostgreSQL readiness: PASS'
echo 'Deployment ready: http://127.0.0.1:8080'
