import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { buildApi } from '../build.mjs';
import { SCHEMA_PARTS } from '../../frontend/functions/schema-bundle.mjs';

// Characterization, not approval of an access policy: these tests document the
// current sharing boundaries while the operator decides whether to change them.
// All accounts, records and evidence are synthetic; no production DB or AI
// provider is contacted. The DB adapter and secret below are local to this file.
let db, onRequest, skillSyncs, probeInserts, probeDeletes;
const adapter = { query: async (sql, params = []) => {
  if (sql.startsWith('INSERT INTO agent_skills(')) skillSyncs++;
  if (sql.startsWith('INSERT INTO audit_events(id,user_id,action,detail,ip)') && params[1] === 'V133_SELF_CHECK') probeInserts++;
  if (sql.startsWith('DELETE FROM audit_events WHERE id=$1 RETURNING id')) probeDeletes++;
  return (await db.query(sql, params)).rows;
} };
const env = { DB_ADAPTER: adapter, LOCAL_PREVIEW: 'true', COOKIE_SECURE: 'false', CSRF_SECRET: 'disposable-viewer-review-test-secret-over-32-characters' };

before(async () => {
  db = await PGlite.create();
  for (const part of SCHEMA_PARTS) await db.exec(part.sql);
  await buildApi();
  ({ onRequest } = await import('../../.data/api.mjs'));
});
beforeEach(async () => {
  await db.exec('TRUNCATE agent_skills, auth_rate_limits, app_users CASCADE');
  skillSyncs = probeInserts = probeDeletes = 0;
});
after(async () => { await db?.close(); });

async function request(path, { method = 'GET', body, cookie, csrf } = {}) {
  const headers = { 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.61' };
  if (cookie) headers.cookie = cookie.split(';')[0];
  if (csrf) headers['x-csrf-token'] = csrf;
  const response = await onRequest({
    request: new Request('https://isolated.test/api' + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
    env
  });
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie') };
}

async function accounts() {
  const owner = await request('/demo', { method: 'POST', body: {} });
  assert.equal(owner.status, 200);
  const ownerMe = (await request('/me', { cookie: owner.cookie })).data;
  assert.equal(ownerMe.user.role, 'Admin');
  const viewer = await request('/auth/register', { method: 'POST', body: { username: 'review-viewer', password: 'Synthetic-password-123' } });
  assert.equal(viewer.status, 201);
  assert.equal(viewer.data.user.role, 'Viewer');
  const viewerMe = (await request('/me', { cookie: viewer.cookie })).data;
  return { owner: { cookie: owner.cookie, ...ownerMe }, viewer: { cookie: viewer.cookie, ...viewerMe } };
}

test('workspace-wide statistics and Critic aggregates are Admin-only; Viewer Critic evidence stays account-scoped', async () => {
  const { owner, viewer } = await accounts();
  const privateDetail = 'Synthetic owner-only audit detail';
  const privatePrompt = 'Synthetic owner-only agent prompt';
  await db.query('INSERT INTO audit_events(id,user_id,action,detail,ip) VALUES($1,$2,$3,$4,$5)', [crypto.randomUUID(), owner.user.id, 'SYNTHETIC_OWNER_EVENT', privateDetail, 'test']);
  const runId = crypto.randomUUID();
  await db.query('INSERT INTO agent_runs(id,user_id,prompt,failures,duration_ms) VALUES($1,$2,$3,$4,$5)', [runId, owner.user.id, privatePrompt, 1, 23111]);
  const auditCount = Number((await db.query('SELECT count(*)::int AS n FROM audit_events')).rows[0].n);

  assert.equal((await request('/stats')).status, 401);
  const stats = await request('/stats', { cookie: viewer.cookie });
  assert.equal(stats.status, 403);
  assert.equal(stats.data.error, 'Admin role required for workspace-wide statistics');
  const adminStats = await request('/stats', { cookie: owner.cookie });
  assert.equal(adminStats.status, 200);
  assert.equal(adminStats.data.activeUsers, 2);
  assert.equal(adminStats.data.auditCount, auditCount);
  assert.ok(!JSON.stringify(stats.data).includes(privateDetail));
  assert.equal((await request('/admin/audit', { cookie: owner.cookie })).status, 200);
  assert.equal((await request('/admin/audit', { cookie: viewer.cookie })).status, 403);
  assert.equal((await request('/admin/diagnostics', { cookie: viewer.cookie })).status, 403);
  assert.deepEqual((await request('/assistant/agent/runs', { cookie: viewer.cookie })).data.runs, []);
  assert.equal((await request(`/assistant/agent/runs/${runId}`, { cookie: viewer.cookie })).status, 404);
  assert.equal((await request(`/assistant/agent/runs/${runId}`, { cookie: owner.cookie })).status, 200);

  const criticPath = '/assistant/critic/review';
  assert.equal((await request(criticPath, { method: 'POST', body: {}, cookie: viewer.cookie })).status, 403);
  const review = await request(criticPath, { method: 'POST', body: {}, cookie: viewer.cookie, csrf: viewer.csrfToken });
  assert.equal(review.status, 200);
  assert.equal(review.data.scope, 'account');
  const dimensions = Object.fromEntries(review.data.dimensions.map(item => [item.id, item.observations]));
  assert.ok(dimensions.security.some(text => text.includes('This account has') && text.includes('audit event(s)')));
  assert.ok(dimensions.reliability.some(item => item.includes('This account has 0 stored agent run(s)')));
  assert.ok(dimensions.performance.some(item => item.includes('No account agent run timings stored yet')));
  assert.ok(!JSON.stringify(review.data).includes('23111 ms'));
  assert.ok(!JSON.stringify(review.data).includes(privateDetail));
  assert.ok(!JSON.stringify(review.data).includes(privatePrompt));

  const adminReview = await request(criticPath, { method: 'POST', body: {}, cookie: owner.cookie, csrf: owner.csrfToken });
  assert.equal(adminReview.status, 200);
  assert.equal(adminReview.data.scope, 'deployment');
  const adminDimensions = Object.fromEntries(adminReview.data.dimensions.map(item => [item.id, item.observations]));
  assert.ok(adminDimensions.reliability.some(item => item.includes('1 stored agent run(s), 1 with a recorded failure')));
  assert.ok(adminDimensions.performance.some(item => item.includes('23111 ms across the last 1 run(s)')));
  const chat = await request('/assistant/chat', { method: 'POST', body: { message: 'Review this deployment', profile: 'critic' }, cookie: viewer.cookie, csrf: viewer.csrfToken });
  assert.equal(chat.status, 200);
  assert.equal(chat.data.scope, 'account');
  assert.ok(chat.data.dimensions.some(item => item.id === 'security' && item.observations.some(text => text.includes('This account has'))));
  assert.ok(!JSON.stringify(chat.data).includes('23111 ms'));
  assert.ok(!JSON.stringify(chat.data).includes(privatePrompt));
  assert.equal((await request('/assistant/critic/reviews', { cookie: owner.cookie })).data.reviews.length, 1);
  assert.equal((await request('/assistant/critic/reviews', { cookie: viewer.cookie })).data.reviews.length, 1);
});

test('skill catalogue GET stays read-only and only explicit Admin POST can sync built-in fields', async () => {
  const { owner, viewer } = await accounts();
  const index = JSON.parse(await readFile(new URL('../../frontend/config/agent-skill-index.json', import.meta.url), 'utf8'));
  const [id, name, domain, family, capability] = index.skills[0];
  await db.query('INSERT INTO agent_skills(id,name,domain,family,capability,objective) VALUES($1,$2,$3,$4,$5,$6)', [id, 'Synthetic override', domain, family, capability, 'Synthetic objective']);
  await db.query('INSERT INTO agent_skills(id,name,domain,family,capability) VALUES($1,$2,$3,$4,$5)', ['synthetic-extra', 'Synthetic extra entry', 'Synthetic', 'test', 'expert']);
  const record = await request('/records', { method: 'POST', cookie: owner.cookie, csrf: owner.csrfToken, body: { id: 'SYNTHETIC-1', name: 'Unchanged shared record' } });
  assert.equal(record.status, 201);
  assert.equal((await request('/agent/skills')).status, 401);
  assert.equal(skillSyncs, 0);

  const list = await request('/agent/skills?limit=1', { cookie: viewer.cookie });
  assert.equal(list.status, 200);
  assert.equal(list.data.total, 2);
  assert.equal(skillSyncs, 0, 'authenticated GET is read-only even when the count differs from the bundled index');
  let stored = (await db.query('SELECT name,objective FROM agent_skills WHERE id=$1', [id])).rows[0];
  assert.equal(stored.name, 'Synthetic override');
  assert.equal(stored.objective, 'Synthetic objective');
  assert.equal((await request('/agent/skills?limit=1', { cookie: viewer.cookie })).status, 200);
  assert.equal(skillSyncs, 0, 'repeated catalogue browsing performs no upsert');
  assert.equal((await db.query('SELECT name FROM agent_skills WHERE id=$1', ['synthetic-extra'])).rows[0].name, 'Synthetic extra entry');
  assert.equal((await request('/agent/skills', { method: 'POST', body: {}, cookie: viewer.cookie })).status, 403);
  assert.equal(skillSyncs, 0, 'Viewer cannot explicitly sync, even without CSRF');
  assert.equal((await request('/agent/skills', { method: 'POST', body: {}, cookie: viewer.cookie, csrf: viewer.csrfToken })).status, 403);
  assert.equal(skillSyncs, 0, 'CSRF does not grant non-Admins permission to sync');
  assert.equal((await request('/agent/skills', { method: 'POST', body: {}, cookie: owner.cookie, csrf: owner.csrfToken })).status, 200);
  assert.equal(skillSyncs, 1, 'only an explicit Admin POST synchronizes the shared index');
  stored = (await db.query('SELECT name,objective FROM agent_skills WHERE id=$1', [id])).rows[0];
  assert.equal(stored.name, name);
  assert.equal(stored.objective, 'Synthetic objective');
  assert.equal((await db.query('SELECT name FROM agent_skills WHERE id=$1', ['synthetic-extra'])).rows[0].name, 'Synthetic extra entry');
  assert.equal((await request('/agent/skills?limit=1', { cookie: viewer.cookie })).status, 200);
  assert.equal(skillSyncs, 1, 'browsing stays read-only after an Admin sync');
  assert.equal((await request('/records/SYNTHETIC-1', { cookie: owner.cookie })).data.record.name, 'Unchanged shared record');
});

test('Viewer self-check requires CSRF and cleans its synthetic audit probe without removing another event', async () => {
  const { owner, viewer } = await accounts();
  const eventId = crypto.randomUUID();
  await db.query('INSERT INTO audit_events(id,user_id,action,detail,ip) VALUES($1,$2,$3,$4,$5)', [eventId, owner.user.id, 'SYNTHETIC_OWNER_EVENT', 'Keep this event', 'test']);
  const body = { only: ['db.roundtrip'] };
  assert.equal((await request('/agent/self-check', { method: 'POST', body, cookie: viewer.cookie })).status, 403);
  assert.equal(probeInserts, 0);
  const check = await request('/agent/self-check', { method: 'POST', body, cookie: viewer.cookie, csrf: viewer.csrfToken });
  assert.equal(check.status, 200);
  assert.equal(check.data.results.length, 1);
  assert.equal(check.data.results[0].id, 'db.roundtrip');
  assert.equal(check.data.results[0].ok, true);
  assert.equal(skillSyncs, 0, 'self-check performs no implicit shared-catalogue synchronization');
  assert.equal(probeInserts, 1); assert.equal(probeDeletes, 1);
  assert.equal(Number((await db.query("SELECT count(*)::int AS n FROM audit_events WHERE action='V133_SELF_CHECK'")).rows[0].n), 0);
  assert.equal((await db.query('SELECT detail FROM audit_events WHERE id=$1', [eventId])).rows[0].detail, 'Keep this event');
  assert.equal((await request('/agent/self-check', { cookie: viewer.cookie })).data.history.length, 1);
  assert.equal((await request('/agent/self-check', { cookie: owner.cookie })).data.history.length, 0);
});
