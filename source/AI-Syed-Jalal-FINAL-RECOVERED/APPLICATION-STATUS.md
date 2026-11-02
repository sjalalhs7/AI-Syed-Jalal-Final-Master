# Application implementation and verification — 2 November 2026

## What runs now

The recovered application is now tracked in this directory, rather than existing only inside recovery archives. The original homepage, account identity and approved SJ crown asset are retained.

- **JalalAi:** authenticated chat, calculator, Pakistan clock, structured planning/critical-review/coding guidance, workspace-record search, private tasks and notes. Task/note creation requires explicit confirmation. Tasks can be completed/deleted; notes can be deleted; both can be exported.
- **Voice:** user-triggered browser speech recognition with transcript review, stop/cancel and permission/error fallbacks; browser speech synthesis with voice selection and stop. Actual microphone recognition and audible output depend on the browser, OS, permissions and speech service. Automated tests verify fallback behavior, not a physical microphone or human listening quality.
- **Cloud AI:** explicit opt-in through the existing server-side Gemini/OpenAI/Anthropic/DeepSeek adapters. Missing keys or provider failures are labeled; local guidance is not presented as a generated cloud answer. No provider credentials were supplied, so no live cloud model call is claimed.
- **Workspace/dashboard:** local-tool mode works without a provider key; cloud mode remains gated on configuration. The universal dock and homepage widget use the authenticated assistant route. Record CRUD/import/export, admin user controls, diagnostics, print preview and themes are retained and repaired where tested.
- **Authentication/data:** HttpOnly sessions, CSRF, server-side roles, atomic quotas, account-scoped assistant tasks/notes, persistent preview database. Preview login is enabled only by the local server's in-process database adapter; a production environment variable alone cannot enable it or insecure cookies.
- **PWA:** public-shell offline fallback; private workspace/assistant/dashboard pages and all API responses are not cached by the service worker.

## Try it

Requires Node.js 22.13+ and npm, Linux/macOS for the bundled browser-test runner.

```sh
cd source/AI-Syed-Jalal-FINAL-RECOVERED
npm ci
npm run dev
```

Open port 3000, then `/jalalai.html`. Choose **Try the local preview**, or register/sign in through the homepage. The preview database is `.data/postgres`; its session-signing secret is `.data/session-secret`. Both are ignored by Git. Back up this directory before deleting it. Use `PORT` to change the port. `DATA_DIR` is available for disposable test databases and must remain under `.data/`.

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

Local verification on 2 November 2026:

- 61 frontend contract tests passed.
- 9 server tests passed, including real PGlite/PostgreSQL queries, sessions/CSRF, account isolation, confirmed task persistence, records CRUD, backup/merge restore, admin operations and production preview-login denial.
- 3 Chromium browser journeys passed, covering assistant persistence/voice fallback/sign-out, workspace AI/dock/record CRUD/admin/diagnostics/print/theme, dashboard/library/homepage login/mobile layout.
- 93 JavaScript modules/inline scripts parsed; 15 static checks passed.
- Production dependency audit: zero known advisories at the time of the check.

Browser tests use npm-distributed Chromium and a separate disposable `.data/e2e` database. They do not use the preview database. Tests are evidence for the local adapter, not a Neon/Cloudflare production certification.

## Production deployment: still required

No production deployment, DNS change, PR merge or external-account mutation was performed.

1. Use `frontend/` as the Cloudflare Pages output directory and retain `frontend/functions/` and `_headers`.
2. Configure Neon `DATABASE_URL` and a strong `CSRF_SECRET` (at least 32 characters) as server secrets. Do not set `LOCAL_PREVIEW`, `COOKIE_SECURE=false`, or a database adapter in production.
3. Apply the reviewed SQL migrations to a staging database, including `005_v127_auth_rate_limits.sql` and `006_v128_assistant_tools.sql`, then verify `/api/ready` reports 11 required tables. `backend/db/schema.sql` includes the assistant tables for a fresh database; do not blindly replay destructive operations against existing data.
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
