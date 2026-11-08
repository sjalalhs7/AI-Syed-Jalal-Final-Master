# AI-Syed Jalal application — SJS and JARVIS

Runnable application. Requires Node.js 22.13 or newer.

```sh
npm ci
npm run dev
```

On the same computer, open `http://localhost:3000/guide.html` for the simplest
start, or `/jarvis.html` to open the voice assistant. Sign in or choose **Try
the local preview**. Use **test data only** in the preview: it is a shared
sandbox with Admin access, not production. Data persists in ignored
`.data/postgres`. Production uses Cloudflare Pages Functions and Neon, not this
local Node server.

## Use JARVIS

- Type a command, or press **Start listening** and allow microphone access.
  Review the recognized words and press **Run command**. Examples: “calculate
  six times seven”, “show my tasks”, “add task: Review my project”, “save note:
  an idea”, and “open guide”.
- To send final transcripts and listen again after each reply, opt in to
  **Continue the conversation** before starting. **Stop**, hiding the tab, or
  leaving it ends the voice session. Stop cannot guarantee a request already
  received by the server is cancelled.
- Agent and Local modes use bounded tools and structured guidance, not a general
  AI model. Task and note saves require explicit confirmation. Research uses
  Wikipedia and requires a network connection. Cloud AI gives open-ended
  answers only after a server-side provider is configured and actually works.
- Voice support, Urdu recognition and available voices vary by browser/device.
  Speech-language selection controls recognition/pronunciation, not translation.
  The browser speech service may process audio online, and some read-aloud
  voices may use an online service. The app does not receive microphone audio.
- Agent and Research prompts/traces may be stored in the account. Optional
  Cloud AI context is off by default and is sent only to the selected provider
  when enabled. The app keeps the context in page memory and does not save the
  cloud prompt/answer as an AI run; audit metadata and the provider's own
  policies still apply. Clearing the screen does not delete saved account data.

## Optional cloud setup

Set at least one of `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or
`DEEPSEEK_API_KEY` as a **server-side environment secret**, then start or
redeploy the server as appropriate. The local server inherits its launching
environment; it does not automatically load a `.env` file. Alternatively an
Administrator can save a key in **Workspace → Operations → AI Provider Keys**
when the application's `app_settings` table is available; this stores it
server-side in the application database. Environment secrets have precedence,
and removing an Admin-managed key does not remove an environment secret. If
the settings store cannot be read, Operations reports an unknown state rather
than asserting that no stored key exists. If a key change cannot be confirmed,
refresh its status and investigate before retrying: a lost response does not
prove the write was rolled back. Provider changes update one key atomically and
preserve unrelated settings; this is not a substitute for backups.

Provider status is three-state: configured, not configured, or unknown when
stored settings cannot be read. Deployment keys remain usable and take precedence;
unknown cloud selections are disabled and requests fail without contacting a
provider. OmniRoute uses deployment settings only. Never commit credentials or
place them in frontend files. Choose a configured provider in JARVIS and test a
real request; key presence alone does not prove the provider is available.

## Main surfaces

- `/guide.html` — live status, quick start, commands and troubleshooting.
- `/jarvis.html` — voice-first assistant with a typed fallback and explicit controls.
- `/jalalai.html` — assistant, local tools, tasks and notes.
- `/workspace.html` — records, AI command, documents/print, Admin and settings.
- `/dashboard.html` — profile, skills catalogue and quick assistant.
- `/agent.html` — Agent Studio with Direct, Agent and Compare modes.

GitHub Pages is a static website only; login, saved data and cloud AI require a
configured application server and database. OpenJarvis desktop control,
Gmail/Calendar, WhatsApp and scheduled briefings are not connected.

## Verify

```sh
npm run check
npm test
npm run test:e2e
npm audit --omit=dev
```

The browser suite deletes and recreates `.data/e2e`; never keep valuable data
there. Its local test server strips inherited provider credentials, seed-account
settings and the schema-repair unlock. Browser voice tests use simulated
recognition and synthesis. Live providers, physical microphones/speakers,
production deployment and device-specific PWA features need separate verification. See [APPLICATION-STATUS.md](APPLICATION-STATUS.md)
and the repository's `START-HERE.md` and V153 release notes.
