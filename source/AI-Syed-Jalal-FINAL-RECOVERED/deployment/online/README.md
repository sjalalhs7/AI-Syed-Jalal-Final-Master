# Legacy self-hosted Docker deployment

This directory describes an optional self-hosted API and frontend. The current
public website and installed app use the shared Cloudflare Pages/Neon backend;
this Compose file is **not** evidence that the live deployment uses Docker.
Do not deploy a second backend or redirect the website/app to an isolated test
copy as a shortcut for fixing production readiness.

## Safety changes

The production API container now starts `server.mjs` only. Restarting or deploying
it no longer runs schema migrations automatically. `deploy.sh` no longer creates
an Admin automatically, and the API container no longer receives the seed
password. This is a **behavior change**: a fresh or incomplete database will not
be initialized just by starting the stack. Its readiness health check can fail,
preventing the dependent web service from starting. Investigate rather than
bypassing the health check.

The optional `seed` profile remains a separate, deliberate operation. Its script
validates the password and inserts an Admin only if that username does not exist;
it is still a database change and needs appropriate owner authorization. Do not
seed an existing shared production database merely because startup is unhealthy.

## Deployment prerequisites

- Identify the intended database and deployment with the owner. Never paste
  connection strings, credentials or private records into chat or the repository.
- Before any production migration or seed, verify a restorable **full database
  backup**, rehearse the actual operation on an isolated copy, and obtain
  specific owner approval. See the repository's
  [`docs/PRODUCTION-DATABASE-SAFETY.md`](../../../../docs/PRODUCTION-DATABASE-SAFETY.md).
  The SQL may alter constraints and bootstrap data; do not assume it is
  additive-only. The Node migration runner uses a transaction and migration
  history, while the Cloudflare Operations repair uses individual statements;
  rehearsing one path does not prove the other will behave the same way.
- Linux VPS with Docker Engine and the Compose plugin, an HTTPS domain, and
  matching server settings. Keep `PUBLIC_CHAT_ENABLED=false` unless intended.

## Deploy without migrating or seeding

1. Copy `.env.production.example` to `.env.production` and fill the values
   privately using the deployment's approved secret process. Restrict its file
   permissions; it must not be committed. `SEED_ADMIN_PASSWORD` is needed only
   for an explicitly authorized seed, not for ordinary API startup.
2. Set `PUBLIC_ORIGIN`, the intended `DATABASE_URL`, and a strong CSRF secret.
3. From this directory, run `bash deploy.sh`, then check `/api/health` and
   `/api/ready` on the configured HTTPS origin. `deploy.sh` does not migrate or
   seed. If readiness fails, the web container may not start; follow the safety
   prerequisites above. Verify login and applicable features separately.

## Explicit migrations and seed

Only **after** verifying the target, backup, rehearsal and owner approval, an
operator can run the Node migration runner deliberately:

```sh
docker compose --env-file .env.production -f docker-compose.production.yml build api
docker compose --env-file .env.production -f docker-compose.production.yml run --rm --no-deps api node scripts/migrate.mjs
```

Use the exact same runner on the isolated rehearsal target first, and ensure the
production service file points back to the intended shared database only when the
owner authorizes production. After a successful migration, start or restart the
services and independently verify schema, data, login and affected features.
A `24/24` table-name check is not a full health or integrity test.

If a new deployment genuinely needs its first Admin, an owner may separately
set a strong `SEED_ADMIN_PASSWORD` using their protected secret process and
run the optional `seed` profile. This must not be an automatic side effect of a
normal deploy. Review its behavior before use. No command in this document was
run against production as part of this repository update.
