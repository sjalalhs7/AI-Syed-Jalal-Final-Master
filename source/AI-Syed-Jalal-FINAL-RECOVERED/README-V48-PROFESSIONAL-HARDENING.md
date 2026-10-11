# AI-Syed Jalal AI — V48 Professional Hardening Release

V48 is a hardening release based on V47. It fixes concrete audit findings instead of adding cosmetic version labels.

## Implemented
- HttpOnly session cookie for live authentication; bearer token remains only as backward-compatible in-memory support.
- Frontend no longer persists live authentication tokens in localStorage.
- Credentialed cross-origin requests for live API sessions.
- Explicit demo/live mode banner.
- Duplicate `renderAICommand()` definitions consolidated to one.
- Request body size protection.
- Rate-limit map cleanup.
- Production PostgreSQL TLS verification configuration.
- Active runtime consolidated through `backend/ai-runtime.mjs`.
- V48 security/release tests.

## Honest deployment status
Static/code checks can be executed in this package. A real PostgreSQL server, npm dependency installation, browser matrix and live load test are still required for deployment verification.
