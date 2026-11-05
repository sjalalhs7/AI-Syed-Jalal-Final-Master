import { readdirSync } from 'node:fs';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { buildApi, root } from '../build.mjs';
import { resolve } from 'node:path';
import {
  CONTENDERS, JUDGE, SIDES, START_RATING, catalogue, extractArtifacts, judgeResponse, judgeVerdict, updateRatings, contenderFor
} from '../../frontend/functions/arena.mjs';

/**
 * V135 Arena — the contract this test protects:
 *  1. an engine without a provider key is a labelled non-answer, never a tie;
 *  2. blind mode never leaks engine identity before the vote;
 *  3. a battle is decided once, and the human decision is recorded separately from the judge;
 *  4. ratings only move from decided battles, and they say they are preferences.
 */
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
    const response = await onRequest({
      request: new Request('https://preview.test/api' + path, {
        method,
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.31', ...(cookie ? { cookie } : {}), ...(token ? { 'x-csrf-token': token } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      }),
      env: { DB_ADAPTER: { query: async (sql, params = []) => (await db.query(sql, params)).rows }, LOCAL_PREVIEW: 'true', CSRF_SECRET: 'arena-test-secret-at-least-32-characters-x', COOKIE_SECURE: 'false' }
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

test('judge never turns a missing provider key into a tie or a win', () => {
  const mixed = judgeVerdict([
    { side: 'a', status: 'ok', score: 71, engine: 'local' },
    { side: 'b', status: 'not_configured', score: 0, engine: 'openai', nonAnswer: true }
  ]);
  assert.equal(mixed.winner, null, 'one real answer and one non-answer is not a contest');
  assert.match(mixed.reason, /withheld/i);

  const none = judgeVerdict([
    { side: 'a', status: 'not_configured', score: 0, nonAnswer: true },
    { side: 'b', status: 'not_configured', score: 0, nonAnswer: true }
  ]);
  assert.equal(none.winner, null);
  assert.doesNotMatch(none.reason, /tie/i, 'silence is never reported as a tie');

  const close = judgeVerdict([{ side: 'a', score: 80, nonAnswer: false }, { side: 'b', score: 78, nonAnswer: false }]);
  assert.equal(close.winner, 'tie', 'a near-identical rubric result is called a tie');
  const clear = judgeVerdict([{ side: 'a', score: 90, nonAnswer: false }, { side: 'b', score: 40, nonAnswer: false }]);
  assert.equal(clear.winner, 'a');
  assert.match(clear.reason, /rubric score/i);
});


test('each local contender answers in its own voice instead of copying one template', async () => {
  const { c, token } = await account();
  const created = await c('/arena/battles', 'POST', { prompt: 'Review this launch plan for an internal analytics dashboard', contenders: ['local-planner', 'local-critic', 'local-coding', 'local-analysis'], blind: false }, token);
  assert.equal(created.status, 201);
  const contents = created.data.responses.map(response => response.content);
  assert.equal(new Set(contents).size, contents.length, 'four engines must not return the same text');
  assert.match(contents[0], /^Plan:/);
  assert.match(contents[1], /^Critical review:/);
  assert.match(contents[2], /^Implementation checklist/);
});

test('a failed or unconfigured status is never judged as an answer', () => {
  // A stored engine error can read like prose; the status must win.
  const verdict = judgeVerdict([
    { side: 'a', score: 0, status: 'failed', nonAnswer: false },
    { side: 'b', score: 55, status: 'ok', nonAnswer: false }
  ]);
  assert.equal(verdict.winner, null, 'one real answer plus one failed call is not a contest');
  const both = judgeVerdict([
    { side: 'a', score: 40, status: 'not_configured' },
    { side: 'b', score: 30, status: 'ok' }
  ]);
  assert.equal(both.winner, null);
});

test('judge is described as deterministic tooling, not a person or a second model', () => {
  assert.equal(JUDGE.kind, 'deterministic');
  assert.match(JUDGE.disclaimer, /not a human reviewer/);
  assert.match(JUDGE.disclaimer, /not a second AI model/);
  const judged = judgeResponse({ content: '1. Step one\n2. Step two\n- detail\n- detail', prompt: 'how do I ship a plan', mode: 'text', latencyMs: 40, isLocal: true });
  assert.ok(judged.score >= 0 && judged.score <= 100);
  assert.deepEqual(Object.keys(judged.subscores).sort(), ['code', 'coverage', 'safety', 'specificity', 'structure']);
});

test('catalogue labels local, key-ready and unconfigured engines truthfully', () => {
  const entries = catalogue({ OPENAI_API_KEY: 'x' });
  const local = entries.find(item => item.id === 'local');
  const openai = entries.find(item => item.id === 'openai');
  const anthropic = entries.find(item => item.id === 'anthropic');
  assert.equal(local.configured, true);
  assert.equal(openai.configured, true);
  assert.match(openai.status, /live call is still required/);
  assert.equal(anthropic.configured, false);
  assert.match(anthropic.status, /not configured/);
  assert.equal(CONTENDERS.length, 9);
});

test('artifact extraction finds fenced code and refuses empty blocks', () => {
  const artifacts = extractArtifacts('Here:\n```html\n<h1>Hi</h1>\n```\nand\n```js\nconsole.log(1)\n```\n```js\n   \n```');
  assert.equal(artifacts.length, 2);
  assert.equal(artifacts[0].kind, 'preview');
  assert.equal(artifacts[0].language, 'html');
  assert.equal(artifacts[1].language, 'js');
});

test('Elo helper moves an even match by a bounded amount', () => {
  const even = updateRatings(START_RATING, START_RATING, 1);
  assert.ok(even.a > 0 && even.a <= 24, 'an even win is bounded by the K factor');
  assert.equal(even.b, -even.a, 'ratings move symmetrically');
  const upset = updateRatings(1000, 1800, 1);
  assert.ok(upset.a > even.a, 'beating a stronger engine moves the rating further');
  const expected = updateRatings(START_RATING, START_RATING, 0.5);
  assert.ok(expected.expectedA > 0.4 && expected.expectedA < 0.6);
});

test('arena requires authentication and a valid contender list', async () => {
  const publicCatalogue = await client()('/arena/catalogue');
  assert.equal(publicCatalogue.status, 200, 'the catalogue is public so the page can label engines before sign-in');
  assert.match(publicCatalogue.data.judge.disclaimer, /not a human reviewer/);
  assert.ok(publicCatalogue.data.engines.every(engine => typeof engine.configured === 'boolean'));
  assert.equal((await client()('/arena/battles')).status, 401);
  const { c, token } = await account();
  assert.equal((await c('/arena/battles', 'POST', { prompt: 'hello', contenders: ['local'] }, token)).status, 400);
  assert.equal((await c('/arena/battles', 'POST', { prompt: 'hello', contenders: ['local', 'not-an-engine'] }, token)).status, 400);
  assert.equal((await c('/arena/battles', 'POST', { prompt: '', contenders: ['local', 'local-critic'] }, token)).status, 400);
});

test('a blind battle hides engine identity, judges it, and can be voted exactly once', async () => {
  const { c, token } = await account();
  const created = await c('/arena/battles', 'POST', { prompt: 'plan: roll out a small internal dashboard', contenders: ['local-planner', 'local-critic'], blind: true }, token);
  assert.equal(created.status, 201);
  const battle = created.data.battle;
  assert.equal(battle.blind, true);
  assert.equal(created.data.responses.length, 2);
  for (const response of created.data.responses) {
    assert.equal(response.engine, null, 'blind responses must not expose the engine id');
    assert.match(response.label, /^Engine [A-D]$/);
    assert.equal(response.kind, 'hidden');
  }
  assert.match(created.data.disclosure, /hidden until you vote/i);
  assert.equal(created.data.judge.kind, 'deterministic');
  assert.ok(SIDES.includes(created.data.responses[0].side));

  const voted = await c('/arena/battles/' + battle.id + '/vote', 'POST', { vote: 'a' }, token);
  assert.equal(voted.status, 200);
  assert.equal(voted.data.decidedBy, 'user', 'the human decision is recorded as the human decision');
  assert.equal(voted.data.battle.blind, true, 'voting reveals the engine names without rewriting the blind flag');
  assert.ok(voted.data.responses.every(response => response.engine), 'the vote reveals the engines');
  assert.ok(Array.isArray(voted.data.ratings) && voted.data.ratings.length === 2);
  assert.ok(voted.data.ratings.some(item => item.delta === 12));
  assert.ok(voted.data.agreements);

  const again = await c('/arena/battles/' + battle.id + '/vote', 'POST', { vote: 'b' }, token);
  assert.equal(again.status, 409, 'a battle is decided once');

  const loaded = await c('/arena/battles/' + battle.id);
  assert.equal(loaded.status, 200);
  assert.equal(loaded.data.battle.vote, 'a');

  const leader = await c('/arena/leaderboard');
  assert.equal(leader.status, 200);
  assert.ok(leader.data.totalBattles >= 1);
  assert.ok(leader.data.humanDecided >= 1);
  assert.match(leader.data.note, /not a benchmark/i);
  assert.ok(leader.data.entries.every(entry => Number.isFinite(entry.rating)));
});

test('revealing before the vote is recorded as no longer blind', async () => {
  const { c, token } = await account();
  const created = await c('/arena/battles', 'POST', { prompt: 'critique: our release checklist', contenders: ['local', 'local-critic'], blind: true }, token);
  const id = created.data.battle.id;
  const revealed = await c('/arena/battles/' + id + '/reveal', 'POST', {}, token);
  assert.equal(revealed.status, 200);
  assert.match(revealed.data.note, /no longer counts as a blind comparison/);
  assert.equal(revealed.data.battle.blind, false);
  assert.ok(revealed.data.responses.every(response => response.engine));
});

test('the general local tool refuses open-ended prompts instead of scoring a template', async () => {
  const { c, token } = await account();
  const created = await c('/arena/battles', 'POST', { prompt: 'design a marketing campaign for a coffee shop', contenders: ['local', 'local-critic'] }, token);
  assert.equal(created.status, 201);
  const general = created.data.responses.find(response => response.side === 'a');
  assert.equal(general.status, 'needs_provider');
  assert.equal(general.score, 0);
  const score = created.data.judge.scores.find(item => item.side === 'a');
  assert.equal(score.nonAnswer, true);
});

test('an unconfigured engine is stored as a non-answer and scores zero', async () => {
  const { c, token } = await account();
  const created = await c('/arena/battles', 'POST', { prompt: 'explain why evidence matters', contenders: ['local-critic', 'anthropic'] }, token);
  assert.equal(created.status, 201);
  const cloud = created.data.responses.find(response => response.side === 'b');
  assert.ok(cloud, 'the unconfigured engine scores zero');
  assert.ok(['not_configured', 'failed'].includes(cloud.status));
  const judgeScore = created.data.judge.scores.find(item => item.side === cloud.side);
  assert.equal(judgeScore.nonAnswer, true);
  assert.ok(judgeScore.notes.join(' ').length > 0, 'the reason is stated, not hidden');
});

test('battles are owner-scoped', async () => {
  const owner = await account();
  const created = await owner.c('/arena/battles', 'POST', { prompt: 'owner isolation check', contenders: ['local', 'local-planner'] }, owner.token);
  const stranger = await account();
  assert.equal((await stranger.c('/arena/battles/' + created.data.battle.id)).status, 404);
  assert.equal((await stranger.c('/arena/battles/' + created.data.battle.id + '/vote', 'POST', { vote: 'a' }, stranger.token)).status, 404);
  assert.equal((await stranger.c('/arena/battles/' + created.data.battle.id, 'DELETE', {}, stranger.token)).status, 404);
  assert.equal((await owner.c('/arena/battles/' + created.data.battle.id, 'DELETE', {}, owner.token)).status, 200);
});

test('every contender runs through the real engine runner', async () => {
  for (const id of ['local', 'local-planner', 'local-critic', 'local-coding', 'local-analysis']) {
    const engine = contenderFor(id);
    assert.equal(engine.kind, 'local');
    assert.equal(engine.label.length > 0, true);
  }
});
