import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { maskKey, effectiveEnv, providerStates, PROVIDER_IDS } from '../../frontend/functions/provider-settings.mjs';

const root = new URL('../../', import.meta.url);
const api = () => readFileSync(new URL('frontend/functions/api/[[path]].js', root), 'utf8');

test('an API key is never returned in full', () => {
  const key = 'AIzaSyD-abcdefghijklmnop1234';
  const masked = maskKey(key);
  assert.ok(!masked.includes(key.slice(0, 10)), 'the start of the key must not leak');
  assert.ok(masked.endsWith('1234'), 'the last four characters help identify the key');
  assert.equal(maskKey(''), '');
  assert.equal(maskKey('short'), '••••', 'a short value must be fully hidden, not partially shown');
});

test('stored keys fill gaps but never override a deployment secret', async () => {
  const db = { query: async () => [{ value: { gemini: 'db-key-12345678', openai: 'db-openai-9999' } }] };
  const env = await effectiveEnv({ GEMINI_API_KEY: 'env-key-abcdefgh' }, db);
  assert.equal(env.GEMINI_API_KEY, 'env-key-abcdefgh', 'the environment must win');
  assert.equal(env.OPENAI_API_KEY, 'db-openai-9999', 'a stored key fills a gap');
});

test('a missing settings table is treated as "no stored keys", not a crash', async () => {
  const db = { query: async () => { throw new Error('relation "app_settings" does not exist'); } };
  const env = await effectiveEnv({}, db);
  assert.deepEqual(env, {});
  const states = await providerStates({}, db);
  assert.ok(states.every(s => s.configured === false));
});

test('provider state reports configured, never "working"', async () => {
  const db = { query: async () => [{ value: { gemini: 'k-1234567890' } }] };
  const states = await providerStates({}, db);
  const gemini = states.find(s => s.provider === 'gemini');
  assert.equal(gemini.configured, true);
  assert.equal(gemini.source, 'admin-console');
  assert.match(gemini.status, /not yet verified/, 'a key must never be reported as working');
  assert.equal(PROVIDER_IDS.length, states.length);
});

test('first-run bootstrap can only ever create one Administrator', () => {
  const source = api();
  const i = source.indexOf("u.pathname==='/api/bootstrap/admin'");
  assert.ok(i > -1, 'bootstrap route missing');
  const route = source.slice(i, i + 2400);
  // It must re-check the Admin count, so a second caller cannot race in an Admin.
  assert.match(route, /count\(\*\)::int AS n FROM app_users/);
  assert.match(route, /An Administrator already exists/, 'must refuse once an Admin exists');
  assert.match(route, /'Admin'/, 'the bootstrap account must be an Administrator');
  assert.match(route, /rateLimited/, 'bootstrap must be rate limited');
  // An existing account that proves its password is promoted instead of rejected.
  assert.match(route, /password did not match/, 'wrong password must refuse promotion');
  assert.match(route, /SET role='Admin'/, 'a matching existing account must be promoted');

  const status = source.indexOf("u.pathname==='/api/bootstrap/status'");
  assert.ok(status > -1);
  // Availability must depend on "no Administrator exists", not "no users".
  // A deployment with accounts but no Admin was permanently stranded.
  assert.match(source.slice(status, status + 1000), /admins===0/,
    'bootstrap must be available whenever no Administrator exists');
  assert.match(source.slice(status, status + 1000), /role='Admin' AND active=true/, 'must count real Administrators');
});

test('provider key management is Admin-only and rate limited', () => {
  const source = api();
  const i = source.indexOf("u.pathname==='/api/admin/providers'&&request.method==='POST'");
  assert.ok(i > -1);
  const route = source.slice(i, i + 1600);
  assert.match(route, /Authentication required/);
  assert.match(route, /Admin role required/);
  assert.match(route, /consumeRateLimit/);
  assert.match(route, /PROVIDER_IDS.includes/, 'must reject unknown providers');
  assert.match(route, /audit/, 'key changes must be audited');
});

test('the voice self-test actually speaks and reports failure honestly', () => {
  const guide = readFileSync(new URL('frontend/guide.html', root), 'utf8');
  assert.match(guide, /speechSynthesis\.speak/, 'must really speak');
  assert.match(guide, /onerror/, 'must handle a refusal');
  assert.match(guide, /no installed voice engine/, 'must tell the user when nothing started');
  // It must not claim success just because speak() was called.
  assert.match(guide, /browser reported success either way/);
});
