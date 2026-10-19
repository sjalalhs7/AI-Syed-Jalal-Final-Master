# V121 Audit & Fix Report (static audit + offline tests; NOT runtime-verified)

Scope: `current/` of V120-FULL-CONSOLIDATED. `history/` (253 MB) untouched and not shipped here.
Limits: sandbox has no network, so `pg` could not be installed and the API was never started against Postgres. Everything below is code-read + static tests.

## Fixed in this package
| # | Severity | Problem (evidence) | Fix |
|---|----------|--------------------|-----|
| 1 | CRITICAL | Root `docker-compose.yml` never runs `migrate`/`seed` (Dockerfile CMD = `node server.mjs`). Fresh deploy has no tables and no admin, so login cannot work. | `command: migrate && seed && server` |
| 2 | CRITICAL | `sw.js` was cache-first for every GET incl. cross-origin `/api/*`: stale and cross-user authenticated data, stale deploys forever. | New SW: skips API/cross-origin/non-GET, network-first pages, SWR assets, old caches deleted |
| 3 | HIGH | Rate limits keyed on `remoteAddress`; behind nginx every user = proxy IP, so 12 logins/15 min is global (lockout DoS) and 240 req/min is shared. | `TRUST_PROXY` + `X-Forwarded-For`; nginx now proxies `/api/` |
| 4 | HIGH | `backend/docker-compose.yml` had no `CSRF_SECRET`, no `NODE_ENV`: CSRF tokens derived from public default string. | Required in compose; server refuses to start in production with default/short/placeholder secret |
| 5 | HIGH | `/api/ai/run` open to every role (incl. Viewer), no per-user limit: anyone with a login can burn provider credits. | Write-role required, 20 runs/min/user (`AI_RUNS_PER_MINUTE`), prompt cap |
| 6 | MED | `/api/audit`, `/api/security/events` readable by Viewer (IPs, usernames). | Manager/Admin only |
| 7 | MED | Failed logins not audited; unknown-user login returns faster than bad-password (username enumeration by timing). | Dummy scrypt + `LOGIN_FAILED` audit; limiter reset on success |
| 8 | MED | `seed.mjs` fell back to `ChangeMe-123!`. | Refuses weak/placeholder password |
| 9 | MED | nginx: SPA fallback returned HTML for missing assets, no `/api` proxy, no headers/gzip. | Rewritten `deploy/nginx.conf`; API port bound to 127.0.0.1 |
| 10 | LOW | Postgres 16 vs 18 across two compose files; smoke test hard-coded `V40`; dead `V26-OVERLAY` (missing CSS). | Aligned to 16; smoke regex; overlay removed |
| 11 | MED | 3 release tests failed (`audit:current`, `v73-final`, `v75-final`): they assert the app shell on `index.html`, but the app moved to `workspace.html` when the V100 homepage replaced it. | Tests re-pointed to `workspace.html` (stale tests, not missing features) |

## Still open (needs your decision, not guessed)
1. `tests/v120/staging-check.mjs` FAILS: test expects palette `#102A56/#159A70/#D8A62A`; shipped tokens + `v101-palette.css` use `#0B1F3A/#18B981/#F4C95D`. Merge README claimed V120 tokens were preserved; they were overwritten. Pick one palette, then edit one side.
2. Homepage does NOT match your design image. `index.html` is the older cyan/violet "AI Syed Jalal" page with a CSS cartoon character. The orange/gold/green "Alsyed Jalal AI Ultimate Power Agent" design (and `alsyed-jalal-logo.svg`) is not built into it.
3. Frontend: login requires typing an API URL by hand; with the nginx proxy the value is simply the site origin. Make it default to same-origin.
4. Token/PNG icons: manifest has only an SVG icon; add 192/512 PNG for installability.
5. Version drift: backend reports `V75-FINAL`, package `75.0.0`, project V120. Intentional per merge notes, but confusing.
6. Claims in docs ("100/100", "verified & ready") are not backed by a live run. Do not repeat them.
7. `history/` 253 MB: keep out of the deploy repo (git/zip bloat). 

## Deploy order (clean)
`cp .env.deploy.example .env` -> fill POSTGRES_PASSWORD, AUTH_SECRET, CSRF_SECRET (32+ random bytes), SEED_ADMIN_PASSWORD, one AI key -> `docker compose up -d --build` -> open `http://SERVER:8080` -> login screen: API URL = `http://SERVER:8080` -> sign in as admin. Put TLS in front, then set `SESSION_COOKIE_SECURE=true`.

## Stage 1 (added after report): homepage + login + logo
- New `frontend/index.html`: orange/gold/green theme, crowned "A" logo (`assets/alsyed-jalal-logo.svg`, also `app-mark.svg`), mobile-responsive.
- Login now calls `POST /api/auth/login` (cookie session, same-origin by default), shows real errors, then opens `workspace.html`, which restores the session via `/api/me`. The old fake login (localStorage only) is gone.
- Stats shown are real counts from the package (120 roles, 303 profiles, 3,500 skills). Invented numbers from the concept image (10K users, 99.9% uptime) are NOT used.
- NOT verified: login against a live API/Postgres (no network in sandbox). Only the error path and layout were exercised.
- Pending: Stage 2 dashboard shell; merge of ChatGPT's spec file with this spec into one master spec file.

## Stage 2: dashboard (`frontend/dashboard.html`)
- Login now lands here. Left menu, greeting from `/api/me`, real counts from `/api/ai/capabilities` (120 agents, 303 profiles, 3500 skills, providers), searchable agent grid (120 roles by group), Run Agent via `/api/ai/run` with CSRF, Security & Audit (diagnostics + audit feed, Admin/Manager).
- Agent Factory, Automation, Marketplace, Memory & Knowledge, Voice Assistant are shown as SOON on purpose: they do not exist yet.
- Screenshots used a MOCKED API (real agent catalog, fake responses). Not verified against the live backend.

## Stage 2b: Docker fix + upstream merge
- CRITICAL fix: `backend/Dockerfile` built from `./backend`, so `../config/*.json` (agent catalog, 3500-skill registry) was missing inside the image and the API would crash at startup. Build context is now the project root; verified by simulating the container layout (runtime loads, 120 agents). Real `docker build` NOT run (no Docker in sandbox).
- Superpowers (MIT): 15 real skills copied + `/api/library` + dashboard Library tab. Before this the project had only two label strings.
- awesome-llm-apps: 88 templates indexed (not bundled). agentscope: gap analysis. MedicalGPT: reference only. OpenEMR (GPL-3.0): not merged. See `docs/UPSTREAM-MERGE-V121.md` and `THIRD_PARTY_NOTICES.md`.

## Stage 2c: website chat widget
- `frontend/assets/ai-widget.js` (themed orange/green) added to the homepage; it posts to `/api/chat`.
- New public `POST /api/chat` is OFF by default (`PUBLIC_CHAT_ENABLED=false`). When on: 500-char prompt cap, 8 msgs/min and 40/day per IP, global daily cap (default 300), no database access for the agent.
- Verified only with a mocked endpoint in a browser. The real endpoint was not run (no Postgres or provider key in sandbox).
