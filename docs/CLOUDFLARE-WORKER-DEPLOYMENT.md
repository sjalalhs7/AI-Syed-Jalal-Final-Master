# Cloudflare Worker deployment

The Worker entrypoint is `source/AI-Syed-Jalal-FINAL-RECOVERED/worker/index.js`.
The root `wrangler.jsonc` declares the entrypoint and the `previews` block required
by Wrangler preview-aware build configurations.

## Required backend configuration

Set `BACKEND_API_URL` in the Worker environment to the **origin** of the deployed
Node API (scheme and host only; no `/api` suffix, credentials, query, or fragment).
Do not commit database URLs, passwords, session secrets, or AI provider keys.

- `GET /healthz` reports gateway status and whether the backend variable exists.
- `/api/*` proxies to the configured Node API.
- If the backend is missing, requests return an explicit 503; if unreachable, 502.

This gateway does not replace the Node API or claim the application is fully live.
The API must be hosted, its database configured and migrated, and authentication
flows tested before production is considered complete.
