import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pageStatus } from '../../frontend/functions/page-inventory.mjs';
import { builtInChecks, runChecks } from '../../frontend/functions/self-check-core.mjs';
import { REQUIRED_TABLES } from '../../frontend/functions/schema-bundle.mjs';
import { runReview } from '../../frontend/functions/expert-critic.mjs';
import { assistantRoute } from '../../frontend/functions/assistant-routes.mjs';
import { AGENT_TOOLS } from '../../frontend/functions/agent-runtime.mjs';
import { unavailableProviderEnv } from '../../frontend/functions/provider-settings.mjs';

const checks = Object.fromEntries(builtInChecks().map(check => [check.id, check]));

test('page and voice checks do not claim unknown assets are deployed', async () => {
  const pages = await pageStatus({});
  assert.ok(pages.length > 10 && pages.every(page => page.exists === null));
  await assert.rejects(() => checks['ui.pages'].run({ pages }), /could not be checked/);
  await assert.rejects(() => checks['voice.surfaces'].run({ pages }), /could not be checked/);
});

test('asset probe verifies page markers, closing HTML and shared voice declarations', async () => {
  const assets = { fetch: async request => {
    const path = new URL(request.url).pathname.slice(1);
    if (path === 'jarvis.html') return new Response('<html>homepage fallback</html>');
    if (path === 'dashboard.html') return new Response('', { status: 404 });
    if (path === 'agent.html') return new Response('<html id="studio"></html>');
    return new Response(await readFile(new URL('../../frontend/' + path, import.meta.url), 'utf8'));
  }};
  const pages = await pageStatus({ ASSETS: assets });
  assert.equal(pages.find(page => page.file === 'jarvis.html').exists, false);
  assert.equal(pages.find(page => page.file === 'dashboard.html').exists, false);
  assert.equal(pages.find(page => page.file === 'agent.html').voiceContract.ok, false);
  await assert.rejects(() => checks['ui.pages'].run({ pages }), /jarvis\.html/);
  await assert.rejects(() => checks['voice.surfaces'].run({ pages }), /jarvis\.html/);
});

test('self-check schema uses the full readiness table list', async () => {
  const db = { query: async () => REQUIRED_TABLES.filter(name => name !== 'app_settings').map(table_name => ({ table_name })) };
  await assert.rejects(() => checks['db.schema'].run({ db }), /app_settings/);
});

test('critic refuses unavailable evidence rather than turning a failed query into zero', async () => {
  const db = { query: async () => { throw Error('unavailable, private backend detail'); } };
  await assert.rejects(() => runReview({ db, me: { id: 'user' } }), /unavailable/);
  const reply = (body, status = 200) => ({ body, status });
  const result = await assistantRoute({
    request: new Request('https://example.test/api/assistant/critic/review', { method: 'POST' }),
    env: {}, db, me: { id: 'user' }, url: new URL('https://example.test/api/assistant/critic/review'),
    reply, consumeRateLimit: async () => true
  });
  assert.equal(result.status, 503);
  assert.equal(result.body.code, 'CRITIC_EVIDENCE_UNAVAILABLE');
  assert.match(result.body.error, /could not read.*evidence/i);
  assert.doesNotMatch(JSON.stringify(result), /private backend detail/);
});

test('critic does not invent CSRF evidence or flag the expanded tool catalogue', async () => {
  const db = { query: async sql => sql.includes('information_schema') ? REQUIRED_TABLES.map(table_name => ({ table_name })) :
    sql.includes('duration_ms FROM') ? [] : [{ n: 1 }] };
  const pages = await pageStatus({});
  const review = await runReview({ db, me: { id: 'user' }, pages, runtime: { toolTimeoutMs: 9000 } });
  const observations = review.dimensions.flatMap(d => d.observations).join(' ');
  assert.match(observations, /CSRF enforcement was not exercised/);
  assert.doesNotMatch(observations, /was rejected during this session/);
  assert.match(checks['db.schema'].title, /table names/);
  assert.doesNotMatch(checks['auth.session'].title, /HttpOnly/);
  assert.match(checks['auth.write-guard'].title, /unconfirmed/i);
  assert.ok(!review.findings.some(item => item.title === 'Published tool list does not match the runtime'));
  assert.ok(review.findings.some(item => item.title === 'Voice pages could not be verified'));
  assert.ok(review.findings.some(item => item.title === 'Primary pages could not be verified'));
  const performance = review.dimensions.find(d => d.id === 'performance').observations.join(' ');
  assert.match(performance, new RegExp(`lists ${AGENT_TOOLS.length} tools`));
  assert.match(performance, /may not cancel underlying work/);
  assert.doesNotMatch(performance, /caps the cost/i);
});

test('critic distinguishes confirmed review storage from an uncertain write outcome', async () => {
  for (const failed of [false, true]) {
    let attempts = 0;
    const db = { query: async sql => {
      if (sql.includes('INSERT INTO expert_reviews')) {
        attempts++;
        if (failed) throw Error('private database connection detail');
        return [];
      }
      if (sql.includes('information_schema')) return REQUIRED_TABLES.map(table_name => ({ table_name }));
      if (sql.includes('duration_ms FROM')) return [];
      return [{ n: 1 }];
    } };
    const url = new URL('https://example.test/api/assistant/critic/review');
    const result = await assistantRoute({
      request: new Request(url, { method: 'POST' }), url, env: {}, db, me: { id: 'user' },
      reply: (body, status = 200) => ({ body, status }),
      audit: async () => {}, consumeRateLimit: async () => true
    });
    assert.equal(result.status, 200);
    assert.equal(attempts, 1);
    assert.equal(result.body.storageStatus, failed ? 'unconfirmed' : 'confirmed');
    if (failed) assert.equal(result.body.id, null);
    else assert.match(result.body.id, /^[0-9a-f-]{36}$/i);
    assert.doesNotMatch(JSON.stringify(result), /private database connection detail/);
  }
});


test('self-check preserves unknown provider configuration and never implies a live call', async () => {
  const check = checks['agent.no-fake-cloud'];
  const unknown = await check.run({ env: unavailableProviderEnv({}) });
  assert.match(unknown, /configuration is unknown/i);
  assert.match(unknown, /No live provider call was tested/);
  assert.doesNotMatch(unknown, /No checked provider keys configured/);
  const partial = await check.run({ env: unavailableProviderEnv({ OPENAI_API_KEY: 'private example' }) });
  assert.match(partial, /1 checked provider key.*other statuses are unknown/i);
  assert.doesNotMatch(partial, /private example/);
  const empty = await check.run({ env: {} });
  assert.match(empty, /No checked provider keys configured/);
  assert.match(empty, /Gemini, OpenAI, Anthropic, DeepSeek/);
});

test('self-check CSRF probe is unconfirmed even if the CSRF guard fails', async () => {
  const check = checks['auth.write-guard'];
  const original = new Request('https://example.test/api/agent/self-check', { headers: { cookie: 'session=test', 'x-csrf-token': 'secret-token' } });
  let probe;
  const run = status => check.run({ request: original, me: { id: 'user' }, env: {}, onRequest: async ({ request }) => {
    probe = request;
    assert.equal(request.headers.has('x-csrf-token'), false);
    return new Response('{}', { status });
  } });
  assert.match(await run(403), /403/);
  assert.deepEqual(await probe.json(), { confirmed: false, action: {} });
  await assert.rejects(() => run(400), /returned 400; expected 403/);
  const attempted = new Request('https://example.test/api/assistant/confirm', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmed: false, action: {} })
  });
  const response = await assistantRoute({
    request: attempted, env: {}, db: { query: async () => { throw Error('No database query is allowed'); } },
    me: { id: 'user' }, url: new URL(attempted.url), readBody: request => request.json(),
    reply: (body, status = 200) => ({ body, status })
  });
  assert.equal(response.status, 400, 'even a bypassed CSRF guard must not reach a write');
  assert.match(response.body.error, /Explicit confirmation/);
});

test('self-check results sanitize database exceptions without hiding known missing table names', async () => {
  const privateDetail = 'private database connection string';
  const failed = await runChecks([checks['db.schema']], { db: { query: async () => { throw Error(privateDetail); } } });
  assert.equal(failed.results[0].ok, false);
  assert.match(failed.results[0].detail, /Database operation could not be confirmed/);
  assert.doesNotMatch(JSON.stringify(failed), new RegExp(privateDetail));
  const missing = await runChecks([checks['db.schema']], { db: { query: async () =>
    REQUIRED_TABLES.filter(name => name !== 'app_settings').map(table_name => ({ table_name })) } });
  assert.match(missing.results[0].detail, /Missing required table names: app_settings/);
});


test('self-check attempts audit probe cleanup after an unsuccessful read', async () => {
  const queries = [];
  const db = { query: async sql => {
    queries.push(sql);
    if (sql.startsWith('SELECT')) throw Error('read unavailable');
    if (sql.startsWith('DELETE')) return [{ id: 'probe' }];
    return [];
  } };
  await assert.rejects(() => checks['db.roundtrip'].run({ db }), /read unavailable/);
  assert.deepEqual(queries.map(sql => sql.split(' ')[0]), ['INSERT', 'SELECT', 'DELETE']);
});
