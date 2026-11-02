# Cloudflare Pages API — Deployment and Operations

This application uses **Cloudflare Pages Functions** for its production HTTP API and **Neon PostgreSQL** for relational data. The deployed API entry point is:

`functions/api/[[path]].js`

The UI and Cloudflare-native API are deployed from the frontend directory configured in the Pages project. The separate recovered Node backend directory is not an independently deployed production service.

## Production configuration

Configure these values under **Cloudflare Dashboard → Workers & Pages → ai-syed-jalal-live → Settings → Variables and Secrets → Production**.

| Variable | Type | Requirement | Purpose |
|---|---|---|---|
| `DATABASE_URL` | Secret | Required | Neon connection string for the intended production database |
| `CSRF_SECRET` | Secret | Required | HMAC key; use a cryptographically random value of at least 32 characters |
| `SEED_ADMIN_PASSWORD` | Secret | Conditional | Initial/recovery administrator credential; use a unique password of at least 12 characters |
| `SEED_ADMIN_USERNAME` | Text | Conditional | Seed administrator username; normally `admin` |
| `GEMINI_API_KEY` | Secret | Required for Gemini | Google Gemini provider authentication |
| `OPENAI_API_KEY` | Secret | Optional | OpenAI provider authentication |
| `ANTHROPIC_API_KEY` | Secret | Optional | Anthropic provider authentication |
| `DEEPSEEK_API_KEY` | Secret | Optional | DeepSeek provider authentication |
| `OMNIROUTE_API_KEY` / `OMNIROUTE_KEY` | Secret | Optional | OmniRoute authentication |
| `OMNIROUTE_BASE_URL` / `OMNIROUTE_URL` | Text | Optional with OmniRoute | HTTPS base URL for the OmniRoute-compatible API |

Set optional model variables only when intentionally overriding the defaults: `GEMINI_MODEL`, `OPENAI_MODEL`, `ANTHROPIC_MODEL`, `DEEPSEEK_MODEL`, and `OMNIROUTE_MODEL`.

Never put credentials in source control, frontend JavaScript, screenshots, issue reports, or build logs. Do not copy production secret values into documentation.

## Implemented API surface

The current Pages Function contains these routes:

| Route | Method | Purpose |
|---|---|---|
| `/api/health` | GET | Database connectivity check |
| `/api/ready` | GET | Readiness check for the required database tables |
| `/api/version` | GET | Application/API release metadata |
| `/api/auth/register` | POST | User registration |
| `/api/auth/login` | POST | Session creation |
| `/api/auth/logout` | POST | CSRF-protected session revocation |
| `/api/auth/sessions` | GET, DELETE | View sessions and revoke other sessions |
| `/api/csrf` | GET | Authenticated CSRF token |
| `/api/me` | GET | Current authenticated user |
| `/api/chat` | POST | Compatibility alias for the AI execution route |
| `/api/ai/run` | POST | Provider-backed text/image prompt execution |
| `/api/ai/runs` | GET | Current user's AI run history |
| `/api/ai/capabilities` | GET | Authenticated provider and agent capability catalogue |
| `/api/admin/ai/overview` | GET | Admin-only AI usage summary |
| `/api/admin/ai/provider-health` | GET | Admin-only provider configuration status |
| `/api/admin/diagnostics` | GET | Admin-only schema diagnostics |
| `/api/admin/audit` | GET | Admin-only audit event listing |
| `/api/records` | GET, POST | Record listing and creation |
| `/api/records/:id` | GET, PUT, DELETE | Record retrieval, update, and soft deletion |
| `/api/meta` | GET | Record filter metadata |
| `/api/stats` | GET | Record statistics |
| `/api/approvals` | GET, POST, PATCH | Approval workflow |

Unknown or unmigrated routes return HTTP 501 with `ROUTE_NOT_IMPLEMENTED`. A route appearing in the recovered source tree is not proof that it is deployed or production-ready.

## AI capability boundaries

The Cloudflare endpoint executes provider-backed prompts through configured provider APIs. Gemini is the default provider when no provider is specified. A configured key is only evidence that a secret is present; it is **not** proof of successful provider authentication or a successful model response.

The recovered agent catalogue and skill metadata do not mean that every listed agent has an independent tool runtime. Voice capture/synthesis, external browsing, autonomous external actions, and specialist integrations must not be represented as active unless their dedicated runtime is implemented and tested.

## Security and operational behavior

- Sessions use an HTTP-only, Secure, SameSite=Lax cookie.
- Mutating authenticated requests require a valid CSRF token.
- Passwords are stored as derived hashes; never log or return passwords, tokens, or secret values.
- Registration and AI execution have server-side rate limits.
- Request bodies are size-limited and JSON parsing errors are handled.
- Admin-only routes enforce the Admin role.
- API responses set no-store and baseline browser security headers.

## Verification procedure

Run from the frontend project directory:

```bash
npm install --no-audit --no-fund
npm test
npm run check
```

After deployment, verify:

1. `GET /api/health` returns a successful database connectivity result.
2. `GET /api/ready` reports the expected schema readiness.
3. Authentication, CSRF, record CRUD, approvals, and role restrictions pass against a non-production test account.
4. An authenticated prompt to `POST /api/ai/run` returns a real provider response with `status: "completed"` and `simulated: false`.
5. Provider failures, missing configuration, rate limits, and unauthorised access return safe, explicit errors.

Do not run destructive tests against production data. Do not mark the release fully verified until these checks have been executed against the deployed production URL.

## Known gaps requiring separate implementation

The current Pages Function does not provide a complete backup/restore API or a complete administrative user-management API. The library endpoint currently returns empty collections. Unknown routes return 501. These capabilities must be designed against the actual UI and database contracts, implemented with authorization and audit coverage, and tested before being advertised as available.

The separate recovered backend directory is retained in the repository for reference; it is not automatically part of the Cloudflare Pages deployment. Cloudflare Pages is the production API runtime for this configuration. No Render service is required for the current architecture.
