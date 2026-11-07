#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env.production ] || { echo "Create .env.production from .env.production.example first"; exit 1; }
grep -q '^PUBLIC_ORIGIN=https://' .env.production || { echo "PUBLIC_ORIGIN must be HTTPS"; exit 1; }
grep -q '^DATABASE_URL=postgresql://' .env.production || { echo "DATABASE_URL must point to the intended PostgreSQL database"; exit 1; }
grep -q '^CSRF_SECRET=' .env.production || { echo "CSRF_SECRET missing"; exit 1; }
# This only builds and starts services. Schema migration and initial Admin
# seeding are separate, explicitly authorized operations; neither runs here.
docker compose --env-file .env.production -f docker-compose.production.yml build api
docker compose --env-file .env.production -f docker-compose.production.yml up -d api web
echo 'Deployment started. No migrations were run, and no Admin seed was run.'
echo 'Verify /api/health and /api/ready on the configured HTTPS origin; see README for safety prerequisites.'
