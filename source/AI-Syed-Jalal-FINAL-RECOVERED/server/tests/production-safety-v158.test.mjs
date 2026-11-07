import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { buildApi, root } from '../build.mjs';
import { REQUIRED_TABLES } from '../../frontend/functions/schema-bundle.mjs';

// Every mutation in this file targets a disposable in-memory PGlite database.
// It is not a copy of production; the 13-table fixture only models table names.
const presentInLiveReadiness = [
  'app_users', 'sessions', 'records', 'audit_events', 'record_history',
  'documents', 'approvals', 'ai_runs', 'auth_rate_limits', 'assistant_tasks',
  'assistant_notes', 'platform_conversations', 'platform_messages'
];

async function fixture() {
  const db = await PGlite.create();
  try {
    await db.exec(await readFile(resolve(root, 'backend/db/schema.sql'), 'utf8'));
    for (const file of (await readdir(resolve(root, 'backend/db/migrations'))).filter(f => f.endsWith('.sql')).sort()) {
      await db.exec(await readFile(resolve(root, 'backend/db/migrations', file), 'utf8'));
    }
    await buildApi();
    const { onRequest } = await import('../../.data/api.mjs');
    const env = {
      DB_ADAPTER: { query: async (sql, params = []) => (await db.query(sql, params)).rows },
      LOCAL_PREVIEW: 'true', COOKIE_SECURE: 'false',
      CSRF_SECRET: 'production-safety-test-secret-at-least-32-characters'
    };
    function client(cookie = '') {
      return async (path, method = 'GET', body, token = '') => {
        const response = await onRequest({
          request: new Request(`https://preview.test/api${path}`, {
            method,
            headers: {
              'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.158',
              ...(cookie ? { cookie } : {}), ...(token ? { 'x-csrf-token': token } : {})
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) })
          }),
          env
        });
        return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] || '' };
      };
    }
    const anonymous = client();
    const demo = await anonymous('/demo', 'POST', {});
    assert.equal(demo.status, 200);
    const admin = client(demo.cookie);
    const me = await admin('/me');
    assert.equal(me.data.user.role, 'Admin');
    return { db, client, anonymous, admin, token: me.data.csrfToken };
  } catch (error) { await db.close(); throw error; }
}

const names = async db => new Set((await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).rows.map(row => row.table_name));

test('diagnostics counts the same required table names as readiness, not an old hard-coded 21', async () => {
  const { db, admin } = await fixture();
  try {
    await db.exec('CREATE TABLE unrelated_extra_table (id integer)');
    const complete = await admin('/admin/diagnostics');
    assert.equal(complete.status, 200);
    assert.equal(complete.data.checks.schema, true);
    assert.equal(complete.data.schemaTables, REQUIRED_TABLES.length);
    assert.equal(complete.data.required, REQUIRED_TABLES.length);
    assert.deepEqual(complete.data.missing, []);
    assert.ok(!complete.data.tables.includes('unrelated_extra_table'));

    // Simulate a missing new table locally; do not touch any real database.
    await db.exec('DROP TABLE content_reports');
    const ready = await admin('/ready');
    const incomplete = await admin('/admin/diagnostics');
    assert.equal(ready.status, 503);
    assert.equal(incomplete.data.ok, false);
    assert.equal(incomplete.data.checks.schema, false);
    assert.equal(incomplete.data.status, 'schema-incomplete');
    assert.equal(incomplete.data.schemaTables, ready.data.schemaTables);
    assert.equal(incomplete.data.required, ready.data.required);
    assert.deepEqual(incomplete.data.missing, ready.data.missing);
    assert.ok(incomplete.data.missing.includes('content_reports'));
    assert.match(incomplete.data.note, /table names/i);
    await db.exec('DROP TABLE ai_runs');
    const missingRuns = await admin('/admin/diagnostics');
    assert.equal(missingRuns.status, 200);
    assert.equal(missingRuns.data.ai.active, null, 'a missing AI-runs table must not be reported as zero');
    assert.ok(missingRuns.data.missing.includes('ai_runs'));
  } finally { await db.close(); }
});

test('schema repair requires an authenticated Admin, valid CSRF and explicit confirmation', async () => {
  const { db, anonymous, admin, token } = await fixture();
  try {
    const created = await admin('/records', 'POST', { name: 'Local sentinel', region: 'Local', sector: 'Safety' }, token);
    assert.equal(created.status, 201);
    const beforeRecords = (await db.query('SELECT id, name, region, sector FROM records ORDER BY id')).rows;
    const beforeUsers = (await db.query('SELECT id, username, role, active FROM app_users ORDER BY id')).rows;
    const beforeSessions = (await db.query('SELECT id, user_id, token_hash, expires_at FROM sessions ORDER BY id')).rows;
    await db.query('INSERT INTO assistant_notes(id,user_id,content) VALUES($1,$2,$3)', [crypto.randomUUID(), beforeUsers[0].id, 'Local note to preserve']);
    const beforeNotes = (await db.query('SELECT id, user_id, content FROM assistant_notes ORDER BY id')).rows;

    for (const name of REQUIRED_TABLES.filter(name => !presentInLiveReadiness.includes(name))) {
      await db.exec(`DROP TABLE IF EXISTS ${name} CASCADE`);
    }
    const missing = REQUIRED_TABLES.filter(name => !presentInLiveReadiness.includes(name));
    assert.equal(missing.length, REQUIRED_TABLES.length - presentInLiveReadiness.length);
    assert.equal((await anonymous('/admin/schema/repair', 'POST', { confirm: 'apply-schema-repair' })).status, 401);
    for (const badToken of ['', 'incorrect']) {
      const rejected = await admin('/admin/schema/repair', 'POST', { confirm: 'apply-schema-repair' }, badToken);
      assert.equal(rejected.status, 403, 'a valid Admin session alone must not authorize a mutation');
      assert.match(rejected.data.error, /CSRF/i);
      const have = await names(db);
      assert.deepEqual(missing.filter(name => !have.has(name)), missing, 'a rejected request must not run migrations');
    }
    assert.equal(Number((await db.query("SELECT count(*) AS n FROM auth_rate_limits WHERE scope='schema-repair'")).rows[0].n), 0,
      'rejected CSRF requests must not consume repair rate-limit tokens');
    const preview = await admin('/admin/schema/repair', 'POST', {}, token);
    assert.equal(preview.status, 400, 'CSRF alone must not replace explicit repair confirmation');
    assert.deepEqual(preview.data.preview.missing, missing);
    assert.equal(preview.data.preview.transactional, false);
    assert.match(preview.data.preview.warning, /partial changes/i);
    assert.match(preview.data.error, /restorable full database backup/i);
    assert.equal(Number((await db.query("SELECT count(*) AS n FROM auth_rate_limits WHERE scope='schema-repair'")).rows[0].n), 0,
      'a preview without confirmation must not write a rate-limit row');

    const repaired = await admin('/admin/schema/repair', 'POST', { confirm: 'apply-schema-repair' }, token);
    assert.equal(repaired.status, 200);
    assert.equal(repaired.data.ok, true);
    assert.equal(repaired.data.before, presentInLiveReadiness.length);
    assert.equal(repaired.data.after, REQUIRED_TABLES.length);
    assert.deepEqual(repaired.data.failed, []);
    assert.deepEqual((await db.query('SELECT id, name, region, sector FROM records ORDER BY id')).rows, beforeRecords);
    assert.deepEqual((await db.query('SELECT id, username, role, active FROM app_users ORDER BY id')).rows, beforeUsers);
    assert.deepEqual((await db.query('SELECT id, user_id, token_hash, expires_at FROM sessions ORDER BY id')).rows, beforeSessions);
    assert.deepEqual((await db.query('SELECT id, user_id, content FROM assistant_notes ORDER BY id')).rows, beforeNotes);
  } finally { await db.close(); }
});

test('provider-key changes also require CSRF and keep the existing admin flow', async () => {
  const { db, client, anonymous, admin, token } = await fixture();
  try {
    const payload = { provider: 'gemini', key: 'unit-test-only-provider-value-12345678' };
    assert.equal((await anonymous('/admin/providers', 'POST', payload)).status, 401);
    assert.equal((await anonymous('/admin/diagnostics')).status, 401);
    const viewerCreate = await admin('/admin/users', 'POST', { username: 'local-safety-viewer', password: 'Local-Test-Password123', role: 'Viewer' }, token);
    assert.equal(viewerCreate.status, 201);
    const login = await anonymous('/auth/login', 'POST', { username: 'local-safety-viewer', password: 'Local-Test-Password123' });
    assert.equal(login.status, 200);
    const viewer = client(login.cookie), viewerToken = (await viewer('/me')).data.csrfToken;
    assert.equal((await viewer('/admin/diagnostics')).status, 403);
    assert.equal((await viewer('/admin/providers', 'POST', payload, viewerToken)).status, 403);
    assert.equal((await viewer('/admin/schema/repair', 'POST', { confirm: 'apply-schema-repair' }, viewerToken)).status, 403);
    for (const badToken of ['', 'incorrect']) {
      const rejected = await admin('/admin/providers', 'POST', payload, badToken);
      assert.equal(rejected.status, 403);
      assert.match(rejected.data.error, /CSRF/i);
    }
    assert.equal((await db.query("SELECT * FROM app_settings WHERE key='provider_keys'")).rows.length, 0);
    assert.equal(Number((await db.query("SELECT count(*) AS n FROM auth_rate_limits WHERE scope='provider-keys'")).rows[0].n), 0);

    const saved = await admin('/admin/providers', 'POST', payload, token);
    assert.equal(saved.status, 200);
    assert.equal(saved.data.ok, true);
    assert.ok(!JSON.stringify(saved.data).includes(payload.key), 'the key must not be returned in full');
    const removed = await admin('/admin/providers', 'POST', { provider: 'gemini', remove: true }, token);
    assert.equal(removed.status, 200);
    assert.equal(removed.data.ok, true);
  } finally { await db.close(); }
});

test('the records backup is only an active-records export, not a database backup', async () => {
  const { db, admin, token } = await fixture();
  try {
    const active = await admin('/records', 'POST', { name: 'Active local record' }, token);
    const deleted = await admin('/records', 'POST', { name: 'Deleted local record' }, token);
    assert.equal(active.status, 201);
    assert.equal(deleted.status, 201);
    assert.equal((await admin('/records/' + deleted.data.record.id, 'DELETE', {}, token)).status, 200);
    const backup = await admin('/backup');
    assert.equal(backup.status, 200);
    assert.deepEqual(Object.keys(backup.data).sort(), ['exportedAt', 'format', 'records', 'version']);
    assert.ok(backup.data.records.some(record => record.id === active.data.record.id));
    assert.ok(!backup.data.records.some(record => record.id === deleted.data.record.id));
    assert.equal((await db.query('SELECT count(*)::int AS n FROM app_users')).rows[0].n > 0, true);
    assert.equal('app_users' in backup.data, false);
    assert.equal('documents' in backup.data, false);
    assert.equal('sessions' in backup.data, false);
    assert.equal('assistant_notes' in backup.data, false);
  } finally { await db.close(); }
});
