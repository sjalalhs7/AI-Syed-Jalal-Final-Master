import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { neon } from '@neondatabase/serverless';
import { buildApi } from '../build.mjs';
import { createPgliteAdapter } from '../pglite-adapter.mjs';
import { SCHEMA_PARTS } from '../../frontend/functions/schema-bundle.mjs';

// Synthetic accounts only, in a disposable in-memory database. No production
// website, database, Neon instance, or provider is contacted by these tests.
let db, onRequest;
const adapter = createPgliteAdapter(() => db);
const env = { DB_ADAPTER: adapter, LOCAL_PREVIEW: 'true', COOKIE_SECURE: 'false', CSRF_SECRET: 'isolated-admin-lifecycle-test-secret-over-32-characters' };
const password = 'Synthetic-lifecycle-password-123';

before(async () => {
  db = await PGlite.create();
  for (const part of SCHEMA_PARTS) await db.exec(part.sql);
  await buildApi();
  ({ onRequest } = await import('../../.data/api.mjs'));
});
beforeEach(async () => { await db.exec('TRUNCATE sessions, audit_events, auth_rate_limits, app_users CASCADE'); });
after(async () => { await db?.close(); });

async function request(path, { method = 'GET', body, cookie, csrf, dbAdapter = adapter } = {}) {
  const headers = { 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.95' };
  if (cookie) headers.cookie = cookie.split(';')[0];
  if (csrf) headers['x-csrf-token'] = csrf;
  const response = await onRequest({
    request: new Request('https://isolated.test/api' + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
    env: { ...env, DB_ADAPTER: dbAdapter }
  });
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie') };
}
async function admin() {
  const demo = await request('/demo', { method: 'POST', body: {} });
  assert.equal(demo.status, 200);
  const me = await request('/me', { cookie: demo.cookie });
  assert.equal(me.data.user.role, 'Admin');
  return { cookie: demo.cookie, csrf: me.data.csrfToken, user: me.data.user };
}
async function account(username = 'lifecycle-viewer') {
  const created = await request('/auth/register', { method: 'POST', body: { username, password } });
  assert.equal(created.status, 201);
  const me = await request('/me', { cookie: created.cookie });
  return { cookie: created.cookie, csrf: me.data.csrfToken, user: me.data.user };
}
const login = username => request('/auth/login', { method: 'POST', body: { username, password } });
const status = (actor, target, active, dbAdapter = adapter) => request('/admin/users/' + target.user.id, {
  method: 'PATCH', body: { active }, cookie: actor.cookie, csrf: actor.csrf, dbAdapter
});
const authenticated = async session => (await request('/me', { cookie: session.cookie })).data.authenticated;
const stored = async target => (await db.query('SELECT active FROM app_users WHERE id=$1', [target.user.id])).rows[0].active;

async function withRevocationFailure(run) {
  await db.exec(`CREATE FUNCTION synthetic_lifecycle_failure() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'synthetic session update failure'; END $$;
    CREATE TRIGGER synthetic_lifecycle_failure BEFORE UPDATE ON sessions
    FOR EACH ROW EXECUTE FUNCTION synthetic_lifecycle_failure();`);
  try { return await run(); }
  finally { await db.exec('DROP TRIGGER synthetic_lifecycle_failure ON sessions; DROP FUNCTION synthetic_lifecycle_failure()'); }
}

test('status changes require an Admin, CSRF, valid input and a different account for deactivation', async () => {
  const owner = await admin(), target = await account();
  const path = '/admin/users/' + target.user.id;
  assert.equal((await request(path, { method: 'PATCH', body: { active: false } })).status, 401);
  assert.equal((await request(path, { method: 'PATCH', cookie: owner.cookie, body: { active: false } })).status, 403);
  assert.equal((await status(target, owner, false)).status, 403);
  assert.equal((await status(owner, target, 'false')).status, 400);
  assert.equal((await status(owner, owner, false)).status, 400);
  assert.equal((await request('/admin/users/not-a-uuid', { method: 'PATCH', cookie: owner.cookie, csrf: owner.csrf, body: { active: false } })).status, 400);
  const missing = { user: { id: crypto.randomUUID() } };
  assert.equal((await status(owner, missing, false)).status, 404);
  assert.equal(await stored(target), true);
  assert.equal(await authenticated(target), true);
});

test('deactivation revokes every target session, preserves unrelated sessions, and reactivation does not resurrect them', async () => {
  const owner = await admin(), target = await account(), other = await account('lifecycle-other');
  const targetSecond = await login(target.user.username);
  assert.equal(targetSecond.status, 200);
  const deactivated = await status(owner, target, false);
  assert.equal(deactivated.status, 200);
  assert.equal(deactivated.data.user.id, target.user.id);
  assert.equal(deactivated.data.user.active, false);
  assert.equal(deactivated.data.sessionsRevoked, true);
  assert.equal(await authenticated(target), false);
  assert.equal(await authenticated(targetSecond), false);
  assert.equal(await authenticated(owner), true);
  assert.equal(await authenticated(other), true);
  assert.notEqual((await login(target.user.username)).status, 200);
  const activated = await status(owner, target, true);
  assert.equal(activated.status, 200);
  assert.equal(activated.data.user.active, true);
  assert.equal(activated.data.sessionsRevoked, true);
  assert.equal(await authenticated(target), false);
  assert.equal(await authenticated(targetSecond), false);
  assert.equal((await login(target.user.username)).status, 200);
  assert.equal(Number((await db.query("SELECT count(*)::int AS n FROM audit_events WHERE action='ADMIN_USER_STATUS' AND user_id=$1", [owner.user.id])).rows[0].n), 2);
});

test('a revocation failure rolls back deactivation and leaves both account and sessions unchanged', async () => {
  const owner = await admin(), target = await account();
  const second = await login(target.user.username);
  assert.equal(second.status, 200);
  await withRevocationFailure(async () => assert.equal((await status(owner, target, false)).status, 500));
  assert.equal(await stored(target), true);
  assert.equal(await authenticated(target), true);
  assert.equal(await authenticated(second), true);
  assert.equal(Number((await db.query("SELECT count(*)::int AS n FROM audit_events WHERE action='ADMIN_USER_STATUS'")).rows[0].n), 0);
});

test('reactivation cleans up unrevoked legacy sessions, and its revocation failure also rolls back', async () => {
  const owner = await admin(), target = await account();
  // Models an inactive account left behind by the old partial-failure path.
  await db.query('UPDATE app_users SET active=false WHERE id=$1', [target.user.id]);
  assert.equal(await authenticated(target), false);
  await withRevocationFailure(async () => assert.equal((await status(owner, target, true)).status, 500));
  assert.equal(await stored(target), false);
  assert.equal(await authenticated(target), false);
  const activated = await status(owner, target, true);
  assert.equal(activated.status, 200);
  assert.equal(activated.data.sessionsRevoked, true);
  assert.equal(await authenticated(target), false, 'the old session must not become usable again');
  assert.equal((await login(target.user.username)).status, 200);
});

test('repeating activation on an already active account does not sign its user out', async () => {
  const owner = await admin(), target = await account();
  const result = await status(owner, target, true);
  assert.equal(result.status, 200);
  assert.equal(result.data.sessionsRevoked, false);
  assert.equal(await authenticated(target), true);
});

test('repeating deactivation cleans up a legacy unrevoked session', async () => {
  const owner = await admin(), target = await account();
  await db.query('UPDATE app_users SET active=false WHERE id=$1', [target.user.id]);
  const result = await status(owner, target, false);
  assert.equal(result.status, 200);
  assert.equal(result.data.sessionsRevoked, true);
  assert.equal((await status(owner, target, true)).status, 200);
  assert.equal(await authenticated(target), false);
});

test('status changes fail closed without transaction support', async () => {
  const owner = await admin(), target = await account();
  const result = await status(owner, target, false, { query: adapter.query });
  assert.equal(result.status, 503);
  assert.equal(result.data.code, 'USER_STATUS_UNAVAILABLE');
  assert.equal(await stored(target), true);
  assert.equal(await authenticated(target), true);
});

test('a status change paused after authentication fails if the Admin session is revoked', async () => {
  const owner = await admin(), target = await account();
  const sessions = (await request('/auth/sessions', { cookie: owner.cookie })).data.sessions;
  const current = sessions.find(session => session.current);
  let arrived, resume;
  const reached = new Promise(resolve => { arrived = resolve; });
  const gate = new Promise(resolve => { resume = resolve; });
  const paused = { query: adapter.query, transaction: async (...args) => { arrived(); await gate; return adapter.transaction(...args); } };
  const pending = status(owner, target, false, paused);
  try {
    await reached;
    await db.query('UPDATE sessions SET revoked_at=now() WHERE id=$1', [current.id]);
  } finally { resume(); }
  const result = await pending;
  assert.equal(result.status, 409);
  assert.equal(result.data.code, 'ADMIN_SESSION_STALE');
  assert.equal(await stored(target), true);
  assert.equal(await authenticated(target), true);
});

test('two preauthenticated Admins cannot deactivate each other and leave no active Admin', async () => {
  const a = await admin(), b = await admin();
  let arrivals = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const racing = {
    query: adapter.query,
    transaction: async (...args) => { if (++arrivals === 2) release(); await gate; return adapter.transaction(...args); }
  };
  const results = await Promise.all([status(a, b, false, racing), status(b, a, false, racing)]);
  assert.equal(arrivals, 2);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  assert.equal(results.find(result => result.status === 409).data.code, 'ADMIN_SESSION_STALE');
  assert.equal(Number((await db.query("SELECT count(*)::int AS n FROM app_users WHERE role='Admin' AND active=true")).rows[0].n), 1);
  assert.equal([await authenticated(a), await authenticated(b)].filter(Boolean).length, 1);
});

test('a lost transaction response stays uncertain even though the deactivation committed', async () => {
  const owner = await admin(), target = await account();
  const lost = { query: adapter.query, transaction: async (...args) => { await adapter.transaction(...args); throw new Error('synthetic connection loss after commit'); } };
  assert.equal((await status(owner, target, false, lost)).status, 500);
  assert.equal(await stored(target), false);
  assert.equal(await authenticated(target), false);
  assert.equal((await status(owner, target, true)).status, 200);
  assert.equal(await authenticated(target), false);
});

test('the Neon adapter sends the serialized READ COMMITTED status batch without a network call', async () => {
  const owner = await admin(), target = await account();
  const native = neon('postgresql://synthetic:synthetic@example.invalid/synthetic');
  const originalFetch = globalThis.fetch;
  let calls = 0, received;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(new URL(url).hostname, 'api.invalid');
    assert.equal(new Headers(options.headers).get('Neon-Batch-Isolation-Level'), 'ReadCommitted');
    const payload = JSON.parse(options.body);
    assert.equal(payload.queries.length, 5);
    assert.match(payload.queries[0].query, /pg_advisory_xact_lock/);
    assert.match(payload.queries[1].query, /app_users.*FOR SHARE/s);
    assert.match(payload.queries[2].query, /sessions.*FOR SHARE/s);
    assert.match(payload.queries[3].query, /app_users.*FOR UPDATE/s);
    assert.match(payload.queries[4].query, /WITH prior AS MATERIALIZED/);
    assert.match(payload.queries[4].query, /UPDATE sessions SET revoked_at/);
    const row = (fields, values) => ({ command: 'SELECT', rowCount: values.length, fields: fields.map(([name, dataTypeID]) => ({ name, dataTypeID })), rows: values, rowAsArray: true });
    return Response.json({ results: [
      row([['pg_advisory_xact_lock', 2278]], [[null]]),
      row([['id', 2950]], [[owner.user.id]]),
      row([['id', 2950]], [[crypto.randomUUID()]]),
      row([['id', 2950]], [[target.user.id]]),
      row([['outcome', 25], ['id', 2950], ['username', 25], ['role', 25], ['active', 16], ['created_at', 1184], ['was_active', 16], ['revoked_count', 23]],
        [['updated', target.user.id, target.user.username, 'Viewer', 'f', '2026-11-07 12:34:56+00', 't', '1']])
    ] });
  };
  try {
    // Only a transport/statement-shape test: this mock does not commit to Neon.
    const result = await status(owner, target, false, { query: adapter.query, transaction: async (...args) => (received = await native.transaction(...args)) });
    assert.equal(result.status, 200, JSON.stringify({ data: result.data, received }));
    assert.equal(result.data.sessionsRevoked, true);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});
