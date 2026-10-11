# V35 Production Deployment

## Architecture

Frontend (GitHub Pages or another static host) -> HTTPS API -> PostgreSQL.

GitHub Pages is static hosting; deploy the backend separately and set the frontend API URL to the HTTPS API origin.

## Required production settings

- `DATABASE_URL`
- `CORS_ORIGIN` set to the exact frontend origin(s), never `*`
- `SESSION_TTL_HOURS`
- Strong seeded admin password; change it immediately after first login
- HTTPS at the API edge

## Database

1. Start PostgreSQL.
2. Apply `backend/db/schema.sql`.
3. Run `node backend/scripts/seed.mjs` with production credentials only in a secure environment.
4. Run `node scripts/verify-production.mjs`.

## Backups

`./scripts/backup.sh ./backups` creates a PostgreSQL custom-format dump. PostgreSQL documents `pg_dump` as a consistent backup method that can run while the database is in use. Test restores regularly; a backup that has never been restored is not a verified recovery plan.

## Restore

`./scripts/restore.sh ./backups/al-syed-jalal-YYYYMMDD-HHMMSS.dump`

Perform restores against a controlled maintenance environment first.
