# Al-Syed Jalal AI V37 — Production Release Engineering

V37 moves the project from runtime hardening toward repeatable release engineering.

## Included
- GitHub Actions CI validation for backend/frontend syntax and production configuration.
- GitHub Pages deployment workflow with deployment environment and concurrency controls.
- Backend smoke test for health/readiness and request IDs.
- Docker healthcheck for the API container.
- Existing V36 telemetry, rate limiting, PostgreSQL pool controls, backups, restore, audit, users and permissions are retained.

## Deployment model
1. Frontend: GitHub Pages.
2. API: separate HTTPS Node.js service/container.
3. Database: PostgreSQL 18/current supported production release.
4. Keep database credentials only in the deployment environment; never commit `.env` files.
5. Configure `CORS_ORIGIN` to the exact Pages origin.

GitHub Actions environments can restrict branches, require approvals, and protect environment secrets. Concurrency can prevent overlapping deployments. See the official GitHub documentation before enabling production protections.

## Smoke test
With the API running:

```bash
cd backend
SMOKE_URL=https://api.example.com npm run smoke
```

Expected: `/api/health` returns HTTP 200 and reports `V37`. `/api/ready` returns 200 when PostgreSQL is reachable or 503 when it is not.

## Important
This package contains deployment automation but does not deploy the API/database itself. Real deployment still requires your chosen hosting provider, PostgreSQL instance, domain/HTTPS configuration, and environment secrets.
