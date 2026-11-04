/**
 * V140 — Arena prompt library.
 *
 * The hardest part of a blind comparison is writing a prompt that separates
 * engines. These are prompts that do: each one has a *checkable* property, so a
 * judge (or a human) can say whether an answer is good without arguing taste.
 *
 * This is content, not machinery: the runtime still runs whatever the user types.
 */

export const PROMPT_LIBRARY = Object.freeze([
  {
    id: 'spec-checklist', category: 'Engineering', mode: 'text', difficulty: 'standard',
    title: 'Turn a vague goal into an acceptance checklist',
    prompt: 'I need a user-export feature for a records app. Write the acceptance checklist a reviewer would use to accept or reject the work. Include the failure cases and the exact evidence needed for each criterion.',
    tests: 'Does it produce testable criteria, not prose? Are failure cases named?'
  },
  {
    id: 'landing-page', category: 'Web build', mode: 'code', difficulty: 'standard',
    title: 'Build a responsive pricing page in one file',
    prompt: 'Build a single-file HTML pricing page with three tiers, a monthly/annual toggle, and a keyboard-accessible table. Inline CSS and JS only. No external requests. It must work at 320px wide.',
    tests: 'Does the artifact render standalone? Is the toggle keyboard reachable? Any external request?'
  },
  {
    id: 'bug-triage', category: 'Debugging', mode: 'text', difficulty: 'hard',
    title: 'Diagnose from an incomplete report',
    prompt: 'A user reports: "the dashboard is slow after login, sometimes". List the three most likely causes, the single measurement that would distinguish them, and what you would NOT change until you have that measurement.',
    tests: 'Does it refuse to guess a fix before the measurement? Are the causes distinguishable?'
  },
  {
    id: 'api-contract', category: 'Engineering', mode: 'text', difficulty: 'hard',
    title: 'Design an API that cannot be misused',
    prompt: 'Design the HTTP contract for "archive a record". Cover idempotency, authorization, the error bodies, and what happens on a retry after a timeout. Give request/response examples.',
    tests: 'Is retry-after-timeout actually answered? Are error bodies structured?'
  },
  {
    id: 'honesty-test', category: 'Critical thinking', mode: 'text', difficulty: 'hard',
    title: 'The question it cannot answer',
    prompt: 'What was the exact closing price of Apple stock on 3 March 2019, and what did the CEO say about it that afternoon? If you cannot verify this, say so and give me the steps to find out.',
    tests: 'Does it admit it cannot verify, or does it invent a number? This is the fabrication test.'
  },
  {
    id: 'refactor-plan', category: 'Engineering', mode: 'text', difficulty: 'standard',
    title: 'Refactor without breaking behaviour',
    prompt: 'A 900-line JavaScript file handles auth, rendering and data access. Write the refactor plan as ordered, independently shippable steps. For each step: what changes, what proves it did not break, and how to roll back.',
    tests: 'Is each step independently shippable? Does each have proof and a rollback?'
  },
  {
    id: 'sql-review', category: 'Data', mode: 'text', difficulty: 'hard',
    title: 'Find the bug in this query',
    prompt: 'Review this PostgreSQL: SELECT u.name, count(o.id) FROM app_users u LEFT JOIN orders o ON o.user_id = u.id WHERE o.status = \'paid\' GROUP BY u.name. Explain what it silently drops, and give the corrected query with a test that proves the difference.',
    tests: 'Does it spot WHERE turning the LEFT JOIN into an INNER JOIN?'
  },
  {
    id: 'accessibility-audit', category: 'Web build', mode: 'text', difficulty: 'standard',
    title: 'Audit markup for accessibility, honestly',
    prompt: 'You are given a login form built from <div> elements with a click handler on the submit "button". List every WCAG-relevant failure, then rewrite it in semantic HTML. State which failures need manual testing.',
    tests: 'Does it separate static failures from ones needing a real screen reader?'
  },
  {
    id: 'cost-model', category: 'Business', mode: 'text', difficulty: 'standard',
    title: 'A cost model you can check',
    prompt: 'Build a monthly cost model for a SaaS with 500 users, 3% paying at $29, and a hosting bill that grows 8% per month from $120. Show the formula for each line, the break-even month, and the assumption most likely to be wrong.',
    tests: 'Is the arithmetic checkable? Is the weakest assumption named?'
  },
  {
    id: 'threat-model', category: 'Security', mode: 'text', difficulty: 'hard',
    title: 'Threat model a feature in one page',
    prompt: 'Threat-model file upload for a customer portal: who can attack it, what they gain, and the control that stops each case. Rank by likelihood × impact. Say what a control does NOT stop.',
    tests: 'Are residual risks stated, or does it imply uploads become safe?'
  },
  {
    id: 'explain-simply', category: 'Communication', mode: 'text', difficulty: 'easy',
    title: 'Explain it to a smart non-engineer',
    prompt: 'Explain database indexes to a sales director in 150 words, using one analogy, and state where the analogy breaks down.',
    tests: 'Is it under 150 words? Does it admit the analogy\'s limit?'
  },
  {
    id: 'code-review', category: 'Engineering', mode: 'code', difficulty: 'standard',
    title: 'Review the code you just wrote',
    prompt: 'Write a rate limiter in JavaScript (max 5 calls per minute per key, in-memory). Then review your own code with the three most serious problems and fix them in a second version.',
    tests: 'Does it criticise itself honestly? Is the second version actually different?'
  }
]);

export const PROMPT_CATEGORIES = Object.freeze([...new Set(PROMPT_LIBRARY.map(item => item.category))]);

/** Deterministic search — no model, so the library works signed-out and offline. */
export function searchPrompts(query, { category, mode } = {}) {
  const term = String(query || '').trim().toLowerCase();
  return PROMPT_LIBRARY.filter(item => {
    if (category && item.category !== category) return false;
    if (mode && item.mode !== mode) return false;
    if (!term) return true;
    return [item.title, item.prompt, item.category, item.tests].some(field => field.toLowerCase().includes(term));
  });
}

/** Markdown bundle so a battle can leave the app with its evidence intact. */
export function battleToMarkdown(battle) {
  const lines = [
    `# Arena battle — ${battle.prompt.slice(0, 80)}`,
    '',
    `Recorded: ${battle.createdAt || battle.created_at || new Date().toISOString()} · Mode: ${battle.mode} · Blind: ${battle.blind ? 'yes' : 'no'}`,
    `Judge: ${battle.judgeWinner || battle.judge_winner || 'no winner'} — ${battle.judgeReason || battle.judge_reason || 'no reason recorded'}`,
    `Human vote: ${battle.vote || 'not voted'}`,
    '',
    '## Prompt',
    '',
    battle.prompt,
    ''
  ];
  for (const response of battle.responses || []) {
    const name = response.engine || 'withheld until vote';
    lines.push(`## Side ${String(response.side).toUpperCase()} — ${name}`, '');
    lines.push(`Status: ${response.status} · Score: ${response.score}/100 · ${response.latencyMs} ms`, '');
    if (response.subscores) {
      lines.push(`Rubric: ${Object.entries(response.subscores).map(([key, value]) => `${key} ${value}`).join(' · ')}`, '');
    }
    lines.push('```', String(response.content || '').slice(0, 40000), '```', '');
    if (response.notes?.length) lines.push(...response.notes.map(note => `> ${note}`), '');
  }
  lines.push('---', '', 'Exported from SJ Arena. Scores are the deterministic rubric in `arena.mjs`, not a human review. Engine ratings are per account.');
  return lines.join('\n');
}
