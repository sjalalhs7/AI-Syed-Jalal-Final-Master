# Agent Capability Roadmap

Add capabilities while preserving the locked Login/Homepage/Logo identity.

## Shared AI Assistant
Keep one conversational entry point for writing, planning, coding, analysis, and research. Preserve provider transparency, bounded tool calls, trace IDs, rate limits, and server-side credentials.

## Google AI Studio / Gemini
Use the existing server-side Gemini provider adapter. Optional Google Search grounding is controlled by `GEMINI_ENABLE_GOOGLE_SEARCH=true`. Keep `GEMINI_API_KEY` server-side. The UI must distinguish configured from live verified.

## Google Research and Wikipedia
Google research should use live search/grounding where enabled and show source links and retrieval times. Wikipedia should be a separate adapter with page title, canonical URL, retrieval timestamp and attribution. Do not treat Wikipedia as a primary source for current or medical claims. Report unreachable sources rather than inventing citations.

## Health & Medicine
Treat output as educational information, not diagnosis or prescription. Prefer reputable official/primary sources and current clinical guidance; include links and dates. Avoid inventing dose advice. Escalate emergency symptoms to qualified emergency care. Do not send patient data to third-party providers without explicit consent and a reviewed privacy policy.

## Professional Voice Assistant
Voice input/output must be opt-in and permission-gated. Show microphone/listening/speaking state; provide stop/cancel controls and text fallback. Wake-word listening stays disabled by default until privacy, browser/device support and battery impact are tested. Camera/screen access requires separate consent.

## Supervisor and bounded AutoGPT
Supervisor delegates to a limited set of specialist roles and records per-task status. AutoGPT uses a bounded iteration count and must not claim completion without evidence. Both require authenticated write access, CSRF protection, rate limits, goal-length caps and audit events.

## Release gates
1. Unit and source contract tests.
2. Browser E2E with a real authenticated session.
3. Real provider E2E using deployment secrets.
4. Medical safety and source-attribution tests.
5. Voice permission/stop/revoke tests on supported browsers and physical devices.
6. Production deployment, backup/restore and rollback drill.
