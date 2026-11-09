# Start here — AI-Syed Jalal and JARVIS

The selected **crowned SJ** identity, recorded greeting and application are included. Start with a local preview,
then follow the production checklist before using real accounts or private data.
The application does not have Iron Man–style autonomous access to devices,
email, or the outside world.

## 1. Start the application

Install Node.js 22.13 or newer. From the repository root (or the folder extracted
from the V153 source archive):

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
2. Type a request and press **Run command**, or press **Start listening** and
   grant browser microphone permission. Review the transcript before sending.
3. Try “calculate six times seven”, “show my tasks”, “add task: Review my
   project”, or “open guide”. Task and note writes require an explicit
   confirmation. English spoken-number calculations are bounded, not a general
   math tutor.
4. Optionally select **Continue the conversation** before starting. Final
   transcripts are sent automatically, and the microphone can reopen after a
   reply. Press **Stop**, hide the tab, or leave it to end the voice session.
   Stop ends local listening/speech and stops waiting for a request; a server
   request already sent may still finish.
5. In **Voice settings**, choose the language and a device voice for assistant
   read-aloud. This does not replace the selected opening recording. Language
   selects recognition and pronunciation, not translation. Urdu recognition and
   voices depend on the browser and device. Typing remains available when
   speech input is unavailable.

For free-form conversational answers, choose **Cloud AI** and a provider that
the owner has configured and successfully tested. Local tools, including the
calculator and confirmed tasks/notes, do not require an AI key. Research uses
Wikipedia and requires network access.

## 3. Configure cloud AI safely (optional)

The owner can add `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or
`DEEPSEEK_API_KEY` as **server-side environment secrets**; the local preview
inherits its environment when launched. An Administrator may alternatively use
**Workspace → Operations → AI Provider Keys**, which stores the key in the
server database. Environment secrets take precedence. Never commit keys, put
them in frontend files, or share them in chat. A configured key is not proof
that a live provider call succeeds: select that provider and try a real request.
No provider key is included in this archive.

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

The separate `AI-Syed-Jalal-Website-V153-SJS-static.zip` is a **static website
only**, not the login/API/database server. It is packaged to show that limitation
on any static host. GitHub Pages similarly publishes only static files. For real
accounts and saved data, use the source application with a configured backend
and database; for production, see `APPLICATION-STATUS.md` and the deployment
checklist. Device-specific PWA features depend on the browser and operating
system. This version does not register background sync or push notifications.

The source archive includes the runnable application and documentation, but not
the large historical `AI-Syed-Jalal-Master.part*` recovery parts. Those remain
in the repository/release assets.

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
