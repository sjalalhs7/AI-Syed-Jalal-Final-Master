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
  await db.exec(await readFile(resolve(root, 'backend/db/migrations/002_v43_ai_runs.sql'), 'utf8'));
  await db.exec(await readFile(resolve(root, 'backend/db/migrations/005_v127_auth_rate_limits.sql'), 'utf8'));
  await db.exec(await readFile(resolve(root, 'backend/db/migrations/007_v129_agent_platform.sql'), 'utf8'));
  await buildApi(); ({ onRequest } = await import('../../.data/api.mjs'));
});
after(async () => { await db?.close(); });
function client(cookie = '') {
  return async (path, method = 'GET', body, token = '') => {
    const response = await onRequest({ request: new Request('https://preview.test/api' + path, { method, headers: { 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.20', ...(cookie ? { cookie } : {}), ...(token ? { 'x-csrf-token': token } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), env: { DB_ADAPTER: { query: async (sql, params = []) => (await db.query(sql, params)).rows }, LOCAL_PREVIEW: 'true', CSRF_SECRET: 'platform-test-secret-at-least-32-characters', COOKIE_SECURE: 'false' } });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] || '' };
  };
}
async function account() { const c = client(); const demo = await c('/demo', 'POST', {}); const authed = client(demo.cookie); const me = await authed('/me'); return { c: authed, token: me.data.csrfToken, user: me.data.user }; }

test('platform state, conversation CRUD and owner isolation', async () => {
  const { c, token } = await account();
  assert.equal((await c('/platform/state')).status, 200);
  const state = await c('/platform/state', 'GET', undefined, token);
  assert.equal(state.status, 200); assert.ok(state.data.models.some(m => m.id === 'local'));
  const created = await c('/platform/conversations', 'POST', { title: 'Test conversation', mode: 'chat' }, token);
  assert.equal(created.status, 201); const id = created.data.conversation.id;
  assert.equal((await c('/platform/conversations/' + id)).data.conversation.title, 'Test conversation');
  const renamed = await c('/platform/conversations/' + id, 'PATCH', { title: 'Renamed' }, token);
  assert.equal(renamed.data.conversation.title, 'Renamed');
  const other = await account();
  assert.equal((await other.c('/platform/conversations/' + id, 'GET', undefined, other.token)).status, 404);
  assert.equal((await other.c('/platform/conversations/' + id, 'DELETE', {}, other.token)).status, 404);
  assert.equal((await c('/platform/conversations/' + id, 'DELETE', {}, token)).status, 200);
});

test('direct local message, agent workflow and file inspection persist', async () => {
  const { c, token } = await account();
  const created = await c('/platform/conversations', 'POST', { title: 'New conversation' }, token); const id = created.data.conversation.id;
  const calc = await c(`/platform/conversations/${id}/messages`, 'POST', { content: 'calculate 6*7', mode: 'chat', modelA: 'local' }, token);
  assert.equal(calc.status, 200); assert.match(calc.data.messages.at(-1).content, /42/);
  const agent = await c(`/platform/conversations/${id}/messages`, 'POST', { content: 'plan: Ship the platform', mode: 'agent', modelA: 'local', attachments: [{ name: 'notes.md', text: '# Title\nTODO: finish\n' }] }, token);
  assert.equal(agent.status, 200); const assistant = agent.data.messages.at(-1);
  assert.equal(assistant.steps.length, 4); assert.match(assistant.content, /Attached file inspection/); assert.match(assistant.content, /TODO\/FIXME\/HACK markers/);
  const loaded = await c(`/platform/conversations/${id}`); assert.ok(loaded.data.messages.length >= 4);
  const titled = await c('/platform/conversations'); assert.equal(titled.data.conversations[0].title, 'calculate 6*7');
});

test('compare mode returns two sides and records a vote', async () => {
  const { c, token } = await account();
  const created = await c('/platform/conversations', 'POST', { mode: 'compare', modelA: 'local-planner', modelB: 'local-critic' }, token); const id = created.data.conversation.id;
  const result = await c(`/platform/conversations/${id}/messages`, 'POST', { content: 'plan: Compare engines', mode: 'compare', modelA: 'local-planner', modelB: 'local-critic' }, token);
  assert.equal(result.status, 200);
  const sides = result.data.messages.filter(m => m.role === 'assistant');
  assert.equal(sides.length, 2); assert.deepEqual(sides.map(m => m.side), ['a', 'b']); assert.ok(sides[0].comparisonId);
  const vote = await c(`/platform/conversations/${id}/vote`, 'POST', { comparisonId: sides[0].comparisonId, vote: 'a' }, token);
  assert.equal(vote.status, 200);
  const loaded = await c(`/platform/conversations/${id}`); assert.ok(loaded.data.messages.filter(m => m.role === 'assistant').every(m => m.vote === 'a'));
  assert.equal((await c(`/platform/conversations/${id}/vote`, 'POST', { comparisonId: sides[0].comparisonId, vote: 'invalid' }, token)).status, 400);
});

test('history off keeps messages transient and cloud gaps stay explicit', async () => {
  const { c, token } = await account();
  const created = await c('/platform/conversations', 'POST', { history: false }, token); const id = created.data.conversation.id;
  const result = await c(`/platform/conversations/${id}/messages`, 'POST', { content: 'calculate 2+2', history: false }, token);
  assert.equal(result.status, 200); assert.equal(result.data.history, false); assert.equal(result.data.messages.length, 2);
  assert.equal((await c(`/platform/conversations/${id}`)).data.messages.length, 0);
  const cloud = await c(`/platform/conversations/${id}/messages`, 'POST', { content: 'Tell me a story', modelA: 'gemini', history: false }, token);
  assert.equal(cloud.status, 200); assert.match(cloud.data.messages.at(-1).content, /not configured/);
  const badFile = await c(`/platform/conversations/${id}/messages`, 'POST', { content: 'read', attachments: [{ name: 'image.png', text: 'x' }] }, token);
  assert.equal(badFile.status, 400);
});
