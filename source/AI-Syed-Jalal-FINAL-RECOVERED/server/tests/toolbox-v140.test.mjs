import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TOOLBOX_TOOLS, planFromToolbox, timeIn, daysBetween, addToDate, convertUnits,
  convertTemperature, hashText, inspectJson, diffLines, summariseCsv, contrastRatio,
  auditCode, detectLanguage, base64
} from '../../frontend/functions/toolbox.mjs';
import { AGENT_TOOLS, runAgent } from '../../frontend/functions/agent-runtime.mjs';
import { PROMPT_LIBRARY, PROMPT_CATEGORIES, searchPrompts, battleToMarkdown } from '../../frontend/functions/prompt-library.mjs';
import { ARENA_FEATURES, featureSummary } from '../../frontend/functions/arena-features.mjs';
import { routePrompt } from '../../frontend/functions/all-in-one.mjs';

const db = { query: async () => [] };
const me = { id: 'user-1', username: 'tester', role: 'Admin' };

test('the toolbox publishes every tool and each one is planned by the runtime', () => {
  // V140 shipped 8; V141 added the page builder. Assert the order and membership
  // rather than a count, so adding a tool never means editing a magic number.
  assert.ok(TOOLBOX_TOOLS.length >= 8);
  assert.ok(AGENT_TOOLS.length >= 12);
  const ids = AGENT_TOOLS.map(tool => tool.id);
  assert.deepEqual(ids.slice(0, 12), ['calculator', 'research', 'records', 'tasks', 'datetime', 'units', 'json', 'hash', 'contrast', 'csv', 'audit', 'diff']);
  assert.ok(ids.includes('pagebuild'), 'V141 web page builder must be published');
  // Every toolbox tool must be reachable from a natural request, or it is dead code.
  const samples = {
    datetime: 'time in Tokyo', units: 'convert 10 km to miles', json: 'json {"a":1}', hash: 'sha256 of hello',
    contrast: 'contrast #ffffff and #000000', csv: 'csv\nname,amount\nA,1', audit: 'audit this\n```html\n<img src=x>\n```',
    diff: 'diff\n```\na\n```\n```\nb\n```'
  };
  for (const [id, prompt] of Object.entries(samples)) {
    assert.ok(planFromToolbox(prompt).some(step => step.tool === id), `${id} was not planned from “${prompt}”`);
  }
});

test('time zones, date maths and unit conversion are correct, not approximated', () => {
  const fixed = new Date('2026-03-01T12:00:00Z');
  assert.match(timeIn('Tokyo', fixed), /GMT\+9/);
  assert.match(timeIn('karachi', fixed), /GMT\+5/);
  assert.throws(() => timeIn('atlantis', fixed), /do not have a time zone/);
  assert.match(daysBetween('2026-01-01', '2026-03-01'), /59 day/);
  assert.match(daysBetween('2026-03-01', '2026-01-01'), /before/);
  assert.match(addToDate('2026-01-31', 1, 'months'), /2026-01-31 \+ 1 months = 2026-02-28/);
  assert.match(addToDate('2026-01-01', 30, 'days'), /2026-01-31/);
  assert.throws(() => daysBetween('31/01/2026', '2026-02-01'), /ISO dates/);
  // 1 inch is exactly 0.0254 m and 1 mile is exactly 1609.344 m.
  assert.equal(convertUnits(1, 'inch', 'mm'), '1 in = 25.4 mm');
  assert.equal(convertUnits(1, 'mile', 'km'), '1 mi = 1.609344 km');
  assert.equal(convertUnits(1, 'gb', 'mib'), '1 gb = 953.674316 mib');
  assert.throws(() => convertUnits(1, 'km', 'kg'), /not defined/);
  assert.equal(convertTemperature(98.6, 'f', 'c'), '98.6°F = 37°C');
});

test('hashes, JSON, diff, CSV and contrast return auditable values', async () => {
  assert.equal(await hashText('sha256', 'hello'), '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  await assert.rejects(() => hashText('md5', 'hello'), /Supported hashes/);
  assert.equal(base64('hello', 'encode'), 'Encoded: aGVsbG8=');

  const json = inspectJson('{"a":1,"b":[2,3]}');
  assert.equal(json.valid, true);
  assert.deepEqual(json.keys, ['a', 'b']);
  assert.throws(() => inspectJson('{"a":'), /Invalid JSON/);

  const diff = diffLines('a\nb', 'a\nc');
  assert.equal(diff.added, 1);
  assert.equal(diff.removed, 1);
  assert.equal(diff.unchanged, 1);
  assert.ok(diff.lines.includes('+ c') && diff.lines.includes('− b'));

  const csv = summariseCsv('name,amount\nA,10\nB,20');
  assert.equal(csv.rows, 2);
  assert.equal(csv.columns[1].numeric, true);
  assert.equal(csv.columns[1].sum, 30);
  assert.equal(csv.columns[0].distinct, 2);

  // #777777 on white is 4.48:1 — just under AA for body text. The verdict must say so.
  const contrast = contrastRatio('#ffffff', '#777777');
  assert.equal(contrast.ratio, 4.48);
  assert.match(contrast.verdict, /large text/);
  assert.match(contrastRatio('#000000', '#ffffff').verdict, /AAA/);
});

test('the code audit finds real defects and states what it cannot see', () => {
  const html = '<!doctype html><html><body><img src="x"><button>Go</button><div onclick="x()">y</div></body></html>';
  const result = auditCode(html, 'html');
  const ids = result.findings.map(finding => finding.id);
  assert.ok(ids.includes('html-lang'));
  assert.ok(ids.includes('img-alt'));
  assert.ok(ids.includes('button-type'));
  assert.ok(ids.includes('inline-handler'));
  assert.equal(result.findings[0].severity, 'high');
  assert.match(result.note, /not a security review/i);

  const js = auditCode("eval(userInput); el.innerHTML = data;", 'javascript');
  const jsIds = js.findings.map(finding => finding.id);
  assert.ok(jsIds.includes('eval') && jsIds.includes('innerhtml'));

  const css = auditCode('a { outline: none; width: 1200px; color: red !important; background: blue !important; border: none !important; }', 'css');
  assert.ok(css.findings.some(finding => finding.id === 'outline-none'));
  assert.ok(css.findings.some(finding => finding.id === 'important'));

  // A clean snippet must not be reported as passing a security review.
  const clean = auditCode('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"></head><body></body></html>', 'html');
  assert.equal(clean.findings.length, 0);
  assert.match(clean.note, /not proof/i);
  assert.equal(detectLanguage('<!doctype html><p>hi</p>'), 'html');
  assert.equal(detectLanguage('const x = () => 1'), 'javascript');
});

test('a real agent run uses the new tools and records their trace', async () => {
  const cases = [
    ['time in Tokyo', 'datetime', /Tokyo \(Asia\/Tokyo\)/],
    ['convert 10 km to miles', 'units', /10 km = 6\.213712 mi/],
    ['sha256 of hello', 'hash', /2cf24dba/],
    ['contrast #ffffff and #777777', 'contrast', /4\.48:1/],
    ['summarise this csv\nname,amount\nA,10\nB,20', 'csv', /sum 30/]
  ];
  for (const [prompt, tool, expected] of cases) {
    const run = await runAgent({ prompt, db, me, env: {} });
    assert.equal(run.ok, true);
    const step = run.steps.find(item => item.tool === tool);
    assert.ok(step, `${tool} did not run for “${prompt}”`);
    assert.equal(step.ok, true, `${tool} failed: ${step.observation}`);
    assert.match(step.observation, expected);
    assert.ok(run.trace.tools.includes(tool));
    // A tool that answered must not also demand a provider.
    assert.equal(run.needsProvider, false, `${tool} wrongly claimed a provider was needed`);
  }
});

test('a failing tool is reported as a failure, never smoothed into an answer', async () => {
  // A broken database must show up as a failed step, not a silent empty list.
  const broken = { query: async () => { throw new Error('database is unreachable'); } };
  const run = await runAgent({ prompt: 'show my open tasks', db: broken, me, env: {} });
  const tasks = run.steps.find(step => step.tool === 'tasks');
  assert.equal(tasks.ok, false);
  assert.match(tasks.observation, /database is unreachable/);
  assert.equal(run.trace.failures, 1);
  assert.match(run.output, /FAILED/);
});

test('the prompt library is searchable offline and every prompt has a checkable property', () => {
  assert.ok(PROMPT_LIBRARY.length >= 12);
  for (const item of PROMPT_LIBRARY) {
    assert.ok(item.tests && item.tests.length > 10, `${item.id} has no checkable property`);
    assert.ok(item.prompt.length > 60, `${item.id} prompt is too thin to separate engines`);
    assert.ok(PROMPT_CATEGORIES.includes(item.category));
    assert.ok(['text', 'code'].includes(item.mode));
  }
  assert.equal(new Set(PROMPT_LIBRARY.map(item => item.id)).size, PROMPT_LIBRARY.length, 'prompt ids must be unique');
  assert.deepEqual(searchPrompts('fabrication').map(item => item.id), ['honesty-test']);
  assert.equal(searchPrompts('', { category: 'Security' }).length, 1);
  assert.equal(searchPrompts('', { mode: 'code' }).length, 2);
  assert.equal(searchPrompts('zzzz').length, 0);
});

test('battle export keeps the evidence a reader needs', () => {
  const markdown = battleToMarkdown({
    prompt: 'build a page', mode: 'code', blind: true, createdAt: '2026-11-04T00:00:00Z',
    judgeWinner: 'b', judgeReason: 'more specific', vote: 'a',
    responses: [
      { side: 'a', engine: 'sj-critic', status: 'ok', score: 71, latencyMs: 12, subscores: { structure: 80 }, content: 'answer a', notes: ['short'] },
      { side: 'b', engine: 'sj-planner', status: 'ok', score: 88, latencyMs: 9, subscores: { structure: 95 }, content: 'answer b', notes: [] }
    ]
  });
  assert.match(markdown, /^# Arena battle/);
  assert.match(markdown, /Judge: b — more specific/);
  assert.match(markdown, /Human vote: a/);
  assert.match(markdown, /Rubric: structure 80/);
  assert.match(markdown, /answer b/);
  assert.match(markdown, /not a human review/);
});

test('the feature map claims only what V140 shipped', () => {
  const summary = featureSummary();
  assert.equal(summary.total, ARENA_FEATURES.length);
  assert.equal(summary.shipped + summary['needs-key'] + summary['not-shipped'], summary.total);
  const byId = Object.fromEntries(ARENA_FEATURES.map(feature => [feature.id, feature]));
  for (const id of ['prompt-library', 'artifact-preview', 'battle-export']) {
    assert.equal(byId[id].state, 'shipped', `${id} should be shipped`);
    assert.ok(byId[id].evidence.length > 10, `${id} needs evidence`);
  }
  // Still absent, and still admitted.
  for (const id of ['image-arena', 'public-leaderboard', 'human-judge']) assert.equal(byId[id].state, 'not-shipped');
  // Nothing may claim image battles exist.
  const image = byId['image-arena'];
  assert.match(image.detail, /Absent on purpose/);
});

test('the all-in-one panel routes tool requests to the agent, from the toolbox itself', () => {
  // Regression: before V140 the panel used a hand-kept keyword list, so
  // "convert 10 km to miles" was answered by the planner with a generic plan
  // instead of the tool that can actually do it.
  const toolPrompts = [
    'convert 10 km to miles',
    'time in Tokyo',
    'sha256 of hello',
    'contrast #ffffff and #777777',
    'days between 2026-01-01 and 2026-03-01'
  ];
  for (const prompt of toolPrompts) {
    const routed = routePrompt(prompt);
    assert.equal(routed[0].id, 'agent', `“${prompt}” routed to ${routed[0].id} instead of the agent`);
    assert.match(routed[0].reason, /tool/i);
  }
  // Prose requests must still reach the specialist frames, not the agent.
  assert.equal(routePrompt('write a short update for my team')[0].id, 'writer');
  assert.equal(routePrompt('plan the launch in two weeks')[0].id, 'planner');
  assert.equal(routePrompt('critique the launch risk')[0].id, 'critic');
});
