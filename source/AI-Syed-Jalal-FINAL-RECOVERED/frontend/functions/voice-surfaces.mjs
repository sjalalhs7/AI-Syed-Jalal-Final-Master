// V137 — canonical voice-surface contract.
//
// The JARVIS console and the Agent Lab self-check both need the same answer to
// "which surfaces can speak, and what must each one guarantee?". Keeping the
// list here means the page, the tests and the runtime cannot drift apart: if a
// surface is added to the application but not to this file, the self-check fails
// and the build gate fails too.
//
// Honest limits (stated on the page, not implied away):
// * Speech recognition and synthesis are the browser's own engines. The server
//   never receives audio and cannot speak for you.
// * When a browser exposes no voices, the console says so instead of falling
//   back silently to the default voice.
// * Spoken requests reach exactly the same endpoints as typed ones, so the same
//   rate limits, ownership checks and confirmations apply.

/**
 * Every surface with read-aloud capability.
 * `element` is the DOM id of the voice selector that must exist on that page.
 */
export const VOICE_SURFACES = Object.freeze([
  Object.freeze({ file: 'jalalai.html', label: 'JalalAi assistant', element: 'voice', speak: 'readBtn', listen: 'micBtn' }),
  Object.freeze({ file: 'jarvis.html', label: 'JARVIS voice console', element: 'voice', speak: 'speakBtn', listen: 'talkBtn' }),
  Object.freeze({ file: 'agent.html', label: 'Agent Studio', element: 'agentVoice', speak: 'readBtn', listen: 'micBtn' }),
  Object.freeze({ file: 'workspace.html', label: 'Workspace dock', element: 'ajVoiceChoice', speak: 'ajDockRead', listen: 'ajDockMic' })
]);

/** What every surface is required to ship. Checked by the self-check and tests. */
export const VOICE_CONTRACT = Object.freeze({
  sharedPreference: 'aj-speech-voice-v1',
  sharedModule: 'assets/speech-preferences.js',
  noServerAudio: true,
  needsGesture: true,
  honestUnsupported: true
});

export const VOICE_LIMITS = Object.freeze([
  'Speech recognition is the browser engine (Web Speech API). Chrome and Edge support it; Firefox does not, and Safari support varies by version.',
  'Read-aloud uses the browser speech-synthesis engine and the voices that device exposes. No audio is generated on the server.',
  'Your microphone stays off until you press the talk button, and it stops automatically when the transcript is final.',
  'Spoken requests use the same endpoints, limits and confirmations as typed ones. Voice never grants extra permissions.',
  'Audio is never stored: no recording is uploaded, and the transcript is ordinary chat text you can edit before sending.'
]);

/** True when a page source ships the shared module and a bindable voice selector. */
export function surfaceShipsContract(html) {
  const source = String(html || '');
  if (!source.includes(VOICE_CONTRACT.sharedModule)) return { ok: false, reason: 'does not load assets/speech-preferences.js' };
  if (!/data-aj-voice/.test(source)) return { ok: false, reason: 'has no data-aj-voice selector' };
  if (/<script[^>]*>\s*speechSynthesis\.speak/.test(source)) return { ok: false, reason: 'speaks inline instead of using the shared module' };
  return { ok: true };
}
