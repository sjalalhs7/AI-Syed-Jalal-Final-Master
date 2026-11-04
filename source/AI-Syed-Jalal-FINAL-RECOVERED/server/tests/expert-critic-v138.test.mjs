/**
 * V138 — the Expert Critic must judge, not flatter.
 *
 * These tests exist because a "review" is the easiest thing in software to fake:
 * print a checklist, award 95/100, call it expert. Each test below pins a rule
 * that prevents that — no evidence scores zero, one blocker forbids a ready
 * verdict, findings carry their evidence and fix, and the prose cannot claim more
 * than the findings support.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { builtInChecks } from '../../frontend/functions/self-check-core.mjs';
import { REVIEW_DIMENSIONS, SEVERITIES, finding, runReview, summarizeReview } from '../../frontend/functions/expert-critic.mjs';

const PAGES = ['index.html', 'guide.html', 'jalalai.html', 'jarvis.html', 'agent.html', 'arena.html', 'agent-lab.html', 'workspace.html', 'dashboard.html', 'critic.html', 'refactor-plan.html']
  .map(file => ({ file, exists: true, closesHtml: true }));

/** A database double where every table query returns a supplied count. */
function fakeDb(counts = {}, rows = {}) {
  const queries = [];
  return {
    queries,
    query: async (sql, params = []) => {
      queries.push(sql.replace(/\s+/g, ' ').trim());
      for (const [table, value] of Object.entries(rows)) {
        if (sql.includes(`FROM ${table}`)) return Array.isArray(value) ? value : [{ n: value }];
      }
      for (const [table, value] of Object.entries(counts)) {
        if (sql.includes(`FROM ${table}`)) return [{ n: value }];
      }
      if (sql.includes('information_schema')) return [{ n: 0 }];
      return [];
    }
  };
}

const me = { id: '11111111-1111-4111-8111-111111111111' };

test('a review with no evidence scores zero on those dimensions instead of assuming the best', async () => {
  const review = await runReview({ db: fakeDb({}), me, env: {}, pages: PAGES, runtime: {} });
  assert.equal(review.mode, 'critic');
  assert.equal(review.simulated, false);
  const security = review.dimensions.find(item => item.id === 'security');
  const reliability = review.dimensions.find(item => item.id === 'reliability');
  assert.equal(security.score, 0, 'no audit events and no rate-limit evidence must not score as a pass');
  assert.equal(reliability.score, 0, 'no stored runs must not score as a pass');
  assert.equal(review.verdict, 'not-ready');
  assert.ok(review.findings.some(item => item.title === 'No audit events recorded'));
  assert.ok(review.findings.some(item => item.title === 'No agent run evidence'));
});

test('one blocker forbids a ready verdict however good the average is', async () => {
  // Everything looks healthy…
  const healthy = fakeDb({ audit_events: 120, sessions: 4, auth_rate_limits: 6, agent_runs: 30, ai_runs: 10, agent_self_checks: 5, arena_battles: 12, arena_responses: 40 }, {
    agent_runs: [{ n: 30, duration_ms: 900 }],
    'agent_runs ORDER BY created_at': [{ duration_ms: 900 }, { duration_ms: 1200 }],
    "agent_runs WHERE failures > 0": 3,
    'agent_runs r LEFT JOIN': 0,
    'agent_runs WHERE user_id': 30,
    "arena_responses WHERE status <> 'ok' AND score > 0": 0
  });
  const good = await runReview({ db: healthy, me, env: {}, pages: PAGES, runtime: { toolTimeoutMs: 9000, csrfEnforced: true } });
  // …except one control that would be a blocker.
  const broken = await runReview({ db: healthy, me, env: {}, pages: PAGES, runtime: { toolTimeoutMs: 9000, csrfEnforced: false } });
  assert.equal(broken.verdict, 'not-ready');
  assert.ok(broken.counts.blocker >= 1);
  assert.ok(broken.findings.some(item => item.title === 'CSRF guard is not enforced'));
  assert.notEqual(broken.verdict, 'ready');
  assert.ok(good.score >= broken.score, 'a blocker must never raise the score');
});

test('a non-answer scored above zero is a blocker, not a rounding error', async () => {
  const db = fakeDb({ audit_events: 10, agent_runs: 5, agent_self_checks: 2, arena_battles: 3 }, {
    'agent_runs ORDER BY created_at': [{ duration_ms: 800 }],
    'agent_runs r LEFT JOIN': 0,
    'arena_responses WHERE status <> \'ok\' AND score > 0': 2
  });
  const review = await runReview({ db, me, env: {}, pages: PAGES, runtime: { toolTimeoutMs: 9000 } });
  const item = review.findings.find(entry => entry.title === 'A non-answer received credit');
  assert.ok(item, 'scoring a non-answer must be reported');
  assert.equal(item.severity, 'blocker');
  assert.equal(review.verdict, 'not-ready');
});

test('every finding carries its evidence, its fix and a known severity', async () => {
  const review = await runReview({ db: fakeDb({}), me, env: {}, pages: PAGES, runtime: {} });
  assert.ok(review.findings.length >= 4);
  for (const item of review.findings) {
    assert.ok(SEVERITIES.includes(item.severity), `unknown severity ${item.severity}`);
    assert.ok(REVIEW_DIMENSIONS.some(dimension => dimension.id === item.dimension), `unknown dimension ${item.dimension}`);
    assert.ok(item.evidence.length > 10, 'a finding without evidence is an opinion');
    assert.ok(item.fix.length > 10, 'a finding without a fix is a complaint');
  }
  // The dimension scores must be reproducible from the same evidence.
  assert.equal(review.dimensions.length, REVIEW_DIMENSIONS.length);
  assert.equal(review.dimensions.reduce((sum, item) => sum + item.weight, 0), 100);
});

test('the generated prose cannot claim more than the findings support', async () => {
  const empty = await runReview({ db: fakeDb({}), me, env: {}, pages: PAGES, runtime: {} });
  assert.match(empty.generated.summary, /not ready/i);
  assert.doesNotMatch(empty.generated.summary, /certified|guaranteed|100% secure/i);
  assert.match(summarizeReview(empty), /Open findings:/);
  // A missing page is a real finding, not silently absorbed.
  const partial = await runReview({ db: fakeDb({}), me, env: {}, pages: PAGES.filter(page => page.file !== 'jarvis.html'), runtime: {} });
  assert.ok(partial.findings.some(item => /voice surface is missing/i.test(item.title)));
  // The statically-known refactor page must be graded as current, not stale.
  assert.ok(!partial.findings.some(item => /describes the pre-merge state/i.test(item.title)));
});

test('the review is reachable from chat, both routes and the self-check', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const root = resolve(import.meta.dirname, '../..');
  const routes = await readFile(resolve(root, 'frontend/functions/assistant-routes.mjs'), 'utf8');
  assert.match(routes, /\/api\/assistant\/critic\/review/);
  assert.match(routes, /\/api\/assistant\/critic\/reviews/);
  // The critic profile answers with findings instead of the generic template.
  assert.match(routes, /profile === 'critic'/);
  assert.match(routes, /critique\(/);
  // The evidence table is registered where readiness is computed.
  const api = await readFile(resolve(root, 'frontend/functions/api/[[path]].js'), 'utf8');
  assert.match(api, /expert_reviews/);
  assert.match(api, /n>=21/);
  const checks = builtInChecks();
  assert.ok(checks.find(check => check.id === 'agent.tool-runtime'));
});

test('findings are validated, so a malformed one cannot reach the UI', () => {
  assert.throws(() => finding({ dimension: 'made-up', severity: 'blocker', title: 'x', evidence: 'x', fix: 'x' }), /Unknown review dimension/);
  assert.throws(() => finding({ dimension: 'security', severity: 'panic', title: 'x', evidence: 'x', fix: 'x' }), /Unknown severity/);
  const ok = finding({ dimension: 'security', severity: 'minor', title: 't', evidence: 'e'.repeat(5000), fix: 'f' });
  assert.ok(ok.evidence.length <= 600, 'long evidence must be truncated, not dropped into the page raw');
});
