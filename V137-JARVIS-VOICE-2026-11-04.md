# V137 — JARVIS voice console: every option verified

Date: 4 November 2026 · Base: `main` @ `4a6c7bb` (V136) · Repo: `sjalalhs7/AI-Syed-Jalal-Final-Master`

## What was asked

> "Add JARVIS please, and confirm that all options are working correctly — voice assistant features
> are necessary for this."

Two things, and the second one is the hard part. A voice page is easy to add and easy to fake. So
this release adds the console **and** a contract that fails the build if any voice option stops
working.

## The console

`jarvis.html` is a hands-free front end for the **same bounded agent runtime** JalalAi uses. It adds
no new powers:

| Option | What it actually does |
| --- | --- |
| **Hold to talk** | Opens the microphone only on press and closes it on the final transcript, on error, or on Stop. The reply is never spoken before it exists. |
| **Hands-free** | When on, the reply is read aloud automatically with the remembered voice. When off, **Repeat last reply** speaks it on demand. |
| **Run on final transcript** | Optional: sends the command as soon as the browser marks the transcript final. Otherwise the text lands in the box for you to edit. |
| **Response engine** | Agent (tool calls + trace), Research (live Wikipedia), Local tools, Cloud AI. The mode label changes with it. |
| **Speech language / Browser voice** | Urdu (PK), English (US/UK) and every voice the device exposes — through the *same* remembered preference as JalalAi, Agent Studio and the Workspace dock. |
| **Stop** | Cancels listening, speech, and an in-flight request. Detaching handlers first is deliberate: some engines emit a final `onresult` during `abort()`, which used to start the command the user had just cancelled. |
| **Last run evidence** | The real tool trace — steps, tool names, durations, output, failures — not a summary. |

## How "all options work" is proven, not asserted

`frontend/functions/voice-surfaces.mjs` is a **single source of truth** for every read-aloud surface
(JalalAi, JARVIS, Agent Studio, Workspace dock) and what each must ship. Three things consume it:

1. **The runtime** — a 19th graded self-check, `voice.surfaces`, fails if a surface disappears, stops
   loading the shared preference module, or if JARVIS itself is not shipped.
2. **The build gate** — three new static checks (34 total) assert the page, its assets, the shared
   module, and that the private shell stays out of the service-worker precache.
3. **The browser suite** — `tests/browser/jarvis-voice.spec.mjs` drives the real UI with a
   deterministic fake speech engine and microphone, and asserts **what was spoken, in which voice, in
   which language**, and what the trace shows.

That last point matters: the journeys prove voice-in → real tool → voice-out end to end. A voice
console that merely renders buttons cannot pass them.

## Bugs this work found (and fixed)

The browser journeys were written expecting them to pass first time. They did not:

- **A missing speech engine crashed the page.** `'speechSynthesis' in window` is true even when the
  property is `undefined`, so `window.speechSynthesis.cancel()` threw and the console was dead before
  sign-in — on exactly the browsers that needed the typed fallback.
- **The spoken reply overwrote the run outcome.** When speech ended it reset the status line to
  "Ready", erasing the tool count and any failure warning the user needed to read.
- **Stop could launch the command it cancelled.** `abort()` on some engines fires a final
  `onresult`; handlers are now detached before aborting.
- **A moving target is an unusable button.** The talk button changed width with its label, so the
  second click landed off it. Fixed width, fixed label text.
- **The browser suite exceeded a real production limit.** `POST /api/demo` allows 10 preview
  accounts per minute per IP; a full run legitimately creates one per spec. The limit is now
  configurable (`PREVIEW_SESSION_MINUTE`) with the production default unchanged — the test server
  raises it, production does not.

## Verification

| Gate | Command | Result |
| --- | --- | --- |
| Static checks | `npm run check` | **34/34** (3 new) |
| Frontend contracts | `npm --prefix frontend test` | 80/80 |
| Server + integration | `node --test server/tests/*.test.mjs` | **61/61** (5 new voice tests) |
| Browser journeys | `npm run test:e2e` | **17/17** (3 new JARVIS journeys) |
| Agent Lab self-check | `POST /api/agent/self-check` | **19/19, score 100** |
| Backend release · audit | — | 8 suites PASS · 0 vulnerabilities |

Live run captured in `screenshots/jarvis-v137.png`: `calculate (1200 + 350) * 15% * 3` →
"1 tool call(s), 0 failure(s)", step output `= 697.5`, spoken back through the browser voice.

## Still not claimed

- **Speech engines are the browser's.** Chrome/Edge expose recognition; Firefox does not, and the
  console says so and stays usable by typing. Synthesis needs voices installed on the device.
- **This sandbox has no microphone and no audio device.** The journeys use a deterministic double, so
  they prove the wiring and the contract — not that a specific phone's microphone is loud enough.
- The console still cannot open doors, control devices, read Gmail, send WhatsApp messages, or run
  programs. That is stated on the page, in the page's own words, not only in this note.
