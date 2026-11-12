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

test('unreadable settings leave deployment keys usable and make stored-key status unknown', async () => {
  const db = { query: async () => { throw new Error('simulated settings read failure'); } };
  const env = await effectiveEnv({ OPENAI_API_KEY: 'local-env-key-12345678' }, db);
  assert.equal(env.OPENAI_API_KEY, 'local-env-key-12345678');
  const states = await providerStates({ OPENAI_API_KEY: 'local-env-key-12345678' }, db);
  const openai = states.find(s => s.provider === 'openai');
  assert.equal(openai.configured, true);
  assert.equal(openai.source, 'environment');
  for (const state of states.filter(s => s.provider !== 'openai')) {
    assert.equal(state.configured, null);
    assert.equal(state.source, 'unknown');
    assert.match(state.status, /could not be read; configuration is unknown/i);
  }
});

test('missing rows are empty, but malformed provider settings are unknown', async () => {
  const empty = await providerStates({}, { query: async () => [] });
  assert.ok(empty.every(s => s.source === 'none' && s.configured === false));
  for (const invalid of [null, [], 'unexpected', { gemini: { key: 'bad-type' } }]) {
    const states = await providerStates({}, { query: async () => [{ value: invalid }] });
    assert.ok(states.every(s => s.source === 'unknown'));
  }
  for (const invalidRows of [undefined, null, {}]) {
    const states = await providerStates({}, { query: async () => invalidRows });
    assert.ok(states.every(s => s.source === 'unknown'));
  }
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

test('first-run bootstrap requires an operator-configured seed and a shared limit', () => {
  const source = api();
  const i = source.indexOf("u.pathname==='/api/bootstrap/admin'");
  assert.ok(i > -1, 'bootstrap route missing');
  const route = source.slice(i, source.indexOf('async function bootstrapLoginSession', i));
  assert.match(route, /count\(\*\)::int AS n FROM app_users/);
  assert.match(route, /An Administrator already exists/, 'must refuse once an Admin exists');
  assert.match(route, /configuredInitialSetup/, 'setup must require the explicit switch and an owner seed');
  assert.match(route, /consumeRateLimit/, 'setup must use the shared fail-closed limiter');
  assert.match(route, /password did not match/, 'an existing account must prove its own password');
  assert.match(route, /SET role='Admin'/, 'a matching existing account can be promoted');

  const status = source.indexOf("u.pathname==='/api/bootstrap/status'");
  assert.ok(status > -1);
  const statusRoute = source.slice(status, i);
  assert.match(statusRoute, /allAdmins===0&&Boolean\(configuredInitialSetup\(env\)\)/);
  assert.match(statusRoute, /role='Admin' AND active=true/);
  assert.match(source, /env\.FIRST_ADMIN_SETUP_ENABLED==='true'/);
  // Runtime, rate-limit, account and race coverage is in bootstrap-security.test.mjs.
});

test('provider key management is Admin-only and rate limited', () => {
  const source = api();
  const i = source.indexOf("u.pathname==='/api/admin/providers'&&request.method==='POST'");
  assert.ok(i > -1);
  const end = source.indexOf("u.pathname==='/api/admin/ai/overview'", i);
  assert.ok(end > i, 'could not find the end of the provider route');
  const route = source.slice(i, end);
  assert.match(route, /Authentication required/);
  assert.match(route, /Admin role required/);
  assert.match(route, /consumeRateLimit/);
  assert.match(route, /PROVIDER_IDS.includes/, 'must reject unknown providers');
  assert.match(route, /updateStoredProviderKey/, 'must update one provider atomically');
  assert.match(route, /audit/, 'key changes must be audited');
});

test('the voice self-test actually speaks and reports failure honestly', () => {
  const guide = readFileSync(new URL('frontend/guide.html', root), 'utf8');
  assert.match(guide, /speechSynthesis\.speak/, 'must really speak');
  assert.match(guide, /onerror/, 'must handle a refusal');
  assert.match(guide, /no installed voice engine/, 'must tell the user when nothing started');
  // It must not claim success just because speak() was called.
  assert.match(guide, /The browser reported speech complete/);
  assert.match(guide, /If you heard nothing/);
  assert.match(guide, /without reporting that speech started/);
});
