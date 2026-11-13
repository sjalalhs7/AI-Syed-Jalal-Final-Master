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
| `SEED_ADMIN_PASSWORD` | Secret | Conditional | Initial/recovery administrator credential; use a unique password of 12–1,024 characters containing letters and numbers |
| `SEED_ADMIN_USERNAME` | Text | Conditional | Exact seed administrator username (3–40 letters, numbers, dots, underscores or hyphens) |
| `FIRST_ADMIN_SETUP_ENABLED` | Text | Normally absent or `false` | Only the exact value `true` enables initial Admin setup alongside the seed credentials; remove or disable immediately after authorized setup |
| `GEMINI_API_KEY` | Secret | Required for Gemini | Google Gemini provider authentication |
| `OPENAI_API_KEY` | Secret | Optional | OpenAI provider authentication |
| `ANTHROPIC_API_KEY` | Secret | Optional | Anthropic provider authentication |
| `DEEPSEEK_API_KEY` | Secret | Optional | DeepSeek provider authentication |
| `OMNIROUTE_API_KEY` / `OMNIROUTE_KEY` | Secret | Optional | OmniRoute authentication |
| `OMNIROUTE_BASE_URL` / `OMNIROUTE_URL` | Text | Optional with OmniRoute | HTTPS base URL for the OmniRoute-compatible API |

Set optional model variables only when intentionally overriding the defaults: `GEMINI_MODEL`, `OPENAI_MODEL`, `ANTHROPIC_MODEL`, `DEEPSEEK_MODEL`, and `OMNIROUTE_MODEL`.

First-administrator setup is disabled unless the operator explicitly sets `FIRST_ADMIN_SETUP_ENABLED` to `true` **and** configures both seed values. It accepts only that exact username and password, is unavailable while any Administrator account exists (including inactive accounts), and uses the shared rate limiter. If the limiter or trusted client IP is unavailable, setup fails closed. An existing account must also match its stored password before promotion. Disable the setup switch after the authorized operation and use a separately reviewed recovery procedure for inactive Administrators. This is not a permanent one-time seal: if all Admin roles are removed and the switch and seed remain configured, setup may reopen. It is also not a global atomic constraint across concurrent account-role changes. Ordinary sign-in for existing accounts does not require the setup switch. The login route retains a separate seed-based password recovery path for an existing active Admin, so a configured seed remains a sensitive recovery credential even after initial setup. The operator should decide when to remove it, after confirming another safe recovery method; do not remove it blindly or post it in chat. These code and documentation changes do not change deployment settings or migrate a database.

The optional OmniRoute adapter requires **both** a server-side key and an HTTPS endpoint. JARVIS and JalalAi report it as configured when both values are nonblank; the adapter rejects an invalid or non-HTTPS endpoint before making a request. The deployment-controlled endpoint may forward submitted text to another provider. Confirm its privacy terms and possible charges before enabling it. Key and endpoint presence do not prove that authentication or a model request succeeds.

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
| `/api/approvals` | GET, POST | List pending approvals; Admin/Manager may request a recorded decision |
| `/api/approvals/:id` | PATCH, POST | Admin/Manager may approve or reject a pending decision |
| `/api/assistant/*` | GET, POST, PATCH, DELETE | Authenticated local/cloud assistant, confirmed tasks/notes and state |
| `/api/platform/*` | GET, POST, PATCH, DELETE | Agent Studio conversations, messages, transient history and compare votes |

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

Run from the recovered application directory (`source/AI-Syed-Jalal-FINAL-RECOVERED`):

```bash
npm ci
npm run check
npm test
npm run test:e2e
npm run build
```

The browser suite uses an isolated local database and speech/provider doubles; it is not a real device or live-provider test.

After deployment:

1. Read `GET /api/health` for database connectivity and `GET /api/ready` for the required table-name inventory. A ready response has `ready: true` and `schemaTables` equal to `required` (currently 24). This checks names only, not columns, indexes, migration history, data or provider behavior. A connected database alone is not readiness.
2. If readiness is incomplete, do not automatically migrate or repair production. First identify the actual target, verify a restorable full backup, rehearse the intended repair on an isolated clone, and obtain explicit operator approval. See [Production database safety](../../../docs/PRODUCTION-DATABASE-SAFETY.md).
3. Exercise authentication, CSRF, record CRUD, approvals, role restrictions, Agent Studio history/transient mode, attachments and compare voting on an isolated non-production deployment using test data. Those results do not themselves prove the production configuration.
4. With the owner's approval and awareness of provider costs, use a non-sensitive prompt to check that the intended deployed provider returns a real response with `status: "completed"` and `simulated: false`. Check provider failures, absent configuration and unauthorised access safely. A successful response proves only that particular request; it does not validate voice on a physical device.

Do not run destructive tests against production data. Record which deployment, test data, provider and device were actually exercised; do not mark the release fully verified from local or simulated results alone.

## Known gaps requiring separate implementation

The current Pages Function includes records backup/merge restore, administrative user management and a skills/library catalogue. Restore is a records merge, not a full tenant/database disaster-recovery restore. Unknown routes return 501. Live production verification still requires the configured Neon database, migrations, secrets and staging checks below.

The separate recovered backend directory is retained in the repository for reference; it is not automatically part of the Cloudflare Pages deployment. Cloudflare Pages is the production API runtime for this configuration. No Render service is required for the current architecture.
