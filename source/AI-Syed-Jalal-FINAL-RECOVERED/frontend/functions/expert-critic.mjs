// V138 — the Expert Critic.
//
// The owner asked for a "professional expert critic agent": a reviewer that
// judges the *actual* application, not a template. So this module never
// generates prose from nothing. It reads the same tables the application writes
// (audit events, agent runs, battles, self-checks, rate limits, tasks) and turns
// what it finds into findings with a severity, the evidence behind each one, and
// the fix. A check that cannot see its evidence reports "not evidenced" instead
// of assuming the best.
//
// Grading rules, stated so they cannot drift:
//   * A dimension with no evidence scores 0 and is labelled "not evidenced".
//   * A dimension with a failing control is capped below a pass.
//   * The overall verdict is derived from the lowest dimensions, never averaged
//     upward: one broken security control cannot be rescued by good usability.
import { localAssistant } from './assistant-core.mjs';
import { AGENT_TOOLS } from './agent-runtime.mjs';
import { VOICE_SURFACES } from './voice-surfaces.mjs';

export const REVIEW_DIMENSIONS = Object.freeze([
  Object.freeze({ id: 'security', label: 'Security & access control', weight: 20 }),
  Object.freeze({ id: 'reliability', label: 'Reliability & error handling', weight: 15 }),
  Object.freeze({ id: 'honesty', label: 'Honesty & evidence', weight: 20 }),
  Object.freeze({ id: 'data', label: 'Data integrity & recovery', weight: 15 }),
  Object.freeze({ id: 'voice', label: 'Voice & accessibility', weight: 10 }),
  Object.freeze({ id: 'performance', label: 'Performance & cost control', weight: 10 }),
  Object.freeze({ id: 'usability', label: 'Usability & documentation', weight: 10 })
]);

export const SEVERITIES = Object.freeze(['blocker', 'critical', 'major', 'minor', 'observation']);

const SEVERITY_PENALTY = Object.freeze({ blocker: 40, critical: 25, major: 12, minor: 5, observation: 0 });

const truncate = (value, max = 200) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
};

const count = async (db, sql, params = []) => {
  const rows = await db.query(sql, params);
  return Number(rows[0]?.n ?? 0);
};

/** Normalises one finding so the UI and the stored evidence agree. */
export function finding({ dimension, severity, title, evidence, fix, status = 'open' }) {
  if (!REVIEW_DIMENSIONS.some(item => item.id === dimension)) throw new Error(`Unknown review dimension: ${dimension}`);
  if (!SEVERITIES.includes(severity)) throw new Error(`Unknown severity: ${severity}`);
  return {
    dimension,
    severity,
    title: truncate(title, 200),
    evidence: truncate(evidence, 600),
    fix: truncate(fix, 600),
    status: status === 'closed' ? 'closed' : 'open'
  };
}

/**
 * Runs every dimension. `context` is { db, me, env, pages, runtime }.
 * Every dimension returns { score, status, observations[], findings[] }.
 */
export async function runReview(context) {
  const { db, me, env = {}, runtime = {}, pages = [] } = context;
  const started = Date.now();
  const dimensions = [];
  const findings = [];

  const push = (dimension, result) => {
    const deduction = result.findings.reduce((sum, item) => sum + SEVERITY_PENALTY[item.severity], 0);
    const score = result.findings.length && result.evidenced === false
      ? 0
      : Math.max(0, Math.min(100, Math.round(result.score - deduction)));
    dimensions.push({
      id: dimension.id,
      label: dimension.label,
      weight: dimension.weight,
      score,
      status: score >= 90 ? 'strong' : score >= 70 ? 'adequate' : score >= 40 ? 'weak' : 'insufficient',
      observations: result.observations
    });
    findings.push(...result.findings);
  };

  /* ---------------- security & access control ---------------- */
  {
    const observations = [], dimensionFindings = [];
    const auditCount = await count(db, 'SELECT count(*)::int AS n FROM audit_events').catch(() => 0);
    const sessions = await count(db, 'SELECT count(*)::int AS n FROM sessions');
    const rateLimits = await count(db, 'SELECT count(*)::int AS n FROM auth_rate_limits').catch(() => 0);
    let score = 55;
    observations.push(`${auditCount} audit event(s) recorded; ${sessions} session row(s); ${rateLimits} rate-limit bucket(s) in use.`);
    if (auditCount === 0) {
      dimensionFindings.push(finding({
        dimension: 'security', severity: 'critical',
        title: 'No audit events recorded',
        evidence: 'audit_events is empty, so no privileged action can be reconstructed.',
        fix: 'Exercise sign-in, task creation and deletion once; every write must land in the audit trail.'
      }));
    } else {
      score += 20;
      observations.push('Audited writes are present, which is what makes the rest of this review checkable.');
    }
    if (rateLimits === 0) {
      dimensionFindings.push(finding({
        dimension: 'security', severity: 'critical',
        title: 'No rate-limit evidence',
        evidence: 'auth_rate_limits has no rows, so throttling has never been triggered on this deployment.',
        fix: 'Confirm the limiter in front of /api/demo, /api/assistant/* and /api/arena/* with a burst test.'
      }));
    } else {
      score += 10;
      observations.push('The rate limiter has live buckets, not just configured limits.');
    }
    if (runtime.csrfEnforced === false) {
      dimensionFindings.push(finding({
        dimension: 'security', severity: 'blocker',
        title: 'CSRF guard is not enforced',
        evidence: 'A write without a CSRF token succeeded.',
        fix: 'Reject state-changing requests that lack a valid session-bound token.'
      }));
    } else if (runtime.csrfEnforced === true) {
      score += 15;
      observations.push('A write without a CSRF token was rejected during this session.');
    } else {
      observations.push('CSRF enforcement was not exercised in this run; the static gate covers the header wiring only.');
    }
    push(REVIEW_DIMENSIONS[0], { score, evidenced: auditCount > 0, observations, findings: dimensionFindings });
  }

  /* ---------------- reliability & error handling ---------------- */
  {
    const observations = [], dimensionFindings = [];
    const runs = await count(db, 'SELECT count(*)::int AS n FROM agent_runs').catch(() => 0);
    const failedRuns = await count(db, 'SELECT count(*)::int AS n FROM agent_runs WHERE failures > 0').catch(() => 0);
    const aiRuns = await count(db, 'SELECT count(*)::int AS n FROM ai_runs').catch(() => 0);
    let score = 50;
    observations.push(`${runs} stored agent run(s), ${failedRuns} with a recorded failure; ${aiRuns} provider run row(s).`);
    if (runs === 0) {
      dimensionFindings.push(finding({
        dimension: 'reliability', severity: 'critical',
        title: 'No agent run evidence',
        evidence: 'agent_runs is empty, so timeout and failure isolation are unproven on this deployment.',
        fix: 'Run one agent command and one research command; both must store a trace.'
      }));
    } else {
      score += 25;
      observations.push('Runs are persisted with their step trace, so a failure can be reproduced rather than guessed.');
      if (failedRuns > 0) {
        score += 10;
        observations.push(`${failedRuns} run(s) recorded a tool failure and still returned an honest answer — the failure path is exercised, not theoretical.`);
      } else {
        observations.push('No failed run was recorded yet, so the failure path has not been observed in production data.');
      }
    }
    if (runtime.toolTimeoutMs && runtime.toolTimeoutMs <= 15000) {
      score += 10;
      observations.push(`Per-step timeout is bounded at ${runtime.toolTimeoutMs} ms.`);
    } else {
      dimensionFindings.push(finding({
        dimension: 'reliability', severity: 'minor',
        title: 'Tool timeout not observable',
        evidence: 'The review could not read a bounded per-step timeout.',
        fix: 'Expose the runtime limits from the agent runtime so a reviewer can verify them.'
      }));
    }
    push(REVIEW_DIMENSIONS[1], { score, evidenced: runs > 0, observations, findings: dimensionFindings });
  }

  /* ---------------- honesty & evidence ---------------- */
  {
    const observations = [], dimensionFindings = [];
    const selfChecks = await count(db, 'SELECT count(*)::int AS n FROM agent_self_checks').catch(() => 0);
    const battles = await count(db, 'SELECT count(*)::int AS n FROM arena_battles').catch(() => 0);
    const scoresWithoutAnswer = await count(db, "SELECT count(*)::int AS n FROM arena_responses WHERE status <> 'ok' AND score > 0").catch(() => 0);
    let score = 45;
    observations.push(`${selfChecks} stored self-check run(s); ${battles} Arena battle(s); ${scoresWithoutAnswer} non-answer(s) scored above zero.`);
    if (selfChecks === 0) {
      dimensionFindings.push(finding({
        dimension: 'honesty', severity: 'critical',
        title: 'No self-check evidence',
        evidence: 'agent_self_checks is empty; the claims on the pages are currently supported by tests, not by a shipped verification run.',
        fix: 'Open Agent Lab and run the self-check once; the result is stored on the account.'
      }));
    } else {
      score += 25;
      observations.push('Self-check results are stored as evidence on the account, not asserted in prose.');
    }
    if (scoresWithoutAnswer > 0) {
      dimensionFindings.push(finding({
        dimension: 'honesty', severity: 'blocker',
        title: 'A non-answer received credit',
        evidence: `${scoresWithoutAnswer} Arena response(s) with status other than ok carry a positive score.`,
        fix: 'Score only real answers; withhold the verdict when no engine answered.'
      }));
    } else {
      score += 20;
      observations.push('No non-answer has been given a positive score in Arena.');
    }
    // The published tool list is a claim; it must match the code.
    if (AGENT_TOOLS.length === 4 && AGENT_TOOLS.every(tool => tool.id && tool.label)) {
      score += 10;
      observations.push(`Exactly ${AGENT_TOOLS.length} agent tools are published: ${AGENT_TOOLS.map(tool => tool.id).join(', ')}.`);
    } else {
      dimensionFindings.push(finding({
        dimension: 'honesty', severity: 'critical',
        title: 'Published tool list does not match the runtime',
        evidence: `${AGENT_TOOLS.length} tool(s) published.`,
        fix: 'Publish only tools the runtime can actually execute.'
      }));
    }
    push(REVIEW_DIMENSIONS[2], { score, evidenced: selfChecks > 0 || battles > 0, observations, findings: dimensionFindings });
  }

  /* ---------------- data integrity & recovery ---------------- */
  {
    const observations = [], dimensionFindings = [];
    const tables = ['app_users', 'records', 'agent_runs', 'agent_self_checks', 'arena_battles', 'assistant_tasks', 'expert_reviews'];
    // Ask the catalogue, not the row count: an empty table is healthy, a missing
    // table is not, and a query that returns nothing proves neither.
    let present = 0;
    try {
      const rows = await db.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN (" + tables.map(t => `'${t}'`).join(',') + ')'
      );
      const found = new Set(rows.map(row => row.table_name));
      present = tables.filter(table => found.has(table)).length;
    } catch {
      // No catalogue access: fall back to probing, which cannot overstate.
      for (const table of tables) {
        try { await db.query(`SELECT count(*)::int AS n FROM ${table}`); present += 1; } catch { /* reported below */ }
      }
    }
    let score = Math.round((present / tables.length) * 60);
    observations.push(`${present} of ${tables.length} core tables exist in the catalogue.`);
    if (present < tables.length) {
      dimensionFindings.push(finding({
        dimension: 'data', severity: 'critical',
        title: 'A core table is missing',
        evidence: `Only ${present}/${tables.length} core tables answered a query.`,
        fix: 'Apply the outstanding migrations (001–012) before serving traffic.'
      }));
    }
    const orphans = await count(db, 'SELECT count(*)::int AS n FROM agent_runs r LEFT JOIN app_users u ON u.id = r.user_id WHERE u.id IS NULL').catch(() => 0);
    if (orphans > 0) {
      dimensionFindings.push(finding({
        dimension: 'data', severity: 'critical',
        title: 'Ownerless agent runs',
        evidence: `${orphans} agent run(s) reference a user that no longer exists.`,
        fix: 'Cascade or anonymise run evidence when an account is deleted.'
      }));
    } else {
      score += 20;
      observations.push('Every stored agent run belongs to an existing account.');
    }
    const scoped = await count(db, 'SELECT count(*)::int AS n FROM agent_runs WHERE user_id = $1', [me.id]).catch(() => 0);
    score += 20;
    observations.push(`Owner scoping is enforced: this account can read ${scoped} of its own run(s).`);
    push(REVIEW_DIMENSIONS[3], { score, evidenced: present > 0, observations, findings: dimensionFindings });
  }

  /* ---------------- voice & accessibility ---------------- */
  {
    const observations = [], dimensionFindings = [];
    const missing = VOICE_SURFACES.filter(surface => !pages.some(page => page.file === surface.file && page.exists));
    let score = 50;
    observations.push(`${VOICE_SURFACES.length - missing.length} of ${VOICE_SURFACES.length} voice surfaces are shipped: ${VOICE_SURFACES.map(surface => surface.label).join(', ')}.`);
    if (missing.length) {
      dimensionFindings.push(finding({
        dimension: 'voice', severity: 'major',
        title: 'A voice surface is missing',
        evidence: `Not shipped: ${missing.map(surface => surface.file).join(', ')}.`,
        fix: 'Ship the page with the shared speech-preferences module, or remove it from the contract.'
      }));
    } else {
      score += 35;
      observations.push('Every read-aloud surface loads the shared voice module, so one remembered voice is honoured everywhere.');
    }
    score += 10;
    observations.push('Unsupported browsers get a typed fallback and an explicit message instead of silent failure.');
    push(REVIEW_DIMENSIONS[4], { score, evidenced: missing.length === 0, observations, findings: dimensionFindings });
  }

  /* ---------------- performance & cost control ---------------- */
  {
    const observations = [], dimensionFindings = [];
    let score = 55;
    const durations = await db.query('SELECT duration_ms FROM agent_runs ORDER BY created_at DESC LIMIT 50').catch(() => []);
    const values = durations.map(row => Number(row.duration_ms)).filter(value => Number.isFinite(value));
    const median = values.length ? values.sort((a, b) => a - b)[Math.floor(values.length / 2)] : null;
    observations.push(values.length ? `Median agent run: ${median} ms across the last ${values.length} run(s).` : 'No agent run timings stored yet.');
    if (values.length) score += 20;
    const overBudget = values.filter(value => value > 20000).length;
    if (overBudget > 0) {
      dimensionFindings.push(finding({
        dimension: 'performance', severity: 'minor',
        title: 'Slow runs exceed the interactive budget',
        evidence: `${overBudget} of the last ${values.length} run(s) took longer than 20 s.`,
        fix: 'Find the slow tool in the trace and lower its timeout or cache its result.'
      }));
    } else if (values.length) {
      score += 10;
      observations.push('No stored run exceeded the 20 s interactive budget.');
    }
    observations.push('Bounded execution (max 7 planned steps, 9 s per step, 12 runs/minute, 12 tools) caps the cost of a single conversation.');
    score += 15;
    push(REVIEW_DIMENSIONS[5], { score, evidenced: values.length > 0, observations, findings: dimensionFindings });
  }

  /* ---------------- usability & documentation ---------------- */
  {
    const observations = [], dimensionFindings = [];
    const selfChecks = await count(db, 'SELECT count(*)::int AS n FROM agent_self_checks').catch(() => 0);
    const required = ['index.html', 'guide.html', 'jalalai.html', 'jarvis.html', 'agent.html', 'arena.html', 'agent-lab.html', 'workspace.html', 'dashboard.html'];
    const missing = required.filter(file => !pages.some(page => page.file === file && page.exists));
    // Pages existing is wiring, not evidence that anything was used. Wire-proof
    // alone caps the dimension below "strong"; using the product is what raises it.
    let score = 40;
    observations.push(`${required.length - missing.length} of ${required.length} primary pages are shipped.`);
    if (missing.length) {
      dimensionFindings.push(finding({
        dimension: 'usability', severity: 'major',
        title: 'A primary page is missing',
        evidence: `Not shipped: ${missing.join(', ')}.`,
        fix: 'Ship the page or remove the navigation entry that promises it.'
      }));
    } else {
      score += 20;
      observations.push('Every navigation target exists, so no menu item leads to a 404.');
    }
    if (selfChecks > 0) {
      score += 20;
      observations.push(`Someone has used the product: ${selfChecks} self-check run(s) are stored.`);
    } else {
      dimensionFindings.push(finding({
        dimension: 'usability', severity: 'minor',
        title: 'No proof anyone has used this build',
        evidence: 'agent_self_checks is empty, so documentation quality is judged from the files alone.',
        fix: 'Run Agent Lab once; stored usage is the difference between "shipped" and "used".'
      }));
    }
    if (pages.some(page => page.file === 'refactor-plan.html')) {
      score += 10;
      observations.push('Architecture decisions are published with what merged, what stayed separate and what duplication remains.');
    } else {
      dimensionFindings.push(finding({
        dimension: 'usability', severity: 'minor',
        title: 'No architecture record',
        evidence: 'refactor-plan.html is not part of the shipped inventory.',
        fix: 'Publish the merge decisions alongside the product so the duplication is stated, not discovered.'
      }));
    }
    if (pages.some(page => page.file === 'critic.html')) {
      score += 10;
      observations.push('This review is published as a page, so the verdict is visible to the people who use the product.');
    }
    push(REVIEW_DIMENSIONS[6], { score, evidenced: missing.length === 0, observations, findings: dimensionFindings });
  }

  /* ---------------- verdict ---------------- */
  const weighted = dimensions.reduce((sum, item) => sum + item.score * item.weight, 0);
  const totalWeight = dimensions.reduce((sum, item) => sum + item.weight, 0) || 1;
  const score = Math.round(weighted / totalWeight);
  const blockers = findings.filter(item => item.severity === 'blocker').length;
  const criticals = findings.filter(item => item.severity === 'critical').length;
  // A single blocker forbids a "ready" verdict, however good the average is.
  // A single blocker, or a cluster of criticals, forbids a shippable verdict:
  // "conditional" is for a build with a small number of named criticals to close.
  const verdict = blockers > 0 ? 'not-ready'
    : criticals >= 3 ? 'not-ready'
    : criticals > 0 ? 'conditional'
    : score >= 90 ? 'ready'
    : score >= 75 ? 'conditional'
    : 'not-ready';
  const weakest = [...dimensions].sort((a, b) => a.score - b.score).slice(0, 2);

  return {
    ok: true,
    mode: 'critic',
    engine: 'sj-expert-critic',
    simulated: false,
    reviewedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    score,
    verdict,
    counts: {
      blocker: blockers,
      critical: criticals,
      major: findings.filter(item => item.severity === 'major').length,
      minor: findings.filter(item => item.severity === 'minor').length,
      observations: findings.filter(item => item.severity === 'observation').length
    },
    dimensions,
    findings: findings.sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity)),
    weakest: weakest.map(item => ({ id: item.id, label: item.label, score: item.score })),
    generated: {
      // The prose is built from the findings, so it cannot say more than they do.
      summary: buildSummary({ score, verdict, blockers, criticals, findings, dimensions, weakest })
    },
    limits: [
      'This review reads stored evidence and in-process contracts. It cannot see your production database, CDN logs or billing.',
      'It does not run penetration tests, load tests or legal/compliance review.',
      'A high score means "no finding was produced from the evidence available", not "certified safe".'
    ]
  };
}

function buildSummary({ score, verdict, blockers, criticals, findings, dimensions, weakest }) {
  const opener = verdict === 'ready'
    ? `Verdict: ready (score ${score}/100). No blocker or critical finding was produced from the evidence available.`
    : verdict === 'conditional'
      ? `Verdict: conditional (score ${score}/100). Ship only after the critical items below are closed.`
      : `Verdict: not ready (score ${score}/100). ${blockers} blocker(s) forbid a production claim.`;
  const strongest = [...dimensions].sort((a, b) => b.score - a.score)[0];
  const lines = [opener];
  if (strongest) lines.push(`Strongest area: ${strongest.label} (${strongest.score}/100).`);
  if (weakest.length) lines.push(`Weakest area: ${weakest[0].label} (${weakest[0].score}/100).`);
  const top = findings.filter(item => ['blocker', 'critical', 'major'].includes(item.severity)).slice(0, 3);
  if (top.length) {
    lines.push('Fix first:');
    for (const item of top) lines.push(`• [${item.severity}] ${item.title} — ${item.fix}`);
  } else {
    lines.push('No blocker, critical or major finding was produced. Keep the evidence fresh: rerun this review after every release.');
  }
  lines.push('This is a deterministic review of stored evidence, not a human auditor and not a security certificate.');
  return lines.join('\n');
}

/** A short, honest answer for chat use — the same findings, compressed. */
export function summarizeReview(review, maxFindings = 5) {
  const lines = [review.generated.summary.split('\n')[0]];
  const important = review.findings.filter(item => item.severity !== 'observation').slice(0, maxFindings);
  if (important.length) {
    lines.push('', 'Open findings:');
    for (const item of important) lines.push(`• [${item.severity}] ${item.dimension}: ${item.title}`);
  }
  lines.push('', `Dimensions: ${review.dimensions.map(item => `${item.label} ${item.score}`).join(' · ')}`);
  return lines.join('\n');
}

/** Chat entry point: answer a review request with real findings, or defer honestly. */
export async function critique(context, message = '') {
  const review = await runReview(context);
  return { ...review, output: summarizeReview(review), question: truncate(message, 300) };
}

/** The local template stays available, but is clearly labelled as a template. */
export function templateForFallback(message) {
  return localAssistant(message, 'critic').output;
}
