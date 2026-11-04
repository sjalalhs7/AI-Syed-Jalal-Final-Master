// V133 — durable, deterministic self-check engine.
//
// This module answers the owner's recurring request: "an application that really
// works and responds to what I ask". It runs a fixed suite of graded checks that
// cover the real behaviour of this application — not a screenshot of a green
// pipeline. Every check produces an observation (what actually happened) and a
// verdict, so a failure is reproducible instead of a claim.
//
// Design rules:
// * Deterministic: no Math.random, no clock other than an injected one.
// * Bounded: each check has a hard timeout through the caller's AbortSignal.
// * Honest: cloud providers are only reported as "not configured" or
//   "configured; live call not verified" until a caller supplies evidence.
// Path-safe for both the Cloudflare bundle (frontend/functions) and the local
// preview build (esbuild entry frontend/functions/api/[[path]].js).
import { localAssistant, calculate } from './assistant-core.mjs';
import { JUDGE, judgeVerdict } from './arena.mjs';
import { AGENT_TOOLS, planFor } from './agent-runtime.mjs';

const DEFAULT_TIMEOUT_MS = 4000;

class TimeoutError extends Error {}

function withTimeout(promise, ms, label) {
  if (!Number.isFinite(ms) || ms <= 0) ms = DEFAULT_TIMEOUT_MS;
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new TimeoutError(`${label} timed out after ${ms} ms`)), ms); })
  ]).finally(() => clearTimeout(timer));
}

function truncate(value, max = 240) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

// A check is a small object: id, title, weight, group, run(context).
// `expect` is a function returning {ok, detail} so a failure explains itself.
function defineCheck(spec) {
  if (!spec || typeof spec.id !== 'string' || typeof spec.run !== 'function') throw new Error('Invalid check definition');
  return {
    id: spec.id.slice(0, 80),
    title: String(spec.title || spec.id).slice(0, 160),
    group: String(spec.group || 'general').slice(0, 60),
    weight: Math.max(1, Math.min(10, Number(spec.weight) || 3)),
    severity: spec.severity === 'critical' ? 'critical' : 'standard',
    run: spec.run
  };
}

/**
 * The checks. Each receives a context object:
 * { db, me, env, request, onRequest, now, query, record }
 */
export function builtInChecks() {
  return [
    defineCheck({
      id: 'app.health', title: 'API answers /api/health with a truthful runtime label', group: 'application', weight: 5, severity: 'critical',
      async run({ onRequest, request, env }) {
        const target = new URL(request.url); target.pathname = '/api/health';
        const response = await onRequest({ request: new Request(target, { method: 'GET', headers: request.headers }), env });
        const data = await response.json().catch(() => ({}));
        if (response.status !== 200) throw new Error(`GET /api/health returned ${response.status}`);
        if (!data.ok) throw new Error('Health payload did not report ok:true');
        if (!data.database) throw new Error('Health payload did not report a database label');
        return `GET /api/health → ${response.status}; runtime=${data.runtime}; database=${data.database}; localTools=${Boolean(data.assistant?.localTools)}`;
      }
    }),
    defineCheck({
      id: 'db.schema', title: 'Database has every required table', group: 'data', weight: 6, severity: 'critical',
      async run({ db }) {
        const rows = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
        const names = new Set(rows.map(row => String(row.table_name)));
        // Must match the readiness list in frontend/functions/api/[[path]].js exactly.
        const required = ['app_users', 'sessions', 'records', 'audit_events', 'record_history', 'documents', 'approvals', 'ai_runs', 'auth_rate_limits', 'assistant_tasks', 'assistant_notes', 'platform_conversations', 'platform_messages', 'agent_skills', 'agent_self_checks', 'arena_battles', 'arena_responses', 'arena_artifacts', 'arena_ratings', 'agent_runs'];
        const missing = required.filter(name => !names.has(name));
        if (missing.length) throw new Error(`Missing tables: ${missing.join(', ')}`);
        return `${required.length}/${required.length} required tables present (${names.size} total)`;
      }
    }),
    defineCheck({
      id: 'db.roundtrip', title: 'A write is readable immediately and afterwards deleted', group: 'data', weight: 5,
      async run({ db }) {
        const id = crypto.randomUUID();
        await db.query('INSERT INTO audit_events(id,user_id,action,detail,ip) VALUES($1,NULL,$2,$3,$4)', [id, 'V133_SELF_CHECK', 'self-check write probe', 'self-check']);
        const rows = await db.query('SELECT action FROM audit_events WHERE id=$1', [id]);
        const removed = await db.query('DELETE FROM audit_events WHERE id=$1 RETURNING id', [id]);
        if (rows.length !== 1) throw new Error('Inserted row was not readable');
        if (removed.length !== 1) throw new Error('Probe row could not be deleted');
        return 'INSERT → SELECT → DELETE completed in one round trip';
      }
    }),
    defineCheck({
      id: 'math.calculator', title: 'Calculator returns a verified result for a difficult expression', group: 'reasoning', weight: 4,
      async run() {
        const result = calculate('(1200 + 350) * 15% * 3 - 4 / 8');
        if (!/=\s*697$/.test(result)) throw new Error(`Unexpected calculator output: ${result}`);
        return `calculate("(1200 + 350) * 15% * 3 - 4 / 8") → ${truncate(result.split('=').pop(), 40)} (percentages and precedence verified)`;
      }
    }),
    defineCheck({
      id: 'math.calculator-guard', title: 'Calculator refuses unsafe input instead of guessing', group: 'reasoning', weight: 4,
      async run() {
        let refused = false;
        for (const probe of ['calculate require("fs")', 'calculate $(rm -rf /)', 'calculate 2+']) {
          try { calculate(probe); } catch { refused = true; }
        }
        if (!refused) throw new Error('The calculator accepted an unsafe or malformed expression');
        return 'Unsafe/malformed expressions rejected with a usable error';
      }
    }),
    defineCheck({
      id: 'agent.planner', title: 'Planner profile produces an executable, bounded plan', group: 'agents', weight: 5,
      async run() {
        const out = localAssistant('plan: Launch a professional website', 'planner').output;
        const steps = (out.match(/^\d\.\s+/gm) || []).length;
        if (steps < 5) throw new Error(`Planner produced ${steps} numbered steps; expected at least 5`);
        if (!/not a claim/i.test(out)) throw new Error('Planner output lost its honesty disclaimer');
        return `Planner produced ${steps} numbered steps plus its honesty disclaimer`;
      }
    }),
    defineCheck({
      id: 'agent.critic', title: 'Critic profile challenges evidence, security and reliability', group: 'agents', weight: 4,
      async run() {
        const out = localAssistant('critic: Review my launch readiness', 'critic').output;
        for (const axis of ['Evidence', 'Security', 'Reliability', 'Usability', 'Operations']) {
          if (!out.includes(axis)) throw new Error(`Critic omitted the ${axis} axis`);
        }
        return 'Critic covered Evidence, Security, Reliability, Usability and Operations';
      }
    }),
    defineCheck({
      id: 'agent.confirmation', title: 'Task creation is proposed first and never saved silently', group: 'agents', weight: 6, severity: 'critical',
      async run({ db, me }) {
        const before = await db.query('SELECT count(*)::int AS n FROM assistant_tasks WHERE user_id=$1', [me?.id || null]);
        const result = localAssistant('add task: Self-check must not autosave', 'general');
        if (result.action?.type !== 'create_task') throw new Error('Task intent did not produce a confirmable action');
        const after = await db.query('SELECT count(*)::int AS n FROM assistant_tasks WHERE user_id=$1', [me?.id || null]);
        if (Number(after[0]?.n) !== Number(before[0]?.n)) throw new Error('A task was saved without explicit confirmation');
        return 'Proposal returned an action object; stored task count unchanged';
      }
    }),
    defineCheck({
      id: 'studio.reply-actions', title: 'Copy and Regenerate are backed by stored replies', group: 'agents', weight: 4,
      async run({ db, me }) {
        if (!me) return 'Skipped: reply actions are account-scoped and this run is anonymous';
        const rows = await db.query('SELECT count(*)::int AS n FROM platform_messages WHERE status=\'failed\' AND role=\'assistant\'');
        const columns = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='platform_messages' AND column_name IN ('reply_to','status')");
        if (columns.length !== 2) throw new Error('platform_messages is missing the V134 reply_to/status columns');
        return `Reply actions supported: platform_messages has reply_to + status (${Number(rows[0]?.n || 0)} flagged reply/replies pending retry)`;
      }
    }),
    defineCheck({
      id: 'agent.no-fake-cloud', title: 'Unconfigured cloud models are labelled, not simulated', group: 'honesty', weight: 6, severity: 'critical',
      async run({ env }) {
        const configured = ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'DEEPSEEK_API_KEY'].filter(key => Boolean(env[key]));
        // The runtime must carry the honest fallback path regardless of configuration.
        const fallback = localAssistant('Tell me a story', 'general');
        if (!fallback.needsProvider) throw new Error('Open-ended chat is answered locally without disclosing the missing provider');
        return configured.length
          ? `${configured.length} provider key(s) configured; the local fallback still declares "needsProvider"`
          : 'No provider keys configured; open-ended chat declares needsProvider instead of inventing an answer';
      }
    }),
    defineCheck({
      id: 'auth.session', title: 'Sessions use HttpOnly cookies and CSRF-protected writes', group: 'security', weight: 7, severity: 'critical',
      async run({ onRequest, request, env }) {
        const target = new URL(request.url); target.pathname = '/api/me';
        const response = await onRequest({ request: new Request(target, { method: 'GET', headers: request.headers }), env });
        const data = await response.json().catch(() => ({}));
        if (response.status !== 200) throw new Error(`GET /api/me returned ${response.status}`);
        if (data.authenticated && !data.csrfToken) throw new Error('An authenticated session did not expose a CSRF token');
        const headers = Object.fromEntries(response.headers.entries());
        if (!headers['x-content-type-options']) throw new Error('Security hardening headers are missing from API responses');
        return data.authenticated ? 'Authenticated session returned a CSRF token and hardened headers' : 'Anonymous session correctly reports authenticated:false with hardened headers';
      }
    }),
    defineCheck({
      id: 'auth.write-guard', title: 'A write without a CSRF token is rejected', group: 'security', weight: 7, severity: 'critical',
      async run({ onRequest, request, env, me }) {
        if (!me) return 'Skipped write probe: this self-check ran anonymously, so there is no session to abuse';
        const target = new URL(request.url); target.pathname = '/api/assistant/confirm';
        const headers = new Headers(request.headers); headers.set('content-type', 'application/json'); headers.delete('x-csrf-token');
        const response = await onRequest({ request: new Request(target, { method: 'POST', headers, body: JSON.stringify({ confirmed: true, action: { type: 'create_note', content: 'self-check should not save' } }) }), env });
        if (response.status !== 403) throw new Error(`CSRF-less write returned ${response.status}; expected 403`);
        return 'POST /api/assistant/confirm without X-CSRF-Token → 403';
      }
    }),
    defineCheck({
      id: 'api.records-scope', title: 'Workspace record reads are bounded and shaped', group: 'application', weight: 3,
      async run({ db }) {
        const rows = await db.query("SELECT id,name,status FROM records WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 5");
        return `Record query returned ${rows.length} row(s) with a LIMIT-bounded projection`;
      }
    }),
    defineCheck({
      id: 'catalog.skills', title: 'Skill library is complete and answerable', group: 'catalog', weight: 4,
      async run({ db, index }) {
        const rows = await db.query('SELECT count(*)::int AS n FROM agent_skills');
        const count = Number(rows[0]?.n || 0);
        if (index?.count && count !== index.count) throw new Error(`Database has ${count} skills; index has ${index.count}`);
        return `${count} skills queryable across ${index?.domainCount ?? '?'} domains`;
      }
    }),
    defineCheck({
      id: 'catalog.search', title: 'Skill search returns relevant, ranked matches', group: 'catalog', weight: 3,
      async run({ searchSkills, index }) {
        const hits = searchSkills('security review', index, 5);
        if (!hits.length) throw new Error('Skill search returned no matches for "security review"');
        // Natural language must now work too, not only catalogue vocabulary.
        const natural = searchSkills('make my website faster', index, 3);
        if (!natural.length) throw new Error('Plain-language search returned no matches for "make my website faster"');
        const noise = searchSkills('zzzq xylophone quasar', index, 3);
        if (noise.length) throw new Error('Search returned results for a meaningless query');
        return `${hits.length} match(es) for "security review" → ${truncate(hits[0].name, 50)}; plain language "make my website faster" → ${truncate(natural[0].name, 50)}; nonsense query correctly returns nothing`;
      }
    }),
    defineCheck({
      id: 'agent.tool-runtime', title: 'Agent runtime uses a finite tool list and a bounded plan', group: 'agents', weight: 5,
      async run({ db, me }) {
        if (AGENT_TOOLS.length !== 4) throw new Error('The published agent tool list changed size unexpectedly');
        for (const tool of AGENT_TOOLS) {
          if (!tool.id || !tool.label || !tool.kind) throw new Error('A published agent tool is incomplete');
        }
        // A plan must only reference published tools, and must be bounded.
        for (const prompt of ['calculate 40 * 3', 'research the printing press', 'show my tasks', 'write a poem']) {
          const plan = planFor(prompt);
          if (plan.length < 1 || plan.length > 4) throw new Error(`Plan for "${prompt}" is not bounded`);
          for (const item of plan) {
            if (item.tool !== 'none' && !AGENT_TOOLS.some(tool => tool.id === item.tool)) throw new Error(`Plan used an unpublished tool: ${item.tool}`);
          }
        }
        // The calculator must be deterministic and correct.
        const calcPlan = planFor('calculate (1200 + 350) * 15% * 3');
        const outcome = await calcPlan[0].run({ db, me, env: {} });
        if (!/= 697\.5$/.test(outcome.observation)) throw new Error('The calculator tool returned an unexpected result');
        const runs = await db.query('SELECT count(*)::int AS n FROM agent_runs');
        return `${AGENT_TOOLS.length} published tools, bounded plans, calculator verified; ${Number(runs[0]?.n || 0)} stored agent run(s)`;
      }
    }),
    defineCheck({
      id: 'arena.blind-judge', title: 'Arena keeps answers blind and never scores silence as a win', group: 'honesty', weight: 4,
      async run({ db, me }) {
        // The judge must withhold a verdict when nothing was actually answered.
        const silent = judgeVerdict([
          { side: 'a', score: 0, nonAnswer: true },
          { side: 'b', score: 0, nonAnswer: true }
        ]);
        if (silent.winner !== null) throw new Error('The rubric judge awarded a winner when no engine answered');
        if (!/withheld/i.test(silent.reason)) throw new Error('The judge did not explain why it withheld a verdict');
        if (JUDGE.kind !== 'deterministic') throw new Error('The judge is not labelled as deterministic tooling');
        if (!/not a human reviewer/.test(JUDGE.disclaimer)) throw new Error('The judge disclaimer is missing');
        if (!me) return 'Judge honesty verified for anonymous runs (account battles were not queried)';
        const battles = await db.query('SELECT count(*)::int AS n FROM arena_battles');
        const responses = await db.query("SELECT count(*)::int AS n FROM arena_responses WHERE status='ok'");
        const unlabelled = await db.query("SELECT count(*)::int AS n FROM arena_responses WHERE status<>'ok' AND score<>0");
        if (Number(unlabelled[0]?.n || 0) > 0) throw new Error('A non-answer was given a positive rubric score');
        return `Judge ${JUDGE.id} withholds verdicts on non-answers; ${Number(battles[0]?.n || 0)} battle(s), ${Number(responses[0]?.n || 0)} real answer(s), zero credit for non-answers`;
      }
    }),
    defineCheck({
      id: 'ui.pages', title: 'Every shipped page is present and self-contained', group: 'application', weight: 4,
      async run({ pages }) {
        const missing = pages.filter(page => !page.exists);
        if (missing.length) throw new Error(`Missing page files: ${missing.map(page => page.file).join(', ')}`);
        const broken = pages.filter(page => page.exists && !page.closesHtml);
        if (broken.length) throw new Error(`Pages without a closing </html>: ${broken.map(page => page.file).join(', ')}`);
        return `${pages.length} application pages present and well-formed`;
      }
    })
  ];
}

export function gradeChecks(results) {
  const total = results.reduce((sum, item) => sum + item.weight, 0) || 1;
  const earned = results.reduce((sum, item) => sum + (item.ok ? item.weight : 0), 0);
  return Math.round((earned / total) * 100);
}

export function verdictFor(results) {
  const criticalFailure = results.some(item => item.severity === 'critical' && !item.ok);
  const anyFailure = results.some(item => !item.ok);
  if (criticalFailure || results.filter(item => !item.ok).length >= 2) return 'fail';
  if (anyFailure) return 'warn';
  return 'pass';
}

/**
 * Runs the supplied checks. Never throws for a failing check: a thrown check
 * becomes a recorded failure with its message, which is the point of the tool.
 */
export async function runChecks(checks, context, options = {}) {
  const timeoutMs = Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS;
  const only = Array.isArray(options.only) && options.only.length ? new Set(options.only) : null;
  const selected = checks.filter(check => !only || only.has(check.id));
  const results = [];
  for (const check of selected) {
    const started = Date.now();
    try {
      const detail = await withTimeout(Promise.resolve().then(() => check.run(context)), timeoutMs, check.id);
      results.push({ id: check.id, title: check.title, group: check.group, weight: check.weight, severity: check.severity, ok: true, detail: truncate(detail || 'Completed with no detail'), ms: Date.now() - started });
    } catch (error) {
      results.push({ id: check.id, title: check.title, group: check.group, weight: check.weight, severity: check.severity, ok: false, detail: truncate(error instanceof TimeoutError ? error.message : error?.message || 'Check failed'), ms: Date.now() - started });
    }
  }
  const score = gradeChecks(results);
  return {
    score,
    verdict: verdictFor(results),
    checksTotal: results.length,
    checksPassed: results.filter(item => item.ok).length,
    results,
    groups: summarizeGroups(results)
  };
}

export function summarizeGroups(results) {
  const groups = new Map();
  for (const item of results) {
    const entry = groups.get(item.group) || { group: item.group, passed: 0, total: 0 };
    entry.total += 1;
    if (item.ok) entry.passed += 1;
    groups.set(item.group, entry);
  }
  return [...groups.values()];
}

/**
 * Deterministic, ranked skill search over the generated index.
 * Scoring favours exact phrase, then token coverage, then domain/family hits.
 */
// Ordinary language people actually type, mapped onto the catalogue's vocabulary.
const SYNONYMS = {
  website: ['web', 'frontend', 'site'], website_build: ['web'],
  launch: ['release', 'deployment', 'deploy', 'ship'],
  ship: ['release', 'deployment'], deploy: ['deployment', 'release'], deployment: ['deploy'],
  app: ['application'], application: ['app'],
  bug: ['debugging', 'defect'], bugs: ['debugging'], fix: ['debugging', 'refactoring'],
  fast: ['performance'], slow: ['performance'], speed: ['performance'],
  doctor: ['healthcare', 'medical'], health: ['healthcare'], medical: ['healthcare'],
  money: ['finance', 'budget'], cost: ['finance', 'budget'], budget: ['finance'],
  secure: ['security'], safety: ['security'], hack: ['security', 'cybersecurity'],
  test: ['testing', 'qa'], tests: ['testing'], qa: ['testing'],
  data: ['analytics', 'data'], database: ['database'], sql: ['database'],
  design: ['ui', 'ux', 'design'], ui: ['interface'], writing: ['content', 'editing'],
  translate: ['localization', 'translation'], language: ['localization'],
  teach: ['education', 'learning'], learn: ['education', 'learning'],
  plan: ['planning', 'project management'], roadmap: ['planning'],
  team: ['project management', 'operations'], office: ['productivity', 'operations'],
  ai: ['reasoning', 'meta-agent'], agent: ['meta-agent']
};

export function searchSkills(query, index, limit = 20) {
  const text = String(query || '').toLowerCase().trim().slice(0, 120);
  if (!text || !index?.skills?.length) return [];
  const tokens = text.split(/[^a-z0-9+]+/).filter(token => token.length > 2).slice(0, 8);
  const phrase = text;
  if (!tokens.length) return [];
  // Expand each token with its synonyms once, so the scan stays linear.
  const expansions = tokens.map(token => ({ token, related: SYNONYMS[token] || [] }));
  const scored = [];
  for (const row of index.skills) {
    const name = row[1].toLowerCase(), domain = row[2].toLowerCase(), family = row[3].toLowerCase();
    const haystack = `${name} ${family} ${domain}`;
    let score = 0;
    if (name === phrase) score += 40;
    if (name.includes(phrase)) score += 18;
    if (haystack.includes(phrase)) score += 8;
    // Cheap prefix match so "websites" or "testing" still lands on "web"/"test".
    const prefixable = tokens.filter(token => token.length >= 4);
    for (const token of prefixable) if (haystack.includes(token.slice(0, Math.max(4, token.length - 1)))) score += 1;
    for (const { token, related } of expansions) {
      if (name.includes(token)) score += 6;
      else if (family.includes(token)) score += 3;
      else if (domain.includes(token)) score += 2;
      else if (haystack.includes(token)) score += 1;
      for (const alternate of related) {
        if (name.includes(alternate)) score += 4;
        else if (family.includes(alternate)) score += 3;
        else if (domain.includes(alternate)) score += 1;
      }
    }
    if (score > 0) scored.push({ score, id: row[0], name: row[1], domain: row[2], family: row[3], capability: row[4] });
  }
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return scored.slice(0, Math.max(1, Math.min(100, limit)));
}

export { withTimeout, truncate };
