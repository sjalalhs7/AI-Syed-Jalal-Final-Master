import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { buildApi } from '../build.mjs';
import { SCHEMA_PARTS } from '../../frontend/functions/schema-bundle.mjs';

// Only an in-memory database and invented credentials are used. These tests do
// not contact the website, Neon, or any configured provider.
let db, onRequest;
const seed = { FIRST_ADMIN_SETUP_ENABLED: 'true', SEED_ADMIN_USERNAME: 'setup-owner', SEED_ADMIN_PASSWORD: 'local-test-password-12345' };
const baseEnv = { LOCAL_PREVIEW: 'true', COOKIE_SECURE: 'false', CSRF_SECRET: 'isolated-test-secret-with-at-least-32-chars' };
const adapter = { query: async (sql, params = []) => (await db.query(sql, params)).rows };

before(async () => {
  db = await PGlite.create();
  for (const part of SCHEMA_PARTS) await db.exec(part.sql);
  await buildApi();
  ({ onRequest } = await import('../../.data/api.mjs'));
});
beforeEach(async () => {
  await db.exec('TRUNCATE sessions, audit_events, auth_rate_limits, app_users CASCADE');
  await db.exec("UPDATE app_bootstrap SET completed_at=NULL, completed_by='' WHERE id=true");
});
after(async () => { await db?.close(); });

async function request(path, { method = 'GET', body, env = {}, ip = '192.0.2.31', dbAdapter = adapter, cookie, csrf } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (ip !== null) headers['cf-connecting-ip'] = ip;
  if (cookie) headers.cookie = cookie.split(';')[0];
  if (csrf) headers['x-csrf-token'] = csrf;
  const response = await onRequest({
    request: new Request('https://isolated.test/api' + path, {
      method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) })
    }),
    env: { ...baseEnv, ...env, DB_ADAPTER: dbAdapter }
  });
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie') };
}
async function adminCount() {
  return Number((await db.query("SELECT count(*)::int AS n FROM app_users WHERE role='Admin' AND active=true")).rows[0].n);
}
const setup = (username, password) => ({ method: 'POST', env: seed, body: { username, password } });

test('first administrator setup is closed without an owner-configured seed', async () => {
  const status = await request('/bootstrap/status');
  assert.equal(status.data.available, false);
  const attempt = await request('/bootstrap/admin', { method: 'POST', body: { username: 'unowned', password: 'unowned-password-12345' } });
  assert.equal(attempt.status, 403);
  assert.equal(await adminCount(), 0);
  assert.equal(Number((await db.query('SELECT count(*)::int AS n FROM auth_rate_limits')).rows[0].n), 0, 'a disabled setup must not consume a rate-limit write');
});

test('seed credentials alone cannot enable setup or create a seed Admin through login', async () => {
  for (const flag of [undefined, '', 'false', 'TRUE', ' true ', true]) {
    const env = { ...seed, FIRST_ADMIN_SETUP_ENABLED: flag };
    assert.equal((await request('/bootstrap/status', { env })).data.available, false);
    assert.equal((await request('/bootstrap/admin', { ...setup(seed.SEED_ADMIN_USERNAME, seed.SEED_ADMIN_PASSWORD), env })).status, 403);
  }
  const env = { ...seed, FIRST_ADMIN_SETUP_ENABLED: undefined };
  assert.equal((await request('/auth/login', { method: 'POST', env, body: { username: seed.SEED_ADMIN_USERNAME, password: seed.SEED_ADMIN_PASSWORD } })).status, 401);
  assert.equal(await adminCount(), 0);
});

test('inactive Administrators prevent reopening setup even when the flag is enabled', async () => {
  const created = await request('/auth/login', { method: 'POST', env: seed, body: { username: seed.SEED_ADMIN_USERNAME, password: seed.SEED_ADMIN_PASSWORD } });
  assert.equal(created.status, 200);
  await db.query("UPDATE app_users SET active=false WHERE username=$1", [seed.SEED_ADMIN_USERNAME]);
  const status = await request('/bootstrap/status', { env: seed });
  assert.equal(status.data.admins, 0);
  assert.equal(status.data.available, false);
  assert.equal(status.data.completed, true);
  assert.equal((await request('/bootstrap/admin', setup(seed.SEED_ADMIN_USERNAME, seed.SEED_ADMIN_PASSWORD))).status, 409);
  const replacement = { ...seed, SEED_ADMIN_USERNAME: 'other-owner' };
  assert.equal((await request('/auth/login', { method: 'POST', env: replacement, body: { username: replacement.SEED_ADMIN_USERNAME, password: replacement.SEED_ADMIN_PASSWORD } })).status, 401);
  assert.equal(Number((await db.query("SELECT count(*)::int AS n FROM app_users WHERE role='Admin'")).rows[0].n), 1);
});

test('seed identity and password are required; a successful claim closes setup', async () => {
  assert.equal((await request('/bootstrap/status', { env: seed })).data.available, true);
  assert.equal((await request('/bootstrap/admin', setup('other-name', seed.SEED_ADMIN_PASSWORD))).status, 403);
  assert.equal((await request('/bootstrap/admin', setup(seed.SEED_ADMIN_USERNAME, 'wrong-password-12345'))).status, 403);
  assert.equal(await adminCount(), 0);
  const claim = await request('/bootstrap/admin', setup(seed.SEED_ADMIN_USERNAME, seed.SEED_ADMIN_PASSWORD));
  assert.equal(claim.status, 201);
  assert.match(claim.cookie, /HttpOnly/);
  assert.equal(await adminCount(), 1);
  assert.equal((await request('/bootstrap/status', { env: seed })).data.available, false);
  assert.equal((await request('/bootstrap/admin', setup(seed.SEED_ADMIN_USERNAME, seed.SEED_ADMIN_PASSWORD))).status, 409);
  const login = await request('/auth/login', { method: 'POST', body: { username: seed.SEED_ADMIN_USERNAME, password: seed.SEED_ADMIN_PASSWORD } });
  assert.equal(login.status, 200, 'ordinary login must still work after setup secrets are removed');
});

test('setup rejects weak/default seed configuration and too-long passwords', async () => {
  for (const env of [
    { ...seed, SEED_ADMIN_PASSWORD: 'change-me-password-12345' },
    { ...seed, SEED_ADMIN_USERNAME: 'bad name' },
    { ...seed, SEED_ADMIN_PASSWORD: 'short1' }
  ]) assert.equal((await request('/bootstrap/status', { env })).data.available, false);
  const tooLong = await request('/bootstrap/admin', setup(seed.SEED_ADMIN_USERNAME, 'a1'.repeat(600)));
  assert.equal(tooLong.status, 400);
  assert.equal(await adminCount(), 0);
});

test('seed alone cannot promote an existing account with a different password', async () => {
  const registration = await request('/auth/register', { method: 'POST', body: { username: seed.SEED_ADMIN_USERNAME, password: 'different-password-67890' } });
  assert.equal(registration.status, 201);
  assert.equal((await request('/bootstrap/admin', setup(seed.SEED_ADMIN_USERNAME, seed.SEED_ADMIN_PASSWORD))).status, 401);
  assert.equal(await adminCount(), 0);
  const samePasswordSeed = { ...seed, SEED_ADMIN_PASSWORD: 'different-password-67890' };
  const promoted = await request('/bootstrap/admin', { method: 'POST', env: samePasswordSeed, body: { username: samePasswordSeed.SEED_ADMIN_USERNAME, password: samePasswordSeed.SEED_ADMIN_PASSWORD } });
  assert.equal(promoted.status, 201);
  assert.equal(await adminCount(), 1);
});

test('setup attempts are limited and fail closed if the limiter or trusted IP is unavailable', async () => {
  const wrong = setup(seed.SEED_ADMIN_USERNAME, 'wrong-password-12345');
  for (let i = 0; i < 5; i++) assert.equal((await request('/bootstrap/admin', wrong)).status, 403);
  assert.equal((await request('/bootstrap/admin', wrong)).status, 429);
  assert.equal((await request('/bootstrap/admin', { ...wrong, ip: null })).status, 429);
  const broken = { query: async (sql, params = []) => {
    if (sql.includes('auth_rate_limits')) throw new Error('simulated unavailable limiter');
    return adapter.query(sql, params);
  }};
  assert.equal((await request('/bootstrap/admin', { ...wrong, ip: '192.0.2.32', dbAdapter: broken })).status, 503);
  assert.equal(await adminCount(), 0);
});

test('an untrusted login cannot silently create the configured seed administrator', async () => {
  const login = (username, password) => request('/auth/login', { method: 'POST', env: seed, body: { username, password } });
  assert.equal((await login('somebody-else', 'wrong-password-12345')).status, 401);
  assert.equal((await login(seed.SEED_ADMIN_USERNAME, 'wrong-password-12345')).status, 401);
  assert.equal(await adminCount(), 0);
});

test('the configured seed can sign in to initialize only when no administrator exists', async () => {
  const created = await request('/auth/login', { method: 'POST', env: seed, body: { username: seed.SEED_ADMIN_USERNAME, password: seed.SEED_ADMIN_PASSWORD } });
  assert.equal(created.status, 200);
  assert.equal(await adminCount(), 1);
});

test('seed login cannot silently add an administrator when another active admin exists', async () => {
  const registered = await request('/auth/register', { method: 'POST', body: { username: 'existing-admin', password: 'existing-password-67890' } });
  assert.equal(registered.status, 201);
  await db.query("UPDATE app_users SET role='Admin' WHERE username=$1", ['existing-admin']);
  const attempt = await request('/auth/login', { method: 'POST', env: seed, body: { username: seed.SEED_ADMIN_USERNAME, password: seed.SEED_ADMIN_PASSWORD } });
  assert.equal(attempt.status, 401);
  assert.equal(await adminCount(), 1);
  assert.equal((await db.query('SELECT id FROM app_users WHERE username=$1', [seed.SEED_ADMIN_USERNAME])).rows.length, 0);
});

test('seed-based recovery still works for the existing seed Admin, but not for a Viewer', async () => {
  const created = await request('/auth/login', { method: 'POST', env: seed, body: { username: seed.SEED_ADMIN_USERNAME, password: seed.SEED_ADMIN_PASSWORD } });
  const me = await request('/me', { cookie: created.cookie });
  const changed = await request('/auth/change-password', {
    method: 'POST', cookie: created.cookie, csrf: me.data.csrfToken,
    body: { currentPassword: seed.SEED_ADMIN_PASSWORD, newPassword: 'new-password-67890' }
  });
  assert.equal(changed.status, 200);
  const recoveryEnv = { ...seed, FIRST_ADMIN_SETUP_ENABLED: undefined };
  const recovered = await request('/auth/login', { method: 'POST', env: recoveryEnv, body: { username: seed.SEED_ADMIN_USERNAME, password: seed.SEED_ADMIN_PASSWORD } });
  assert.equal(recovered.status, 200, 'existing active seed-Admin recovery does not need the initial setup switch');
  await db.query("UPDATE app_users SET role='Viewer' WHERE username=$1", [seed.SEED_ADMIN_USERNAME]);
  await db.query("UPDATE app_users SET password_hash='different-hash' WHERE username=$1", [seed.SEED_ADMIN_USERNAME]);
  const viewerAttempt = await request('/auth/login', { method: 'POST', env: seed, body: { username: seed.SEED_ADMIN_USERNAME, password: seed.SEED_ADMIN_PASSWORD } });
  assert.equal(viewerAttempt.status, 401);
  assert.equal(await adminCount(), 0);
});

test('bootstrap and seed login racing for the same identity create at most one Admin', async () => {
  let arrivals = 0, release;
  const barrier = new Promise(resolve => { release = resolve; });
  const concurrent = { query: async (sql, params = []) => {
    const rows = await adapter.query(sql, params);
    if (/^SELECT id,username,role,salt,password_hash/.test(sql) && rows.length === 0 && arrivals < 2) {
      arrivals += 1;
      if (arrivals === 2) release();
      await barrier;
    }
    return rows;
  }};
  const [claim, login] = await Promise.all([
    request('/bootstrap/admin', { ...setup(seed.SEED_ADMIN_USERNAME, seed.SEED_ADMIN_PASSWORD), dbAdapter: concurrent }),
    request('/auth/login', { method: 'POST', env: seed, dbAdapter: concurrent, body: { username: seed.SEED_ADMIN_USERNAME, password: seed.SEED_ADMIN_PASSWORD } })
  ]);
  assert.equal(arrivals, 2);
  assert.ok([201, 409].includes(claim.status), `unexpected bootstrap status ${claim.status}`);
  assert.ok([200, 401].includes(login.status), `unexpected login status ${login.status}`);
  assert.ok(claim.status === 201 || login.status === 200, 'at least one claim must succeed');
  assert.equal(await adminCount(), 1);
});

test('simultaneous claims for the same seed cannot create duplicate accounts', async () => {
  let arrivals = 0, release;
  const barrier = new Promise(resolve => { release = resolve; });
  const concurrent = { query: async (sql, params = []) => {
    const rows = await adapter.query(sql, params);
    if (/SELECT id,username,role,salt,password_hash,active FROM app_users WHERE username=\$1/.test(sql) && arrivals < 2) {
      arrivals += 1;
      if (arrivals === 2) release();
      await barrier;
    }
    return rows;
  }};
  const payload = { ...setup(seed.SEED_ADMIN_USERNAME, seed.SEED_ADMIN_PASSWORD), dbAdapter: concurrent };
  const [first, second] = await Promise.all([request('/bootstrap/admin', payload), request('/bootstrap/admin', payload)]);
  assert.equal(arrivals, 2, 'both requests must observe the same empty-account state');
  assert.deepEqual([first.status, second.status].sort(), [201, 409]);
  assert.equal(await adminCount(), 1);
});
