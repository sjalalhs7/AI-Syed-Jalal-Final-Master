import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { buildApi, root } from '../build.mjs';

let db, onRequest;
before(async () => {
  db = await PGlite.create();
  await db.exec(await readFile(resolve(root, 'backend/db/schema.sql'), 'utf8'));
  for (const file of readdirSync(resolve(root, 'backend/db/migrations')).filter(f => f.endsWith('.sql')).sort())
    await db.exec(await readFile(resolve(root, 'backend/db/migrations', file), 'utf8'));
  await buildApi(); ({ onRequest } = await import('../../.data/api.mjs'));
});
after(async () => db?.close());
function client(cookie = '') {
  return async (path, method = 'GET', body, csrf = '') => {
    const response = await onRequest({ request: new Request('https://test.local/api' + path, { method,
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.30', ...(cookie ? { cookie } : {}), ...(csrf ? { 'x-csrf-token': csrf } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), env: {
      DB_ADAPTER: { query: async (sql, params = []) => (await db.query(sql, params)).rows }, LOCAL_PREVIEW: 'true',
      CSRF_SECRET: 'test-secret-at-least-32-characters-long', COOKIE_SECURE: 'false'
    }});
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] || '' };
  };
}
async function account(role = 'Admin') {
  const demo = await client()('/demo', 'POST', {});
  const c = client(demo.cookie), me = (await c('/me')).data;
  await db.query('UPDATE app_users SET role=$1 WHERE id=$2', [role, me.user.id]);
  return { c, token: me.csrfToken, user: me.user };
}
const report = { surface: 'jarvis', category: 'offensive', excerpt: '<img src=x onerror=alert(1)>', details: 'A test report.' };

test('reports require an authenticated user, valid CSRF and bounded input', async () => {
  assert.equal((await client()('/content-reports', 'POST', report)).status, 401);
  const { c, token } = await account('Viewer');
  assert.equal((await c('/content-reports', 'POST', report)).status, 403);
  assert.equal((await c('/content-reports', 'POST', { ...report, category: 'unknown' }, token)).status, 400);
  assert.equal((await c('/content-reports', 'POST', { ...report, surface: 'other' }, token)).status, 400);
  assert.equal((await c('/content-reports', 'POST', { ...report, excerpt: ' '.repeat(2) }, token)).status, 400);
  assert.equal((await c('/content-reports', 'POST', { ...report, excerpt: 'x'.repeat(5001) }, token)).status, 413);
  assert.equal((await c('/content-reports', 'POST', { ...report, details: 'x'.repeat(1001) }, token)).status, 413);
});

test('explicit submissions reach an Admin-only queue, and review is confirmed and audited', async () => {
  const viewer = await account('Viewer'), admin = await account('Admin');
  const sent = await viewer.c('/content-reports', 'POST', report, viewer.token);
  assert.equal(sent.status, 201); assert.ok(sent.data.id);
  assert.equal((await viewer.c('/admin/content-reports')).status, 403);
  assert.equal((await viewer.c(`/admin/content-reports/${sent.data.id}/review`, 'POST', { confirm: true }, viewer.token)).status, 403);
  const listing = await admin.c('/admin/content-reports');
  assert.equal(listing.status, 200);
  const stored = listing.data.reports.find(r => r.id === sent.data.id);
  assert.equal(stored.excerpt, report.excerpt); assert.equal(stored.username, viewer.user.username); assert.equal(stored.status, 'open');
  assert.equal((await admin.c(`/admin/content-reports/${sent.data.id}/review`, 'POST', {}, admin.token)).status, 400);
  assert.equal((await admin.c(`/admin/content-reports/${sent.data.id}/review`, 'POST', { confirm: true })).status, 403);
  assert.equal((await admin.c(`/admin/content-reports/${sent.data.id}/review`, 'POST', { confirm: true }, admin.token)).status, 200);
  assert.equal((await admin.c(`/admin/content-reports/${sent.data.id}/review`, 'POST', { confirm: true }, admin.token)).status, 404);
  assert.equal((await admin.c('/admin/content-reports')).data.reports.find(r => r.id === sent.data.id).status, 'reviewed');
  const audits = await db.query("SELECT action,detail FROM audit_events WHERE action LIKE 'CONTENT_REPORT_%'");
  assert.ok(audits.rows.some(r => r.action === 'CONTENT_REPORT_REVIEWED'));
  assert.ok(audits.rows.every(r => !r.detail.includes(report.excerpt)), 'audit log must not duplicate the content');
  // The existing audit FK otherwise prevents account deletion; handling those
  // records is a separate owner-approved account-deletion task.
  await db.query('UPDATE audit_events SET user_id=NULL WHERE user_id=$1', [viewer.user.id]);
  await db.query('DELETE FROM app_users WHERE id=$1', [viewer.user.id]);
  const remaining = await db.query('SELECT id FROM content_reports WHERE id=$1', [sent.data.id]);
  assert.equal(remaining.rows.length, 0, 'reports are removed if the user account is deleted');
});

test('report submission has an enforced per-user rate limit', async () => {
  const { c, token } = await account('Viewer');
  for (let i = 0; i < 10; i++) assert.equal((await c('/content-reports', 'POST', report, token)).status, 201);
  assert.equal((await c('/content-reports', 'POST', report, token)).status, 429);
});
