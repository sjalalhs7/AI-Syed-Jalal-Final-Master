#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env.production ] || { echo "Create .env.production first"; exit 1; }
grep -q '^PUBLIC_ORIGIN=https://' .env.production || { echo "PUBLIC_ORIGIN must be HTTPS"; exit 1; }
grep -q '^POSTGRES_PASSWORD=' .env.production || { echo "POSTGRES_PASSWORD missing"; exit 1; }
grep -q '^AUTH_SECRET=' .env.production || { echo "AUTH_SECRET missing"; exit 1; }
grep -q '^CSRF_SECRET=' .env.production || { echo "CSRF_SECRET missing"; exit 1; }
docker compose --env-file .env.production -f docker-compose.production.yml build api
docker compose --env-file .env.production -f docker-compose.production.yml up -d db api web
docker compose --env-file .env.production -f docker-compose.production.yml run --rm --profile seed seed
echo "Deployment started. Check ${PUBLIC_ORIGIN}/api/health"
