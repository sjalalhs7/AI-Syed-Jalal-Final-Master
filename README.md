# AI-Syed-Jalal — Reconciled Recovery Master

This repository contains the unified AI-Syed Jalal platform on `main`: the recovered source lineage, the repaired runnable application, and **SJ Agent Studio** (`/agent.html`). Historical recovery archives are preserved unchanged and are also available in the published `v1.0.0` GitHub Release.

## Locked design rule
The approved Login Page + Homepage + Logo identity, theme language, and hierarchy are locked. Add capabilities without unnecessary redesign. Older concept boards remain historical references, not replacements for the approved design.

## Source lineage
- V122-MERGED is the larger recovered source base: 9,950 files and 282,418,696 bytes uncompressed in its original archive.
- V125-FULL is a smaller curated continuation: 1,226 files and 18,719,357 bytes uncompressed. It is not a complete replacement for V122.
- The recovery master combines the V122 source lineage with selected V125 additions and verified engineering-baseline records.
- The original historical V25 archive remains missing/unverified.

## Main user-facing surfaces in the recovery package
- Public homepage and login entry
- Dashboard and workspace shell
- AI command console and agent catalog
- Google Gemini / AI Studio provider adapter and optional Google Search grounding configuration
- Bounded Supervisor and AutoGPT UI/API contracts
- Skills/catalog, Agency profiles/tools, learning roadmaps and OSSU reference material
- Profile/settings and OpenCode/Android IDE integration contracts

## Verification summary
Offline regression/source gates pass for the V76/V73/V75 lineage, 3,500 skills across 35 domains, 120 catalog roles, 303 Agency profiles, 16 Agency tool targets, bounded Supervisor/AutoGPT logic, roadmap data/page/menu, source audit, upstream references, and palette contract.

Local PostgreSQL-compatible integration and Chromium browser journeys now pass. Not yet proven as live production: owner-controlled Neon/Cloudflare staging, real provider calls, live Google Search grounding, physical device/voice tests, production load/penetration tests, and exact V25 lineage recovery. Source presence or UI controls are not proof of live integration.

See:
- `docs/FINALIZATION-STATUS.md`
- `docs/AGENT-CAPABILITY-ROADMAP.md`
- `docs/RELEASE-ASSET-HANDOFF.md`
- `docs/visual-history/` in the full recovery package

## Security
Provider secrets stay server-side. Do not commit API keys or production credentials. Medical features must be educational, source-grounded, and safety-gated. Microphone/camera/screen capabilities must be opt-in, permission-gated, visibly active, and revocable.

## Website and login status

- **GitHub Pages website:** https://sjalalhs7.github.io/AI-Syed-Jalal-Final-Master/ opens the static frontend. `.github/workflows/pages.yml` publishes `source/AI-Syed-Jalal-FINAL-RECOVERED/frontend` when the repository Pages source is set to GitHub Actions; the root `index.html` also provides a legacy-Pages launcher to the same frontend.
- **Important:** GitHub Pages is static hosting. It can display the login page and public guides, but it cannot run the login API, database, saved conversations or server-side AI. The site detects this and shows setup guidance instead of pretending sign-in succeeded.
- **Full application:** use the secure Cloudflare Pages + Neon deployment, or run locally from `source/AI-Syed-Jalal-FINAL-RECOVERED` with `npm ci` and `npm run dev`, then open `/guide.html`.
- Production sign-in still requires owner-controlled `DATABASE_URL`, `CSRF_SECRET`, applied migrations and provider keys. No credentials are stored in this repository.

## Runnable application and quick start (November 2026)

The repaired application is tracked under [`source/AI-Syed-Jalal-FINAL-RECOVERED/`](source/AI-Syed-Jalal-FINAL-RECOVERED/). From that directory run `npm ci` and `npm run dev`, then open `/guide.html` for one-click preview access, live capability status and a plain-language guide. `/jalalai.html` is the assistant; `/workspace.html` is the workspace; `/dashboard.html` is the profile/skills dashboard.

Use test data only in the local preview. See the [application status and verification report](source/AI-Syed-Jalal-FINAL-RECOVERED/APPLICATION-STATUS.md) for working features, test evidence, limitations and production release gates. The original recovery archives remain unchanged.

## Latest audit

[AUDIT-2026-11-03-EXPERT-LEVELUP.md](docs/AUDIT-2026-11-03-EXPERT-LEVELUP.md) continues from the
`85eeee7` premium-theme/voice-selector update: one shared browser-voice preference across JalalAi,
the Workspace dock, the Agent console and Agent Studio, removal of orphaned Workspace wiring, and a
hardened V129 quality gate. It also lists what remains owner-controlled.

## Final OK report

See [FINAL-OK-REPORT.md](FINAL-OK-REPORT.md) for the final handoff status, test evidence, package checksum and remaining production gates. [FINAL-VERIFICATION.md](FINAL-VERIFICATION.md) preserves the historical explanation of GitHub's 263 red deletion marks and the Worker gateway repair.


## Unified platform

SJ Agent Studio (`source/AI-Syed-Jalal-FINAL-RECOVERED/frontend/agent.html`) is the unified Arena-style workspace: Direct chat, bounded Agent workflows, side-by-side Compare, history, text/code attachments, voice and export. See `source/AI-Syed-Jalal-FINAL-RECOVERED/AGENT-STUDIO.md` and `PLATFORM-CONSOLIDATION.md`.
