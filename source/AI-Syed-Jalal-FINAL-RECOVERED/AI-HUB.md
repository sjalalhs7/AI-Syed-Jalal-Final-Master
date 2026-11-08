# AI Hub

`frontend/ai-hub.html` is an original SJ-branded discovery surface for the existing website and installed application. It uses the same origin, session, application server and backend as Agent Studio. It does not install another backend, copy a third-party service or create a HuJu integration.

## What it offers

- **Explore:** filter and search categories including chat, assistants, coding, research, images, video/comics, voice, music, business and local tools. Each card describes inputs, output, limits and a real destination or editable text prompt.
- **Assistants:** five prompt starters hand a user-edited request to the existing Agent Studio. They are not separate autonomous agents or model instances. Local mode produces deterministic guidance and supported tools; open-ended generated responses need a configured provider and a successful request.
- **Skills:** a round-robin selection of up to 190 references from `frontend/config/agent-skill-index.json`, with different families sampled across the index's 35 domains. They are prompt starting points—not 190 installed or independently executable agents. Search, domain filters and pagination operate in the browser without writing to the database. The larger Agent Lab library/self-check requires the relevant database tables.
- **Provider status:** an authenticated, read-only request to `/api/ai/capabilities` shows configuration state for the existing text adapters. A configured key/endpoint is not a live connectivity, quota or model-access test. Failure, malformed data and signed-out/static modes are displayed as unknown rather than success. If the settings store cannot be read, deployment keys remain usable and affected Admin-managed provider states are reported as unknown, not absent. OmniRoute uses deployment settings only. Unknown cloud selections are disabled; no provider call is made for them.
- **Unsupported media:** image, video, comic and music generation are not connected. Related actions prepare a **text-only** brief or outline. JARVIS voice depends on browser capabilities and permission, and browser speech services may process audio online.

## Draft and privacy behaviour

The user reviews a prompt before leaving the Hub. Opening it in Agent Studio stores it temporarily in `sessionStorage` for that tab, then removes it after an authenticated Studio opens it. If sign-in is necessary, a fixed allowlisted return destination preserves the draft without placing prompt text in the URL. Nothing is automatically sent. If storage is blocked, the user can copy the prompt and open Studio manually; on a static host they must copy it before opening the separate secure app origin. Users should avoid sensitive drafts on shared devices. When a cloud engine is selected, provider terms apply to the content sent to it.

## Hosting and offline behaviour

The public Hub shell, reference index and artwork are precached by the existing service worker. When offline, the selection can still be browsed; provider status is explicitly unavailable and Agent Studio requires the application server. API responses and private Studio pages are never cached. GitHub Pages or another static copy can display the catalogue, but cannot authenticate or call providers; it links to the secure app. The abstract hero illustration is original AI-generated artwork for this surface.

No migration, schema repair, seeding, provider key or production data change is required by the Hub. Running other existing surfaces still depends on their own database readiness. Do not infer that a successful Hub page load means the database is fully migrated or backed up.

## Verification

Run `npm run check`, `npm test` and `npm run test:e2e -- tests/browser/ai-hub.spec.mjs` from this directory. The browser tests cover category/skill filtering, all 190 entries, sign-in draft continuity, local execution, static and blocked-storage behaviour, provider failures, six themes, mobile layout and the offline public shell.
