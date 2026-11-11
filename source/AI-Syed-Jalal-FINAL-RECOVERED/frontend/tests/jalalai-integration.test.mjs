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
const client = readFileSync(new URL('assets/jalalai.js', base), 'utf8');
const routes = readFileSync(new URL('functions/assistant-routes.mjs', base), 'utf8');
test('JalalAi uses authenticated same-origin APIs with explicit local/cloud modes', () => {
  assert.match(routes, /target.pathname = '\/api\/ai\/run'/);
  assert.match(client, /api\('\/assistant\/chat'/); assert.match(client, /csrfToken/);
  assert.match(routes, /privacyMode: true/); assert.match(client, /credentials: 'same-origin'/);
  assert.doesNotMatch(client, /127\.0\.0\.1|localhost:|\/v1\/chat\/completions/);
});
test('private cloud chat avoids prompt persistence and retains quotas', () => {
  assert.match(api, /privacyMode\?\[\]:db\.query/); assert.match(api, /20 per minute/); assert.match(api, /200 per day/);
});
test('provider keys remain server-side and processing is disclosed', () => {
  assert.match(routes, /providerConfiguration\(env, provider\)/); assert.match(api, /env\.GEMINI_API_KEY/); assert.match(page, /server key/);
  assert.match(page, /subject to that provider’s terms/); assert.match(page, /cloud AI model unless you select Cloud AI/);
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

test('quick-start guide and assistant search use real contracts', () => {
  const guide = readFileSync(new URL('guide.html', base), 'utf8');
  const guideJs = readFileSync(new URL('assets/guide.js', base), 'utf8');
  assert.match(guide, /Start preview for me/);
  assert.match(guide, /Not connected:/);
  assert.match(guideJs, /json\('\/health'\)/);
  assert.match(client, /Array\.isArray\(response\.records\)/);
  assert.match(client, /Workspace records could not be read/);
  assert.match(client, /encodeURIComponent\(result\.query\)/);
});
