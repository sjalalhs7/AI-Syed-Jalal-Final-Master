import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pageStatus } from '../../frontend/functions/page-inventory.mjs';
import { builtInChecks } from '../../frontend/functions/self-check-core.mjs';
import { REQUIRED_TABLES } from '../../frontend/functions/schema-bundle.mjs';
import { runReview } from '../../frontend/functions/expert-critic.mjs';
import { assistantRoute } from '../../frontend/functions/assistant-routes.mjs';

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
  assert.ok(!review.findings.some(item => item.title === 'Published tool list does not match the runtime'));
  assert.ok(review.findings.some(item => item.title === 'Voice pages could not be verified'));
  assert.ok(review.findings.some(item => item.title === 'Primary pages could not be verified'));
});
