import { readdirSync } from 'node:fs';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { buildApi, root } from '../build.mjs';
import { resolve } from 'node:path';

let db, onRequest;
before(async () => {
  db = new PGlite();
  await db.exec(await readFile(resolve(root, 'backend/db/schema.sql'), 'utf8'));
  for (const file of readdirSync(resolve(root, 'backend/db/migrations')).filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(await readFile(resolve(root, 'backend/db/migrations', file), 'utf8'));
  }
  await buildApi(); ({ onRequest } = await import('../../.data/api.mjs'));
});
after(async () => { await db?.close(); });
function client(cookie = '') {
  return async (path, method = 'GET', body, token = '') => {
    const response = await onRequest({ request: new Request('https://preview.test/api' + path, { method, headers: { 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.10', ...(cookie ? { cookie } : {}), ...(token ? { 'x-csrf-token': token } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), env: { DB_ADAPTER: { query: async (sql, params = []) => (await db.query(sql, params)).rows }, LOCAL_PREVIEW: 'true', CSRF_SECRET: 'integration-test-secret-at-least-32-characters', COOKIE_SECURE: 'false' } });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] || '' };
  };
}
async function account() { const c = client(); const demo = await c('/demo', 'POST', {}); const authed = client(demo.cookie); const me = await authed('/me'); return { c: authed, token: me.data.csrfToken, user: me.data.user }; }

test('real PostgreSQL schema, session, CSRF and assistant persistence', async () => {
  const ready = (await client()('/ready')).data;
  assert.equal(ready.schemaTables, ready.required);
  assert.equal((await client()('/me')).data.authenticated, false);
  const { c, token, user } = await account(); assert.equal(user.role, 'Admin');
  assert.equal((await c('/assistant/chat', 'POST', { message: 'calculate 2+3*4' })).status, 403);
  const calc = await c('/assistant/chat', 'POST', { message: 'calculate 2+3*4' }, token); assert.match(calc.data.output, /14/);
  const proposal = await c('/assistant/chat', 'POST', { message: 'add task: Test persistence' }, token);
  assert.equal((await c('/assistant/state')).data.tasks.length, 0);
  assert.equal((await c('/assistant/confirm', 'POST', { confirmed: false, action: proposal.data.action }, token)).status, 400);
  const saved = await c('/assistant/confirm', 'POST', { confirmed: true, action: proposal.data.action }, token); assert.equal(saved.status, 200);
  const id = saved.data.task.id;
  assert.equal((await c('/assistant/tasks/' + id, 'PATCH', { status: 'done' }, token)).data.task.status, 'done');
  assert.equal((await c('/assistant/tasks?status=open')).data.tasks.length, 0);
  assert.deepEqual((await c('/assistant/tasks?status=done')).data.tasks.map(item => item.id), [id]);
  assert.equal((await c('/assistant/tasks?status=invalid')).status, 400);
  const other = await account(); assert.equal((await other.c('/assistant/state')).data.tasks.length, 0);
  assert.equal((await other.c('/assistant/tasks?status=done')).data.tasks.length, 0, 'status filters remain account-scoped');
  assert.equal((await other.c('/assistant/tasks/' + id, 'DELETE', {}, other.token)).status, 404);
  assert.equal((await c('/assistant/tasks/' + id, 'DELETE', {}, token)).status, 200);
  assert.equal((await c('/auth/logout', 'POST', {}, token)).status, 200);
  assert.equal((await c('/assistant/state')).status, 401);
});
test('records CRUD, role protection, backup/merge restore and operations contracts', async () => {
  const { c, token } = await account();
  const created = await c('/records', 'POST', { name: 'Integration record', region: 'North', sector: 'Test', status: 'Active' }, token); assert.equal(created.status, 201);
  const id = created.data.record?.id || created.data.id; assert.ok(id);
  assert.equal((await c('/records/' + encodeURIComponent(id))).status, 200);
  const backup = await c('/backup'); assert.equal(backup.data.format, 'alsyed-jalal-backup');
  const restore = await c('/restore', 'POST', backup.data, token); assert.equal(restore.data.mode, 'merge');
  for (const path of ['/stats', '/admin/metrics', '/admin/permissions', '/admin/system-snapshot', '/admin/data-integrity', '/admin/diagnostics', '/admin/users', '/security/events', '/auth/sessions', '/library', '/ai/capabilities']) assert.equal((await c(path)).status, 200, path);
  const diagnostics = await c('/admin/diagnostics'); assert.equal(diagnostics.data.checks.schema, true); assert.equal(diagnostics.data.pool.available, false);
  const username = 'test-viewer-' + Date.now();
  const viewer = await c('/admin/users', 'POST', { username, password: 'Test-password-12345', role: 'Viewer' }, token); assert.equal(viewer.status, 201);
  const login = await client()('/auth/login', 'POST', { username, password: 'Test-password-12345' }); assert.equal(login.status, 200);
  const viewerClient = client(login.cookie), viewerSession = await viewerClient('/me');
  assert.equal((await viewerClient('/admin/users', 'GET', undefined, viewerSession.data.csrfToken)).status, 403);
  assert.equal((await viewerClient('/records', 'POST', { name: 'Forbidden' }, viewerSession.data.csrfToken)).status, 403);
  assert.equal((await viewerClient('/assistant/chat', 'POST', { message: 'help' }, viewerSession.data.csrfToken)).status, 200);
  assert.equal((await viewerClient('/approvals', 'POST', { action: 'Forbidden' }, viewerSession.data.csrfToken)).status, 403);
  assert.equal((await c('/admin/users/' + viewer.data.user.id, 'PATCH', { active: false }, token)).status, 200);
  const approval = await c('/approvals', 'POST', { action: 'Integration approval', description: 'Review before release' }, token); assert.equal(approval.status, 201);
  const approvalId = approval.data.approval.id;
  assert.equal((await c('/approvals/' + approvalId, 'PATCH', { status: 'approved' }, token)).status, 200);
  assert.equal((await c('/approvals/' + approvalId, 'PATCH', { status: 'approved' }, token)).status, 404);
  assert.equal((await c('/records/' + encodeURIComponent(id), 'DELETE', {}, token)).status, 200);
});
test('cloud failure is explicit and local fallback never pretends to be an AI answer', async () => {
  const { c, token } = await account();
  const result = await c('/assistant/chat', 'POST', { message: 'Tell me a story', mode: 'cloud', provider: 'gemini' }, token);
  assert.equal(result.status, 200); assert.equal(result.data.mode, 'local'); assert.equal(result.data.needsProvider, true); assert.match(result.data.cloudError, /not configured/);
});
test('production cannot enable preview login or insecure cookies through a flag alone', async () => {
  const response = await onRequest({ request: new Request('https://production.test/api/demo', { method: 'POST' }), env: { DATABASE_URL: 'postgres://unused', LOCAL_PREVIEW: 'true', COOKIE_SECURE: 'false' } });
  assert.equal(response.status, 404);
});

test('agent and research voice commands only prepare writes until a CSRF-protected confirmation', async () => {
  const { c, token } = await account();
  const task = await c('/assistant/chat', 'POST', { message: 'add task: Voice follow-up', mode: 'agent' }, token);
  assert.equal(task.status, 200);
  assert.equal(task.data.action.type, 'create_task');
  assert.equal(task.data.needsProvider, false);
  assert.equal(task.data.id, null, 'an unconfirmed proposal must not persist its text in agent history');
  assert.equal((await c('/assistant/agent/runs')).data.total, 0);
  assert.equal((await c('/assistant/tasks')).data.tasks.length, 0);
  assert.equal((await c('/assistant/confirm', 'POST', { confirmed: true, action: task.data.action })).status, 403);
  assert.equal((await c('/assistant/confirm', 'POST', { confirmed: false, action: task.data.action }, token)).status, 400);
  assert.equal((await c('/assistant/tasks')).data.tasks.length, 0);
  assert.equal((await c('/assistant/confirm', 'POST', { confirmed: true, action: task.data.action }, token)).status, 200);
  assert.equal((await c('/assistant/tasks')).data.tasks[0].title, 'Voice follow-up');
  const metadata = await c('/assistant/state?metadata=1');
  assert.deepEqual(metadata.data.tasks, []);
  assert.deepEqual(metadata.data.notes, []);
  assert.ok(metadata.data.tools.length > 0);
  assert.equal((await c('/assistant/state')).data.tasks.length, 1);

  const note = await c('/assistant/chat', 'POST', { message: 'save note: Voice research idea', mode: 'research' }, token);
  assert.equal(note.data.action.type, 'create_note');
  assert.equal((await c('/assistant/state')).data.notes.length, 0);
  const other = await account();
  assert.equal((await other.c('/assistant/tasks')).data.tasks.length, 0, 'saved tasks remain account scoped');
  assert.equal((await other.c('/assistant/state')).data.notes.length, 0, 'another account cannot see the proposal');
  assert.equal((await c('/assistant/confirm', 'POST', { confirmed: true, action: note.data.action }, token)).status, 200);
  assert.equal((await c('/assistant/notes')).data.notes[0].content, 'Voice research idea');
  assert.equal((await other.c('/assistant/notes')).data.notes.length, 0, 'notes are account scoped');
});
