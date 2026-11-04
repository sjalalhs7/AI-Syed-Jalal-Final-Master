> Quick start: open `/guide.html` in the running app for live status, one-click preview, working commands and troubleshooting.

# JalalAi setup and permissions

JalalAi is part of the existing AI-Syed Jalal website. The approved homepage, login identity and rainbow SJ crown logo are retained.

## Start locally

From the application directory, run `npm ci` then `npm run dev`. Open `/jalalai.html` on port 3000. Sign in, or choose **Try the local preview**. For cloud deployment, no local computer or OpenJarvis installation is needed.

The preview is a disposable shared sandbox. Preview accounts can exercise Admin controls; use test data only. Tasks and notes are scoped to the signed-in account, while workspace records are shared. Production never enables preview login through a flag alone: the endpoint also requires the local server's in-process database adapter.

## Working without an AI key

Local mode provides a safe calculator, Pakistan clock, structured planning/critical-review/coding guidance, workspace search and confirmed task/note actions. These are deterministic tools/templates, not a language model. General open-ended answers require a configured cloud provider. Type `help` for examples.

A task or note is only a proposal until you press **Confirm & save**. Saved tasks/notes survive reloads, can be deleted and can be exported. Chat is transient and is not written to AI history. Clearing chat does not delete saved tasks/notes.

## Cloud AI

Select **Cloud AI** explicitly. Provider keys stay on the server. The assistant calls the authenticated `/api/ai/run` route through `/api/assistant/chat`; it never embeds a provider key in frontend code. Private cloud chat does not store prompt or reply text in `ai_runs`; limited security metadata and atomic per-user quotas remain. The underlying AI route allows 20 requests/minute and 200/day, with an additional assistant bucket of 30/minute.

Messages sent in cloud mode go to the selected provider and are subject to that provider's terms and retention policy. A configured key is not proof of model access or availability. Missing keys, provider errors and local fallback are labeled. No live provider call was verified without credentials.

## Voice and privacy

- **Speak** uses browser Web Speech recognition when available. Review the transcript before sending. The browser vendor may process audio remotely; this is not guaranteed on-device recognition.
- **Read reply** uses browser speech synthesis. Voice availability and whether a voice is local depend on the browser/OS. You can stop playback or cancel a pending chat request.
- Microphone access is requested only after a user action. Denial, unsupported recognition and network failures have text-input fallbacks. Automated browser checks cover unsupported recognition, not physical microphone quality or every mobile speech service.
- ElevenLabs voice remains a separate premium server integration requiring `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID`. It is not enabled by the redesigned page's default playback button. Enabling it requires a separate disclosure that assistant reply text is separately sent to ElevenLabs, user-triggered consent and a live test. Configure credentials only in Cloudflare production secrets/variables, never in frontend files.

## Not connected

This page does not read Gmail, Calendar, contacts, files, or another person's private data. No email, calendar, WhatsApp, sending, purchasing or computer-control action is connected. OpenJarvis desktop control and the separate ChatGPT Daily Morning Briefing are not website features. Any future external action must require your approval and a separately verified integration.

The cloud agent catalogue contains prompt profiles, not independent autonomous agents. Local expert profiles provide checklists, not a substitute for professional security, legal or medical review.

## Verify and deploy

Run `npm run check`, `npm test`, `npm run test:e2e` and `npm audit --omit=dev` from the application directory. See `../APPLICATION-STATUS.md` for the exact local verification scope and production gates. Apply migrations 005, 006, 007 and 009 to staging, configure Neon and CSRF secrets, verify 15 readiness tables, then repeat account/data/assistant checks on Cloudflare. Do not claim production readiness from local tests alone.
