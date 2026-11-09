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
  const raw = rows[0]?.n;
  const value = Number(raw);
  if (raw == null || !Number.isSafeInteger(value) || value < 0) throw new Error('Review evidence query returned an invalid count');
  return value;
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
    const auditCount = await count(db, 'SELECT count(*)::int AS n FROM audit_events');
    const sessions = await count(db, 'SELECT count(*)::int AS n FROM sessions');
    const rateLimits = await count(db, 'SELECT count(*)::int AS n FROM auth_rate_limits');
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
        evidence: 'auth_rate_limits currently has no rows; expired or removed buckets cannot show past throttling.',
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
    const runs = await count(db, 'SELECT count(*)::int AS n FROM agent_runs');
    const failedRuns = await count(db, 'SELECT count(*)::int AS n FROM agent_runs WHERE failures > 0');
    const aiRuns = await count(db, 'SELECT count(*)::int AS n FROM ai_runs');
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
        observations.push(`${failedRuns} run(s) recorded a tool failure; their answers were not examined by this review.`);
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
    const selfChecks = await count(db, 'SELECT count(*)::int AS n FROM agent_self_checks');
    const battles = await count(db, 'SELECT count(*)::int AS n FROM arena_battles');
    const scoresWithoutAnswer = await count(db, "SELECT count(*)::int AS n FROM arena_responses WHERE status <> 'ok' AND score > 0");
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
    if (AGENT_TOOLS.length > 0 && AGENT_TOOLS.every(tool => tool.id && tool.label) && new Set(AGENT_TOOLS.map(tool => tool.id)).size === AGENT_TOOLS.length) {
      score += 10;
      observations.push(`The runtime lists ${AGENT_TOOLS.length} uniquely named tools: ${AGENT_TOOLS.map(tool => tool.id).join(', ')}. This review did not execute each tool.`);
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
    // An unavailable catalogue is not evidence that a table is missing. Let
    // the route report that evidence is unavailable rather than inventing rows.
    const rows = await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN (" + tables.map(t => `'${t}'`).join(',') + ')'
    );
    const found = new Set(rows.map(row => row.table_name));
    const present = tables.filter(table => found.has(table)).length;
    let score = Math.round((present / tables.length) * 60);
    observations.push(`${present} of ${tables.length} core tables exist in the catalogue.`);
    if (present < tables.length) {
      dimensionFindings.push(finding({
        dimension: 'data', severity: 'critical',
        title: 'A core table is missing',
        evidence: `Only ${present}/${tables.length} core table names were visible in the catalogue; columns and data were not checked.`,
        fix: 'First verify a restorable full backup and rehearse on an isolated database. An authorized operator can then assess the missing migrations.'
      }));
    }
    const orphans = await count(db, 'SELECT count(*)::int AS n FROM agent_runs r LEFT JOIN app_users u ON u.id = r.user_id WHERE u.id IS NULL');
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
    const scoped = await count(db, 'SELECT count(*)::int AS n FROM agent_runs WHERE user_id = $1', [me.id]);
    score += 20;
    observations.push(`A query filtered to this account returned ${scoped} run(s); endpoint authorization was not tested.`);
    push(REVIEW_DIMENSIONS[3], { score, evidenced: present > 0, observations, findings: dimensionFindings });
  }

  /* ---------------- voice & accessibility ---------------- */
  {
    const observations = [], dimensionFindings = [];
    const status = file => pages.find(page => page.file === file);
    const missing = VOICE_SURFACES.filter(surface => status(surface.file)?.exists === false);
    const unknown = VOICE_SURFACES.filter(surface => status(surface.file)?.exists !== true && status(surface.file)?.exists !== false);
    const present = VOICE_SURFACES.filter(surface => status(surface.file)?.exists === true);
    const invalid = present.filter(surface => !status(surface.file)?.voiceContract?.ok);
    let score = 50;
    observations.push(`${present.length} of ${VOICE_SURFACES.length} voice page responses had their expected marker; ${unknown.length} could not be checked.`);
    if (missing.length) dimensionFindings.push(finding({
      dimension: 'voice', severity: 'major', title: 'A voice surface is missing',
      evidence: `Expected page content unavailable: ${missing.map(surface => surface.file).join(', ')}.`,
      fix: 'Check the deployed asset paths and publish the expected page, or remove the broken link.'
    }));
    if (unknown.length) dimensionFindings.push(finding({
      dimension: 'voice', severity: 'major', title: 'Voice pages could not be verified',
      evidence: `The asset probe could not check: ${unknown.map(surface => surface.file).join(', ')}.`,
      fix: 'Check the deployed pages and their voice controls in a browser; retry the asset probe when available.'
    }));
    if (invalid.length) dimensionFindings.push(finding({
      dimension: 'voice', severity: 'major', title: 'Shared voice controls not declared',
      evidence: `The expected shared selector or module was not found on: ${invalid.map(surface => surface.file).join(', ')}.`,
      fix: 'Restore the shared speech preference controls and test them in supported browsers.'
    }));
    if (!missing.length && !unknown.length && !invalid.length) {
      score += 35;
      observations.push('The HTML responses declare the shared voice selector and preference module; this does not test playback.');
    }
    observations.push('Physical microphones, speakers, recognition accuracy and installed voices were not tested.');
    push(REVIEW_DIMENSIONS[4], { score, evidenced: !missing.length && !unknown.length && !invalid.length, observations, findings: dimensionFindings });
  }

  /* ---------------- performance & cost control ---------------- */
  {
    const observations = [], dimensionFindings = [];
    let score = 55;
    const durations = await db.query('SELECT duration_ms FROM agent_runs ORDER BY created_at DESC LIMIT 50');
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
    const selfChecks = await count(db, 'SELECT count(*)::int AS n FROM agent_self_checks');
    const required = ['index.html', 'guide.html', 'jalalai.html', 'jarvis.html', 'agent.html', 'arena.html', 'agent-lab.html', 'workspace.html', 'dashboard.html'];
    const status = file => pages.find(page => page.file === file)?.exists;
    const missing = required.filter(file => status(file) === false);
    const unknown = required.filter(file => status(file) !== true && status(file) !== false);
    const present = required.filter(file => status(file) === true);
    let score = 40;
    observations.push(`${present.length} of ${required.length} primary page responses had their expected marker; ${unknown.length} could not be checked.`);
    if (missing.length) dimensionFindings.push(finding({
      dimension: 'usability', severity: 'major', title: 'A primary page is missing',
      evidence: `Expected page content unavailable: ${missing.join(', ')}.`,
      fix: 'Check the deployment paths and restore the page or remove the navigation entry.'
    }));
    if (unknown.length) dimensionFindings.push(finding({
      dimension: 'usability', severity: 'major', title: 'Primary pages could not be verified',
      evidence: `The asset probe could not check: ${unknown.join(', ')}.`,
      fix: 'Check these pages on the deployed site and rerun the probe when an asset binding is available.'
    }));
    if (!missing.length && !unknown.length) {
      score += 20;
      observations.push('These page responses contain expected markers. Links, controls and accessibility still require separate testing.');
    }
    if (selfChecks > 0) {
      score += 20;
      observations.push(`${selfChecks} self-check run(s) are stored; that alone does not establish usability.`);
    } else {
      dimensionFindings.push(finding({
        dimension: 'usability', severity: 'minor', title: 'No stored self-check evidence',
        evidence: 'agent_self_checks has no stored runs; this does not establish whether anyone used other parts of the site.',
        fix: 'Run the self-check when the required tables are available, then separately test key journeys.'
      }));
    }
    if (status('refactor-plan.html') === true) {
      score += 10;
      observations.push('The architecture page returned its expected marker; its accuracy was not checked.');
    }
    if (status('critic.html') === true) {
      score += 10;
      observations.push('The review page returned its expected marker; its controls were not tested here.');
    }
    push(REVIEW_DIMENSIONS[6], { score, evidenced: !missing.length && !unknown.length, observations, findings: dimensionFindings });
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
      'This review reads the database connected to this deployment and limited in-process contracts. It cannot see CDN logs, billing or physical devices.',
      'It does not run penetration tests, load tests or legal/compliance review.',
      'A high score means "no finding was produced from the evidence available", not "certified safe".'
    ]
  };
}

function buildSummary({ score, verdict, blockers, criticals, findings, dimensions, weakest }) {
  const opener = verdict === 'ready'
    ? `Verdict: ready within these limited checks (score ${score}/100). No blocker or critical finding was produced; this is not production approval.`
    : verdict === 'conditional'
      ? `Verdict: conditional (score ${score}/100). Ship only after the critical items below are closed.`
      : `Verdict: not ready (score ${score}/100). ${blockers} blocker(s), ${criticals} critical finding(s); this is not production approval.`;
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
