# Application implementation and verification — 2 November 2026

## What runs now

The recovered application is now tracked in this directory, rather than existing only inside recovery archives. The original homepage, account identity and approved SJ crown asset are retained. A new **Start here** guide (`/guide.html`) gives one-click preview access, live capability status, working commands and clear troubleshooting; it is linked from the homepage, assistant, workspace and dashboard.

- **SJ Agent Studio:** unified Direct / Agent / Compare workspace with account-scoped history, transient mode, engine selection, text/code attachments, voting, export, voice controls and links to the existing tools.
- **JalalAi:** authenticated chat, calculator, Pakistan clock, structured planning/critical-review/coding guidance, workspace-record search, private tasks and notes. Task/note creation requires explicit confirmation. Tasks can be completed/deleted; notes can be deleted; both can be exported.
- **Voice:** user-triggered browser speech recognition with transcript review, stop/cancel and permission/error fallbacks; browser speech synthesis with voice selection and stop. Actual microphone recognition and audible output depend on the browser, OS, permissions and speech service. Automated tests verify fallback behavior, not a physical microphone or human listening quality.
- **Cloud AI:** explicit opt-in through the existing server-side Gemini/OpenAI/Anthropic/DeepSeek adapters. Missing keys or provider failures are labeled; local guidance is not presented as a generated cloud answer. No provider credentials were supplied, so no live cloud model call is claimed.
- **Workspace/dashboard:** local-tool mode works without a provider key; cloud mode remains gated on configuration. The universal dock and homepage widget use the authenticated assistant route. Record CRUD/import/export, admin user controls, diagnostics, print preview and themes are retained and repaired where tested. The approval queue now has a real Admin/Manager UI backed by `/api/approvals`; approval records a human decision and does not execute an external action by itself.
- **Authentication/data:** HttpOnly sessions, CSRF, server-side roles, atomic quotas, account-scoped assistant tasks/notes, persistent preview database. Preview login is enabled only by the local server's in-process database adapter; a production environment variable alone cannot enable it or insecure cookies.
- **PWA:** public-shell offline fallback; private workspace/assistant/dashboard pages and all API responses are not cached by the service worker.

## Try it

Requires Node.js 22.13+ and npm, Linux/macOS for the bundled browser-test runner.

```sh
cd source/AI-Syed-Jalal-FINAL-RECOVERED
npm ci
npm run dev
```

Open port 3000, then `/guide.html` for the simplest start. Choose **Start preview for me**, or open `/jalalai.html` and choose **Try the local preview**. You can also register/sign in through the homepage. The preview database is `.data/postgres`; its session-signing secret is `.data/session-secret`. Both are ignored by Git. Back up this directory before deleting it. Use `PORT` to change the port. `DATA_DIR` is available for disposable test databases and must remain under `.data/`.

**The preview is a disposable shared sandbox, not a production tenant.** Preview accounts receive Admin to exercise the controls. Tasks/notes are account-scoped, but workspace records and user administration are shared. Do not enter sensitive or real personal data. The local Node server explicitly refuses `NODE_ENV=production`.

Working local commands include:

```text
help
calculate (1200 + 350) * 15%
What is the current time?
plan: Launch a professional website
critic: Review my launch readiness
add task: Review the proposal
save note: A private test note
show tasks
show notes
search records: project name
```

## Verification

Run:

```sh
npm run check
npm test
npm run test:e2e
npm audit --omit=dev
```

Final local verification on 2 November 2026 (unified V129 platform):

- 67 frontend contract tests passed.
- 16 server tests passed, including real PGlite/PostgreSQL queries, sessions/CSRF, account isolation, confirmed task persistence, records CRUD, backup/merge restore, approval request/resolve role checks, worker-gateway behavior, admin operations and production preview-login denial.
- 5 Chromium browser journeys passed, covering Agent Studio sign-in/direct/agent/compare/vote/history/mobile, plus assistant persistence/voice fallback/sign-out, workspace AI/dock/record CRUD/approval request-approve/admin/diagnostics/print/theme, dashboard/library/homepage login/mobile layout, and the guide/one-click preview/assistant record search.
- The recovered backend release gate (`npm --prefix backend run test:release`) passed: V76 grand audit, V71 skills, V73 quality/final, V75 final/agency, Wikipedia adapter and capability contracts. Stale UI/palette/path gates were reconciled with the current approved UI instead of restoring retired controls.
- Cloudflare Worker gateway dry-run (`wrangler deploy --dry-run`) passed; the gateway still requires `BACKEND_API_URL` for live proxying and is not a substitute for the Pages Functions API.
- 100 JavaScript modules/inline scripts parsed; 20 static checks passed.
- Production dependency audit: zero known advisories at the time of the check.

Browser tests use npm-distributed Chromium and a separate disposable `.data/e2e` database. They do not use the preview database. Tests are evidence for the local adapter, not a Neon/Cloudflare production certification.

Hosted verification for the unified platform: [application CI run 41392227632](https://github.com/sjalalhs7/AI-Syed-Jalal-Final-Master/actions/runs/41392227632), [recovery-control run 41392419328](https://github.com/sjalalhs7/AI-Syed-Jalal-Final-Master/actions/runs/41392419328) and [CodeQL run 41392418993](https://github.com/sjalalhs7/AI-Syed-Jalal-Final-Master/actions/runs/41392418993) passed. Cloudflare Pages and Workers Builds checks also passed. CodeRabbit was skipped by configuration, not failed. The application workflow now runs on `main`, Arena work branches and pull requests.

## Production deployment: still required

PRs #13 and #14 were merged into `main`; historical superseded PRs #1, #2 and #12 were closed. No manual production deployment, DNS change, provider-key configuration or production database migration was performed. Hosted build/deployment checks are recorded separately from owner-controlled production certification.

1. Use `frontend/` as the Cloudflare Pages output directory and retain `frontend/functions/` and `_headers`.
2. Configure Neon `DATABASE_URL` and a strong `CSRF_SECRET` (at least 32 characters) as server secrets. Do not set `LOCAL_PREVIEW`, `COOKIE_SECURE=false`, or a database adapter in production.
3. Apply the reviewed SQL migrations to a staging database, including `005_v127_auth_rate_limits.sql`, `006_v128_assistant_tools.sql` and `007_v129_agent_platform.sql`, then verify `/api/ready` reports 15 required tables (V133 adds `agent_skills` and `agent_self_checks`). `backend/db/schema.sql` includes the assistant tables for a fresh database; do not blindly replay destructive operations against existing data.
4. Configure only the provider keys you intend to use. Verify model access and a real non-sensitive prompt for each provider. Key presence is not a live-provider test.
5. Repeat registration/login/logout, password change, role restrictions, record CRUD/import/export, backup and a controlled merge restore, assistant confirmation/persistence, mobile voice and PWA checks against staging.
6. Verify backup restoration and rollback before promoting the deployment. Production data migration and release approval remain owner responsibilities.

The restore feature is a **records merge**, not a full tenant/database disaster-recovery restore. Matching record IDs are overwritten after confirmation; unrelated records are retained. Users, sessions, assistant notes/tasks and audit history are not restored by that endpoint.

## Explicitly not connected or certified

- OpenJarvis desktop/OS control, Gmail/Calendar OAuth, contacts, WhatsApp, scheduled morning briefings and autonomous external actions.
- Premium ElevenLabs playback: the existing authenticated server adapter remains available, but the redesigned assistant uses browser speech by default. ElevenLabs needs its own server key/voice ID, disclosure/consent and live verification before being enabled in a UI.
- The cloud agent catalogue is a set of prompt profiles, not hundreds of independently executing agents. Supervisor/AutoGPT are bounded provider-backed text workflows, not unrestricted computer agents.
- The universal dock does not process attachments. The legacy cloud console/provider path may accept images; no cloud image request was live-verified here.
- Physical microphone/speaker behavior across Safari/Firefox/Android/iOS, production load testing, independent penetration testing and legal/medical compliance certification.

Local planning/review output is a structured template. It is not represented as an expert human review or an external model response. See `frontend/JALALAI-SETUP.md`, `frontend/API-DEPLOYMENT.md` and the repository audit for additional boundaries.


## V129 Agent Studio update

- Added `frontend/agent.html` with Direct / Agent / Compare modes, account-scoped history, text/code attachments, voice, export, tools panel and theme.
- Added `/api/platform/*` routes and migration `007_v129_agent_platform.sql`; V133 raised the readiness requirement to 15 tables by adding the Agent Lab tables.

## V133 Agent Lab update (3 November 2026)

- Added `frontend/agent-lab.html` + `assets/agent-lab.{js,css}`: a real self-check surface that posts to `/api/agent/self-check`, stores per-account evidence in `agent_self_checks`, plots a run history and searches the skill library.
- Added `/api/agent/skills` (search/list/sync), `/api/agent/self-check` (GET history, POST run), `/api/agent/capabilities` and `/api/agent/report`, backed by migration `009_v133_agent_skills.sql`.
- The self-check engine (`frontend/functions/self-check-core.mjs`) runs 15 weighted, timeout-bounded checks across application, data, reasoning, agents, honesty, security and catalogue groups. A thrown or hung check is recorded as a failure with its observation; nothing is silently skipped.
- `frontend/config/agent-skill-index.json` is generated from the 3,500-skill catalogue by `scripts/build-skill-index.mjs` (63 KB vs 1.1 MB) and verified for freshness in CI.
- Readiness now requires 15 tables. Verification: `npm run check` (27 static checks), `npm test` (80 frontend + 27 server), `npm run test:e2e` (11 browser journeys including two Agent Lab journeys).
- Local engines work without keys. Cloud engines remain credential-gated and honestly labeled.
- Verification: `npm run check`, `npm test` (67 frontend + 16 server), `npm run test:e2e` (5 browser journeys), `npm audit --omit=dev` 0, backend release tests PASS.
- Final handoff: see repository-root `FINAL-OK-REPORT.md`.


## GitHub Pages static website (November 2026)

The GitHub Pages workflow publishes the frontend directory so the website URL opens the actual homepage instead of the repository root. GitHub Pages is a static host: login, database-backed workspace features and cloud AI require the secure application server. The frontend detects `*.github.io` / `file:` hosting, shows a static-preview banner, blocks dead sign-in submissions with setup guidance, and keeps local preview access available only when a real local server enables it.

Browser regression coverage now includes static-host login guidance and password visibility. This does not certify production authentication; Neon/Cloudflare configuration and live provider verification remain owner-controlled release gates.
