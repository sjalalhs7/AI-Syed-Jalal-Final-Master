/**
 * V136 — Agent runtime: real, bounded, observable tool use.
 *
 * This is the module that makes the "agent" claim testable. It does not pretend
 * to think; it *plans a fixed sequence, calls real tools, and reports what each
 * call returned*. Everything the agent says it did is in the trace.
 *
 * Rules:
 *  - Only the four tools listed here exist. No shell, no filesystem, no eval,
 *    no network address other than the Wikipedia endpoint and this app's own
 *    recipe/calculation code.
 *  - Every step records `ok`, `ms` and an observation, so a failed step is
 *    visible instead of being smoothed over.
 *  - The agent never claims an action it did not perform. If a tool fails, the
 *    answer says the tool failed.
 */

import { calculate, localAssistant, proposedAssistantAction, isClockQuestion } from './assistant-core.mjs';
import { extractArithmetic, isArithmeticRequest } from './spoken-arithmetic.mjs';
import { searchWikipedia } from './wikipedia-adapter.mjs';
import { TOOLBOX_TOOLS, planFromToolbox } from './toolbox.mjs';

export const AGENT_TOOLS = [
  { id: 'calculator', label: 'Calculator', kind: 'local', detail: 'Deterministic arithmetic with parentheses and percentages.' },
  { id: 'research', label: 'Wikipedia research', kind: 'network', detail: 'Live search against the Wikipedia API; returns titles, snippets and links with attribution.' },
  { id: 'records', label: 'Workspace records', kind: 'database', detail: 'Read-only search of the records you are allowed to see.' },
  { id: 'tasks', label: 'Tasks and notes', kind: 'database', detail: 'Read your saved tasks and notes. Writes always need explicit confirmation.' },
  // V140: eight deterministic tools that replace a browser tab each. Same rules:
  // local, bounded, reproducible from the input alone, no filesystem or shell.
  ...TOOLBOX_TOOLS.map(tool => ({ ...tool }))
];

const RESEARCH_HINT = /^(?:research|look up|search the web|find out about|what is|who is|tell me about|explain)\b/i;
const RECORD_HINT = /\b(records?|workspace|customers?|entries|database)\b/i;
const TASK_HINT = /\b(tasks?|notes?|to-?do)\b/i;
// A lookup wants a specific fact ("who is Ada Lovelace"). Anything broader —
// "explain the philosophy of mind" — needs a model, not a search result.
const LOOKUP_HINT = /^(?:research|look up|search the web|find out about|who is|who was|when (?:was|did|is)|where is|what year|how old is)\b/i;

function step(id, title, tool, run) {
  return { id, title, tool, run };
}

function truncate(value, max = 220) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

/** Chooses a bounded plan from the prompt. Never invents a step it cannot run. */
export function planFor(prompt, profile = 'general') {
  const text = String(prompt || '').trim();
  const lower = text.toLowerCase();
  const steps = [];
  // Exact task/note requests are always proposals, never implicit writes. This
  // must run before keyword routing: a note can itself contain 'show my tasks'.
  const action = proposedAssistantAction(text);
  if (action) return [step('prepare-action', 'Prepare a save for your confirmation', 'none', async () => ({
    observation: localAssistant(text, profile).output, action, data: null, noTool: true
  }))];
  const researchQuery = text.replace(/^(?:research|look up|search the web(?: for)?|find out about|tell me about|what is|who is|explain)\s*:?\s*/i, '').trim();

  // "What is the time in New York?" is a clock question, not an encyclopedia
  // lookup. Without this exclusion the research step fires first, and if the
  // Wikipedia request fails the user gets a network error instead of the time.
  const clockQuestion = isClockQuestion(text);
  const wantsMath = isArithmeticRequest(text);
  const wantsResearch = !wantsMath && !clockQuestion && (RESEARCH_HINT.test(text) || (/\b(?:facts?|sources?|references?|evidence|history of)\b/i.test(lower) && /\w{4,}/.test(lower)));
  const wantsRecords = RECORD_HINT.test(lower) && /\b(search|find|list|show|which)\b/i.test(lower);
  const wantsTasks = TASK_HINT.test(lower) && /\b(list|show|my|open|pending)\b/i.test(lower);
  const includeTasks = /\b(?:tasks?|to-?do)\b/i.test(text);
  const includeNotes = /\bnotes?\b/i.test(text);

  if (wantsMath) steps.push(step('calculate', 'Evaluate the expression deterministically', 'calculator', async () => {
    const parsed = extractArithmetic(text);
    if (!parsed) return { observation: 'I could not understand that arithmetic. Try “calculate six times seven” or use numbers and symbols.', data: null, noTool: true };
    const answer = calculate(parsed.expression);
    return { observation: parsed.remainder ? `${answer}\nOnly the arithmetic portion was calculated; see other steps for any remaining requests.` : answer, data: null };
  }));

  if (wantsResearch && researchQuery.length >= 2) {
    steps.push(step('research', `Search Wikipedia for “${truncate(researchQuery, 80)}”`, 'research', async ({ env }) => {
      const found = await searchWikipedia(researchQuery, { limit: 3, timeoutMs: 8000, fetchImpl: env?.FETCH_IMPL });
      // A working Wikipedia is not an answer to an open-ended question. Unless the
      // question was explicitly a lookup, findings stay "sources to read" and the
      // run still needs a model to turn them into prose — so does not overclaim.
      const lookup = LOOKUP_HINT.test(text);
      const noProvider = !lookup;
      if (!found.results.length) return { observation: `Wikipedia returned no article for “${researchQuery}”.`, data: found, noTool: true, needsProvider: true };
      const lines = found.results.map((hit, index) => `${index + 1}. ${hit.title} — ${truncate(hit.snippet, 160)} (${hit.url})`).join('\n');
      const label = noProvider ? 'Sources found (Wikipedia does not answer the question itself)' : 'Wikipedia returned';
      return { observation: `${label}${noProvider ? ` for “${researchQuery}”` : ''} — ${found.results.length} article(s):\n${lines}`, data: found, needsProvider: noProvider, sourcesOnly: noProvider };
    }));
  }

  if (wantsRecords) {
    const term = text.replace(/.*(?:search|find|list|show|which)\b/i, '').replace(/^(?:\s*the)?\s*(?:records?|workspace|customers?|entries|database)\b/i, '').replace(/^(?:\s*(?:for|about|named|matching))?\s*/i, '').trim();
    steps.push(step('records', `Search workspace records${term ? ` for “${truncate(term, 60)}”` : ''}`, 'records', async ({ db, me }) => {
      const like = '%' + (term || '') + '%';
      const rows = await db.query('SELECT id,name,region,sector,status FROM records WHERE deleted_at IS NULL AND (name ILIKE $1 OR notes ILIKE $1 OR region ILIKE $1 OR sector ILIKE $1) ORDER BY updated_at DESC LIMIT 10', [like]);
      if (!rows.length) return { observation: term ? `No workspace record matches “${term}”.` : 'You have no workspace records yet.', data: { records: [] } };
      return { observation: `${rows.length} record(s) found:\n` + rows.map(row => `• ${row.name} (${row.region || '—'}, ${row.sector || '—'}) — ${row.status}`).join('\n'), data: { records: rows } };
    }));
  }

  if (wantsTasks) {
    steps.push(step('tasks', 'Read your saved tasks and notes', 'tasks', async ({ db, me }) => {
      // Do not read or speak private notes just because the user asked for tasks,
      // or vice versa. Only the requested categories leave the database.
      const [tasks, notes] = await Promise.all([
        includeTasks ? db.query("SELECT title,status FROM assistant_tasks WHERE user_id=$1 ORDER BY created_at DESC LIMIT 15", [me.id]) : [],
        includeNotes ? db.query('SELECT content FROM assistant_notes WHERE user_id=$1 ORDER BY created_at DESC LIMIT 5', [me.id]) : []
      ]);
      const parts = [];
      if (includeTasks) {
        const open = tasks.filter(item => item.status !== 'done');
        parts.push(tasks.length ? `${open.length} open task(s) of ${tasks.length}:\n` + tasks.map(item => `${item.status === 'done' ? '✓' : '○'} ${truncate(item.title, 90)}`).join('\n') : 'No tasks saved yet.');
      }
      if (includeNotes) parts.push(notes.length ? `${notes.length} recent note(s):\n` + notes.map(note => `• ${truncate(note.content, 90)}`).join('\n') : 'No notes saved yet.');
      return { observation: parts.join('\n\n'), data: { tasks, notes } };
    }));
  }

  // V140 toolbox steps. They append after the V136 tools so a prompt that needs
  // both ("audit this code and search my tasks") still gets both, in order.
  for (const extra of planFromToolbox(text)) {
    if (steps.some(item => item.tool === extra.tool)) continue;
    steps.push(step(extra.id, extra.title, extra.tool, async () => {
      const outcome = await extra.run();
      // A step may hand back a real file (the page builder does). It travels with
      // the step so the answer can embed it instead of only describing it.
      const files = Array.isArray(outcome.data?.artifacts) ? outcome.data.artifacts : [];
      return { observation: outcome.observation, data: outcome.data ?? null, artifacts: files };
    }));
  }

  if (!steps.length) {
    // No tool fits: hand over to the profile engine and say plainly that no tool ran.
    steps.push(step('answer', 'Answer with the selected local profile (no external tool)', 'none', async () => {
      const result = localAssistant(text, profile);
      return { observation: result.output, data: null, noTool: true, needsProvider: Boolean(result.needsProvider) };
    }));
  }
  return steps;
}

/**
 * Runs a plan. Each step is isolated: a thrown or slow tool becomes a recorded
 * failure with its message, and the run continues so the user still gets answers
 * from the steps that worked.
 */
export async function runAgent({ prompt, db, me, env, profile = 'general', timeoutMs = 9000 }) {
  const started = Date.now();
  const plan = planFor(prompt, profile);
  const steps = [];
  const artifacts = [];
  let action = null;
  for (const item of plan) {
    const at = Date.now();
    let timer;
    try {
      const outcome = await Promise.race([
        item.run({ db, me, env }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${item.title} timed out after ${timeoutMs} ms`)), timeoutMs); })
      ]);
      if (outcome.action) action = outcome.action;
      const files = (outcome.artifacts || []).map(file => ({ ...file, from: item.tool }));
      artifacts.push(...files);
      steps.push({
        id: item.id, title: item.title, tool: item.tool, ok: true,
        ms: Date.now() - at, observation: truncate(outcome.observation, 1600),
        noTool: Boolean(outcome.noTool), needsProvider: Boolean(outcome.needsProvider),
        ...(files.length ? { artifacts: files.map(file => ({ language: file.language, kind: file.kind, bytes: file.bytes })) } : {})
      });
    } catch (error) {
      steps.push({
        id: item.id, title: item.title, tool: item.tool, ok: false,
        ms: Date.now() - at, observation: truncate(error?.message || 'The tool failed.', 400)
      });
    } finally {
      clearTimeout(timer);
    }
  }

  // "Used a tool" means a tool ran and returned something. A failed call is
  // reported as a failure, never counted as evidence.
  const usedTools = steps.filter(item => item.ok && item.tool !== 'none' && !item.noTool);
  const failed = steps.filter(item => !item.ok);
  // A local answer or prepared action can be useful without an external tool.
  // Only say a provider is needed when the step explicitly says so or all tools fail.
  const needsProvider = steps.some(item => item.needsProvider)
    || (failed.length > 0 && steps.every(item => item.tool === 'none' || !item.ok));

  const header = usedTools.length
    ? `Agent run — ${plan.length} step(s), ${usedTools.length} tool call(s), ${failed.length} failure(s).`
    : 'Agent run — no external tool applied, answered locally.';

  const body = steps.map((item, index) => `Step ${index + 1} · ${item.title}\n${item.ok ? item.observation : `FAILED: ${item.observation}`}`).join('\n\n');
  const footer = [
    'What this run does not prove: it used only the tools listed above, each call is shown with its result, and nothing was executed outside this application except the Wikipedia request when present.',
    needsProvider ? 'This question needs a cloud model for a generated answer. Switch to Cloud AI and select a configured provider; no model output was invented in this run.' : ''
  ].filter(Boolean).join('\n');

  return {
    ok: true,
    mode: 'agent',
    provider: 'sj-agent-runtime',
    simulated: false,
    plan: plan.map(item => ({ id: item.id, title: item.title, tool: item.tool })),
    steps,
    trace: {
      tools: [...new Set(usedTools.map(item => item.tool))],
      toolCalls: usedTools.length,
      attempted: steps.filter(item => item.tool !== 'none').length,
      failures: failed.length,
      totalMs: Date.now() - started,
      bounded: true,
      maxSteps: 7
    },
    output: `${header}\n\n${body}\n\n${footer}`,
    // Only real generated files appear here; a step that produced nothing adds nothing.
    artifacts,
    ...(action ? { action } : {}),
    needsProvider
  };
}

/** Persists a run so the agent's history is evidence rather than a claim. */
export async function recordRun({ db, me, prompt, result, surface = 'agent' }) {
  const id = crypto.randomUUID();
  await db.query(
    'INSERT INTO agent_runs(id,user_id,prompt,surface,steps,tools,failures,duration_ms,needs_provider) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9)',
    [id, me.id, prompt.slice(0, 4000), surface, JSON.stringify(result.steps), JSON.stringify(result.trace.tools), result.trace.failures, result.trace.totalMs, Boolean(result.needsProvider)]
  );
  return id;
}
