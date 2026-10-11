# V38 Deployment

## Frontend

Deploy `frontend/` through GitHub Pages. The V38 workflow is `.github/workflows/pages-v38.yml`.

## API + PostgreSQL

Run the backend separately from GitHub Pages. Required production variables include:

- `DATABASE_URL`
- `CORS_ORIGIN`
- `SESSION_TTL_HOURS`

Run migrations before the API starts:

```bash
node backend/scripts/migrate.mjs
node backend/scripts/seed.mjs
node backend/server.mjs
```

## Release sequence

1. Merge to `main`.
2. Let V38 Quality Gate finish.
3. Review the Pages deployment environment.
4. Deploy the API/database separately.
5. Verify `/api/health` and `/api/ready`.
6. Perform a real login and data-operation smoke test.
7. Confirm backup/restore readiness before accepting production traffic.

Never treat a CI-only pass as proof of a live production deployment.
