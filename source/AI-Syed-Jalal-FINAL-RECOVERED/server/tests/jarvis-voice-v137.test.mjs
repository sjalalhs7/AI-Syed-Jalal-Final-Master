/**
 * V137 — JARVIS voice console contract.
 *
 * These tests exist because "voice assistant works" is easy to claim and hard to
 * verify. They check the parts that can be verified without a microphone: the
 * shared voice contract, the page wiring, and the honest fallbacks. The browser
 * journey in tests/browser/jarvis-voice.spec.mjs drives the real UI with a fake
 * speech engine and asserts what is actually spoken.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = file => readFile(resolve(root, file), 'utf8');

test('every voice surface is declared and shares one preference module', async () => {
  const { VOICE_SURFACES, VOICE_CONTRACT } = await import('../../frontend/functions/voice-surfaces.mjs');
  assert.ok(VOICE_SURFACES.length >= 4, 'the contract must cover every read-aloud surface');
  assert.equal(VOICE_CONTRACT.sharedPreference, 'aj-speech-voice-v1');
  for (const surface of VOICE_SURFACES) {
    const html = await read('frontend/' + surface.file);
    assert.ok(html.includes(VOICE_CONTRACT.sharedModule), `${surface.file} must load the shared voice module`);
    assert.ok(html.includes('data-aj-voice'), `${surface.file} must expose a voice selector`);
    assert.ok(html.includes(`id="${surface.element}"`), `${surface.file} declares a selector id that does not exist`);
    assert.ok(html.includes(`id="${surface.speak}"`), `${surface.file} declares a speak button that does not exist`);
    assert.ok(html.includes(`id="${surface.listen}"`), `${surface.file} declares a listen button that does not exist`);
  }
});

test('the console states what it cannot do instead of implying more', async () => {
  const html = await read('frontend/jarvis.html');
  const js = await read('frontend/assets/jarvis.js');
  // The page must be explicit about the microphone, audio and external control.
  assert.match(html, /microphone stays off/i);
  assert.match(html, /does not upload audio/i);
  assert.match(html, /does not open doors/i);
  assert.match(html, /does not fake a voice answer/i);
  // Unsupported browsers get a typed fallback, not silence.
  assert.match(js, /Voice input is not supported in this browser/i);
  assert.match(js, /cannot speak the reply/i);
  // The console must not be able to speak before it has a reply.
  assert.match(js, /\$\('speakBtn'\)\.disabled = !lastReply \|\| busy/);
  assert.match(js, /listening \? '■ Stop listening'/);
});

test('spoken commands reach exactly the same endpoint as typed ones', async () => {
  const js = await read('frontend/assets/jarvis.js');
  // One path to the server, with the same mode/profile body as JalalAi.
  const calls = js.match(/api\('\/assistant\/chat'/g) || [];
  assert.equal(calls.length, 1, 'the console must have a single chat path');
  assert.match(js, /mode: \$\('mode'\)\.value/);
  assert.match(js, /profile: \$\('profile'\)\.value/);
  // No client-side tool execution: the console cannot answer arithmetic itself.
  assert.doesNotMatch(js, /eval\(|new Function\(/);
});

test('the voice surface check is part of the graded self-check', async () => {
  const source = await read('frontend/functions/self-check-core.mjs');
  assert.match(source, /id: 'voice\.surfaces'/);
  const { builtInChecks } = await import('../../frontend/functions/self-check-core.mjs');
  const checks = builtInChecks();
  const voice = checks.find(check => check.id === 'voice.surfaces');
  assert.ok(voice, 'the voice contract must be graded, not asserted in prose');
  assert.equal(voice.group, 'honesty');
  // Run it the way the engine does, with the page inventory supplied.
  const pages = ['index.html', 'agent.html', 'jalalai.html', 'workspace.html', 'dashboard.html', 'guide.html', 'agent-lab.html', 'arena.html', 'jarvis.html']
    .map(file => ({ file, exists: true, closesHtml: true }));
  const detail = await voice.run({ pages });
  assert.match(detail, /voice surfaces share one remembered voice/);
  // A missing page must fail the check rather than pass quietly.
  await assert.rejects(() => voice.run({ pages: pages.filter(page => page.file !== 'jarvis.html') }), /jarvis\.html/);
});

test('the console cannot be opened on a host that has no backend', async () => {
  const js = await read('frontend/assets/jarvis.js');
  const html = await read('frontend/jarvis.html');
  assert.match(js, /AJ_STATIC_HOST/);
  assert.match(js, /backend not connected/);
  // The private shell must stay out of the service-worker precache.
  const sw = await read('frontend/sw.js');
  assert.match(sw, /endsWith\('\/jarvis\.html'\)/);
  assert.ok(!sw.includes("'./jarvis.html'"));
  assert.match(html, /data-aj-voice/);
});
