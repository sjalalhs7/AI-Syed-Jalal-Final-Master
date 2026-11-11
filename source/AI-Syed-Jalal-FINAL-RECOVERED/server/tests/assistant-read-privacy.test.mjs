import test from 'node:test';
import assert from 'node:assert/strict';
import { localAssistant } from '../../frontend/functions/assistant-core.mjs';
import { assistantRoute } from '../../frontend/functions/assistant-routes.mjs';
import { runAgent } from '../../frontend/functions/agent-runtime.mjs';
import { answerAll, routePrompt } from '../../frontend/functions/all-in-one.mjs';

const me = { id: 'fixture-user', username: 'fixture', role: 'Viewer' };
function database() {
  const queries = [], parameters = [];
  return {
    queries, parameters,
    async query(sql, params = []) {
      queries.push(sql); parameters.push(params);
      if (sql.includes('assistant_tasks')) {
        const rows = [{ title: 'Private open task fixture', status: 'open' }, { title: 'Private done task fixture', status: 'done' }];
        return params[1] ? rows.filter(item => item.status === params[1]) : rows;
      }
      if (sql.includes('assistant_notes')) return [{ content: 'Private note fixture' }];
      if (sql.includes('records')) return [{ name: 'Private record fixture' }];
      return [];
    }
  };
}
async function chat(body) {
  const db = database();
  let forwarded = null, networkCalls = 0;
  const request = new Request('https://app.example/api/assistant/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  const response = await assistantRoute({
    request, url: new URL(request.url), db, me,
    env: { OPENAI_API_KEY: 'fixture-key', FETCH_IMPL: async () => { networkCalls++; throw new Error('unexpected Wikipedia request'); } },
    readBody: req => req.json(), reply: (data, status = 200) => Response.json(data, { status }),
    audit: async () => {}, consumeRateLimit: async () => true,
    onRequest: async ({ request: inner }) => {
      forwarded = await inner.json();
      return Response.json({ ok: true, output: 'Mocked provider answer', provider: forwarded.provider });
    }
  });
  return { status: response.status, data: await response.json(), db, forwarded, networkCalls };
}

test('an exclusion never opens or forwards saved items in any assistant mode', async () => {
  const messages = [
    "Don't show my notes",
    'Show my tasks but not my notes',
    'Never search my records',
    'Do not send my notes to a provider',
    'Without reading my tasks, suggest a plan',
    'Show my tasks except notes',
    'Show my tasks but omit notes',
    'Hide my notes',
    'Keep my notes private',
    'Do not include my to-do list',
    'Do not show my to do',
    'notes mat dikhao',
    'notes chupao',
    'mere tasks nahi dikhao',
    'notes ke baghair plan banao',
    'میرے نوٹس مت دکھائیں'
  ];
  for (const message of messages) {
    const local = localAssistant(message);
    assert.equal(local.readAccessBlocked, true, message);
    assert.equal(local.tool, undefined, message);
    for (const mode of ['local', 'agent', 'research', 'cloud']) {
      const result = await chat({ message, mode, provider: 'openai' });
      assert.equal(result.status, 200, `${mode}: ${message}`);
      assert.equal(result.data.readAccessBlocked, true, `${mode}: ${message}`);
      assert.equal(result.forwarded, null, `${mode}: ${message}`);
      assert.equal(result.networkCalls, 0, `${mode}: ${message}`);
      assert.deepEqual(result.db.queries, [], `${mode}: ${message}`);
    }
    let networkCalls = 0;
    const db = database();
    const env = { FETCH_IMPL: async () => { networkCalls++; throw new Error('unexpected'); } };
    const run = await runAgent({ prompt: message, db, me, env });
    assert.deepEqual(db.queries, [], message);
    assert.equal(networkCalls, 0, message);
    assert.equal(run.readAccessBlocked, true, message);
    assert.deepEqual(run.trace.tools, [], message);
    const panel = await answerAll({ prompt: message, db, me, env, only: ['agent', 'planner'] });
    assert.deepEqual(db.queries, [], message);
    assert.equal(networkCalls, 0, message);
    assert.ok(panel.answers.every(item => /did not read/i.test(item.output)), message);
  }
});

test('general questions about saved items do not implicitly read them or search Wikipedia', async () => {
  for (const message of [
    'What are notes?', 'What are tasks?', 'What are the notes?', 'the notes', 'all tasks',
    'How do I organize my notes?', 'Explain why my tasks are overdue', 'Explain why these tasks are overdue',
    'Explain how to organize saved notes', 'Show me how to manage my records',
    'How do I search and show my notes?', 'Explain how to find and show my tasks',
    'Can you explain how to search and find my records?',
    'Give an example of how to find and show my notes', 'I wonder how to search and find my records'
  ]) {
    assert.equal(localAssistant(message).tool, undefined, message);
    const db = database();
    let networkCalls = 0;
    const run = await runAgent({ prompt: message, db, me, env: { FETCH_IMPL: async () => { networkCalls++; throw new Error('unexpected'); } } });
    assert.equal(db.queries.some(sql => /assistant_tasks|assistant_notes|\bFROM records\b/i.test(sql)), false, message);
    assert.equal(networkCalls, 0, message);
    assert.ok(!run.trace.tools.includes('tasks') && !run.trace.tools.includes('records'), message);
    const cloud = await chat({ message, mode: 'cloud', provider: 'openai' });
    assert.equal(cloud.forwarded?.privacyMode, true, message);
    assert.deepEqual(cloud.db.queries, [], message);
    assert.doesNotMatch(cloud.forwarded.prompt, /Private (?:open task|done task|note|record) fixture/, message);
  }
});

test('compound instructional examples do not become implicit saved-data reads', async () => {
  for (const prompt of [
    'Calculate 6 * 7 and tell me how to find and show my notes',
    'Calculate 6 * 7 and explain why she would find and show my notes',
    'How do I organize my notes and find my records and calculate 6 * 7',
    'Show my tasks and explain why I would find and show my records',
    "I'm learning to find and show my notes"
  ]) {
    const db = database();
    let networkCalls = 0;
    const run = await runAgent({ prompt, db, me, env: { FETCH_IMPL: async () => { networkCalls++; throw new Error('unexpected'); } } });
    assert.equal(db.queries.some(sql => /assistant_tasks|assistant_notes|\bFROM records\b/i.test(sql)), false, prompt);
    assert.equal(networkCalls, 0, prompt);
    assert.ok(!run.trace.tools.includes('tasks') && !run.trace.tools.includes('records'), prompt);
  }
});

test('ordinary use of the words “to do” is not mistaken for a saved to-do list', async () => {
  for (const message of ["I don't know what to do", 'Do not tell me what to do']) {
    const result = await chat({ message, mode: 'cloud', provider: 'openai' });
    assert.equal(result.data.readAccessBlocked, undefined, message);
    assert.equal(result.forwarded?.privacyMode, true, message);
    assert.deepEqual(result.db.queries, [], message);
  }
});

test('explicit read commands request only their named categories and combined reads opt in', async () => {
  for (const [message, tool] of [['show my tasks', 'list_tasks'], ['read my notes', 'list_notes'], ['what are my tasks?', 'list_tasks'], ['what are the saved notes?', 'list_notes'], ['my notes', 'list_notes']]) {
    for (const mode of ['local', 'cloud', 'research']) {
      const result = await chat({ message, mode, provider: 'openai' });
      assert.equal(result.data.tool, tool, `${mode}: ${message}`);
      assert.equal(result.forwarded, null, `${mode}: ${message}`);
      assert.equal(result.networkCalls, 0, `${mode}: ${message}`);
      assert.deepEqual(result.db.queries, [], `${mode}: ${message}`);
    }
  }
  for (const mode of ['local', 'cloud', 'research']) {
    const legacy = await chat({ message: 'show my tasks and notes', mode, provider: 'openai' });
    assert.equal(legacy.data.tool, undefined, mode);
    assert.match(legacy.data.output, /separately|refresh/i, mode);
    assert.equal(legacy.forwarded, null, mode);
    assert.equal(legacy.networkCalls, 0, mode);
    for (const message of ['show my tasks and notes', 'show my tasks and then show my notes', 'show my tasks then show my notes']) {
      const updated = await chat({ message, mode, provider: 'openai', supportsCombinedReads: true });
      assert.equal(updated.data.tool, 'list_tasks_and_notes', `${mode}: ${message}`);
      assert.deepEqual(updated.db.queries, [], `${mode}: ${message}`);
      assert.equal(updated.forwarded, null, `${mode}: ${message}`);
      assert.equal(updated.networkCalls, 0, `${mode}: ${message}`);
    }
  }

  for (const [prompt, tasks, notes] of [
    ['show my tasks', true, false],
    ['show my notes', false, true],
    ['show my tasks and notes', true, true],
    ['show my tasks and then show my notes', true, true],
    ['calculate 6 * 7 and show my tasks', true, false],
    ['what is 6 * 7 and show my notes', false, true],
    ['show my tasks and calculate 6 * 7', true, false]
  ]) {
    const db = database();
    const run = await runAgent({ prompt, db, me, env: {} });
    assert.equal(db.queries.some(sql => sql.includes('assistant_tasks')), tasks, prompt);
    assert.equal(db.queries.some(sql => sql.includes('assistant_notes')), notes, prompt);
    assert.ok(run.trace.tools.includes('tasks'), prompt);
    if (prompt.includes('6 * 7')) {
      assert.ok(run.trace.tools.includes('calculator'), prompt);
      assert.match(run.output, /6 \* 7 = 42/, prompt);
    }
  }
});

test('status-qualified requests read only the requested tasks and older pages are protected', async () => {
  for (const [message, status] of [['show my open tasks', 'open'], ['show only my open tasks', 'open'], ['list my completed tasks', 'done']]) {
    const legacy = await chat({ message, mode: 'local' });
    assert.equal(legacy.data.tool, undefined, message);
    assert.match(legacy.data.output, /refresh|separately/i, message);
    const updated = await chat({ message, mode: 'local', supportsTaskStatusFilter: true });
    assert.equal(updated.data.tool, 'list_tasks', message);
    assert.equal(updated.data.taskStatus, status, message);
    const db = database();
    const run = await runAgent({ prompt: message, db, me, env: {} });
    assert.equal(db.queries.filter(sql => sql.includes('assistant_tasks')).length, 1, message);
    assert.match(db.queries.find(sql => sql.includes('assistant_tasks')), /status\s*=\s*\$2/i, message);
    assert.equal(db.parameters[db.queries.findIndex(sql => sql.includes('assistant_tasks'))][1], status, message);
    assert.match(run.output, status === 'open' ? /Private open task fixture/ : /Private done task fixture/, message);
    assert.doesNotMatch(run.output, status === 'open' ? /Private done task fixture/ : /Private open task fixture/, message);
  }
  for (const message of ['show my open tasks and notes', 'show my notes and open tasks']) {
    const result = await chat({ message, mode: 'local', supportsCombinedReads: true, supportsTaskStatusFilter: true });
    assert.equal(result.data.tool, 'list_tasks_and_notes', message);
    assert.equal(result.data.taskStatus, 'open', message);
    const db = database();
    const run = await runAgent({ prompt: message, db, me, env: {} });
    assert.match(run.output, /Private open task fixture/, message);
    assert.match(run.output, /Private note fixture/, message);
    assert.doesNotMatch(run.output, /Private done task fixture/, message);
  }
});

test('all-in-one routes explicit saved-data reads to the actual tool, not a profile that only says it opened them', async () => {
  for (const [prompt, expected] of [['show tasks', 'assistant_tasks'], ['list notes', 'assistant_notes'], ['search records for Karachi', 'records']]) {
    const db = database();
    const panel = await answerAll({ prompt, db, me, env: { FETCH_IMPL: async () => { throw new Error('unexpected'); } } });
    assert.equal(panel.answers[0].id, 'agent', prompt);
    assert.ok(db.queries.some(sql => sql.includes(expected)), prompt);
  }
  assert.ok(!routePrompt('How do I organize my notes?').some(item => item.id === 'agent'));
  const db = database();
  const onlyPlanner = await answerAll({ prompt: 'show my tasks', db, me, env: {}, only: ['planner'] });
  assert.match(onlyPlanner.answers[0].output, /did not open/i);
  assert.deepEqual(db.queries, []);
});

test('research mode honors an explicit record command without sending it to Wikipedia', async () => {
  const result = await chat({ message: 'show my records', mode: 'research' });
  assert.ok(result.data.trace.tools.includes('records'));
  assert.equal(result.networkCalls, 0);
  assert.equal(result.forwarded, null);
  assert.ok(result.db.queries.some(sql => /FROM records/i.test(sql)));
});

test('explicit research of an instructional question does not read the mentioned saved data', async () => {
  for (const message of ['How do I search and show my notes?', 'I wonder how to search and find my records']) {
    const result = await chat({ message, mode: 'research' });
    // Research mode explicitly sends the question text to Wikipedia, but it
    // must not turn the words describing a read into an actual saved-data read.
    assert.equal(result.networkCalls, 1, message);
    assert.equal(result.db.queries.some(sql => /assistant_tasks|assistant_notes|\bFROM records\b/i.test(sql)), false, message);
    assert.ok(!result.data.trace.tools.includes('tasks') && !result.data.trace.tools.includes('records'), message);
  }
});

test('record searches pass only the specified search term to the database', async () => {
  for (const prompt of ['search records for Karachi', 'show my records matching Karachi', 'find the records named Karachi', 'search records for Karachi and show my tasks']) {
    const db = database();
    const run = await runAgent({ prompt, db, me, env: { FETCH_IMPL: async () => { throw new Error('unexpected'); } } });
    assert.ok(run.trace.tools.includes('records'), prompt);
    const index = db.queries.findIndex(sql => /FROM records/i.test(sql));
    assert.ok(index >= 0, prompt);
    assert.equal(db.parameters[index][0], '%Karachi%', prompt);
  }
});

test('a save proposal may contain a negation without reading or saving its contents', async () => {
  for (const mode of ['local', 'agent', 'research', 'cloud']) {
    const result = await chat({ message: "save note: Don't show my tasks", mode, provider: 'openai' });
    assert.equal(result.data.action?.type, 'create_note', mode);
    assert.equal(result.data.action?.content, "Don't show my tasks", mode);
    assert.equal(result.forwarded, null, mode);
    assert.deepEqual(result.db.queries, [], mode);
  }
});
