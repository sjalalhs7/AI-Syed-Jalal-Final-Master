import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const base = new URL('../', import.meta.url);
const page = readFileSync(new URL('agent.html', base), 'utf8');
const client = readFileSync(new URL('assets/agent.js', base), 'utf8');
const routes = readFileSync(new URL('functions/platform-routes.mjs', base), 'utf8');
const sw = readFileSync(new URL('sw.js', base), 'utf8');

test('Agent Studio exposes Direct, Agent and Compare with approved SJ identity', () => {
  assert.match(page, /data-mode="chat"/); assert.match(page, /data-mode="agent"/); assert.match(page, /data-mode="compare"/);
  assert.match(page, /assets\/brand\/sjs-logo\.svg/); assert.match(page, /SJ Agent Studio/);
});
test('Agent Studio uses authenticated same-origin APIs and CSRF', () => {
  assert.match(client, /credentials: 'same-origin'/); assert.match(client, /X-CSRF-Token/);
  assert.match(client, /\/platform\/conversations/); assert.doesNotMatch(client, /127\.0\.0\.1|localhost:|\/v1\/chat\/completions/);
});
test('platform routes are owner-scoped, rate-limited and honest about cloud configuration', () => {
  assert.match(routes, /user_id=\$2/); assert.match(routes, /consumeRateLimit\(db, 'platform-minute'/);
  assert.match(routes, /not configured/); assert.match(routes, /privacyMode: true/);
  assert.match(routes, /No external action was executed/);
});
test('private Agent Studio shell and API responses are not cached by the service worker', () => {
  assert.doesNotMatch(sw, /'\.\/agent\.html'/); assert.match(sw, /url\.pathname\.endsWith\('\/agent\.html'\)/);
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/);
});
test('history control, attachments, vote and export are wired', () => {
  assert.match(page, /id="historyToggle"/); assert.match(page, /id="fileInput"/);
  assert.match(client, /\/vote/); assert.match(client, /exportConversation/); assert.match(client, /Confirm & save/);
  assert.match(client, /Private conversation/); assert.match(routes, /Private conversation/);
});
