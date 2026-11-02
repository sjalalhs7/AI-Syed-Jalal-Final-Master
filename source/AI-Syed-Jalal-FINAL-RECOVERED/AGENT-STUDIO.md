# SJ Agent Studio

`frontend/agent.html` is the unified Arena-style agent workspace for AI-Syed Jalal. It keeps the approved SJ identity and connects the existing assistant, workspace, dashboard, data vault, documents and admin tools into one conversation-centered platform.

## Modes

| Mode | What it does | What it does not do |
| --- | --- | --- |
| Direct | One engine answers; local tools can calculate, plan, critique, search records, and propose tasks/notes. | It does not silently browse, email, control a desktop, or run external actions. |
| Agent | Bounded workflow: understand → plan → draft/tool → review. Steps are shown in the reply. | It is not an autonomous infinite loop and does not claim unexecuted actions. |
| Compare | Two engines answer side by side; the user can vote A / tie / B. | Votes are local product feedback, not a public leaderboard. |

## Engines

- Local: SJ Local Tools, Planner, Critic, Coding Advisor, Analysis Advisor. These work without an AI key and are deterministic guidance/tools, not cloud LLMs.
- Cloud: Gemini, OpenAI, Anthropic Claude, DeepSeek, OmniRoute. These require server-side environment variables. The UI labels key configuration state; a configured key still requires a successful live request.

## Conversation features

- Account-scoped conversation history with search, rename, delete and export (Markdown; Shift-click export for JSON).
- History toggle. When off, message text is not stored and the conversation uses the generic title “Private conversation”; the conversation shell may remain so settings can be remembered.
- Text/code attachments: `.txt`, `.md`, `.csv`, `.json`, `.js`, `.ts`, `.py`, `.html`, `.css`, `.xml`, `.yaml`, `.log`, `.sql`. Maximum four files, 120,000 characters each, 240,000 total. Local mode performs deterministic file inspection; cloud mode sends file text to the selected provider.
- Browser voice input and read-aloud where supported. Microphone is requested only on button press.
- Confirmed task/note creation through the existing assistant confirmation endpoint.
- Light/dark theme, responsive sidebar, tools panel, keyboard shortcut Ctrl/Cmd+K for a new conversation.

## API

All routes require an authenticated session. Mutations require `X-CSRF-Token`.

- `GET /api/platform/state`
- `GET/POST /api/platform/conversations`
- `GET/PATCH/DELETE /api/platform/conversations/:id`
- `POST /api/platform/conversations/:id/messages`
- `POST /api/platform/conversations/:id/vote`

Database migration: `backend/db/migrations/007_v129_agent_platform.sql`. Readiness now requires 13 tables.

## Privacy and safety

- Conversations are saved only when history is enabled. Turning history off deletes stored messages for that conversation.
- Cloud prompts are sent to the selected provider with `privacyMode: true`, so the app does not store prompt/response text in `ai_runs`; provider terms still apply.
- Attachments are treated as user data, not instructions.
- No Arena.ai proprietary backend, private models, paid accounts, or credentials are copied. This is an original SJ implementation of the multi-mode agent workflow pattern.
