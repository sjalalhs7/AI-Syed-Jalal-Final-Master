# V153 — SJS JARVIS conversation and application completion

Date: 7 November 2026 · Base: `main` @ `1084c90` (V152 SJS identity)

## What changed

- The approved **SJS** identity is retained and the homepage links directly to
  JARVIS. Sign-in or preview access returns to JARVIS through a validated
  same-site destination. The homepage/login hierarchy remains intact.
- JARVIS has a responsive voice/text console, visible microphone state, a
  prominent mobile listening control, explicit errors, and real tool evidence.
  One-shot dictation is reviewed by default. Optional automatic sending and
  optional continued conversation are separate choices. The microphone can
  restart after a reply only after the user opts in and presses Start listening;
  it stops on Stop, a speech error, a hidden tab, or navigation.
- Stop detaches speech handlers, stops local listening/speech and stops waiting
  for an in-flight request. It does **not** promise to undo a server operation
  that has already started. Delayed speech and server callbacks are ignored.
- The calculator handles bounded English spoken-number arithmetic as well as
  typed expressions, rejects unsupported/ambiguous expressions, and labels a
  partially handled multi-part request. Clock questions handle named supported
  cities instead of always reporting Pakistan time.
- Agent and Research modes prepare task/note actions for a separate,
  authenticated, CSRF-protected confirmation; an unconfirmed agent proposal is
  not persisted in agent history. Tasks and notes are account-scoped. Voice
  startup requests provider/tool metadata without prefetching private tasks or
  notes; list requests fetch only the data the user asked for.
- Cloud AI offers Gemini, OpenAI, Anthropic and DeepSeek when configured on the
  server. An optional, off-by-default page session context sends at most six
  short user/assistant messages to the chosen provider, with an overall prompt
  bound. Context is cleared on opt-out, provider change, session clear, sign-in
  expiry or page exit. Cloud runs use app privacy mode; upstream policies and
  audit metadata still apply. A configured key does not prove a successful call.
- Shared browser voice settings no longer discard a saved voice while the device
  is still loading its voices, or resurrect an older voice after choosing System
  default. Unsupported speech and speech errors preserve the typed fallback.
- The static website archive is explicitly marked static, including on generic
  static hosts, so it cannot pretend its login/API is connected. The source
  archive retains the repository layout and a correct `npm run test:e2e`
  command. See `START-HERE.md` for the difference between the packages.
- The widget now refreshes on install/resume without registering background
  sync. Activation removes a periodic widget job created by earlier versions.
  No push notification or file-system access capability was added.

## Privacy and practical limits

The application server receives transcripts, not raw microphone audio. Browser
speech recognition may send audio to the browser vendor, and some browser voices
may send read-aloud text to a speech service. Voice support, Urdu availability,
permission prompts and audio quality vary by browser and device; selecting a
speech language does not translate replies.

Agent and Research prompts and traces may be stored on the account. Cloud AI
prompts and answers in this console are not stored as application AI runs, but
request/completion audit metadata is recorded and the external provider may
retain data under its own terms. Clearing the page does not delete previously
saved tasks, notes or traces. The local preview is a shared Admin sandbox: use
test data only.

JARVIS cannot access Gmail, WhatsApp, devices, programs or external accounts,
and has no wake word or background listening. Open-ended responses need a
working cloud provider; local tools do not. GitHub Pages is static and cannot
host the login/API/database. Production needs owner-controlled deployment,
database, secrets and separate verification. See `START-HERE.md`.

## Verification

The latest complete gate counts are recorded below after running the current
source. Speech browser journeys use deterministic recognition/synthesis doubles;
cloud UI/provider routing tests use mocked provider responses. Integration tests
exercise real application routes, account isolation and CSRF against PGlite.
Neither test double proves that a physical microphone, speaker or cloud provider
works on a particular device or account.

- `npm run check`: **51/51** static checks.
- `npm test`: **83 frontend** and **161 server/integration** tests.
- `npm run test:e2e`: **59 browser journeys**, including hostile sign-in return targets.
- The source archive was clean-extracted, installed and checked with the same
  frontend/server, static and browser gates. The static archive was served on a
  generic local host: its 25 HTML pages and 30 precache entries returned HTTP 200,
  its no-backend warning appeared, and the guide/logo worked offline in Chromium.

Not verified: actual physical voice I/O, real provider responses, live public
endpoint, owner-controlled Neon/Cloudflare staging, production load/penetration,
or operating-system-specific widget/side-panel behavior. A successful CI run,
manifest declaration or API-key presence is not evidence for those claims.
