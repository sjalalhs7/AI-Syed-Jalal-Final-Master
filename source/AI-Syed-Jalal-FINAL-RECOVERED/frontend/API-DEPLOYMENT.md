# Cloudflare-native API deployment

The Pages Functions API in `functions/api/[[path]].js` uses Neon PostgreSQL over the Neon serverless HTTP driver. The UI design is intentionally unchanged.

## Required production secrets

In Cloudflare Dashboard → Workers & Pages → `ai-syed-jalal-live` → Settings → Variables and Secrets → Production, add:

- `DATABASE_URL` (Secret): the Neon connection string for project `ai-syed-jalal-db`, branch `main`, database `neondb`.
- `CSRF_SECRET` (Secret): a random value with at least 32 characters.
- `SEED_ADMIN_PASSWORD` (Secret): a unique temporary admin password of at least 12 characters.
- `SEED_ADMIN_USERNAME` (Text): `admin`.

Save the variables and redeploy. The first login request creates the seed admin only when `app_users` is empty. Keep the password private and change it after the first successful sign-in.

## Current API coverage

Health/readiness, login/session/CSRF, current-user, records CRUD, metadata/stats and approvals are implemented in Pages Functions. Routes not yet migrated (including AI agent execution and several admin/backup operations) return `501 ROUTE_NOT_IMPLEMENTED`; do not treat those modules as production-ready until their Cloudflare-native implementations and end-to-end tests are complete.

No Render service or paid hosting is required for this architecture.
