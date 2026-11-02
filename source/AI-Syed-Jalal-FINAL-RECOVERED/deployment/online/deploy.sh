#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env.production ] || { echo "Create .env.production from .env.production.example first"; exit 1; }
grep -q '^PUBLIC_ORIGIN=https://' .env.production || { echo "PUBLIC_ORIGIN must be HTTPS"; exit 1; }
grep -q '^DATABASE_URL=postgresql://' .env.production || { echo "DATABASE_URL must point to Neon PostgreSQL"; exit 1; }
grep -q '^CSRF_SECRET=' .env.production || { echo "CSRF_SECRET missing"; exit 1; }
grep -q '^SEED_ADMIN_PASSWORD=' .env.production || { echo "SEED_ADMIN_PASSWORD missing"; exit 1; }
docker compose --env-file .env.production -f docker-compose.production.yml build api seed
docker compose --env-file .env.production -f docker-compose.production.yml up -d api web
docker compose --env-file .env.production -f docker-compose.production.yml --profile seed run --rm seed
echo "Deployment started. Verify ${PUBLIC_ORIGIN}/api/health and ${PUBLIC_ORIGIN}/api/ready"
