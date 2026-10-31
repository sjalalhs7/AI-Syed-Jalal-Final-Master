# JalalAi + Jarvis: ElevenLabs voice setup

The JalalAi page now supports user-triggered speech for assistant replies through the authenticated Cloudflare API. Gemini remains the text-chat provider. Audio is generated only after the user taps **Listen**.

## Production configuration

In Cloudflare Pages, open project `ai-syed-jalal-live` → **Settings** → **Variables and Secrets** → **Production** and add:

- `ELEVENLABS_API_KEY` — **Secret**. Use the existing ElevenLabs account key. Never put this value in GitHub, source files, browser code, or chat.
- `ELEVENLABS_VOICE_ID` — **Variable**. Use the voice ID selected for the Jarvis/Jalal voice.
- `ELEVENLABS_MODEL_ID` — optional **Variable**. Defaults to `eleven_multilingual_v2`.

Save the Production configuration and deploy the updated production branch. Preview deployments need their own Preview bindings if they are to be tested.

## Security and behavior

- The browser never receives the ElevenLabs API key.
- `/api/voice/speak` requires the existing signed-in session and CSRF token.
- Speech requests are limited to 30 per user per hour and 2,500 characters per request.
- The route times out after 20 seconds and rejects audio larger than 12 MB.
- The app logs request metadata for quotas/security, not the spoken text or returned audio.
- Tapping **Listen** sends the assistant reply text to ElevenLabs. This is disclosed in the JalalAi privacy section.
- Missing key or voice ID returns a clear configuration error; text chat remains available.

## Verification still required after configuration

Sign in to the production site, send a short chat prompt, tap **Listen**, and confirm MP3 playback on Android. A successful code test does not prove the live ElevenLabs account key, voice ID, quota, or billing are valid.
