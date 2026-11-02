# AI-Syed Jalal application

Runnable repaired application. Requires Node.js 22.13+.

```sh
npm ci
npm run dev
```

Open port 3000, then **`/guide.html`** for the simplest start: one-click preview, live status, working commands and troubleshooting. Or open `/jalalai.html` and choose **Try the local preview**.

- `/jalalai.html` — assistant, local tools, optional voice, tasks and notes.
- `/workspace.html` — records, AI command, documents/print, admin and settings.
- `/dashboard.html` — profile, skills catalogue and quick assistant.

**Use test data only in the preview.** It is a shared sandbox with Admin access, not production. Data persists in ignored `.data/postgres`. Production uses Cloudflare Pages Functions and Neon, not this local Node server.

Local tools work without an AI key. Open-ended cloud AI needs a server-side provider key and live verification. OpenJarvis desktop control, Gmail/Calendar, WhatsApp and scheduled briefings are not connected.

## Verify

```sh
npm run check
npm test
npm run test:e2e
npm audit --omit=dev
```

See [APPLICATION-STATUS.md](APPLICATION-STATUS.md) for verified results, limitations and production release gates.


## Unified platform

SJ Agent Studio (`source/AI-Syed-Jalal-FINAL-RECOVERED/frontend/agent.html`) is the unified Arena-style workspace. See `AGENT-STUDIO.md` and `PLATFORM-CONSOLIDATION.md` in the app folder.
