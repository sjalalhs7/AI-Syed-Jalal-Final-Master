# AI-Syed-Jalal V123 FINAL (single merged package)

Built from the three uploaded packages. Nothing here is claimed "production verified": see "Not verified".

## What was merged
- **Base = V122 (which contains V121 fixes, which contain V120 `current/`).**
- **Restored from V120 (lost in V121/V122):** `backend/agent-systems/` (Supervisor + AutoGPT), `config/v120-feature-registry.json`, `deployment/online/` (Caddy + production compose), `tests/v120/agent-systems.mjs`, `tests/v120/ui-agent-systems.mjs`.
  - `/api/ai/supervisor` and `/api/ai/autogpt` re-added to `server.mjs`, now with the V121 guards (write role + per-user rate limit + goal length cap).
  - Supervisor & AutoGPT card restored in `frontend/workspace.html` (AI Command view). In V120 its script was misplaced inside the JSON-LD block, so it never ran; it is now a real script at the end of the page.

## What was removed
- `history/` (253 MB archive from V120) — not shipped.
- V122 full raw copies of AgentScope, MedicalGPT, Awesome-LLM-Apps, OpenEMR, duplicate Superpowers (~287 MB). Replaced by lean text-only extracts in `integrations/reference/` (see its README). OpenEMR is GPL-3.0 PHP: only its docs/license are kept. The wired Superpowers skills (`integrations/upstream/superpowers`, 15 skills) and the 88-template index (`config/upstream-library-v121.json`) are kept.
- V122 `components/AIWidget` + `config/api.js`: the file did `import './AIWidget.css'`, which browsers cannot load, so it never mounted. The working widget is `frontend/assets/ai-widget.js` (homepage). Dead script tags removed from 4 pages.
- Stale V122 notes, `ai-runtime-v43-backup.mjs`.
- `tests/v120/staging-check.mjs` palette expectation updated to the palette actually shipped (`#0B1F3A / #18B981 / #F4C95D`).

## File audit (every file hashed)
- V120 `current/`, V120 `history/`, V121, V122: all functional files are present in this package, identical or in their newest version. Only older variants of the same files were dropped.
- Older V120 homepage kept as `frontend/legacy/index-v120-cyan-violet.html` (21 KB).
- NOT included: `ORIGINAL-V25-SOURCE ... .tar.zst` (217 MB, in V120 `history/`). Keep your copy of that zip separately; it could not be opened here (no zstd).

## Deploy
1. `cp .env.deploy.example .env` and fill: `POSTGRES_PASSWORD`, `AUTH_SECRET`, `CSRF_SECRET` (32+ random chars each), `SEED_ADMIN_PASSWORD`, and at least one AI key (DeepSeek / Gemini / OpenAI / OmniRoute).
2. `docker compose up -d --build`
3. Open `http://SERVER:8080`, sign in as `admin` with `SEED_ADMIN_PASSWORD`.
4. Put TLS in front (Caddy config in `deployment/online/`), then set `SESSION_COOKIE_SECURE=true`.

## Verified (offline, in sandbox)
- Syntax check of all backend/frontend JS; all JSON valid.
- Tests passing: audit:current, v71-skills, v73-quality, v73-final, v75-final, v75-agency, v120-agent-systems, v121-upstream, v120 ui-agent-systems, v120 staging-check, v101-palette.
- Server boots (with a stubbed database); `/api/health` = 200; Supervisor/AutoGPT/run return 401 without login.

## Not verified
- Real PostgreSQL, real login, real AI-provider calls, `docker build`, browser/mobile rendering. No network or Docker in the sandbox.
- 19 old tests (`tests/v45…v56`, `quality-gate`, etc.) fail. They fail identically in V120 and V122: they assert text of the old homepage and old version strings. They are stale, not new breakage.
- Learning Roadmaps page (Go + Programming Skills) added in V124; see `docs/REQUIREMENTS-V124.md` for what is DONE vs PLANNED.
- Homepage design is the V121 orange/gold/green page, not pixel-matched to your concept image.
- `backend` still reports `V75-FINAL` (kept for old test compatibility).

## V125 additions
- `frontend/assets/demo-data.json` + demo mode in `dashboard.html` (`?demo=1`, or automatic on github.io without a saved API): real agent catalog and library, placeholder agent output.
- Fixed old `workspace.html` bug: three stray `async` lines stopped the page script (AI Command, Operations views never initialised).
- GitHub Pages bundle: see `jalalai-github-pages.zip`.
