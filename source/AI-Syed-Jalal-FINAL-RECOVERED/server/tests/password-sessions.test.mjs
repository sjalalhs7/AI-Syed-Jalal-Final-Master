import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { neon } from '@neondatabase/serverless';
import { buildApi } from '../build.mjs';
import { createPgliteAdapter } from '../pglite-adapter.mjs';
import { SCHEMA_PARTS } from '../../frontend/functions/schema-bundle.mjs';

// All accounts and sessions are synthetic and the database is in memory.
// These tests do not connect to Neon, a provider, or the live website.
let db, onRequest;
const adapter = createPgliteAdapter(() => db);
const env = { DB_ADAPTER: adapter, LOCAL_PREVIEW: 'true', COOKIE_SECURE: 'false', CSRF_SECRET: 'isolated-password-session-test-secret-over-32-characters' };
const oldPassword = 'Synthetic-current-password-123';
const newPassword = 'Synthetic-new-password-456';

before(async () => {
  db = await PGlite.create();
  for (const part of SCHEMA_PARTS) await db.exec(part.sql);
  await buildApi();
  ({ onRequest } = await import('../../.data/api.mjs'));
});
beforeEach(async () => { await db.exec('TRUNCATE sessions, audit_events, auth_rate_limits, app_users CASCADE'); });
after(async () => { await db?.close(); });

async function request(path, { method = 'GET', body, cookie, csrf, dbAdapter = adapter } = {}) {
  const headers = { 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.96' };
  if (cookie) headers.cookie = cookie.split(';')[0];
  if (csrf) headers['x-csrf-token'] = csrf;
  const response = await onRequest({
    request: new Request('https://isolated.test/api' + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
    env: { ...env, DB_ADAPTER: dbAdapter }
  });
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie'), retryAfter: response.headers.get('retry-after') };
}
const register = username => request('/auth/register', { method: 'POST', body: { username, password: oldPassword } });
const login = (username, password = oldPassword, dbAdapter = adapter) => request('/auth/login', { method: 'POST', body: { username, password }, dbAdapter });
const change = (session, currentPassword = oldPassword, next = newPassword, dbAdapter = adapter) => request('/auth/change-password', {
  method: 'POST', cookie: session.cookie, csrf: session.csrf, body: { currentPassword, newPassword: next }, dbAdapter
});
async function account(username = 'password-viewer') {
  const registered = await register(username);
  assert.equal(registered.status, 201);
  const me = await request('/me', { cookie: registered.cookie });
  assert.equal(me.data.user.role, 'Viewer');
  return { cookie: registered.cookie, csrf: me.data.csrfToken, user: me.data.user };
}

test('password change preserves the current session and revokes only the account’s other sessions', async () => {
  const first = await account();
  const second = await login('password-viewer');
  const unrelated = await account('unrelated-viewer');
  assert.equal(second.status, 200);
  const firstSessions = (await request('/auth/sessions', { cookie: first.cookie })).data.sessions;
  const secondSessions = (await request('/auth/sessions', { cookie: second.cookie })).data.sessions;
  const otherSessions = (await request('/auth/sessions', { cookie: unrelated.cookie })).data.sessions;
  assert.equal(firstSessions.length, 2); assert.equal(secondSessions.length, 2); assert.equal(otherSessions.length, 1);
  assert.equal(firstSessions.filter(session => session.current).length, 1);
  assert.equal(secondSessions.filter(session => session.current).length, 1);
  const currentId = firstSessions.find(session => session.current).id;
  const secondId = secondSessions.find(session => session.current).id;
  assert.notEqual(currentId, secondId);
  assert.ok(firstSessions.every(session => session.active === true));
  assert.ok(!firstSessions.some(session => session.id === otherSessions[0].id));
  assert.equal((await request('/auth/sessions')).status, 401);
  assert.equal((await request('/auth/change-password', { method: 'POST', cookie: first.cookie, body: { currentPassword: oldPassword, newPassword } })).status, 403);
  assert.equal((await change(first, 'wrong-password-123')).data.code, 'PASSWORD_CURRENT_INVALID');
  assert.equal((await change(first, oldPassword, 'weak')).data.code, 'PASSWORD_INVALID');
  assert.equal((await change(first, oldPassword, oldPassword)).data.code, 'PASSWORD_UNCHANGED');
  assert.equal((await request('/me', { cookie: second.cookie })).data.authenticated, true);

  const result = await change(first);
  assert.equal(result.status, 200);
  assert.equal(result.data.otherSessionsRevoked, true);
  assert.equal((await request('/me', { cookie: first.cookie })).data.authenticated, true);
  assert.equal((await request('/me', { cookie: second.cookie })).data.authenticated, false);
  assert.equal((await request('/me', { cookie: unrelated.cookie })).data.authenticated, true);
  const after = (await request('/auth/sessions', { cookie: first.cookie })).data.sessions;
  assert.equal(after.find(session => session.id === currentId)?.active, true);
  assert.equal(after.find(session => session.id === currentId)?.current, true);
  assert.equal(after.find(session => session.id === secondId).active, false);
  assert.equal(after.find(session => session.id === secondId).current, false);
  assert.ok(after.find(session => session.id === secondId).revokedAt);
  assert.equal((await login('password-viewer', oldPassword)).status, 401);
  assert.equal((await login('password-viewer', newPassword)).status, 200);
  assert.equal((await login('unrelated-viewer', oldPassword)).status, 200);
  assert.equal(Number((await db.query("SELECT count(*)::int AS n FROM audit_events WHERE action='PASSWORD_CHANGED' AND user_id=$1", [first.user.id])).rows[0].n), 1);
});

test('manual revocation requires CSRF, affects only other sessions and permits a new sign-in', async () => {
  const first = await account();
  const second = await login('password-viewer');
  const unrelated = await account('unrelated-viewer');
  assert.equal(second.status, 200);
  assert.equal((await request('/auth/sessions', { method: 'DELETE', cookie: first.cookie })).status, 403);
  assert.equal((await request('/me', { cookie: second.cookie })).data.authenticated, true);
  const revoked = await request('/auth/sessions', { method: 'DELETE', cookie: first.cookie, csrf: first.csrf });
  assert.equal(revoked.status, 200); assert.equal(revoked.data.ok, true);
  assert.equal((await request('/me', { cookie: first.cookie })).data.authenticated, true);
  assert.equal((await request('/me', { cookie: second.cookie })).data.authenticated, false);
  assert.equal((await request('/me', { cookie: unrelated.cookie })).data.authenticated, true);
  assert.equal((await login('password-viewer', oldPassword)).status, 200);
});

test('a password change paused before its write cannot proceed after its session was revoked', async () => {
  const first = await account();
  const second = await login('password-viewer');
  assert.equal(second.status, 200);
  const secondMe = await request('/me', { cookie: second.cookie });
  const session = { cookie: second.cookie, csrf: secondMe.data.csrfToken };
  let reachedRead, resume;
  const reached = new Promise(resolve => { reachedRead = resolve; });
  const gate = new Promise(resolve => { resume = resolve; });
  const paused = {
    query: async (sql, params = []) => {
      const rows = await adapter.query(sql, params);
      if (sql.startsWith('SELECT salt,password_hash FROM app_users WHERE id=$1 AND active=true')) {
        reachedRead(); await gate;
      }
      return rows;
    },
    transaction: adapter.transaction
  };
  const pending = change(session, oldPassword, newPassword, paused);
  try {
    await reached;
    const revoked = await request('/auth/sessions', { method: 'DELETE', cookie: first.cookie, csrf: first.csrf });
    assert.equal(revoked.status, 200);
  } finally { resume(); }
  const result = await pending;
  assert.equal(result.status, 409);
  assert.equal(result.data.code, 'PASSWORD_CHANGE_STALE');
  assert.equal((await request('/me', { cookie: first.cookie })).data.authenticated, true);
  assert.equal((await request('/me', { cookie: second.cookie })).data.authenticated, false);
  assert.equal((await login('password-viewer', oldPassword)).status, 200);
  assert.equal((await login('password-viewer', newPassword)).status, 401);
});

test('the session list is account-scoped and limited to the latest 100 rows', async () => {
  const first = await account();
  const unrelated = await account('unrelated-viewer');
  await db.query(`INSERT INTO sessions(id,user_id,token_hash,created_at,expires_at)
    SELECT md5('synthetic-session-'||n)::uuid,$1,md5('synthetic-token-'||n),now()+n*interval '1 second',now()+interval '1 hour'
    FROM generate_series(1,105) AS n`, [first.user.id]);
  const rows = (await request('/auth/sessions', { cookie: first.cookie })).data.sessions;
  const other = (await request('/auth/sessions', { cookie: unrelated.cookie })).data.sessions;
  assert.equal(rows.length, 100);
  assert.equal(rows.filter(row => row.current).length, 0, 'the older current session need not be among the latest 100');
  assert.equal(other.length, 1); assert.equal(other[0].current, true);
  assert.ok(!rows.some(row => row.id === other[0].id));
});

test('authenticated password guesses are limited per account and refill without audit writes', async () => {
  const first = await account();
  const unrelated = await account('unrelated-viewer');
  const attempts = await Promise.all(Array.from({ length: 8 }, () => change(first, 'Wrong-password-999', newPassword)));
  assert.equal(attempts.filter(result => result.status === 401).length, 5);
  const limited = attempts.filter(result => result.status === 429);
  assert.equal(limited.length, 3);
  assert.ok(limited.every(result => result.data.code === 'PASSWORD_CHANGE_RATE_LIMIT' && result.retryAfter === '300'));
  assert.equal((await change(unrelated)).status, 200, 'a different account has its own bucket');
  await db.query("UPDATE auth_rate_limits SET tokens=0,updated_at=now()-interval '5 minutes' WHERE scope='password-change'");
  assert.equal((await change(first)).status, 200, 'one token refills after five minutes');
});

test('password change fails closed when its limiter cannot be read or written', async () => {
  const first = await account();
  const second = await login('password-viewer');
  const broken = { query: async (sql, params = []) => {
    if (sql.includes('auth_rate_limits')) throw new Error('synthetic limiter failure');
    return adapter.query(sql, params);
  }, transaction: adapter.transaction };
  const result = await change(first, oldPassword, newPassword, broken);
  assert.equal(result.status, 503); assert.equal(result.data.code, 'PASSWORD_CHANGE_UNAVAILABLE');
  assert.equal((await request('/me', { cookie: second.cookie })).data.authenticated, true);
  assert.equal((await login('password-viewer', oldPassword)).status, 200);
  assert.equal((await login('password-viewer', newPassword)).status, 401);
});

test('a database failure while revoking sessions rolls back the password update', async () => {
  const first = await account();
  const second = await login('password-viewer');
  assert.equal(second.status, 200);
  const before = (await db.query('SELECT salt,password_hash FROM app_users WHERE id=$1', [first.user.id])).rows[0];
  await db.exec(`CREATE FUNCTION synthetic_revoke_failure() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'synthetic session update failure'; END $$;
    CREATE TRIGGER synthetic_revoke_failure BEFORE UPDATE ON sessions
    FOR EACH ROW EXECUTE FUNCTION synthetic_revoke_failure();`);
  try {
    assert.equal((await change(first)).status, 500);
  } finally {
    await db.exec('DROP TRIGGER synthetic_revoke_failure ON sessions; DROP FUNCTION synthetic_revoke_failure()');
  }
  assert.deepEqual((await db.query('SELECT salt,password_hash FROM app_users WHERE id=$1', [first.user.id])).rows[0], before);
  assert.equal((await request('/me', { cookie: first.cookie })).data.authenticated, true);
  assert.equal((await request('/me', { cookie: second.cookie })).data.authenticated, true);
  assert.equal((await login('password-viewer', oldPassword)).status, 200);
  assert.equal((await login('password-viewer', newPassword)).status, 401);
});

test('two changes verified against the same old password cannot both report success', async () => {
  const first = await account();
  let arrivals = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const racing = {
    query: async (sql, params = []) => {
      const rows = await adapter.query(sql, params);
      if (sql.startsWith('SELECT salt,password_hash FROM app_users WHERE id=$1 AND active=true') && arrivals < 2) {
        arrivals++;
        if (arrivals === 2) release();
        await gate;
      }
      return rows;
    },
    transaction: (queries, options) => adapter.transaction(queries, options)
  };
  const candidates = ['Synthetic-new-one-456', 'Synthetic-new-two-789'];
  const results = await Promise.all(candidates.map(password => change(first, oldPassword, password, racing)));
  assert.equal(arrivals, 2);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  assert.equal(results.find(result => result.status === 409).data.code, 'PASSWORD_CHANGE_STALE');
  const winner = candidates[results.findIndex(result => result.status === 200)];
  const loser = candidates[results.findIndex(result => result.status === 409)];
  assert.equal((await login('password-viewer', oldPassword)).status, 401);
  assert.equal((await login('password-viewer', loser)).status, 401);
  assert.equal((await login('password-viewer', winner)).status, 200);
  assert.equal((await request('/me', { cookie: first.cookie })).data.authenticated, true);
});

test('a login that verified the old password cannot issue a session after the change commits', async () => {
  const first = await account();
  let arrived, release;
  const atInsert = new Promise(resolve => { arrived = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const paused = {
    query: async (sql, params = []) => {
      if (sql.includes('INSERT INTO sessions(id,user_id,token_hash,expires_at)')) {
        arrived();
        await gate;
      }
      return adapter.query(sql, params);
    }
  };
  const pending = login('password-viewer', oldPassword, paused);
  await atInsert;
  try { assert.equal((await change(first)).status, 200); }
  finally { release(); }
  const staleLogin = await pending;
  assert.equal(staleLogin.status, 401);
  assert.equal(staleLogin.data.code, 'AUTH_CREDENTIALS_CHANGED');
  assert.equal(staleLogin.cookie, null);
  assert.equal((await login('password-viewer', newPassword)).status, 200);
});

test('an adapter without transaction support fails closed', async () => {
  const first = await account();
  const second = await login('password-viewer');
  const noTransaction = { query: adapter.query };
  const result = await change(first, oldPassword, newPassword, noTransaction);
  assert.equal(result.status, 503);
  assert.equal(result.data.code, 'PASSWORD_CHANGE_UNAVAILABLE');
  assert.equal((await request('/me', { cookie: second.cookie })).data.authenticated, true);
  assert.equal((await login('password-viewer', oldPassword)).status, 200);
  assert.equal((await login('password-viewer', newPassword)).status, 401);
});

test('the Neon adapter receives a two-statement READ COMMITTED transaction without a network call', async () => {
  const first = await account();
  const native = neon('postgresql://synthetic:synthetic@example.invalid/synthetic');
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(new URL(url).hostname, 'api.invalid');
    assert.equal(new Headers(options.headers).get('Neon-Batch-Isolation-Level'), 'ReadCommitted');
    const payload = JSON.parse(options.body);
    assert.equal(payload.queries.length, 2);
    assert.match(payload.queries[0].query, /UPDATE app_users SET salt/);
    assert.match(payload.queries[1].query, /UPDATE sessions SET revoked_at/);
    const [salt, hash, id] = payload.queries[0].params;
    assert.equal(id, first.user.id);
    return Response.json({ results: [
      { command: 'UPDATE', rowCount: 1, fields: [{ name: 'id', dataTypeID: 2950 }, { name: 'salt', dataTypeID: 25 }, { name: 'password_hash', dataTypeID: 25 }], rows: [[id, salt, hash]], rowAsArray: true },
      { command: 'UPDATE', rowCount: 0, fields: [{ name: 'id', dataTypeID: 2950 }], rows: [], rowAsArray: true }
    ] });
  };
  try {
    // The mocked HTTP transaction is a wire-contract test only; it does not
    // change PGlite. Real atomicity is tested separately with a failing trigger.
    const result = await change(first, oldPassword, newPassword, { query: adapter.query, transaction: native.transaction });
    assert.equal(result.status, 200);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('a lost transaction response remains uncertain even when the database committed', async () => {
  const first = await account();
  const second = await login('password-viewer');
  const lost = {
    query: adapter.query,
    transaction: async (queries, options) => {
      await adapter.transaction(queries, options);
      throw new Error('synthetic connection loss after commit');
    }
  };
  assert.equal((await change(first, oldPassword, newPassword, lost)).status, 500);
  assert.equal((await request('/me', { cookie: second.cookie })).data.authenticated, false);
  assert.equal((await login('password-viewer', oldPassword)).status, 401);
  assert.equal((await login('password-viewer', newPassword)).status, 200);
});
