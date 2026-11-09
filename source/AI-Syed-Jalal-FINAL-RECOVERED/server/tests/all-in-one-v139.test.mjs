/**
 * V139 — all-in-one panel and Arena feature parity.
 *
 * The risk in an "all-in-one" surface is that it becomes a single opaque box that
 * always answers something. These tests pin the opposite: routing is
 * deterministic and explainable, every specialist is real, a failure is reported
 * as a failure, and the Arena page can never advertise a feature that is not
 * shipped.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SPECIALISTS, answerAll, routePrompt, specialistCatalogue } from '../../frontend/functions/all-in-one.mjs';
import { ARENA_FEATURES, FEATURE_STATES, featureSummary, ARENA_POSITIONING } from '../../frontend/functions/arena-features.mjs';
import { localAssistant, PROFILE_IDS } from '../../frontend/functions/assistant-core.mjs';

const root = resolve(import.meta.dirname, '../..');
const read = file => readFile(resolve(root, file), 'utf8');
const db = { query: async () => [] };
const me = { id: '11111111-1111-4111-8111-111111111111' };

test('every published specialist is real and can answer', () => {
  assert.equal(SPECIALISTS.length, 8);
  assert.deepEqual(specialistCatalogue().map(item => item.id).sort(), SPECIALISTS.map(item => item.id).sort());
  // Each profile specialist must map to a real assistant profile.
  for (const item of SPECIALISTS.filter(entry => entry.kind === 'profile')) {
    const catalogue = specialistCatalogue().find(entry => entry.id === item.id);
    assert.ok(PROFILE_IDS.includes(catalogue.profile), `${item.id} maps to an unknown profile`);
  }
  // A published specialist may not be a label for nothing.
  const outputs = new Set(SPECIALISTS.filter(item => item.kind === 'profile').map(item => localAssistant('Design the release', specialistCatalogue().find(entry => entry.id === item.id).profile).output));
  assert.ok(outputs.size >= 6, 'different specialists must give genuinely different answers');
});

test('routing explains itself and is bounded', () => {
  const tool = routePrompt('calculate (1200 + 350) * 15% and show my tasks');
  assert.equal(tool[0].id, 'agent');
  assert.match(tool[0].reason, /real tool/);

  const critique = routePrompt('critique the launch risk of this release');
  assert.equal(critique[0].id, 'critic');

  const review = routePrompt('review the security of my login flow');
  assert.ok(review.some(item => item.id === 'reviewer'));

  // Direct instructions beat keyword guesses.
  const architect = routePrompt('architect the schema and the migration');
  assert.ok(architect.some(item => item.id === 'architect'));

  // Always bounded, always explained, never empty.
  for (const prompt of ['hello', 'write a poem', 'compare two databases and plan the migration']) {
    const routed = routePrompt(prompt);
    assert.ok(routed.length >= 1 && routed.length <= 3, `routing for "${prompt}" is not bounded`);
    for (const item of routed) {
      assert.ok(SPECIALISTS.some(entry => entry.id === item.id), `routed to an unknown specialist: ${item.id}`);
      assert.ok(item.reason.length > 10, 'a route without a reason is a guess');
    }
  }
});

test('the panel answers, labels and never fabricates', async () => {
  const panel = await answerAll({ prompt: 'calculate (1200 + 350) * 15% * 3 and critique the launch risk', db, me, env: {} });
  assert.equal(panel.mode, 'all-in-one');
  assert.equal(panel.simulated, false);
  assert.ok(panel.answers.length >= 2);
  // The tool answer must contain the real arithmetic.
  const agent = panel.answers.find(item => item.id === 'agent');
  assert.ok(agent, 'the tool specialist must run for an arithmetic prompt');
  assert.match(agent.output, /697\.5/);
  assert.ok(agent.trace, 'a tool answer without a trace is a claim');
  // Every answer must come from its own frame, not a repeated copy.
  const tasks = panel.answers.find(item => item.id === 'tasks');
  for (const other of panel.answers.filter(item => item.id !== 'agent')) {
    assert.notEqual(other.output, agent.output, `${other.id} repeated the agent output`);
  }
  // Limits travel with the payload so the UI cannot oversell it.
  assert.ok(panel.limits.some(line => /no external model was called/i.test(line)));
  assert.match(panel.limits.join(" "), /server-side key|no external model was called/i);
});

test('a failing specialist is reported as failed, never replaced by filler', async () => {
  // A database double that throws: the tool specialist must fail honestly.
  const brokenDb = { query: async () => { throw new Error('private database connection detail'); } };
  const panel = await answerAll({ prompt: 'show my tasks', db: brokenDb, me, env: {} });
  const agent = panel.answers.find(item => item.id === 'agent');
  // The runtime isolates the failure: the step is recorded as FAILED in the
  // trace, the run still returns, and the panel never claims it succeeded.
  assert.equal(agent.ok, true);
  assert.equal(agent.trace.failures, 1);
  assert.match(agent.output, /FAILED/);
  assert.match(agent.output, /Account data could not be read/);
  assert.doesNotMatch(agent.output, /private database connection detail/);
  assert.equal(panel.needsProvider, true, 'a run whose only step failed must say it needs a model');
  assert.ok(!panel.answers.some(item => /No tasks saved yet/.test(item.output || '')), 'a failed read must not look like an empty list');
});

test('an explicit choice overrides routing but stays bounded', async () => {
  const panel = await answerAll({ prompt: 'calculate 2+2', db, me, env: {}, only: ['writer', 'planner'] });
  assert.deepEqual(panel.answers.map(item => item.id), ['writer', 'planner']);
  assert.ok(panel.answers.every(item => /chose this specialist/i.test(item.reason)));
  await assert.rejects(() => answerAll({ prompt: '', db, me, env: {} }), /Enter a prompt first/);
  await assert.rejects(() => answerAll({ prompt: 'x'.repeat(4001), db, me, env: {} }), /under 4,000/);
});

test('the calculator accepts a sentence instead of throwing', () => {
  // Regression: "calculate 40*12 and show my tasks" used to throw, which broke
  // both the local assistant and the tool agent for the same prompt.
  const answer = localAssistant('calculate 40*12 and show my tasks');
  assert.match(answer.output, /40\*12 = 480/);
  assert.match(answer.output, /rest of the request was not evaluated/);
  assert.match(localAssistant('calculate (1200 + 350) * 15% * 3').output, /= 697\.5$/);
});

test('the Arena feature map cannot advertise what is not shipped', async () => {
  assert.ok(ARENA_FEATURES.length >= 10);
  for (const feature of ARENA_FEATURES) {
    assert.ok(FEATURE_STATES.includes(feature.state), `unknown state ${feature.state}`);
    assert.ok(feature.evidence.length > 5, `${feature.id} has no evidence`);
    // Nothing may be "shipped" without naming where it is proven.
    if (feature.state === 'shipped') assert.match(feature.evidence, /test|arena\.mjs|arena-routes|API|=|\./i);
  }
  const summary = featureSummary();
  assert.equal(summary.total, ARENA_FEATURES.length);
  assert.equal(summary.shipped + summary['needs-key'] + summary['not-shipped'], summary.total);
  // Image battles and a public leaderboard are genuinely absent; claiming them
  // would be the single most misleading thing this page could do.
  assert.equal(ARENA_FEATURES.find(item => item.id === 'image-arena').state, 'not-shipped');
  assert.equal(ARENA_FEATURES.find(item => item.id === 'public-leaderboard').state, 'not-shipped');
  assert.ok(ARENA_POSITIONING.some(line => /not a copy of another company/i.test(line)));
});

test('the page, the route and the tests all read the same modules', async () => {
  const routes = await read('frontend/functions/assistant-routes.mjs');
  assert.match(routes, /\/api\/assistant\/all\/answer/);
  assert.match(routes, /\/api\/assistant\/all\/route/);
  assert.match(routes, /\/api\/assistant\/all\/specialists/);
  const arenaRoutes = await read('frontend/functions/arena-routes.mjs');
  assert.match(arenaRoutes, /\/api\/arena\/features/);
  const page = await read('frontend/allinone.html');
  assert.match(page, /id="askBtn"/);
  assert.match(page, /It is not/);
  const arenaPage = await read('frontend/arena.html');
  assert.match(arenaPage, /id="features"/);
  // The three new profiles must be selectable where people actually chat.
  for (const file of ['frontend/jalalai.html', 'frontend/jarvis.html']) {
    const html = await read(file);
    for (const profile of ['architect', 'reviewer', 'writer']) assert.ok(html.includes(`value="${profile}"`), `${file} is missing the ${profile} profile`);
  }
});

test('the panel identifies unsaved proposals and publishes the current tool count', async () => {
  const { AGENT_TOOLS } = await import('../../frontend/functions/agent-runtime.mjs');
  for (const only of [['agent'], ['planner']]) {
    const panel = await answerAll({ prompt: 'add task: private draft', db, me, env: {}, only });
    assert.equal(panel.answers[0].action.type, 'create_task');
    assert.match(panel.limits.join(' '), new RegExp(`${AGENT_TOOLS.length} tools are published`));
  }
});
