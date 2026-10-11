# Al-Syed Jalal AI V32 — Enterprise Data Core

V32 replaces the V31 JSON-backed persistence layer with PostgreSQL and adds database-backed sessions, indexed records, role enforcement, audit events and a Docker Compose deployment.

## Architecture

GitHub Pages/static frontend → HTTPS API → PostgreSQL → audit/session tables → backup tooling.

## Local start

1. Install Docker Desktop.
2. `cd backend`
3. `docker compose up --build`
4. API: `http://localhost:8787/api/health`
5. Demo admin: `admin` / `ChangeMe-123!` (change before any real deployment).

## Backup

For production PostgreSQL, use `pg_dump`/`pg_restore` and keep encrypted/off-site copies. The web `/api/backup` endpoint is a portable application-level export, not a replacement for database-native backups.
