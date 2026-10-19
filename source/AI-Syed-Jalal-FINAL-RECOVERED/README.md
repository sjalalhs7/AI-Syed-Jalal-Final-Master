# AI-Syed-Jalal — Reconciled Recovery Master

This package consolidates the recovered V122 source lineage with selected V125 recovery additions and preserves the approved Login Page, Homepage, Logo, theme language, and design hierarchy.

## Start here

- `docs/FINALIZATION-STATUS.md` — source lineage, regression evidence, feature truth table, and remaining live-verification gates.
- `docs/AGENT-CAPABILITY-ROADMAP.md` — AI Assistant, Google/Gemini, Wikipedia, Health & Medicine, voice, Supervisor/AutoGPT, and release safety requirements.
- `docs/visual-history/` — recovery audit, locked visual definition, and visual comparison board.
- `README-V123-FINAL.md` — prior V122/V125 merge notes and historical verification boundary.
- `backend/package.json` — available regression and runtime test commands.

## User-facing surfaces

- `frontend/index.html` — public homepage/login entry.
- `frontend/dashboard.html` — authenticated dashboard shell and learning-roadmap navigation.
- `frontend/workspace.html` — workspace, AI command console, provider selection, bounded Supervisor and AutoGPT panels.
- `frontend/roadmaps.html` — learning roadmaps page.

## Run locally

Requires Node.js 20+ and PostgreSQL. Review `backend/.env.example`, `.env.deploy.example`, and deployment docs. Configure credentials only in server-side environment variables. Never commit secrets.

```bash
cd backend
npm install
npm run test:release
node ../tests/v120/agent-systems.mjs
node ../tests/v120/ui-agent-systems.mjs
node ../tests/v124-roadmaps.mjs
```

For a real deployment, apply database migrations and configure a strong `AUTH_SECRET`/`CSRF_SECRET`, database credentials, explicit allowed CORS origins, and at least one supported AI provider. Follow the deployment-specific instructions before exposing the service publicly.

## What is and is not verified

Offline source/regression gates cover 3,500 skills across 35 domains, 120 catalog roles, 303 Agency profiles, 16 Agency tool targets, V76/V73/V75 release checks, bounded Supervisor/AutoGPT logic, roadmap content, and source contracts.

The current source does **not** prove a fully live production release. Live PostgreSQL, real provider/fallback calls, Google Search citations, dedicated Wikipedia integration, medical safety E2E, voice/device permissions, physical browser/mobile tests, Windows/VPS deployment, and the original historical V25 archive remain verification or recovery gaps. See `docs/FINALIZATION-STATUS.md`.

## Design lock

Add capability. Preserve identity. The approved Login, Homepage, Logo, and theme system are locked. Historical boards are reference evidence, not permission to replace the approved design with an older visual generation.
