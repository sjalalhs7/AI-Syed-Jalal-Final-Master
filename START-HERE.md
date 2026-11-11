# Start here — AI-Syed Jalal and JARVIS

The selected **crowned SJ** identity, recorded greeting and application are included. Start with a local preview,
then follow the production checklist before using real accounts or private data.
The application does not have Iron Man–style autonomous access to devices,
email, or the outside world.

## 1. Start the application

Install Node.js 22.13 or newer. From the repository root, using the current
source (historical V153 archives may not include later fixes):

```sh
cd source/AI-Syed-Jalal-FINAL-RECOVERED
npm ci
npm run dev
```

Open `http://localhost:3000/guide.html` on the same computer. Select **Start
preview for me**, or open **JARVIS voice** and select **Try the local preview**.
Use **test data only**: this is a shared local sandbox with administrative
access, not a production deployment. The preview database and session secret
are kept in the ignored `.data/` directory.

## 2. Talk or type to JARVIS

1. Open `/jarvis.html` and sign in, or start the local preview.
2. Type a request and press **Send**, or press **Dictate once**, grant browser
   microphone permission and review the transcript before sending. One-shot
   automatic sending is off by default and can be enabled in advanced settings.
3. Try “calculate six times seven”, “show my tasks”, “add task: Review my
   project”, “show my tasks and notes”, or “open guide”. You can ask for open
   or completed tasks. Task and note writes require an explicit confirmation.
   English spoken-number calculations are bounded, not a general math tutor.
4. For turn-taking, press **Start conversation**. Each final transcript is sent
   automatically, and the microphone can reopen after a reply. Use **Interrupt
   & speak** during a spoken reply, or press **Stop**, hide the tab, or leave it
   to end the session. Stop ends local listening/speech and stops waiting; a
   server request already sent may still finish. Unsent drafts are protected.
5. Choose the speech language and, in **Voice and advanced settings**, a browser
   voice. This does not replace the selected opening recording. Recognition,
   voices and pronunciation depend on the browser and device. Cloud replies are
   asked to use the selected language, but this is not guaranteed; local tools
   respond in English. Typing remains available when speech is unsupported.

For free-form conversational answers, use **Cloud AI** with a provider that the
owner has configured and successfully tested. JARVIS may select a known
configured provider automatically and shows the chosen engine; no prompt is
sent to that provider until you speak or submit. Choose **Agent** or
**Local tools** to avoid a cloud AI request. Local tools, including the
calculator and confirmed tasks/notes, do not require an AI key. Research mode
may send the question to Wikipedia; recognized local saved-data commands stay
local. Agent mode may also perform a Wikipedia lookup when it recognizes a
research request.

Saved-data requests are matched conservatively, not understood in every language
or wording. Recognized exclusions ask for clarification rather than opening
saved items or contacting a provider for that turn; an unrecognized phrase may
still be sent when Cloud AI or Research is selected. Ask separately for the
items you want and review dictated text. JalalAi loads tasks and notes in its
sidebar on sign-in. A recognized exclusion hides both sidebar lists on that page;
previous chat remains visible, and reloading or choosing **Show saved lists**
shows the lists again. An older open JalalAi page may still reload both lists
after a message; refresh it to load the new behavior and use combined or
filtered reads.

## 3. Configure cloud AI safely (optional)

The owner can add `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or
`DEEPSEEK_API_KEY` as **server-side environment secrets**; the local preview
inherits its environment when launched. An Administrator may alternatively use
**Workspace → Operations → AI Provider Keys**, which stores the key in the
server database. Environment secrets take precedence. The optional OmniRoute
adapter requires a server-side key (`OMNIROUTE_API_KEY` or `OMNIROUTE_KEY`) and
an HTTPS endpoint (`OMNIROUTE_BASE_URL` or `OMNIROUTE_URL`); unlike the other
keys, those values are configured in the deployment environment, not the Admin
key panel. That endpoint may forward text to another provider and incur charges.
Never commit keys, put them in frontend files, or share them in chat. A
configured key does not prove a live provider call succeeds: with the owner's
approval, test using a non-sensitive prompt and be aware of potential charges.
No provider key is included in this repository.

The **Cloud AI** mode sends the current transcript to the selected provider.
Optional page-only conversation context is off by default. When enabled, up to
three recent successful cloud exchanges may be included; changing providers,
turning context off, clearing the session, or leaving the page clears it from
page memory. The app does not save those cloud prompts and responses as AI runs,
but audit metadata is recorded and the provider has its own data policies.
Agent and Research prompts and traces may be stored in the account. An
unconfirmed task or note proposal is not stored in agent history or saved as a
task or note. Clearing the page does not delete existing tasks, notes, or traces.
Browser recognition and some browser voices may use an online speech service;
the app itself does not receive microphone audio.

## 4. Static website versus full application

The historical `AI-Syed-Jalal-Website-V153-SJS-static.zip` is a **static
website only**, not the login/API/database server, and may not include newer
fixes. GitHub Pages similarly publishes only static files. For real accounts and
saved data, use the source application with a configured backend and database;
see [current status](docs/CURRENT-STATUS.md) and [production database safety](docs/PRODUCTION-DATABASE-SAFETY.md)
before production changes. Device-specific PWA features depend on the browser and
operating system. This version does not register background sync or push notifications.

The historical source archive does not include the large `AI-Syed-Jalal-Master.part*`
recovery parts. Those remain in the repository/release assets.

## 5. Verify

From `source/AI-Syed-Jalal-FINAL-RECOVERED`:

```sh
npm run check
npm test
npm run test:e2e
npm audit --omit=dev
```

The browser voice tests use simulated speech engines, not a physical microphone
or speaker. Live cloud providers, public deployment, production security/load,
and device-specific OS integrations must be verified separately.
