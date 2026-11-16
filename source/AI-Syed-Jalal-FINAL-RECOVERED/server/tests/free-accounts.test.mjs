import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { buildApi } from '../build.mjs';
import { SCHEMA_PARTS, REQUIRED_TABLES } from '../../frontend/functions/schema-bundle.mjs';

// Invented credentials and an in-memory database only: no Neon, providers or
// production records are contacted. Concurrency barriers force both contenders
// past the same pre-check before they attempt their inserts.
let db, onRequest;
const adapter = { query: async (sql, params = []) => (await db.query(sql, params)).rows };
const env = { DB_ADAPTER: adapter, LOCAL_PREVIEW: 'true', COOKIE_SECURE: 'false', CSRF_SECRET: 'disposable-free-account-test-secret-over-32-characters' };
const password = 'Local-strong-password-123';

before(async () => {
  db = await PGlite.create();
  for (const part of SCHEMA_PARTS) await db.exec(part.sql);
  await buildApi();
  ({ onRequest } = await import('../../.data/api.mjs'));
});
beforeEach(async () => { await db.exec('TRUNCATE auth_rate_limits, app_users CASCADE'); });
after(async () => { await db?.close(); });

async function request(path, { method = 'GET', body, cookie, csrf, ip = '192.0.2.71', dbAdapter = adapter, override = {}, contentType = 'application/json', headers: extra = {} } = {}) {
  const headers = { ...extra };
  if (contentType) headers['content-type'] = contentType;
  if (ip !== null) headers['cf-connecting-ip'] = ip;
  if (cookie) headers.cookie = cookie.split(';')[0];
  if (csrf) headers['x-csrf-token'] = csrf;
  const response = await onRequest({
    request: new Request('https://isolated.test/api' + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
    env: { ...env, ...override, DB_ADAPTER: dbAdapter }
  });
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie'), headers: response.headers };
}
const register = (username, options = {}) => request('/auth/register', { method: 'POST', body: { username, password, role: 'Admin' }, ...options });
const login = (username, pass = password, options = {}) => request('/auth/login', { method: 'POST', body: { username, password: pass }, ...options });
async function admin() {
  const demo = await request('/demo', { method: 'POST', body: {} });
  assert.equal(demo.status, 200);
  const me = await request('/me', { cookie: demo.cookie });
  return { cookie: demo.cookie, csrf: me.data.csrfToken };
}
function racingPrechecks() {
  let arrivals = 0, release;
  const barrier = new Promise(resolve => { release = resolve; });
  return {
    adapter: { query: async (sql, params = []) => {
      const rows = await adapter.query(sql, params);
      if (sql.startsWith('SELECT id FROM app_users WHERE lower(username)=lower($1)') && arrivals < 2) {
        arrivals++;
        if (arrivals === 2) release();
        await barrier;
      }
      return rows;
    } },
    arrivals: () => arrivals
  };
}

test('free registration creates a Viewer session with access to existing shared records, not Admin or write access', async () => {
  const owner = await admin();
  const record = await request('/records', { method: 'POST', cookie: owner.cookie, csrf: owner.csrf, body: { id: 'SHARED-1', name: 'Existing shared record', notes: 'Existing shared note' } });
  assert.equal(record.status, 201);
  const created = await register('NewViewer', { override: { COOKIE_SECURE: 'true' } });
  assert.equal(created.status, 201);
  assert.equal(created.data.user.username, 'newviewer');
  assert.equal(created.data.user.role, 'Viewer', 'a requested role must never change the public role');
  assert.match(created.cookie, /HttpOnly/); assert.match(created.cookie, /Secure/); assert.match(created.cookie, /SameSite=Lax/);
  assert.doesNotMatch(JSON.stringify(created.data), /Local-strong-password|password_hash|token_hash/);
  const stored = (await db.query('SELECT username,role,salt,password_hash FROM app_users WHERE id=$1', [created.data.user.id])).rows[0];
  assert.equal(stored.role, 'Viewer'); assert.notEqual(stored.password_hash, password); assert.ok(stored.salt && stored.password_hash);
  const me = await request('/me', { cookie: created.cookie });
  assert.equal(me.data.authenticated, true); assert.equal(me.data.user.id, created.data.user.id); assert.ok(me.data.csrfToken);
  const records = await request('/records', { cookie: created.cookie });
  assert.equal(records.status, 200);
  assert.ok(records.data.records.some(row => row.id === 'SHARED-1' && row.notes === 'Existing shared note'));
  assert.equal((await request('/records/SHARED-1', { cookie: created.cookie })).status, 200);
  assert.equal((await request('/admin/users', { cookie: created.cookie })).status, 403);
  assert.equal((await request('/backup', { cookie: created.cookie })).status, 403);
  assert.equal((await request('/records', { method: 'POST', cookie: created.cookie, csrf: me.data.csrfToken, body: { name: 'Unauthorized write' } })).status, 403);
  assert.equal((await request('/admin/users', { method: 'POST', cookie: created.cookie, csrf: me.data.csrfToken, body: { username: 'try-admin', password, role: 'Admin' } })).status, 403);
  assert.equal((await request('/auth/logout', { method: 'POST', cookie: created.cookie, body: {} })).status, 403);
  const logout = await request('/auth/logout', { method: 'POST', cookie: created.cookie, csrf: me.data.csrfToken, body: {} });
  assert.equal(logout.status, 200); assert.match(logout.cookie, /Max-Age=0/);
  assert.equal((await request('/me', { cookie: created.cookie })).data.authenticated, false);
  assert.equal((await login('NEWVIEWER', 'wrong-password-123')).status, 401);
  const signedIn = await login('NEWVIEWER');
  assert.equal(signedIn.status, 200); assert.equal(signedIn.data.user.id, created.data.user.id); assert.equal(signedIn.data.user.role, 'Viewer');
});

test('pending approvals are shared while tested tasks, notes, conversations and sessions stay account-scoped', async () => {
  const owner = await admin();
  const ownerMe = await request('/me', { cookie: owner.cookie });
  const ownerWrite = { method: 'POST', cookie: owner.cookie, csrf: owner.csrf };
  const open = await request('/approvals', { ...ownerWrite, body: { action: 'Synthetic shared approval', description: 'Synthetic approval description' } });
  const resolved = await request('/approvals', { ...ownerWrite, body: { action: 'Synthetic resolved approval', description: 'Not pending' } });
  assert.equal(open.status, 201); assert.equal(resolved.status, 201);
  assert.equal((await request(`/approvals/${resolved.data.approval.id}`, { method: 'PATCH', cookie: owner.cookie, csrf: owner.csrf, body: { status: 'approved' } })).status, 200);
  const note = await request('/assistant/confirm', { ...ownerWrite, body: { confirmed: true, action: { type: 'create_note', content: 'Synthetic owner-only note' } } });
  const task = await request('/assistant/confirm', { ...ownerWrite, body: { confirmed: true, action: { type: 'create_task', title: 'Synthetic owner-only task' } } });
  const conversation = await request('/platform/conversations', { ...ownerWrite, body: { title: 'Synthetic owner-only conversation' } });
  assert.equal(note.status, 200); assert.equal(task.status, 200); assert.equal(conversation.status, 201);

  const viewer = await register('sharing-viewer');
  assert.equal(viewer.status, 201); assert.equal(viewer.data.user.role, 'Viewer');
  const viewerMe = await request('/me', { cookie: viewer.cookie });
  const viewerWrite = { cookie: viewer.cookie, csrf: viewerMe.data.csrfToken };
  const approvals = await request('/approvals', { cookie: viewer.cookie });
  assert.equal(approvals.status, 200);
  const shared = approvals.data.approvals.find(item => item.id === open.data.approval.id);
  assert.equal(shared?.action, 'Synthetic shared approval');
  assert.equal(shared.description, 'Synthetic approval description');
  assert.equal(shared.requestedBy, ownerMe.data.user.username);
  assert.ok(!approvals.data.approvals.some(item => item.id === resolved.data.approval.id));
  assert.equal((await request('/approvals', { ...viewerWrite, method: 'POST', body: { action: 'Forbidden approval' } })).status, 403);
  assert.equal((await request(`/approvals/${shared.id}`, { ...viewerWrite, method: 'PATCH', body: { status: 'approved' } })).status, 403);
  assert.ok((await request('/approvals', { cookie: owner.cookie })).data.approvals.some(item => item.id === shared.id), 'denied action must leave the approval pending');

  const viewerNote = await request('/assistant/confirm', { ...viewerWrite, method: 'POST', body: { confirmed: true, action: { type: 'create_note', content: 'Synthetic Viewer note' } } });
  assert.equal(viewerNote.status, 200);
  const notes = await request('/assistant/notes', { cookie: viewer.cookie });
  assert.deepEqual(notes.data.notes.map(item => item.id), [viewerNote.data.note.id]);
  assert.deepEqual((await request('/assistant/tasks', { cookie: viewer.cookie })).data.tasks, []);
  assert.equal((await request(`/assistant/notes/${note.data.note.id}`, { ...viewerWrite, method: 'DELETE', body: {} })).status, 404);
  assert.equal((await request(`/assistant/tasks/${task.data.task.id}`, { ...viewerWrite, method: 'DELETE', body: {} })).status, 404);
  assert.ok((await request('/assistant/notes', { cookie: owner.cookie })).data.notes.some(item => item.id === note.data.note.id));
  assert.ok((await request('/assistant/tasks', { cookie: owner.cookie })).data.tasks.some(item => item.id === task.data.task.id));
  const conversationPath = `/platform/conversations/${conversation.data.conversation.id}`;
  assert.deepEqual((await request('/platform/conversations', { cookie: viewer.cookie })).data.conversations, []);
  assert.equal((await request(conversationPath, { cookie: viewer.cookie })).status, 404);
  assert.equal((await request(conversationPath, { ...viewerWrite, method: 'DELETE', body: {} })).status, 404);
  assert.equal((await request(conversationPath, { cookie: owner.cookie })).status, 200);
  const ownerSessions = (await request('/auth/sessions', { cookie: owner.cookie })).data.sessions;
  const viewerSessions = (await request('/auth/sessions', { cookie: viewer.cookie })).data.sessions;
  assert.ok(ownerSessions.length && viewerSessions.length);
  assert.ok(viewerSessions.every(session => ownerSessions.every(other => other.id !== session.id)));
});

test('pending approvals remain readable by every signed-in role, but only Admins and Managers may change them', async () => {
  const owner = await admin();
  const pending = await request('/approvals', { method: 'POST', cookie: owner.cookie, csrf: owner.csrf, body: { action: 'Shared role fixture', description: 'Visible to all roles' } });
  assert.equal(pending.status, 201);
  const viewer = await register('role-viewer');
  assert.equal(viewer.status, 201);
  const sessions = [{ role: 'Admin', cookie: owner.cookie, csrf: owner.csrf }, { role: 'Viewer', cookie: viewer.cookie }];
  for (const [username, role] of [['role-manager', 'Manager'], ['role-operator', 'Data Operator']]) {
    const created = await request('/admin/users', { method: 'POST', cookie: owner.cookie, csrf: owner.csrf, body: { username, password, role } });
    assert.equal(created.status, 201); assert.equal(created.data.user.role, role);
    const signedIn = await login(username);
    assert.equal(signedIn.status, 200); assert.equal(signedIn.data.user.role, role);
    sessions.push({ role, cookie: signedIn.cookie });
  }
  assert.equal((await request('/approvals')).status, 401);
  for (const session of sessions) {
    session.csrf ||= (await request('/me', { cookie: session.cookie })).data.csrfToken;
    const list = await request('/approvals', { cookie: session.cookie });
    assert.equal(list.status, 200, session.role);
    assert.ok(list.data.approvals.some(item => item.id === pending.data.approval.id && item.description === 'Visible to all roles'), session.role);
    assert.equal((await request('/stats', { cookie: session.cookie })).status, 200, session.role);
  }
  for (const role of ['Viewer', 'Data Operator']) {
    const session = sessions.find(item => item.role === role);
    const write = { cookie: session.cookie, csrf: session.csrf, body: { action: 'Forbidden action' } };
    assert.equal((await request('/approvals', { ...write, method: 'POST' })).status, 403, role);
    assert.equal((await request(`/approvals/${pending.data.approval.id}`, { ...write, method: 'PATCH', body: { status: 'approved' } })).status, 403, role);
  }
  const manager = sessions.find(item => item.role === 'Manager');
  const decision = await request(`/approvals/${pending.data.approval.id}`, { method: 'PATCH', cookie: manager.cookie, csrf: manager.csrf, body: { status: 'approved' } });
  assert.equal(decision.status, 200);
  assert.equal(decision.data.approval.status, 'approved');
});

test('new Viewers cannot use administrative routes or modify shared records', async () => {
  const owner = await admin();
  const ownerMe = await request('/me', { cookie: owner.cookie });
  const record = await request('/records', { method: 'POST', cookie: owner.cookie, csrf: owner.csrf, body: { id: 'BOUNDARY-1', name: 'Synthetic shared record' } });
  assert.equal(record.status, 201);
  const viewer = await register('boundary-viewer');
  assert.equal(viewer.status, 201); assert.equal(viewer.data.user.role, 'Viewer');
  const me = await request('/me', { cookie: viewer.cookie });
  assert.equal((await request('/records/BOUNDARY-1', { cookie: viewer.cookie })).status, 200);

  const adminReads = [
    '/admin/users', '/admin/providers', '/admin/diagnostics', '/admin/ai/overview',
    '/admin/ai/provider-health', '/admin/audit', '/admin/metrics', '/admin/data-integrity',
    '/admin/system-snapshot', '/admin/permissions', '/admin/content-reports', '/security/events', '/backup'
  ];
  for (const path of adminReads) {
    assert.equal((await request(path, { cookie: owner.cookie })).status, 200, `Admin positive control: ${path}`);
    assert.equal((await request(path, { cookie: viewer.cookie })).status, 403, `Viewer denied: ${path}`);
  }
  const adminAndRecordWrites = [
    ['POST', '/admin/providers', { provider: 'gemini', key: 'synthetic-provider-key' }],
    ['POST', '/admin/schema/repair', { confirm: 'apply-schema-repair' }],
    ['POST', '/admin/users', { username: 'unauthorized-admin', password, role: 'Admin' }],
    ['PATCH', `/admin/users/${ownerMe.data.user.id}`, { active: false }],
    ['POST', `/admin/content-reports/${crypto.randomUUID()}/review`, { confirm: true }],
    ['POST', '/restore', { format: 'alsyed-jalal-backup', version: 1, records: [{ id: 'BOUNDARY-1', name: 'Overwritten' }] }],
    ['POST', '/records', { name: 'Unauthorized record' }],
    ['POST', '/records/bulk', { records: [{ id: 'BOUNDARY-1', name: 'Overwritten' }] }],
    ['PUT', '/records/BOUNDARY-1', { name: 'Overwritten' }],
    ['DELETE', '/records/BOUNDARY-1', {}]
  ];
  for (const [method, path, body] of adminAndRecordWrites) {
    const result = await request(path, { method, body, cookie: viewer.cookie, csrf: me.data.csrfToken, override: { SCHEMA_REPAIR_ENABLED: 'true' } });
    assert.equal(result.status, 403, `Viewer denied: ${method} ${path}`);
  }
  const unchanged = await request('/records/BOUNDARY-1', { cookie: owner.cookie });
  assert.equal(unchanged.data.record.name, 'Synthetic shared record');
  assert.equal((await request('/me', { cookie: owner.cookie })).data.user.role, 'Admin');
  assert.equal(Number((await db.query('SELECT count(*)::int AS n FROM app_users')).rows[0].n), 2);
});

test('legacy case variants keep exact sign-in and ambiguous fallbacks fail, even if one account is inactive', async () => {
  const first = await register('legacy-first');
  const second = await register('legacy-second', { body: { username: 'legacy-second', password: 'Other-local-password-456' } });
  assert.equal(first.status, 201); assert.equal(second.status, 201);
  await db.query('UPDATE app_users SET username=$1 WHERE id=$2', ['LegacyName', first.data.user.id]);
  await db.query("UPDATE app_users SET username=$1,role='Admin' WHERE id=$2", ['LEGACYNAME', second.data.user.id]);
  assert.equal((await login('LegacyName')).data.user.id, first.data.user.id);
  assert.equal((await login('LEGACYNAME', 'Other-local-password-456')).data.user.id, second.data.user.id);
  assert.equal((await login('LegacyName', 'Other-local-password-456')).status, 401, 'do not fall through from an exact account to a different one');
  assert.equal((await login('legacyname')).status, 401, 'a non-exact ambiguous spelling must not choose an account');
  await db.query('UPDATE app_users SET active=false WHERE id=$1', [second.data.user.id]);
  assert.equal((await login('legacyname')).status, 401, 'inactive duplicates still make a spelling ambiguous');
  assert.equal((await register('LeGaCyNaMe')).status, 409);
  await db.query('UPDATE app_users SET username=$1 WHERE id=$2', ['OtherLegacyName', second.data.user.id]);
  const unambiguous = await login('legacyname');
  assert.equal(unambiguous.status, 200); assert.equal(unambiguous.data.user.id, first.data.user.id);
  assert.equal((await login('otherlegacyname', 'Other-local-password-456')).status, 401, 'an inactive account cannot sign in');
});

test('simultaneous public sign-ups differing only in case create one account and one session', async () => {
  const race = racingPrechecks();
  const [a, b] = await Promise.all([
    register('RaceName', { dbAdapter: race.adapter }),
    register('RACENAME', { dbAdapter: race.adapter })
  ]);
  assert.equal(race.arrivals(), 2);
  assert.deepEqual([a.status, b.status].sort(), [201, 409]);
  assert.equal(Number((await db.query("SELECT count(*)::int AS n FROM app_users WHERE lower(username)='racename'")).rows[0].n), 1);
  assert.equal(Number((await db.query('SELECT count(*)::int AS n FROM sessions')).rows[0].n), 1);
});

test('public and Admin-created names use the same canonical key in a simultaneous race', async () => {
  const owner = await admin(), race = racingPrechecks();
  const [publicResult, adminResult] = await Promise.all([
    register('CaseRace', { dbAdapter: race.adapter }),
    request('/admin/users', { method: 'POST', cookie: owner.cookie, csrf: owner.csrf, dbAdapter: race.adapter, body: { username: 'CASERACE', password, role: 'Viewer' } })
  ]);
  assert.equal(race.arrivals(), 2);
  assert.deepEqual([publicResult.status, adminResult.status].sort(), [201, 409]);
  const rows = (await db.query("SELECT username,role FROM app_users WHERE lower(username)='caserace'")).rows;
  assert.deepEqual(rows, [{ username: 'caserace', role: 'Viewer' }]);
  assert.equal((await request('/admin/users', { method: 'POST', cookie: owner.cookie, csrf: owner.csrf, body: { username: 'cAsErAcE', password, role: 'Admin' } })).status, 409);
});

test('registration limiter counts every attempt independently of audit writes and refills over time', async () => {
  const noAudit = { query: async (sql, params = []) => {
    if (sql.startsWith('INSERT INTO audit_events')) throw new Error('simulated audit failure');
    return adapter.query(sql, params);
  } };
  assert.equal((await register('first-viewer', { dbAdapter: noAudit })).status, 201);
  assert.equal(Number((await db.query('SELECT count(*)::int AS n FROM audit_events')).rows[0].n), 0);
  for (let i = 0; i < 9; i++) assert.equal((await register('x', { dbAdapter: noAudit })).status, 400);
  const limited = await register('another-viewer', { dbAdapter: noAudit });
  assert.equal(limited.status, 429); assert.equal(limited.headers.get('retry-after'), '360');
  const limiter = (await db.query("SELECT subject_hash FROM auth_rate_limits WHERE scope='register'")).rows;
  assert.equal(limiter.length, 1); assert.notEqual(limiter[0].subject_hash, '192.0.2.71');
  assert.equal((await register('different-ip', { ip: '192.0.2.72' })).status, 201);
  await db.query("UPDATE auth_rate_limits SET updated_at=now()-interval '360 seconds' WHERE scope='register'");
  assert.equal((await register('after-refill', { dbAdapter: noAudit })).status, 201);
  assert.equal((await register('still-limited', { dbAdapter: noAudit })).status, 429);
});

test('simultaneous registration attempts cannot exceed the IP bucket', async () => {
  const results = await Promise.all(Array.from({ length: 15 }, () => register('x')));
  assert.equal(results.filter(result => result.status === 400).length, 10);
  assert.equal(results.filter(result => result.status === 429).length, 5);
});

test('missing trusted IP, limiter, or session secret fails closed and creates no account', async () => {
  const broken = { query: async (sql, params = []) => {
    if (sql.includes('auth_rate_limits')) throw new Error('simulated limiter outage');
    return adapter.query(sql, params);
  } };
  for (const options of [{ ip: null }, { dbAdapter: broken }, { override: { CSRF_SECRET: '', SESSION_SECRET: '' } }]) {
    const result = await register('unavailable-user', options);
    assert.equal(result.status, 503); assert.equal(result.data.code, 'AUTH_UNAVAILABLE');
    assert.equal((await login('unavailable-user', password, options)).status, 503);
  }
  assert.equal(Number((await db.query('SELECT count(*)::int AS n FROM app_users')).rows[0].n), 0);
});

test('a failed initial session insert rolls back account creation', async () => {
  await db.exec('ALTER TABLE sessions ADD CONSTRAINT test_reject_sessions CHECK (false)');
  try {
    const failed = await register('session-failure');
    assert.equal(failed.status, 500);
    assert.equal(Number((await db.query("SELECT count(*)::int AS n FROM app_users WHERE username='session-failure'")).rows[0].n), 0);
    assert.equal(Number((await db.query('SELECT count(*)::int AS n FROM sessions')).rows[0].n), 0);
  } finally { await db.exec('ALTER TABLE sessions DROP CONSTRAINT test_reject_sessions'); }
  assert.equal((await register('session-failure')).status, 201);
});

test('authentication endpoints reject form-compatible content types and do not grant cross-origin CORS', async () => {
  for (const path of ['/auth/register', '/auth/login', '/bootstrap/admin']) {
    for (const contentType of ['text/plain', 'application/x-www-form-urlencoded', null]) {
      const response = await request(path, { method: 'POST', contentType, body: { username: 'cross-site', password } });
      assert.equal(response.status, 415, `${path}: ${contentType}`);
    }
  }
  const preflight = await onRequest({ request: new Request('https://isolated.test/api/auth/register', { method: 'OPTIONS', headers: { origin: 'https://other.test', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } }), env });
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), null);
  assert.equal(Number((await db.query('SELECT count(*)::int AS n FROM app_users')).rows[0].n), 0);
});

test('reserved seed names and case variants cannot create or recover the wrong Administrator', async () => {
  const seed = { FIRST_ADMIN_SETUP_ENABLED: 'true', SEED_ADMIN_USERNAME: 'SeedOwner', SEED_ADMIN_PASSWORD: 'Owner-seed-password-456' };
  assert.equal((await register('SEEDOWNER', { override: seed })).status, 409);
  const legacy = await register('seedowner'); assert.equal(legacy.status, 201);
  const claim = await request('/bootstrap/admin', { method: 'POST', override: seed, body: { username: seed.SEED_ADMIN_USERNAME, password: seed.SEED_ADMIN_PASSWORD } });
  assert.equal(claim.status, 409);
  assert.equal((await login(seed.SEED_ADMIN_USERNAME, seed.SEED_ADMIN_PASSWORD, { override: seed })).status, 401);
  assert.equal(Number((await db.query("SELECT count(*)::int AS n FROM app_users WHERE role='Admin'")).rows[0].n), 0);
  await db.query("UPDATE app_users SET role='Admin' WHERE id=$1", [legacy.data.user.id]);
  const before = (await db.query('SELECT salt,password_hash FROM app_users WHERE id=$1', [legacy.data.user.id])).rows[0];
  assert.equal((await login(seed.SEED_ADMIN_USERNAME, seed.SEED_ADMIN_PASSWORD, { override: seed })).status, 401);
  assert.deepEqual((await db.query('SELECT salt,password_hash FROM app_users WHERE id=$1', [legacy.data.user.id])).rows[0], before);
  assert.equal((await login('SEEDOWNER')).status, 200, 'ordinary password login remains available');
});

test('signup and sign-in work in a disposable fixture with the reported incomplete table-name inventory', async () => {
  // This models the reported table names only. The fixture uses current local
  // schema definitions; it is not a production clone, backup or live test.
  const reportedPresent = [
    'app_users', 'sessions', 'records', 'audit_events', 'record_history',
    'documents', 'approvals', 'ai_runs', 'auth_rate_limits', 'assistant_tasks',
    'assistant_notes', 'platform_conversations', 'platform_messages'
  ];
  const missing = REQUIRED_TABLES.filter(name => !reportedPresent.includes(name));
  assert.equal(reportedPresent.filter(name => REQUIRED_TABLES.includes(name)).length, 13);
  assert.ok(missing.includes('app_settings') && missing.includes('app_bootstrap'));
  const fixture = await PGlite.create();
  try {
    for (const part of SCHEMA_PARTS) await fixture.exec(part.sql);
    for (const name of missing) {
      assert.match(name, /^[a-z_][a-z0-9_]*$/);
      await fixture.query(`DROP TABLE IF EXISTS "${name}" CASCADE`);
    }
    const fixtureAdapter = { query: async (sql, params = []) => (await fixture.query(sql, params)).rows };
    const ready = await request('/ready', { dbAdapter: fixtureAdapter });
    assert.equal(ready.status, 503);
    assert.equal(ready.data.ready, false);
    assert.equal(ready.data.schemaTables, 13);
    assert.equal(ready.data.required, REQUIRED_TABLES.length);
    assert.deepEqual([...ready.data.missing].sort(), [...missing].sort());

    // Give the isolated workspace an existing Admin and record before signup.
    const owner = await request('/demo', { method: 'POST', body: {}, dbAdapter: fixtureAdapter });
    assert.equal(owner.status, 200);
    const ownerMe = await request('/me', { cookie: owner.cookie, dbAdapter: fixtureAdapter });
    assert.equal(ownerMe.data.user.role, 'Admin');
    const bootstrap = await request('/bootstrap/status', { dbAdapter: fixtureAdapter });
    assert.equal(bootstrap.data.available, false);
    assert.equal(bootstrap.data.admins, 1);
    const record = await request('/records', { method: 'POST', cookie: owner.cookie, csrf: ownerMe.data.csrfToken, dbAdapter: fixtureAdapter, body: { id: 'FIXTURE-1', name: 'Shared fixture record', notes: 'Shared fixture note' } });
    assert.equal(record.status, 201);
    const created = await register('FixtureViewer', { dbAdapter: fixtureAdapter });
    assert.equal(created.status, 201);
    assert.equal(created.data.user.role, 'Viewer');
    const me = await request('/me', { cookie: created.cookie, dbAdapter: fixtureAdapter });
    assert.equal(me.data.authenticated, true);
    assert.equal(me.data.user.id, created.data.user.id);
    assert.ok(me.data.csrfToken);
    const records = await request('/records', { cookie: created.cookie, dbAdapter: fixtureAdapter });
    assert.equal(records.status, 200);
    assert.ok(records.data.records.some(row => row.id === 'FIXTURE-1' && row.notes === 'Shared fixture note'));
    // This repository-defined fixture also shows which shared aggregates can
    // work without the missing agent/critic tables. It is not a live DB clone.
    const stats = await request('/stats', { cookie: created.cookie, dbAdapter: fixtureAdapter });
    assert.equal(stats.status, 200);
    assert.equal(stats.data.activeUsers, 2);
    assert.ok(stats.data.auditCount > 0);
    const skills = await request('/agent/skills', { cookie: created.cookie, dbAdapter: fixtureAdapter });
    assert.equal(skills.status, 503); assert.equal(skills.data.code, 'SKILLS_NOT_MIGRATED');
    const critic = await request('/assistant/critic/review', { method: 'POST', cookie: created.cookie, csrf: me.data.csrfToken, dbAdapter: fixtureAdapter, body: {} });
    assert.equal(critic.status, 503); assert.equal(critic.data.code, 'CRITIC_EVIDENCE_UNAVAILABLE');
    assert.equal((await request('/admin/users', { cookie: created.cookie, dbAdapter: fixtureAdapter })).status, 403);
    assert.equal((await request('/records', { method: 'POST', cookie: created.cookie, csrf: me.data.csrfToken, dbAdapter: fixtureAdapter, body: { name: 'Forbidden fixture write' } })).status, 403);
    assert.equal((await request('/auth/logout', { method: 'POST', cookie: created.cookie, csrf: me.data.csrfToken, dbAdapter: fixtureAdapter, body: {} })).status, 200);
    assert.equal((await request('/me', { cookie: created.cookie, dbAdapter: fixtureAdapter })).data.authenticated, false);
    const signedIn = await login('FIXTUREVIEWER', password, { dbAdapter: fixtureAdapter });
    assert.equal(signedIn.status, 200);
    assert.equal(signedIn.data.user.id, created.data.user.id);
    assert.equal(signedIn.data.user.role, 'Viewer');
    assert.equal((await request('/me', { cookie: signedIn.cookie, dbAdapter: fixtureAdapter })).data.authenticated, true);
    assert.equal((await request('/me', { cookie: owner.cookie, dbAdapter: fixtureAdapter })).data.user.role, 'Admin');

    // A missing auth limiter is different: registration and sign-in fail closed.
    await fixture.query('DROP TABLE auth_rate_limits');
    const blocked = await register('blocked-fixture', { dbAdapter: fixtureAdapter });
    assert.equal(blocked.status, 503);
    assert.equal(blocked.data.code, 'AUTH_UNAVAILABLE');
    const blockedLogin = await login('FIXTUREVIEWER', password, { dbAdapter: fixtureAdapter });
    assert.equal(blockedLogin.status, 503);
    assert.equal(blockedLogin.data.code, 'AUTH_UNAVAILABLE');
    const rows = await fixture.query('SELECT count(*)::int AS n FROM app_users WHERE username=$1', ['blocked-fixture']);
    assert.equal(Number(rows.rows[0].n), 0);
  } finally {
    await fixture.close();
  }
});
