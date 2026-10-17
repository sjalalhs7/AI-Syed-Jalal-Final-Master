# Agent Capability Roadmap

This document defines the additive agent layer without changing the locked Login/Homepage/Logo identity.

## 1. Shared AI Assistant

- Keep one conversational entry point for writing, planning, coding, analysis, and research.
- Use the existing catalog/runtime and controlled tool layer.
- Preserve provider/model transparency, bounded tool calls, trace IDs, rate limits, and server-side credentials.

## 2. Google AI Studio / Gemini

- Use the existing server-side Gemini provider adapter.
- Optional Google Search grounding is controlled by `GEMINI_ENABLE_GOOGLE_SEARCH=true`.
- Keep `GEMINI_API_KEY` on the server only.
- UI must distinguish “configured” from “live verified.”

## 3. Google Research and Wikipedia

- Google research should use live search/grounding where enabled and show source links and retrieval times.
- Wikipedia should be a separate source adapter, with page title, canonical URL, retrieval timestamp, and attribution. It should not be presented as a primary source for current or medical claims.
- If a source cannot be reached, report that instead of fabricating citations.

## 4. Health & Medicine

- Treat medical output as educational information, not a diagnosis or prescription.
- Prefer reputable primary/official sources and current clinical guidance; include links and dates where available.
- Ask for missing context only when needed; avoid inventing dose advice or interpreting emergency symptoms casually.
- Include emergency escalation language for red-flag symptoms and advise a qualified clinician for individual treatment decisions.
- No patient data should be sent to third-party providers without explicit consent and a reviewed privacy policy.

## 5. Professional Voice Assistant

- Voice input/output must be opt-in and permission-gated.
- Show microphone/listening/speaking state; provide stop/cancel controls and a text fallback.
- Wake-word listening is disabled by default until device/browser support, privacy behavior, and battery use are tested.
- Camera/screen access is a separate capability with separate consent, not bundled into microphone permission.

## 6. Supervisor and bounded AutoGPT

- Supervisor delegates to a limited set of specialist roles and records per-task status.
- AutoGPT runs a bounded iteration count; it must not claim task completion without evidence.
- Both require authenticated write access, CSRF protection, rate limits, goal-length caps, and audit events.

## 7. Release gates

1. Unit and source contract tests.
2. Browser E2E with a real authenticated session.
3. Real provider E2E using secrets supplied through deployment configuration.
4. Medical safety and source-attribution tests.
5. Voice permission/stop/revoke tests on supported browsers and physical devices.
6. Production deployment, backup/restore, and rollback drill.
