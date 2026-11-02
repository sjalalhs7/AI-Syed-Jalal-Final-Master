import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, localAssistant } from '../../frontend/functions/assistant-core.mjs';

test('calculator respects precedence, parentheses, percentages and unary signs', () => {
  assert.equal(calculate('2+3*4'), '2+3*4 = 14');
  assert.equal(calculate('(1200 + 350) * 15%'), '(1200 + 350) * 15% = 232.5');
  assert.equal(calculate('-2*(3+4)'), '-2*(3+4) = -14');
});
test('calculator rejects code, malformed input and non-finite results', () => {
  for (const input of ['globalThis.alert(1)', '2**999999', '1/0', '(2+3', '2..3', '2 3', '']) assert.throws(() => calculate(input));
});
test('local tools propose writes but never claim to save them', () => {
  const task = localAssistant('add task: Review proposal');
  assert.deepEqual(task.action, { type: 'create_task', title: 'Review proposal' });
  assert.match(task.output, /nothing has been saved/);
  assert.equal(localAssistant('save note: Private thought').action.type, 'create_note');
});
test('expert profiles are explicitly structured guidance, not fake cloud responses', () => {
  for (const profile of ['planner', 'critic', 'coding']) {
    const result = localAssistant('Review this launch', profile);
    assert.equal(result.mode, 'local'); assert.equal(result.simulated, false); assert.ok(result.output.length > 100);
  }
  assert.equal(localAssistant('Tell me a story').needsProvider, true);
});
test('clock uses Pakistan timezone', () => {
  assert.match(localAssistant('What is the current time?', 'general', new Date('2026-11-02T00:00:00Z')).output, /Pakistan time:.*5:00:00/);
});
