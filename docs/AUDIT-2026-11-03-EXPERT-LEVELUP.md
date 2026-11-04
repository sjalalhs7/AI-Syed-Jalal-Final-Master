# Expert audit and level-up — 2026-11-03

Baseline: `85eeee7` *feat(ui): premium JalalAi theme and voice selector* — the update authored
with ChatGPT. This work continues **from that commit**, verified via the GitHub compare API as
7 commits ahead and 0 behind the previous Arena handoff (`7633be8`). No prior work was discarded.

## Scope

Audit the newly added premium theme / voice selector, fix what is genuinely broken, and raise the
surrounding quality bar. Every claim below was reproduced locally before being changed.

## Baseline verification (before any change)

| Gate | Result |
| --- | --- |
| `npm audit --audit-level=high` | 0 vulnerabilities |
| `npm run check` | 104 modules, 22 static checks |
| Frontend tests | 71 / 71 |
| Server tests | 16 / 16 |
| Browser tests | 7 / 7 |
| Recovery controls (`unittest`) | 23 / 23 |
| First-party JS syntax | 79 files |

The inherited baseline was green. The findings below are gaps that the existing gates did not cover.

## Findings and disposition

### F1 — Voice selector reached only one of four read-aloud paths · HIGH · FIXED

The new `#ajVoiceChoice` selector was honoured **only** by the Workspace dock. The Workspace main
prompt ignored it, JalalAi kept a separate list, and Agent Studio had no selector at all. A user
choosing a voice reasonably expects it everywhere.

All read-aloud paths now resolve through one module, `frontend/assets/speech-preferences.js`.

### F2 — Voice choice was lost on reload and could not be shared · MEDIUM · FIXED

JalalAi stored no preference and keyed voices by `name`; the new Workspace selector keyed them by
`name|lang` under `jalalai-speech-voice-v1`. The two could not interoperate.

There is now a single canonical key, `aj-speech-voice-v1`, using `name|lang`. The original
`jalalai-speech-voice-v1` value is **migrated, not discarded**, so an existing choice survives.
Preferences sync across selectors and across browser tabs.

### F3 — Dead controls on browsers without speech support · MEDIUM · FIXED

When `speechSynthesis` was unavailable the selector stayed enabled but did nothing. It is now
disabled, marked `aria-disabled`, and explains itself. This matches the project's existing
"no dead buttons" rule.

### F4 — Agent Studio forced English · MEDIUM · FIXED

`agent.js` hard-coded `speech.lang = 'en-US'`, ignoring both the user's language and any chosen
voice — a real problem for an Urdu-speaking user. It now uses the browser language and the shared
voice, and Agent Studio gained a voice selector in its Tools panel.

### F5 — Orphaned "main prompt" wiring in the Workspace · MEDIUM · FIXED

`workspace.html` contained 16 lines of handlers referencing **eight element IDs that exist nowhere
in the markup** (`mainPromptForm`, `mainPromptInput`, `mainPromptSend`, `mainPromptReply`,
`mainPromptMic`, `mainPromptFiles`, `mainPromptFileStatus`, `mainPromptSpeak`). Optional chaining
hid the failure, so the code silently did nothing.

The dead block was removed and the capability it implied was delivered properly: the real Agent
console now has a working `#aiReadBtn` (read aloud / stop) driven by the shared voice.

### F6 — Unpinned GitHub Action in the new quality gate · MEDIUM · FIXED

`.github/workflows/v129-quality.yml` (renamed `v133-quality.yml` in V133) used `actions/setup-node@v4`, a mutable tag, while every other
action in this repository is pinned to a commit SHA. Pinned to
`49933ea5288caeca8642d1e84afbd3f7d6820020` (v4) to keep the supply-chain posture consistent.

### F7 — Quality gate did not run on Arena working branches · LOW · FIXED

The push filter listed only `main` and two historical `fix/...` branches, so branch work received
no push CI. `arena/**` was added, matching `verify-application.yml`.

### F8 — Asynchronous voice lists could stay empty forever · LOW · FIXED

Some engines populate `getVoices()` asynchronously without emitting `voiceschanged`. A bounded
retry (10 × 250 ms) now populates the catalogue, then stops.

## Precedence rule

An explicitly chosen voice wins and speaks its own language, because a voice cannot reliably speak
another. With no explicit choice, the requested language is matched exactly, then by base language,
then the browser default is used. JalalAi's existing language selector therefore keeps working.

## Verification after the change

| Gate | Result |
| --- | --- |
| `npm run check` | **106 modules, 24 static checks** |
| Frontend tests | **80 / 80** (9 new) |
| Server tests | 16 / 16 |
| Browser tests | **9 / 9** (2 new) |
| `npm audit --audit-level=high` | 0 vulnerabilities |
| Recovery controls | 23 / 23 |
| Backend `test:release` | PASS |
| Worker syntax | PASS |

New coverage:

- `frontend/tests/speech-preferences.test.mjs` — 9 unit tests: unsupported browsers, catalogue
  population, legacy-key migration, voice/language precedence, persistence, cross-selector sync,
  graceful clearing of a voice the device no longer exposes, and asynchronous arrival.
- `tests/browser/speech-voice.spec.mjs` — 2 Chromium tests proving one choice is honoured by
  JalalAi, the Workspace dock and the Agent console, that Agent Studio honours it, and that it
  survives navigation and a full reload.
- Two permanent static checks guard the wiring and prevent the orphaned block returning.

**Testing note.** A real `SpeechSynthesisUtterance` rejects a plain object assigned to `.voice`
(Web IDL type check), which silently aborted `speak()`. The browser test double therefore fakes the
utterance as well as the engine and the voices. Without this the test would have passed vacuously.

## Still open — owner-controlled, not claimed as done

1. **Google OAuth / social sign-in** — explicitly deferred in the baseline commit message. Username
   and password remain the only active method.
2. **Live provider end-to-end calls** — requires owner-held provider keys. A configured key is still
   not proof of a successful authenticated response.
3. **Public recovery archive sanitisation** — the open item recorded in
   `docs/PRODUCTION-READINESS-AUDIT-2026-11-02.md` stands: verify the reported credential is revoked,
   then rebuild and re-publish the archive and all split parts with a new checksum. This was not
   attempted here; it is destructive and needs owner verification.
4. **Production activation** — Neon `DATABASE_URL`, `CSRF_SECRET`, migrations and provider keys.
   GitHub Pages remains a static preview and says so.

No credentials, secrets or provider data were added, and no external integration is represented as
connected.
