# AI-Syed Jalal application

This is the recovered, runnable application source. The repository's original recovery archives and audit controls remain at the repository root.

## Run

Requires Node.js 22.13+:

```sh
npm ci
npm run dev
```

Open port 3000. `/jalalai.html` is the assistant; `/workspace.html` is the workspace; `/dashboard.html` is the profile/skills dashboard. Use the local-preview button for a disposable test account, or register through the homepage.

**Use test data only in the preview.** It is a shared sandbox with Admin access, not production. Data persists in ignored `.data/postgres`. Production uses Cloudflare Pages Functions and Neon, not this local Node server.

## Working features

- Local calculator, clock, planning/review templates, tasks/notes with confirmation and persistence.
- Optional browser voice input/output; optional server-configured cloud AI.
- Authenticated workspace, record CRUD/import/export, admin controls, diagnostics, print preview and themes.
- Public-shell PWA fallback without caching private pages or API responses.

Cloud AI needs your own server-side provider key and a live verification. OpenJarvis desktop control, Gmail/Calendar, WhatsApp and scheduled briefings are not connected. Browser speech support varies by device.

## Verify

```sh
npm run check
npm test
npm run test:e2e
npm audit --omit=dev
```

See [APPLICATION-STATUS.md](APPLICATION-STATUS.md) for verified results, limitations and production release gates. Do not treat local tests as production certification.


## Runnable application (November 2026)

The recovered application is now tracked under [`source/AI-Syed-Jalal-FINAL-RECOVERED/`](source/AI-Syed-Jalal-FINAL-RECOVERED/). Run `npm ci` and `npm run dev` in that directory. See its [application status and verification report](source/AI-Syed-Jalal-FINAL-RECOVERED/APPLICATION-STATUS.md) for working features, local-preview instructions and remaining production/external-service gates. The original recovery archives remain unchanged.
