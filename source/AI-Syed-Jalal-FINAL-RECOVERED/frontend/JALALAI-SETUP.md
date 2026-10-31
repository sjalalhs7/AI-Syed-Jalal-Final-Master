# JalalAi — mobile cloud chat

JalalAi is an entry point inside the existing AI-Syed Jalal website. It does not replace the homepage, login, dashboard, library, database, or approved rainbow SJ crown logo.

## Mobile cloud chat
- Cloud chat runs through the existing website on a phone; no local computer or OpenJarvis installation is needed for this chat.
- The page checks `/api/me`, obtains `/api/csrf`, then calls the authenticated `/api/ai/run` route using the server-configured Gemini provider.
- Gemini credentials remain server-side in Cloudflare Pages environment variables and are never sent to the browser.
- Private chat mode does not store prompt or reply text in `ai_runs`; it records limited request metadata in `audit_events` for security and per-user rate limits.
- Messages are still sent to Google Gemini and are subject to Google's service terms and retention policies.
- The server enforces authentication, CSRF protection, 20 requests/minute and 200 requests/day per user, request-size limits, and provider timeouts/retries.

## Current integration boundaries
- This page does not read or send Gmail, alter calendars, access contacts/files, or send WhatsApp messages.
- Gmail/Calendar authorizations made in ChatGPT are separate from this website.
- ElevenLabs voice is not integrated or tested on this page.
- The separate ChatGPT Daily Morning Briefing is not a JalalAi website feature.
- Any future external action must require clear approval before each action.

## Deployment and verification
Run `npm test` and `npm run check` from this frontend directory. Deploy through the existing Cloudflare Pages project. Verify in a signed-in mobile browser with a short non-sensitive test prompt. Confirm the chat reply appears and private-mode requests do not create an `ai_runs` row containing prompt/reply text. Do not change production database schema or secrets for this update.

Gmail/Calendar website OAuth, ElevenLabs voice, WhatsApp Business API, and OpenJarvis local runtime are separate projects and are not complete as part of this mobile chat change. Review Google permissions at https://myaccount.google.com/permissions.
