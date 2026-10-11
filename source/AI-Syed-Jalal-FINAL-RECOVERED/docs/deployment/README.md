# Deployment

## Frontend

Deploy `frontend/` to GitHub Pages or another static HTTPS host.

## Backend

Deploy `backend/` on a server/container with Node.js 20+ and PostgreSQL. Install production dependencies from `backend/package.json` and run the database migration before the first application start.

## Required production configuration

At minimum configure:

- `DATABASE_URL`
- `CORS_ORIGIN`
- session/auth secrets required by the backend
- AI provider credentials only when live AI execution is needed

Never commit production `.env` files.

## Verification

Run the repository quality workflow and the production verification script with deployment-specific environment variables. Live validation must be performed against the actual PostgreSQL and hosting environment before calling a deployment production-ready.
