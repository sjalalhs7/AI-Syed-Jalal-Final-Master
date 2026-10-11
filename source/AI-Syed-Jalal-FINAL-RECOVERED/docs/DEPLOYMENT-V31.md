# V31 Deployment Blueprint

## Frontend

Deploy `frontend/` to GitHub Pages using the existing Pages workflow or a branch-based Pages source.

## Backend

Deploy `backend/` to a Node.js 20-capable HTTPS service. Set:

- `PORT` — provided by the platform when applicable
- `HOST=0.0.0.0`
- `AUTH_SECRET` — long random production secret
- `CORS_ORIGIN` — exact frontend origin, e.g. `https://OWNER.github.io`

After deployment, verify:

1. `GET /api/health` returns `ok: true` and `version: V31`.
2. Login works with the administrator account.
3. Create/edit/delete permissions match the user's role.
4. Records remain after server restart.
5. Backup downloads successfully.

## Production database

The included V31 store is deliberately a simple JSON-backed starter so the package has no external runtime dependency. It is not the recommended final database for a multi-user office system. The next hardening step is PostgreSQL (or another managed transactional database), migrations, password rotation, refresh/revocation strategy, and server-side rate limiting shared across instances.
