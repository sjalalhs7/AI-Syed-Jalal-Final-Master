import { readdirSync } from 'node:fs';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { buildApi, root } from '../build.mjs';
import { resolve } from 'node:path';
import { searchSkills, runChecks, builtInChecks, gradeChecks, verdictFor } from '../../frontend/functions/self-check-core.mjs';

let db, onRequest, index;
before(async () => {
  db = new PGlite();
  await db.exec(await readFile(resolve(root, 'backend/db/schema.sql'), 'utf8'));
  for (const file of readdirSync(resolve(root, 'backend/db/migrations')).filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(await readFile(resolve(root, 'backend/db/migrations', file), 'utf8'));
  }
  await buildApi(); ({ onRequest } = await import('../../.data/api.mjs'));
  index = JSON.parse(await readFile(resolve(root, 'frontend/config/agent-skill-index.json'), 'utf8'));
});
after(async () => { await db?.close(); });

function client(cookie = '') {
  return async (path, method = 'GET', body, token = '') => {
    const response = await onRequest({ request: new Request('https://preview.test/api' + path, { method, headers: { 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.30', ...(cookie ? { cookie } : {}), ...(token ? { 'x-csrf-token': token } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), env: { DB_ADAPTER: { query: async (sql, params = []) => (await db.query(sql, params)).rows }, LOCAL_PREVIEW: 'true', CSRF_SECRET: 'agent-test-secret-at-least-32-characters-long', COOKIE_SECURE: 'false' } });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] || '' };
  };
}
async function account() { const c = client(); const demo = await c('/demo', 'POST', {}); const authed = client(demo.cookie); const me = await authed('/me'); return { c: authed, token: me.data.csrfToken, user: me.data.user }; }

test('generated skill index is complete and deterministic', () => {
  assert.equal(index.count, 3500);
  assert.equal(index.domainCount, 35);
  assert.equal(index.skills.length, 3500);
  assert.ok(index.skills.every(row => row.length === 5 && row[0] && row[1] && row[2]));
});

test('skill search ranks relevant results and is deterministic', () => {
  const first = searchSkills('security review', index, 5);
  const second = searchSkills('security review', index, 5);
  assert.ok(first.length > 0);
  assert.deepEqual(first.map(item => item.id), second.map(item => item.id));
  assert.ok(first.every(item => item.score > 0));
  assert.deepEqual(searchSkills('', index, 5), []);
  assert.deepEqual(searchSkills('zzzq-xylophone-quasar', index, 5), []);
});

test('ordinary language finds the right skills (synonyms, plurals, empty results)', () => {
  const cases = [
    ['launch a website', /deployment|web|release/i],
    ['make my app faster', /performance|application architecture/i],
    ['secure my login', /security|identity/i],
    ['doctor notes', /medical|healthcare/i],
    ['sql', /database/i]
  ];
  for (const [query, expected] of cases) {
    const hits = searchSkills(query, index, 3);
    assert.ok(hits.length > 0, `no skill matched "${query}"`);
    assert.ok(hits.every(hit => hit.score > 0));
    assert.ok(expected.test(hits[0].name + ' ' + hits[0].family + ' ' + hits[0].domain), `"${query}" ranked an irrelevant skill first: ${hits[0].name}`);
  }
  assert.deepEqual(searchSkills('zzzq xylophone quasar nimbus', index, 3), []);
  assert.deepEqual(searchSkills('a', index, 3), []);
});

test('grading and verdicts are bounded and explicit', () => {
  const allPass = [{ weight: 5, ok: true, severity: 'critical' }, { weight: 5, ok: true, severity: 'standard' }];
  assert.equal(gradeChecks(allPass), 100);
  assert.equal(verdictFor(allPass), 'pass');
  assert.equal(verdictFor([{ weight: 5, ok: false, severity: 'critical' }]), 'fail');
  assert.equal(verdictFor([{ weight: 5, ok: false, severity: 'standard' }]), 'warn');
  assert.equal(gradeChecks([{ weight: 1, ok: false }]), 0);
});

test('a throwing or hung check is recorded as a failure, not an exception', async () => {
  const outcome = await runChecks([
    { id: 'a', title: 'ok', group: 'g', weight: 1, severity: 'standard', run: () => 'fine' },
    { id: 'b', title: 'boom', group: 'g', weight: 1, severity: 'standard', run: () => { throw new Error('expected boom'); } },
    { id: 'c', title: 'hang', group: 'g', weight: 1, severity: 'standard', run: () => new Promise(() => {}) }
  ], {}, { timeoutMs: 50 });
  assert.equal(outcome.checksTotal, 3);
  assert.equal(outcome.checksPassed, 1);
  assert.match(outcome.results.find(item => item.id === 'b').detail, /expected boom/);
  assert.match(outcome.results.find(item => item.id === 'c').detail, /timed out/);
  assert.equal(outcome.verdict, 'fail');
});

test('readiness requires the V136 tables and health reports the current version', async () => {
  const ready = await client()('/ready');
  assert.equal(ready.status, 200);
  assert.equal(ready.data.schemaTables, ready.data.required);
  assert.equal(ready.data.ready, true);
  const { c } = await account();
  const diagnostics = await c('/admin/diagnostics');
  assert.ok(diagnostics.data.tables.includes('agent_skills'));
  assert.ok(diagnostics.data.tables.includes('agent_self_checks'));
  assert.ok(diagnostics.data.tables.includes('arena_battles'));
  assert.ok(diagnostics.data.tables.includes('arena_ratings'));
  assert.ok(diagnostics.data.tables.includes('expert_reviews'));
  assert.equal(diagnostics.data.status, 'healthy');
  assert.equal((await client()('/health')).data.version, 'V138');
});

test('skill catalogue API syncs, lists, searches and is account gated', async () => {
  assert.equal((await client()('/agent/skills')).status, 401);
  const { c, token } = await account();
  const listed = await c('/agent/skills?limit=5');
  assert.equal(listed.status, 200);
  assert.equal(listed.data.total, 3500);
  assert.equal(listed.data.returned, 5);
  assert.equal(listed.data.domains.length, 35);
  const searched = await c('/agent/skills?q=' + encodeURIComponent('medical safety') + '&limit=3');
  assert.equal(searched.status, 200);
  assert.ok(searched.data.skills.length > 0);
  assert.ok(searched.data.skills.length <= 3);
  const domains = await c('/agent/skills?domain=' + encodeURIComponent('Coding & Software') + '&limit=3');
  assert.ok(domains.data.skills.every(skill => skill.domain === 'Coding & Software'));
  assert.equal((await c('/agent/skills', 'POST', {}, '')).status, 403);
  assert.equal((await c('/agent/skills', 'POST', {}, token)).data.count, 3500);
});

test('capabilities advertise real checks and honest providers', async () => {
  const { c } = await account();
  const data = (await c('/agent/capabilities')).data;
  assert.equal(data.version, 'V138');
  assert.ok(data.selfCheck.checks.length >= 14);
  assert.ok(data.selfCheck.checks.every(check => check.id && check.weight > 0));
  assert.ok(data.providers.every(provider => provider.configured === false && /not configured/.test(provider.status)));
  assert.equal(data.skills.count, 3500);
});

test('self-check runs every check on a real database and persists evidence', async () => {
  const { c, token } = await account();
  const run = await c('/agent/self-check', 'POST', {}, token);
  assert.equal(run.status, 200);
  assert.equal(run.data.verdict, 'pass', JSON.stringify(run.data.results.filter(item => !item.ok), null, 1));
  assert.equal(run.data.score, 100);
  assert.equal(run.data.checksPassed, run.data.checksTotal);
  assert.ok(run.data.results.some(item => item.id === 'db.schema' && /\d+\/\d+/.test(item.detail)));
  const history = await c('/agent/self-check');
  assert.equal(history.status, 200);
  assert.equal(history.data.latest.score, 100);
  assert.equal(history.data.latest.verdict, 'pass');
  const report = await c('/agent/report');
  assert.equal(report.status, 200);
  assert.ok(report.data.trend.length >= 1);
});

test('self-check honours a subset request and rejects an unconfigured cloud engine', async () => {
  const { c, token } = await account();
  const subset = await c('/agent/self-check', 'POST', { only: ['math.calculator', 'catalog.search'] }, token);
  assert.equal(subset.status, 200);
  assert.equal(subset.data.checksTotal, 2);
  assert.equal(subset.data.score, 100);
  const cloud = await c('/agent/self-check', 'POST', { engine: 'cloud', provider: 'gemini' }, token);
  assert.equal(cloud.status, 400);
  assert.equal(cloud.data.code, 'PROVIDER_NOT_CONFIGURED');
  assert.match(cloud.data.error, /No request was made to the provider/);
});

test('self-check evidence is account scoped', async () => {
  const first = await account();
  await first.c('/agent/self-check', 'POST', {}, first.token);
  const second = await account();
  const history = await second.c('/agent/self-check');
  assert.equal(history.data.latest, null);
  assert.equal(history.data.history.length, 0);
});

test('built-in checks never claim a live provider call', async () => {
  const source = await readFile(resolve(root, 'frontend/functions/self-check-core.mjs'), 'utf8');
  assert.ok(source.includes('needsProvider'));
  assert.ok(!/mode:\s*'cloud'/.test(source));
  assert.equal(builtInChecks().length >= 14, true);
});

test('the first self-check on a fresh database fills the skill library itself', async () => {
  // A fresh database behind the already-built handler: no second buildApi() call,
  // because test files run in parallel and would race on the shared bundle.
  const fresh = new PGlite();
  await fresh.exec(await readFile(resolve(root, 'backend/db/schema.sql'), 'utf8'));
  await fresh.exec(await readFile(resolve(root, 'backend/db/migrations/009_v133_agent_skills.sql'), 'utf8'));
  const env = { DB_ADAPTER: { query: async (sql, params = []) => (await fresh.query(sql, params)).rows }, LOCAL_PREVIEW: 'true', CSRF_SECRET: 'fresh-db-secret-at-least-32-characters-long', COOKIE_SECURE: 'false' };
  const call = (path, method = 'GET', body, token = '', cookie = '') => onRequest({ request: new Request('https://preview.test/api' + path, { method, headers: { 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.40', ...(cookie ? { cookie } : {}), ...(token ? { 'x-csrf-token': token } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), env });
  const demo = await call('/demo', 'POST', {});
  const cookie = demo.headers.get('set-cookie')?.split(';')[0] || '';
  const me = await (await call('/me', 'GET', undefined, '', cookie)).json();
  const before = await fresh.query('SELECT count(*)::int AS n FROM agent_skills');
  assert.equal(Number(before.rows[0].n), 0);
  const data = await (await call('/agent/self-check', 'POST', {}, me.csrfToken, cookie)).json();
  const catalog = data.results.find(item => item.id === 'catalog.skills');
  assert.equal(catalog.ok, true, catalog.detail);
  assert.match(catalog.detail, /3500 skills/);
  const after = await fresh.query('SELECT count(*)::int AS n FROM agent_skills');
  assert.equal(Number(after.rows[0].n), 3500);
  await fresh.close();
});
