// V139 — Arena feature parity, stated honestly.
//
// The owner asked for "a full clone of Arena.ai". A clone that pretends to have
// features it does not have would be worse than no clone at all, so this module
// publishes the feature map with one of three honest states:
//
//   shipped      — implemented here, covered by tests, usable now
//   needs-key    — implemented, but requires a server-side provider key first
//   not-shipped  — deliberately absent, with the reason
//
// The Arena page renders this list directly, so the page cannot drift from the
// code. Anything that moves to "shipped" must gain a test in the same change.
export const ARENA_FEATURES = Object.freeze([
  Object.freeze({
    id: 'blind-battle', label: 'Blind side-by-side battle', state: 'shipped',
    detail: 'Two or more engines answer one prompt; identities stay hidden until you vote.',
    evidence: 'tests/browser/arena.spec.mjs · backend/tests arena suite'
  }),
  Object.freeze({
    id: 'multi-contender', label: 'Up to four contenders', state: 'shipped',
    detail: 'Two to four engines in one battle, each with its own response and rubric score.',
    evidence: 'SIDES a–d in arena.mjs, MAX_CONTENDERS = 4'
  }),
  Object.freeze({
    id: 'deterministic-judge', label: 'Deterministic rubric judge', state: 'shipped',
    detail: 'Scores structure, specificity, evidence and honesty. Withholds a verdict when nothing answered.',
    evidence: 'JUDGE + rubricTable(); self-check arena.blind-judge'
  }),
  Object.freeze({
    id: 'elo-leaderboard', label: 'Rating leaderboard', state: 'shipped',
    detail: 'Elo-style ratings (start 1200, K = 24) updated from each human vote.',
    evidence: 'updateRatings() + /api/arena/leaderboard'
  }),
  Object.freeze({
    id: 'history', label: 'Battle history and artifacts', state: 'shipped',
    detail: 'Every battle is stored with its responses, scores and extracted code artifacts.',
    evidence: '/api/arena/battles · tests/browser/arena.spec.mjs'
  }),
  Object.freeze({
    id: 'local-contenders', label: 'Local engines that work without a key', state: 'shipped',
    detail: 'Five deterministic profiles compete immediately: general, planner, critic, coding, analysis.',
    evidence: 'arena.mjs CONTENDERS kind:local, exercised by the arena test suite'
  }),
  Object.freeze({
    id: 'modes', label: 'Text and code modes', state: 'shipped',
    detail: 'Code mode extracts artifacts and scores them differently from prose.',
    evidence: 'ARENA_MODES = [text, code]'
  }),
  Object.freeze({
    id: 'prompt-library', label: 'Prompt library with checkable properties', state: 'shipped',
    detail: 'Twelve prompts that separate engines, each labelled with the property a reviewer can check. Plain-text search, no model, readable before sign-in.',
    evidence: 'prompt-library.mjs PROMPT_LIBRARY · /api/arena/prompts · id="promptList" in arena.html'
  }),
  Object.freeze({
    id: 'artifact-preview', label: 'Live artifact preview', state: 'shipped',
    detail: 'HTML and SVG answers render in a sandboxed frame (scripts isolated, no referrer); everything else is shown as copyable code.',
    evidence: "extractArtifacts() kind:preview|image · iframe sandbox in assets/arena.js"
  }),
  Object.freeze({
    id: 'battle-export', label: 'Portable battle export', state: 'shipped',
    detail: 'A decided battle downloads as Markdown with the prompt, every answer, the rubric sub-scores, the judge\u2019s reason and its notes.',
    evidence: 'battleToMarkdown() · GET /api/arena/battles/:id?format=markdown · id="exportBtn"'
  }),
  Object.freeze({
    id: 'cloud-contenders', label: 'Cloud contenders (Gemini, OpenAI, Claude, DeepSeek)', state: 'needs-key',
    detail: 'Adapters are implemented. A battle against a cloud engine requires its server-side key; the page says "key configured; live call not verified" until one succeeds.',
    evidence: 'isConfigured() reads the env key per provider'
  }),
  Object.freeze({
    id: 'human-judge', label: 'Human preference data as a first-class judge', state: 'not-shipped',
    detail: 'Votes are recorded, but there is no human-annotation pipeline or disagreement analytics. The page never claims one.',
    evidence: 'statHuman counts your votes only'
  }),
  Object.freeze({
    id: 'image-arena', label: 'Image / video generation battles', state: 'not-shipped',
    detail: 'Absent on purpose: it needs image models, storage and moderation that this deployment does not have.',
    evidence: 'no image adapter is registered'
  }),
  Object.freeze({
    id: 'public-leaderboard', label: 'Public multi-user leaderboard', state: 'not-shipped',
    detail: 'Ratings are per account. A shared public board needs abuse controls and moderation first.',
    evidence: 'leaderboard is owner-scoped'
  })
]);

export const FEATURE_STATES = Object.freeze(['shipped', 'needs-key', 'not-shipped']);

export function featureSummary() {
  const counts = { shipped: 0, 'needs-key': 0, 'not-shipped': 0 };
  for (const feature of ARENA_FEATURES) counts[feature.state] += 1;
  return {
    total: ARENA_FEATURES.length,
    ...counts,
    headline: `${counts.shipped} feature(s) shipped and tested, ${counts['needs-key']} waiting on a provider key, ${counts['not-shipped']} deliberately absent.`
  };
}

/** What this Arena is *not*, in the product's own words. */
export const ARENA_POSITIONING = Object.freeze([
  'This is an Arena-style blind comparison built inside this application, not a copy of another company\'s site or data.',
  'It competes engines this deployment can actually run; a cloud engine only appears once its key is configured and a live call succeeds.',
  'The judge is a deterministic rubric, not a human reviewer, and it says so on every verdict.',
  'Votes and ratings are per account. There is no public leaderboard and no third-party benchmark claim.'
]);
