# AI-Syed Jalal — Production deployment

This directory supports a self-hosted Docker deployment using the existing Neon PostgreSQL database. The production Compose file builds from the recovered project root (`backend/` and `frontend/`), not the absent `current/` directory. It does not create a second PostgreSQL instance.

## Requirements

- Linux VPS with Docker Engine and the Compose plugin
- A domain pointing to the VPS; TCP 80/443 open
- Neon connection string for the existing `neondb` database
- A strong CSRF secret (32+ random characters), strong admin password (12+ characters), and at least one AI-provider API key for live AI

## Deploy

1. Copy `.env.production.example` to `.env.production` and fill the values locally.
2. Set `PUBLIC_ORIGIN` to the HTTPS origin served by this VPS and paste the Neon connection string into `DATABASE_URL`.
3. Keep `PUBLIC_CHAT_ENABLED=false` unless public unauthenticated AI usage is explicitly intended.
4. Run `./deploy.sh`.
5. Verify `/api/health` and `/api/ready`, then test login, record CRUD, CSRF, and one live AI-provider call.

The API runs database migrations at startup. Migrations are additive and tracked in `schema_migrations`; do not delete that table or manually mark migrations as applied. The seed step creates the initial admin only if that username does not already exist; it does not reset an existing password.

Never commit `.env.production`, connection strings, admin passwords, or provider keys. This self-hosted Compose path is separate from the Cloudflare Pages + Render backend path configured in the repository-level `render.yaml`.
