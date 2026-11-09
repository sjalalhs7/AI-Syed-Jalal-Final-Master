import test from 'node:test';
import assert from 'node:assert/strict';
import { assistantRoute } from '../../frontend/functions/assistant-routes.mjs';
import { AGENT_TOOLS } from '../../frontend/functions/agent-runtime.mjs';

const me = { id: 'account-a', username: 'tester', role: 'Admin' };
const reply = (body, status = 200) => ({ body, status });

async function chat(message, db) {
  const url = new URL('https://example.test/api/assistant/chat');
  return assistantRoute({
    request: new Request(url, { method: 'POST' }), url, env: {}, db, me,
    readBody: async () => ({ message, mode: 'agent' }), reply,
    audit: async () => {}, consumeRateLimit: async () => true
  });
}

test('agent history reports confirmed, unconfirmed and deliberately unattempted writes', async () => {
  let attempts = 0;
  const saved = await chat('calculate 6*7', { query: async sql => {
    assert.match(sql, /INSERT INTO agent_runs/); attempts++; return [];
  } });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.historyStatus, 'confirmed');
  assert.match(saved.body.id, /^[0-9a-f-]{36}$/i);
  assert.match(saved.body.output, /42/);
  assert.equal(attempts, 1);

  // Model a lost response after a write may have committed. The caller must not
  // assert either that it was saved or that it was rolled back.
  let possiblyCommitted = false;
  const uncertain = await chat('calculate 6*7', { query: async sql => {
    assert.match(sql, /INSERT INTO agent_runs/); possiblyCommitted = true;
    throw new Error('private storage connection detail');
  } });
  assert.equal(possiblyCommitted, true);
  assert.equal(uncertain.status, 200);
  assert.equal(uncertain.body.id, null);
  assert.equal(uncertain.body.historyStatus, 'unconfirmed');
  assert.doesNotMatch(JSON.stringify(uncertain), /private storage connection detail/);

  let proposalQueries = 0;
  const proposal = await chat('add task: a private draft', { query: async () => { proposalQueries++; return []; } });
  assert.equal(proposal.body.action.type, 'create_task');
  assert.equal(proposal.body.id, null);
  assert.equal(proposal.body.historyStatus, 'not-attempted');
  assert.equal(proposalQueries, 0, 'preparing a proposal must not store its content');
});

test('the agent catalogue describes database and network sources without calling every tool deterministic', async () => {
  const url = new URL('https://example.test/api/assistant/agent/tools');
  const result = await assistantRoute({ request: new Request(url), url, env: {}, db: {}, me, reply });
  assert.equal(result.status, 200);
  assert.equal(result.body.tools.length, AGENT_TOOLS.length);
  assert.match(result.body.note, /database.*Wikipedia/i);
  assert.match(result.body.note, /explicit confirmation/i);
  assert.doesNotMatch(result.body.note, /all deterministic/i);
});

test('agent tool failures do not expose database or network error details', async () => {
  const { runAgent } = await import('../../frontend/functions/agent-runtime.mjs');
  const privateDetail = 'private connection string or upstream response';
  const brokenDb = { query: async () => { throw new Error(privateDetail); } };
  const databaseRun = await runAgent({ prompt: 'show my tasks', db: brokenDb, me, env: {} });
  assert.equal(databaseRun.trace.failures, 1);
  assert.match(databaseRun.output, /Account data could not be read/);
  assert.match(databaseRun.output, /no successful tool calls/);
  assert.doesNotMatch(databaseRun.output, /question needs a cloud model/i);
  assert.doesNotMatch(JSON.stringify(databaseRun), new RegExp(privateDetail));

  const networkRun = await runAgent({ prompt: 'research space travel', db: {}, me, env: {
    FETCH_IMPL: async () => { throw new Error(privateDetail); }
  } });
  assert.equal(networkRun.trace.failures, 1);
  assert.match(networkRun.output, /Wikipedia research is unavailable/);
  assert.doesNotMatch(JSON.stringify(networkRun), new RegExp(privateDetail));
});

test('a Wikipedia lookup with no hits is an attempted tool, not a local answer', async () => {
  const { runAgent } = await import('../../frontend/functions/agent-runtime.mjs');
  const result = await runAgent({ prompt: 'research an obscure topic', db: {}, me, env: {
    FETCH_IMPL: async () => ({ ok: true, json: async () => ({ query: { search: [] } }) })
  } });
  assert.equal(result.trace.attempted, 1);
  assert.equal(result.trace.toolCalls, 0);
  assert.equal(result.trace.failures, 0);
  assert.match(result.output, /1 tool attempt.*no usable tool result/);
  assert.doesNotMatch(result.output, /answered locally/);
});
