# Chat API troubleshooting and deployment checklist

## What the request path is

The production chat page (`/jalalai.html`) sends same-origin requests to:

- `POST /api/assistant/chat` for JalalAi and JARVIS. Its JSON body is `{ "message": "…", "mode": "local|cloud|agent|research", "profile": "general", "provider": "gemini" }`.
- `POST /api/ai/run` for direct provider-backed Workspace runs.
- `POST /api/chat` is retained as a compatibility alias for direct provider runs; it accepts `{ "prompt": "…" }`.

The actual production API is the Cloudflare Pages Function in `functions/api/[[path]].js`, deployed from the `frontend/` directory. The local preview is `server/dev.mjs` and uses a local PGlite database. The separate recovered backend under `backend/` is not the production API. The browser uses relative `/api/...` URLs and includes the account session and CSRF token; do not put a model key or provider URL in browser code.

## Root causes to check for 404 / 500

- **404 from GitHub Pages:** GitHub Pages serves static files and does not execute `functions/api/[[path]].js`. Open the Cloudflare Pages app or start the local preview. A static preview must not be treated as a running chat backend.
- **404 from a custom host:** the Pages Function may not have been deployed from `frontend/`, the route may be missing from that deployment, or an old client may point at a retired API origin. Check the browser Network tab and verify that the failing URL is the same site's `/api/assistant/chat` (or the documented direct route).
- **Worker gateway 503/502:** this repository's optional `worker/index.js` is a gateway, not the API. It requires `BACKEND_API_URL` to be set to the backend origin. Missing/invalid configuration returns a clear 503; an unreachable backend returns 502. The Cloudflare Pages production project does not require this Worker gateway.
- **500:** an unhandled database/schema or server exception can reach the API's generic production error handler. Responses now include a request ID; use that ID and timestamp to find the sanitized `API_UNHANDLED_ERROR` entry in hosting logs. A stack trace, key, or prompt must not be pasted into a public issue.
- **Provider errors:** missing keys produce a 503; provider authentication/model/quota/network failures are translated to actionable 502/503 responses. A provider's own HTTP 404 means its configured model/endpoint was not found; it is not the same as the website route returning 404. A present key is not proof it works.
- **Local mode:** structured local tools do not call a general-purpose model. For open-ended AI answers, sign in, choose **Cloud AI**, choose a configured provider, and check its status. The backend will not invent an AI answer when no provider is configured.

The original production incident cannot be attributed to one particular exception without the exact failing URL, response body/status, and hosting request log. These diagnostics separate the failure classes without exposing secrets.

## Required configuration

For **Cloudflare Pages production**, configure these under the Pages project's Production variables/secrets:

| Name | Required for | Notes |
|---|---|---|
| `DATABASE_URL` (secret) | API, sessions, health/readiness | Neon PostgreSQL connection string for the intended database. |
| `CSRF_SECRET` (secret) | Protected chat and account operations | At least 32 random characters; never reuse or expose it. |
| One provider secret | Open-ended Cloud AI | `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `DEEPSEEK_API_KEY`. Configure only the provider(s) you intend to offer. |
| `*_MODEL` (optional) | Model selection | `GEMINI_MODEL`, `OPENAI_MODEL`, `ANTHROPIC_MODEL`, `DEEPSEEK_MODEL`; defaults are in the API handler. Override only with a model supported by that provider account. |

OmniRoute requires both a server-side `OMNIROUTE_API_KEY` (or `OMNIROUTE_KEY`) and an HTTPS `OMNIROUTE_BASE_URL` (or `OMNIROUTE_URL`). Its endpoint may forward prompts to another provider; check its terms and costs. Never set provider secrets in HTML, frontend JavaScript, public GitHub, or chat.

For **local preview**, `npm ci && npm run dev` creates its own disposable local database and CSRF secret. The Node preview does not automatically read `.env`: export provider variables into the shell before starting it if you want to test cloud mode. See `API-DEPLOYMENT.md` for the complete production and security configuration.

## Verify without guessing

1. Open the application from the intended Cloudflare Pages origin (not the GitHub Pages static site).
2. In a browser or `curl`, check `GET /api/health`. Expect HTTP 200 with `ok: true` and `databaseConnected: true`. Check `GET /api/ready` for the required schema; a 503 lists missing tables. These checks do not verify a provider key.
3. Sign in, open JalalAi, choose Cloud AI and a provider marked configured. Send a harmless, non-sensitive prompt. Expect an assistant response labelled with the provider, or an actionable provider error and correlation ID; provider key presence alone is not success.
4. In browser DevTools → Network, confirm the request URL is same-origin `/api/assistant/chat`, the request uses JSON, and the response has the expected HTTP status. Do not export or share cookies, CSRF headers, prompts, or secret-bearing headers.
5. On local source, run `npm run check`, `npm test`, and `npm run build`. Tests use local databases and provider doubles; they do not make a live provider request or deploy the site.
