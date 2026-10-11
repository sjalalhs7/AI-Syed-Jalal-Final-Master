# AI-Syed Jalal V55 — Google AI Studio / Gemini Final Level-Up

V55 keeps V54 as the engineering baseline and adds an optional Google AI Studio / Gemini provider using Google's Interactions API. The default model is `gemini-3.8-flash`; Google Search grounding can be enabled with `GEMINI_ENABLE_GOOGLE_SEARCH=true`.

## Configuration

Set these variables on the backend only:

- `GEMINI_API_KEY`
- `GEMINI_MODEL=gemini-3.8-flash`
- `GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta`
- `GEMINI_ENABLE_GOOGLE_SEARCH=true`

Never place `GEMINI_API_KEY` in frontend JavaScript, HTML, localStorage, or a public repository.

## Architecture

Browser → HttpOnly session → V55 API → AI runtime → Gemini Interactions API → optional Google Search grounding → controlled local tools → PostgreSQL/audit.

Existing DeepSeek, OpenAI-compatible and OmniRoute routes remain available as compatibility/fallback providers.
