import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const base = new URL('../', import.meta.url);
const page = readFileSync(new URL('jalalai.html', base), 'utf8');
const workspace = readFileSync(new URL('workspace.html', base), 'utf8');
const guide = readFileSync(new URL('JALALAI-SETUP.md', base), 'utf8');

test('JalalAi remains linked from the existing workspace and keeps the approved SJ logo', () => {
  assert.match(workspace, /jalalai\.html/);
  assert.match(workspace, /assets\/approved-sj-rainbow-crown\.svg/);
  assert.match(page, /AI-Syed Jalal/);
  assert.match(page, /approved-sj-rainbow-crown\.svg/);
});

test('JalalAi uses the existing authenticated cloud AI API, not a local computer endpoint', () => {
  assert.match(page, /json\('\/api\/me'/);
  assert.match(page, /json\('\/api\/csrf'/);
  assert.match(page, /json\('\/api\/ai\/run'/);
  assert.match(page, /X-CSRF-Token/);
  assert.match(page, /credentials:'same-origin'/);
  assert.doesNotMatch(page, /127\.0\.0\.1:8000|localhost:8000|\/v1\/chat\/completions/);
  assert.doesNotMatch(page, /GEMINI_API_KEY|AIza[A-Za-z0-9_-]{20,}/);
});

test('Mobile layout is responsive and does not require a desktop installation', () => {
  assert.match(page, /name="viewport"/);
  assert.match(page, /@media\(max-width:600px\)/);
  assert.match(page, /MOBILE READY/);
  assert.match(page, /No computer or local OpenJarvis installation is required for this chat/);
});

test('Privacy disclosure accurately describes stored AI run history and unavailable integrations', () => {
  assert.match(page, /prompts and AI replies are currently saved/);
  assert.match(page, /Clearing this screen does not delete those records/);
  assert.match(page, /does not read Gmail, Calendar, contacts, files/);
  assert.match(page, /ElevenLabs voice/);
  assert.match(page, /WhatsApp Business integration/);
});

test('Setup guide distinguishes mobile cloud chat from optional local OpenJarvis', () => {
  assert.match(guide, /mobile cloud chat/i);
  assert.match(guide, /OpenJarvis is not required/i);
  assert.match(guide, /\/api\/ai\/run/);
  assert.match(guide, /ai_runs.*database history/i);
});
