# Cloudflare Pages API proxy

The frontend's Pages deployment can route same-origin `/api/*` requests to the Node API using `functions/api/[[path]].js`.

## Required Pages environment variable

Set `BACKEND_API_URL` in the Cloudflare Pages project's environment variables for both Preview and Production. It must be the **origin** of the deployed Node API, for example `https://api.example.com`, with no `/api` suffix and no embedded credentials.

The function intentionally returns a JSON `503 BACKEND_NOT_CONFIGURED` when the variable is missing and `502 BACKEND_UNREACHABLE` when the origin cannot be reached. It does not pretend that the database or API is healthy.

## Important

- Deploy the Node API separately and ensure it serves `/api/*` routes.
- Keep database credentials, auth secrets, and provider API keys only in the backend's secret environment.
- Verify `/api/health`, `/api/ready`, login, logout, and database readiness against the deployed backend before calling the release production-ready.
- This proxy removes the static-site fallback 404 only when the Pages deployment includes this Functions directory. It does not itself provision the API or PostgreSQL.
