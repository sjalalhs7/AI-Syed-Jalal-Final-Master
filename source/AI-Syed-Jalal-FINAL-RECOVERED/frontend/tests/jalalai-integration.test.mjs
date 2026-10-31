import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const base = new URL('../', import.meta.url);
const page = readFileSync(new URL('jalalai.html', base), 'utf8');
const workspace = readFileSync(new URL('workspace.html', base), 'utf8');
const guide = readFileSync(new URL('JALALAI-SETUP.md', base), 'utf8');
const api = readFileSync(new URL('functions/api/[[path]].js', base), 'utf8');

test('JalalAi stays linked from the existing workspace and keeps the approved logo', () => {
  assert.match(workspace, /jalalai\.html/);
  assert.match(workspace, /assets\/approved-sj-rainbow-crown\.svg/);
  assert.match(page, /AI-Syed Jalal/);
  assert.match(page, /approved-sj-rainbow-crown\.svg/);
});
test('JalalAi uses the authenticated cloud API and does not require localhost', () => {
  assert.match(page, /\/api\/ai\/run/);
  assert.match(page, /\/api\/csrf/);
  assert.match(page, /privacyMode:true/);
  assert.match(page, /credentials:'same-origin'/);
  assert.doesNotMatch(page, /127\.0\.0\.1:8000|localhost:8000|\/v1\/chat\/completions/);
});
test('private chat avoids app-side prompt/reply persistence and retains per-user quotas', () => {
  assert.match(api, /privacyMode\?\[\]:db\.query/);
  assert.match(api, /action='AI_CHAT_REQUEST'/);
  assert.match(api, /20 per minute/);
  assert.match(api, /200 per day/);
});
test('provider key remains server-side and provider processing is disclosed', () => {
  assert.match(api, /env\.GEMINI_API_KEY/);
  assert.match(page, /server-side key/);
  assert.match(page, /subject to Google's service terms/);
});
test('other accounts and external actions are not silently connected', () => {
  assert.match(page, /does not read Gmail, Calendar, contacts, files/);
  assert.match(page, /No email, calendar, WhatsApp/);
  assert.match(page, /require your approval/);
  assert.match(page, /WhatsApp:[\s\S]*?Not integrated/i);
});
test('setup guide records the mobile cloud design and explicit integration limits', () => {
  assert.match(guide, /no local computer or OpenJarvis installation is needed/i);
  assert.match(guide, /does not store prompt or reply text/i);
  assert.match(guide, /ElevenLabs voice/i);
});
