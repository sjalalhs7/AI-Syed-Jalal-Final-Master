# JalalAi — mobile cloud chat

JalalAi is part of the existing AI-Syed Jalal website. It keeps the existing homepage, login, workspace, approved rainbow SJ crown logo, Cloudflare Pages Functions API, and Neon database.

## Mobile chat

- Open `/jalalai.html` from the existing website on Android or another modern browser.
- Sign in through the existing project workspace first.
- The page checks the existing `/api/me` session, obtains a CSRF token from `/api/csrf`, and submits prompts to the authenticated `/api/ai/run` route.
- The AI provider key stays server-side in Cloudflare Pages secrets. It is never placed in browser JavaScript.
- The existing API applies per-user quotas (20 requests/minute and 200/day) and enforces session authentication and CSRF validation.
- The API currently saves prompts and AI replies in the existing `ai_runs` database history. Clearing the visible chat only clears the browser screen; it does not erase those records. Do not submit passwords or highly sensitive information.

## What this does not enable

- This page does not read Gmail, Calendar, contacts, files, or another person's private data.
- It does not send email or WhatsApp messages, edit calendars, publish posts, make purchases, or delete records.
- ChatGPT account connections are separate from website-level OAuth connections.
- ElevenLabs voice, website-level Gmail/Calendar OAuth, WhatsApp Business, and per-action approval enforcement still require separate implementation and end-to-end testing.
- Provider key presence is not proof of a successful live request. The first real chat message is the provider smoke test.

## Optional local OpenJarvis

OpenJarvis is not required for the mobile cloud chat. It is an optional local-computer runtime and is not suitable as the required backend for a phone-only setup. Do not expose its localhost API to the public internet to work around browser restrictions.

Official guide: https://open-jarvis.github.io/OpenJarvis/

## Verification

From the frontend project directory:

```bash
npm install --no-audit --no-fund
npm test
npm run check
```

After a preview deployment, verify on an Android browser:
1. Existing project login succeeds.
2. JalalAi identifies the signed-in account.
3. Provider configuration is detected without exposing secrets.
4. A real prompt returns a provider response.
5. Missing session, invalid CSRF token, missing provider key, and provider errors fail safely.
6. Existing workspace, login, dashboard, and library remain unchanged.
