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
  const created = await c('/platform/conversations', 'POST', { title: 'This title must not survive', history: false }, token); const id = created.data.conversation.id;
  assert.equal(created.data.conversation.title, 'Private conversation');
  const result = await c(`/platform/conversations/${id}/messages`, 'POST', { content: 'calculate 2+2', history: false }, token);
  assert.equal(result.status, 200); assert.equal(result.data.history, false); assert.equal(result.data.messages.length, 2);
  const loaded = await c(`/platform/conversations/${id}`);
  assert.equal(loaded.data.messages.length, 0); assert.equal(loaded.data.conversation.title, 'Private conversation');
  const cloud = await c(`/platform/conversations/${id}/messages`, 'POST', { content: 'Tell me a story', modelA: 'gemini', history: false }, token);
  assert.equal(cloud.status, 200); assert.match(cloud.data.messages.at(-1).content, /not configured/);
  const badFile = await c(`/platform/conversations/${id}/messages`, 'POST', { content: 'read', attachments: [{ name: 'image.png', text: 'x' }] }, token);
  assert.equal(badFile.status, 400);
});

test('disabling history removes stored messages and message-derived titles', async () => {
  const { c, token } = await account();
  const created = await c('/platform/conversations', 'POST', { title: 'Sensitive project title' }, token); const id = created.data.conversation.id;
  await c(`/platform/conversations/${id}/messages`, 'POST', { content: 'calculate 5+5' }, token);
  const disabled = await c(`/platform/conversations/${id}`, 'PATCH', { history: false }, token);
  assert.equal(disabled.status, 200); assert.equal(disabled.data.conversation.title, 'Private conversation');
  const loaded = await c(`/platform/conversations/${id}`); assert.equal(loaded.data.messages.length, 0);
});
test('copy adds a saved turn and regenerate replaces exactly the targeted reply', async () => {
  const { c, token } = await account();
  const created = await c('/platform/conversations', 'POST', { title: 'Copy and regenerate' }, token);
  const id = created.data.conversation.id;

  const first = await c(`/platform/conversations/${id}/messages`, 'POST', { content: 'calculate 6*7' }, token);
  const reply = first.data.messages.find(message => message.role === 'assistant');
  assert.ok(reply.id); assert.ok(reply.replyTo, 'assistant replies must carry a reply anchor');

  // Copy: the same text becomes a new user turn with its own real answer.
  const copied = await c(`/platform/conversations/${id}/messages`, 'POST', { content: reply.content }, token);
  assert.equal(copied.status, 200);
  assert.equal(copied.data.messages.filter(message => message.role === 'user').length, 1);
  const stored = await c(`/platform/conversations/${id}`);
  assert.equal(stored.data.messages.length, 4);

  // Regenerate: replaces the named reply instead of appending another one.
  const secondReply = copied.data.messages.find(message => message.role === 'assistant');
  const regenerated = await c(`/platform/conversations/${id}/messages`, 'POST', { content: reply.content, replace: [secondReply.replyTo] }, token);
  assert.equal(regenerated.status, 200);
  assert.equal(regenerated.data.messages.filter(message => message.role === 'user').length, 0, 'regenerate must not duplicate the prompt');
  const after = await c(`/platform/conversations/${id}`);
  assert.equal(after.data.messages.length, 4, 'regenerate must swap the reply, not grow the conversation');
  assert.equal(after.data.messages.some(message => message.id === secondReply.id), false, 'the replaced reply must be gone');
  assert.equal(after.data.messages.filter(message => message.role === 'assistant').length, 2);

  // A reply from another conversation cannot be replaced through this one.
  const other = await c('/platform/conversations', 'POST', { title: 'Other' }, token);
  const foreign = await c(`/platform/conversations/${other.data.conversation.id}/messages`, 'POST', { content: 'calculate 1+1' }, token);
  const foreignAnchor = foreign.data.messages.find(message => message.role === 'assistant').replyTo;
  const hijack = await c(`/platform/conversations/${id}/messages`, 'POST', { content: 'calculate 1+1', replace: [foreignAnchor] }, token);
  assert.equal(hijack.status, 404);
});

test('a compare pair shares one anchor and regenerates as a pair', async () => {
  const { c, token } = await account();
  const id = (await c('/platform/conversations', 'POST', { title: 'Compare', mode: 'compare' }, token)).data.conversation.id;
  const first = await c(`/platform/conversations/${id}/messages`, 'POST', { content: 'plan: Compare two approaches', mode: 'compare', modelA: 'local-planner', modelB: 'local-critic' }, token);
  const sides = first.data.messages.filter(message => message.role === 'assistant');
  assert.equal(sides.length, 2);
  assert.equal(sides[0].replyTo, sides[1].replyTo, 'both compare sides must share one anchor');
  assert.equal(sides[0].replyTo, sides[0].comparisonId);
  // Replacing by anchor swaps the whole pair and keeps the single prompt.
  const regenerated = await c(`/platform/conversations/${id}/messages`, 'POST', { content: 'plan: Compare two approaches', mode: 'compare', modelA: 'local-planner', modelB: 'local-critic', replace: [sides[0].replyTo] }, token);
  assert.equal(regenerated.status, 200);
  assert.equal(regenerated.data.messages.filter(message => message.role === 'user').length, 0, 'the prompt must not be duplicated');
  const after = await c(`/platform/conversations/${id}`);
  assert.equal(after.data.messages.length, 3, 'a pair regeneration replaces two replies with two replies');
  assert.equal(after.data.messages.filter(message => message.role === 'assistant').length, 2);
  assert.equal(after.data.messages.some(message => message.id === sides[0].id || message.id === sides[1].id), false);
});

test('a rejected request never leaves a prompt without a reply behind it', async () => {
  const { c, token } = await account();
  const id = (await c('/platform/conversations', 'POST', { title: 'Rejected' }, token)).data.conversation.id;
  // Oversized attachment, oversized total text and an unsupported type must all be
  // rejected before anything is persisted, so the transcript stays consistent.
  const attempts = [
    [{ name: 'big.txt', text: 'x'.repeat(120001) }, 413],
    [{ name: 'ok.txt', text: 'x'.repeat(119000) }, 400],
    [{ name: 'image.png', text: 'x' }, 400]
  ];
  for (const [attachment, expected] of attempts) {
    const result = await c(`/platform/conversations/${id}/messages`, 'POST', { content: 'summarise this', attachments: [attachment] }, token);
    assert.ok([400, 413].includes(result.status), `expected a rejection, got ${result.status}`);
    assert.ok(expected === 400 || expected === 413);
  }
  const stored = await c(`/platform/conversations/${id}`);
  assert.equal(stored.data.messages.length, 0, 'a rejected request must not persist a partial turn');
});
