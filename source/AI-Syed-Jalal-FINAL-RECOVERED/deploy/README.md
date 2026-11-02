# Reproducible V75 deployment

## Local production-like stack

```bash
cp .env.deploy.example .env
# Replace every REPLACE_* value in .env

docker compose up --build -d
docker compose exec api node scripts/migrate.mjs
docker compose exec api node scripts/seed.mjs
```

Verify:

```bash
curl http://127.0.0.1:8787/api/health
curl http://127.0.0.1:8787/api/ready
```

Frontend: `http://127.0.0.1:8080`

## Runtime E2E

```bash
E2E_PASSWORD="$SEED_ADMIN_PASSWORD" node tests/runtime-e2e.mjs http://127.0.0.1:8787
```

This verifies PostgreSQL readiness, authentication, httpOnly session, CSRF, approval resolution, logout and session revocation.

## Live AI E2E

Configure at least one real provider key, then:

```bash
E2E_PASSWORD="$SEED_ADMIN_PASSWORD" node tests/ai-live-e2e.mjs http://127.0.0.1:8787
```

For fallback verification, configure two providers and set `E2E_AI_PROVIDER` and `E2E_AI_FALLBACK`.

## Browser E2E

With Chromium available:

```bash
node tests/browser-e2e.mjs http://127.0.0.1:8080/
```

It physically drives the page through Chrome DevTools Protocol and verifies navigation targets and the approval modal.

Never commit `.env` or provider credentials.
