import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { buildApi, root } from '../build.mjs';
import { resolve } from 'node:path';
import { AGENT_TOOLS, planFor, runAgent } from '../../frontend/functions/agent-runtime.mjs';

/**
 * V136 — the agent contract.
 *
 * An "agent" claim is only honest if: the tool list is finite and published, every
 * step is recorded with its real result, a failing tool is reported as a failure
 * (never smoothed into a confident answer), and the loop is bounded.
 */
let db, onRequest;
before(async () => {
  db = new PGlite();
  await db.exec(await readFile(resolve(root, 'backend/db/schema.sql'), 'utf8'));
  await db.exec(await readFile(resolve(root, 'backend/db/migrations/012_v136_agent_runtime.sql'), 'utf8'));
  await buildApi(); ({ onRequest } = await import('../../.data/api.mjs'));
});
after(async () => { await db?.close(); });

function client(cookie = '') {
  return async (path, method = 'GET', body, token = '') => {
    const response = await onRequest({
      request: new Request('https://preview.test/api' + path, {
        method,
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.61', ...(cookie ? { cookie } : {}), ...(token ? { 'x-csrf-token': token } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      }),
      env: { DB_ADAPTER: { query: async (sql, params = []) => (await db.query(sql, params)).rows }, LOCAL_PREVIEW: 'true', CSRF_SECRET: 'agent-runtime-test-secret-32-chars-min', COOKIE_SECURE: 'false' }
    });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] || '' };
  };
}
async function account() {
  const c = client();
  const demo = await c('/demo', 'POST', {});
  const authed = client(demo.cookie);
  const me = await authed('/me');
  return { c: authed, token: me.data.csrfToken, user: me.data.user };
}

const fakeFetch = payload => async () => ({ ok: true, status: 200, async json() { return payload; } });

test('the agent publishes a finite tool list and plans only tools that exist', () => {
  // V140 grew the toolbox from 4 to 12, V141 to 13. The contract is a *finite,
  // published, duplicate-free* list — not a frozen count, which would only ever
  // be an invitation to edit the test instead of reading it.
  assert.ok(AGENT_TOOLS.length >= 12 && AGENT_TOOLS.length <= 16, `tool count left its bound: ${AGENT_TOOLS.length}`);
  assert.equal(new Set(AGENT_TOOLS.map(tool => tool.id)).size, AGENT_TOOLS.length);
  for (const id of ['calculator', 'records', 'research', 'tasks']) {
    assert.ok(AGENT_TOOLS.some(tool => tool.id === id), `the original tool ${id} must still exist`);
  }
  for (const tool of AGENT_TOOLS) assert.ok(tool.id && tool.label && tool.kind, `${tool.id} is incomplete`);
  for (const prompt of [
    'calculate 40 * 3',
    'research the history of the printing press',
    'show my tasks',
    'search records for Karachi',
    'write me a poem about the sea'
  ]) {
    const plan = planFor(prompt);
    assert.ok(plan.length >= 1 && plan.length <= 4, `plan for "${prompt}" must be bounded`);
    for (const item of plan) assert.ok(AGENT_TOOLS.some(tool => tool.id === item.tool) || item.tool === 'none');
  }
});

test('a question with no matching tool says no tool ran instead of pretending', () => {
  const plan = planFor('write me a poem about the sea');
  assert.equal(plan.length, 1);
  assert.equal(plan[0].tool, 'none');
});

test('a tool failure is recorded as a failure, not smoothed into an answer', async () => {
  const result = await runAgent({
    prompt: 'research quantum computing',
    db, me: { id: '00000000-0000-4000-8000-000000000000' },
    env: { ...{}, FETCH_IMPL: async () => ({ ok: false, status: 503 }) }
  });
  const research = result.steps.find(step => step.tool === 'research');
  assert.equal(research.ok, false);
  assert.match(research.observation, /503|failed|unavailable/i);
  assert.equal(result.trace.failures, 1);
  assert.match(result.output, /FAILED/);
});

test('research returns the real article titles and attribution when the network works', async () => {
  const result = await runAgent({
    prompt: 'research artificial intelligence',
    db, me: { id: '00000000-0000-4000-8000-000000000000' },
    env: {
      FETCH_IMPL: fakeFetch({ query: { search: [
        { pageid: 42, title: 'Artificial intelligence', snippet: 'A <span>field</span> of study.' },
        { pageid: 7, title: 'Machine learning', snippet: 'A branch of AI.' }
      ] } })
    }
  });
  const research = result.steps.find(step => step.tool === 'research');
  assert.equal(research.ok, true);
  assert.match(research.observation, /Artificial intelligence/);
  assert.match(research.observation, /https:\/\/en\.wikipedia\.org\/wiki\//);
  assert.deepEqual(result.trace.tools, ['research']);
  assert.equal(result.simulated, false);
});

test('the calculator step is deterministic and needs no network', async () => {
  const result = await runAgent({ prompt: 'calculate (1200 + 350) * 15% * 3', db, me: { id: '00000000-0000-4000-8000-000000000000' }, env: {} });
  assert.match(result.steps[0].observation, /= 697\.5$/);
  assert.equal(result.trace.toolCalls, 1);
  assert.equal(result.trace.failures, 0);
});

test('agent mode is account-gated, persists a trace and returns the tool list', async () => {
  assert.equal((await client()('/assistant/chat', 'POST', { message: 'show my tasks', mode: 'agent' })).status, 401);
  const { c, token } = await account();
  const tools = await c('/assistant/agent/tools');
  assert.equal(tools.status, 200);
  assert.equal(tools.data.tools.length, AGENT_TOOLS.length);
  assert.match(tools.data.note, /explicit confirmation/);

  const run = await c('/assistant/chat', 'POST', { message: 'search records for Karachi', mode: 'agent' }, token);
  assert.equal(run.status, 200);
  assert.equal(run.data.mode, 'agent');
  assert.equal(run.data.provider, 'sj-agent-runtime');
  assert.ok(run.data.id, 'the run is stored so the trace is evidence');
  assert.ok(Array.isArray(run.data.steps) && run.data.steps.length >= 1);
  assert.ok(run.data.steps.every(step => typeof step.ok === 'boolean' && Number.isFinite(step.ms)));

  const history = await c('/assistant/agent/runs');
  assert.equal(history.status, 200);
  assert.ok(history.data.total >= 1);
  const one = await c('/assistant/agent/runs/' + run.data.id);
  assert.equal(one.status, 200);
  assert.equal(one.data.run.id, run.data.id);

  const stranger = await account();
  assert.equal((await stranger.c('/assistant/agent/runs/' + run.data.id)).status, 404, 'runs are owner-scoped');
});

// CI runners have internet, so the research tool succeeds there and the
// needsProvider answer must not depend on whether the sandbox can reach out.
const liveWikipedia = (titles = ['Philosophy of mind']) => async () => ({
  ok: true,
  json: async () => ({ query: { search: titles.map(title => ({ title, snippet: 'A summary.', timestamp: '2026-01-01T00:00:00Z' })) } })
});

test('a search hit is not mistaken for an answer on a host with internet', async () => {
  const { c, token } = await account();
  const run = await c('/assistant/chat', 'POST', { message: 'explain the philosophy of mind', mode: 'agent' }, token);
  assert.equal(run.status, 200);
  // Whatever the network did, an open-ended question still needs a model, and the
  // run must not claim Wikipedia answered it.
  assert.equal(run.data.needsProvider, true);
  assert.match(run.data.output, /no model output was invented/i);
  if (run.data.steps[0].ok) {
    assert.match(run.data.steps[0].observation, /Sources found/i);
    assert.doesNotMatch(run.data.steps[0].observation, /^Wikipedia returned/);
  }
});

test('a specific lookup does let the found source stand on its own', async () => {
  const { runAgent } = await import('../../frontend/functions/agent-runtime.mjs');
  const db = { query: async () => [] };
  const result = await runAgent({ prompt: 'who is Ada Lovelace', db, me: { id: 'u1' }, env: { FETCH_IMPL: liveWikipedia(['Ada Lovelace']) } });
  assert.equal(result.needsProvider, false);
  assert.equal(result.trace.toolCalls, 1);
  assert.match(result.steps[0].observation, /en\.wikipedia\.org\/wiki\//);
});

test('an unconfigured provider is reported, never faked, inside an agent run', async () => {
  const { c, token } = await account();
  const run = await c('/assistant/chat', 'POST', { message: 'explain the philosophy of mind', mode: 'agent' }, token);
  assert.equal(run.status, 200);
  assert.equal(run.data.needsProvider, true);
  assert.match(run.data.output, /no model output was invented/i);
});

test('repeated agent runs are rate limited rather than unbounded', async () => {
  const { c, token } = await account();
  let limited = 0;
  for (let i = 0; i < 14; i += 1) {
    const response = await c('/assistant/chat', 'POST', { message: 'calculate 1+1', mode: 'agent' }, token);
    if (response.status === 429) limited += 1;
  }
  assert.ok(limited >= 1, 'the twelfth-plus run in a minute must be refused');
});
