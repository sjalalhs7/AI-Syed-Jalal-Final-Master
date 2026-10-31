# JalalAi — local integration plan

JalalAi is an entry point inside the existing AI-Syed Jalal website. It does not replace the homepage, login, dashboard, or approved rainbow SJ crown logo.

## Current module behavior
- `jalalai.html` checks the existing project's `/api/me` login endpoint.
- It attempts to reach the OpenJarvis local API at `http://127.0.0.1:8000` and uses documented `/health`, `/v1/models`, and `/v1/chat/completions` endpoints.
- Browser-to-localhost access can be blocked by CORS or browser policy. If so, use the official OpenJarvis local UI at `http://localhost:5173`; do not weaken CORS or expose the local API to the public internet to bypass the block.
- This page does not read or send emails, alter calendars, or send WhatsApp messages. No action-capable tool is connected here.

## Install only after identifying the computer
Official guide: https://open-jarvis.github.io/OpenJarvis/getting-started/installation/
- macOS/Linux/WSL2: follow the official `install.sh` instructions.
- Native Windows: follow the PowerShell installer instructions in the same guide.
- Then run `jarvis doctor` and `jarvis --help`. Confirm command syntax before changing configuration.
- Let `jarvis init` detect hardware or use the official hardware table to select a local model. Do not assume RAM or disk capacity.
- Test `jarvis ask "Who are you?"` or use the local chat interface.

## ElevenLabs key safety
OpenJarvis documents an ElevenLabs TTS backend. Keep `ELEVENLABS_API_KEY` only in the local process environment or local configuration supported by the installed version. Never put it in HTML/JavaScript, this repository, browser storage, screenshots, or Cloudflare Pages. Do not paste it into ChatGPT. Set a local voice ID after choosing a voice and test actual audio. ElevenLabs usage may have plan limits or charges; confirm current account terms.

## Gmail and Calendar
Use the documented Google connector (`jarvis connect gdrive`) after checking `jarvis --help` and connector docs. Sign in yourself in the browser. Grant the minimum available scopes. Test reading today's calendar and a small set of email metadata before enabling write-capable actions.

## WhatsApp limits
The documented WhatsApp connector reads exported chat files. Its WhatsApp channel uses API credentials and is not equivalent to connecting a personal WhatsApp account normally. Do not promise live inbound chat until the supported route is configured and tested.

## 8 AM morning digest
Official guide: https://open-jarvis.github.io/OpenJarvis/user-guide/morning-digest/
Before any preset command that overwrites settings, make a dated backup of `~/.openjarvis/config.toml`. Confirm the installed version's preset names and TTS backend using `jarvis --help` and official docs. Configure `Asia/Karachi` and schedule `0 8 * * *`. Restore assistant name, honorific, voice, and connectors after preset initialization. Run `jarvis digest --fresh`, verify audio and real calendar/email data, then configure startup using the OS-appropriate documented method. A powered-off or sleeping computer may miss the briefing.

## Acceptance checklist
- [ ] Actual computer OS, RAM, graphics and free storage checked.
- [ ] OpenJarvis installed; `jarvis doctor` checked.
- [ ] Local model answers “Who are you?” without a hosted AI key.
- [ ] ElevenLabs voice plays out loud without exposing its key.
- [ ] Gmail and Calendar are read-only and verified.
- [ ] WhatsApp route is agreed and tested; no false claim of personal-account support.
- [ ] Morning digest plays real email/calendar data at 8 AM Asia/Karachi.
- [ ] Confirmation gate tested before any send/delete/post/buy action.
- [ ] Stop and uninstall steps documented for the installed OS.

The module is not complete until the local computer and all selected services pass these tests.
