// V139 — the all-in-one assistant.
//
// The owner's request was "one place, every facility, as easy as Arena.ai". The
// temptation is a single opaque box that guesses. This module does the opposite:
// it classifies the request into the specialists that can actually serve it,
// runs them through the *existing* runtime, and returns every specialist answer
// with the reason it was chosen. When nothing fits, it says so instead of
// pretending a general model handled it.
//
// The panel calls the shared runAgent() and localAssistant() implementations.
// It does not execute user code or call a cloud language model; agent steps may
// read account data or query the documented Wikipedia adapter.
import { localAssistant, PROFILE_IDS } from './assistant-core.mjs';
import { AGENT_TOOLS, planFor, runAgent } from './agent-runtime.mjs';

/** Every specialist that can answer without a model key. */
export const SPECIALISTS = Object.freeze([
  Object.freeze({ id: 'agent', label: 'Tool Agent', kind: 'runtime', note: 'Can use the published agent tools as needed and shows the trace.' }),
  Object.freeze({ id: 'planner', label: 'Planner', kind: 'profile', note: 'Turns a goal into numbered, executable steps.' }),
  Object.freeze({ id: 'critic', label: 'Critic', kind: 'profile', note: 'Challenges evidence, security, reliability and operations.' }),
  Object.freeze({ id: 'analyst', label: 'Analyst', kind: 'profile', note: 'Structures the decision, the unknowns and the options.' }),
  Object.freeze({ id: 'architect', label: 'Architect', kind: 'profile', note: 'Boundaries, data, contracts, failure modes, operations.' }),
  Object.freeze({ id: 'reviewer', label: 'Reviewer', kind: 'profile', note: 'Correctness, security, honesty, accessibility, tests.' }),
  Object.freeze({ id: 'coder', label: 'Coding Advisor', kind: 'profile', note: 'Contract → smallest change → validation → tests.' }),
  Object.freeze({ id: 'writer', label: 'Writer', kind: 'profile', note: 'Reader, one point, structure, evidence, next step.' })
]);

export const SPECIALIST_IDS = SPECIALISTS.map(item => item.id);
const PROFILE_FOR = { planner: 'planner', critic: 'critic', analyst: 'analysis', architect: 'architect', reviewer: 'reviewer', coder: 'coding', writer: 'writer' };

/** Keyword triggers. Ordered by specificity so "review the security of X" beats "write about X". */
const TRIGGERS = Object.freeze([
  Object.freeze({ id: 'critic', pattern: /\b(critic|critique|risk|weakness|what could go wrong|challenge|red team|assess the|is this (safe|ready))\b/i }),
  Object.freeze({ id: 'reviewer', pattern: /\b(review|audit|accessib\w*|checklist|code review|security review)\b/i }),
  Object.freeze({ id: 'architect', pattern: /\b(architect\w*|scal(e|ing)|schema|database design|boundar\w*|system design|migrat\w*)\b/i }),
  Object.freeze({ id: 'analyst', pattern: /\b(analys[ei]s|analyse|analyze|compare|trade-?off|decide|decision|forecast|metric)\b/i }),
  Object.freeze({ id: 'planner', pattern: /\b(plan|roadmap|steps|launch|schedule|organi[sz]e|prepare)\b/i }),
  Object.freeze({ id: 'coder', pattern: /\b(code|bug|function|refactor|api|typescript|javascript|python|sql|test)\b/i }),
  Object.freeze({ id: 'writer', pattern: /\b(write|draft|email|post|caption|copy|summar\w*|rewrite|tone)\b/i })
]);

/** Use the runtime's pure planner, not loose keywords that mistake a general
 * question about notes for permission to read them. Planning does not run tools. */
const TOOL_PATTERN = {
  test(text) { return planFor(text).some(step => step.tool !== 'none'); }
};

/**
 * Chooses specialists for a prompt. Deterministic and bounded: at most `limit`.
 * Returns [{ id, reason }] so the UI can show *why* each one answered.
 */
export function routePrompt(prompt, limit = 3) {
  const text = String(prompt || '').trim();
  const picks = [];
  const seen = new Set();
  const add = (id, reason) => {
    if (seen.has(id) || picks.length >= limit) return;
    seen.add(id);
    picks.push({ id, reason });
  };

  if (!text) return [];
  if (TOOL_PATTERN.test(text)) add('agent', 'The prompt needs a real tool: arithmetic, your saved data, or a lookup.');
  for (const trigger of TRIGGERS) {
    const match = text.match(trigger.pattern);
    if (match) add(trigger.id, `The prompt mentions “${match[0].toLowerCase()}”.`);
  }
  // A prompt with no keyword is still served — by the planner, which is the
  // safest general frame, and the reason says so plainly.
  if (!picks.length) add('planner', 'No specialist keyword matched, so the general planning frame answers.');
  return picks;
}

/** Runs one specialist. Never throws: a failure becomes a labelled result. */
async function runSpecialist(id, { prompt, db, me, env }) {
  const started = Date.now();
  const specialist = SPECIALISTS.find(item => item.id === id);
  if (!specialist) return { id, ok: false, error: 'Unknown specialist', ms: 0 };
  try {
    if (id === 'agent') {
      const run = await runAgent({ prompt, db, me, env });
      return {
        id, label: specialist.label, kind: specialist.kind, ok: true, ms: Date.now() - started,
        output: run.output, trace: run.trace, steps: run.steps, action: run.action || null, needsProvider: run.needsProvider, simulated: false
      };
    }
    const profile = PROFILE_FOR[id] || 'general';
    const result = localAssistant(prompt, profile);
    // Only the Tool Agent executes saved-data intents on this panel. A local
    // profile must not claim it opened items which the panel never fetched.
    const deferredRead = ['list_tasks', 'list_notes', 'list_tasks_and_notes', 'search_records'].includes(result.tool);
    return {
      id, label: specialist.label, kind: specialist.kind, ok: true, ms: Date.now() - started,
      output: deferredRead ? 'This profile did not open saved items. Choose Tool Agent to run the requested read.' : result.output,
      tool: result.tool || null, action: result.action || null,
      needsProvider: Boolean(result.needsProvider), simulated: false
    };
  } catch (error) {
    // A specialist that fails is reported as failed — never replaced by filler.
    return { id, label: specialist.label, kind: specialist.kind, ok: false, ms: Date.now() - started, error: 'The specialist could not complete this request.' };
  }
}

/**
 * Answers one prompt with every routed specialist.
 * Returns { panel, answers[], limits, needsProvider, simulated:false }.
 */
export async function answerAll({ prompt, db, me, env, limit = 3, only = null }) {
  const text = String(prompt || '').trim();
  if (!text) throw new Error('Enter a prompt first.');
  if (text.length > 4000) throw new Error('Keep the prompt under 4,000 characters.');
  const started = Date.now();

  let routed = Array.isArray(only) && only.length
    ? only.filter(id => SPECIALIST_IDS.includes(id)).slice(0, 4).map(id => ({ id, reason: 'You chose this specialist explicitly.' }))
    : routePrompt(text, limit);
  if (!routed.length) routed = [{ id: 'planner', reason: 'Nothing matched, so the general planning frame answers.' }];

  const answers = [];
  for (const choice of routed) {
    const answer = await runSpecialist(choice.id, { prompt: text, db, me, env });
    answers.push({ ...answer, reason: choice.reason });
  }

  const failures = answers.filter(item => !item.ok);
  const needsProvider = answers.some(item => item.needsProvider);
  return {
    ok: true,
    mode: 'all-in-one',
    engine: 'sj-all-in-one',
    simulated: false,
    prompt: text,
    durationMs: Date.now() - started,
    routed: answers.map(item => ({ id: item.id, label: item.label, reason: item.reason, ok: item.ok })),
    answers,
    counts: { specialists: answers.length, ok: answers.length - failures.length, failed: failures.length },
    needsProvider,
    // The panel states its own scope, so the UI cannot oversell it.
    limits: [
      `Answered by ${answers.length} specialist(s) using local profiles or the agent runtime; ${AGENT_TOOLS.length} tools are published; no external model was called.`,
      'Not every profile is a model: the planner, critic and analyst frames are deterministic checklists, labelled as such.',
      'One provider-backed answer still requires a server-side key in Cloud AI mode.',
      'Nothing here executes code, sends messages, reads email or controls a device.'
    ],
    tools: AGENT_TOOLS
  };
}

/** Catalogue for the UI, so the picker cannot drift from the router. */
export function specialistCatalogue() {
  return SPECIALISTS.map(item => ({ ...item, profile: PROFILE_FOR[item.id] || null, profiled: PROFILE_IDS.includes(PROFILE_FOR[item.id]) }));
}
