/**
 * V135 — Arena: multi-model battle engine.
 *
 * Shared by the Cloudflare API (frontend/functions) and the local preview build,
 * so there is exactly one implementation of the catalogue, the judge and the
 * rating maths.
 *
 * Honesty rules carried over from this project:
 *  - Every contender is labelled local / configured / not configured.
 *  - A contender with no provider key produces a labelled "not configured"
 *    response. It is scored as having no answer, never as a tie.
 *  - The judge is a deterministic rubric, not a second AI pretending to be a
 *    human reviewer, and it says so in every payload.
 *  - Ratings are evidence of preference, not a quality certification.
 */

export const ARENA_MODES = ['text', 'code'];
export const SIDES = ['a', 'b', 'c', 'd'];
export const MIN_CONTENDERS = 2;
export const MAX_CONTENDERS = 4;
export const START_RATING = 1200;
export const K_FACTOR = 24;

export const CONTENDERS = [
  { id: 'local', label: 'SJ Local Tools', family: 'Local', kind: 'local', blurb: 'Deterministic local helper: calculations, planning, critique, coding checklists, task/note proposals.' },
  { id: 'local-planner', label: 'SJ Planner', family: 'Local', kind: 'local', blurb: 'Turns a goal into a numbered, executable plan with an explicit disclaimer.' },
  { id: 'local-critic', label: 'SJ Critic', family: 'Local', kind: 'local', blurb: 'Challenges evidence, security, reliability, usability and operations.' },
  { id: 'local-coding', label: 'SJ Coding Advisor', family: 'Local', kind: 'local', blurb: 'Contract → smallest change → validation → tests → review.' },
  { id: 'local-analysis', label: 'SJ Analysis Advisor', family: 'Local', kind: 'local', blurb: 'Structured analysis without pretending to be an external model.' },
  { id: 'gemini', label: 'Google Gemini', family: 'Cloud', kind: 'cloud', blurb: 'Provider-backed text profile. Requires a server-side GEMINI_API_KEY.' },
  { id: 'openai', label: 'OpenAI', family: 'Cloud', kind: 'cloud', blurb: 'Provider-backed text profile. Requires a server-side OPENAI_API_KEY.' },
  { id: 'anthropic', label: 'Anthropic Claude', family: 'Cloud', kind: 'cloud', blurb: 'Provider-backed text profile. Requires a server-side ANTHROPIC_API_KEY.' },
  { id: 'deepseek', label: 'DeepSeek', family: 'Cloud', kind: 'cloud', blurb: 'Provider-backed text profile. Requires a server-side DEEPSEEK_API_KEY.' }
];

export const CONTENDER_IDS = CONTENDERS.map(item => item.id);

export function contenderFor(id) {
  return CONTENDERS.find(item => item.id === id) || null;
}

export function isConfigured(env, id) {
  if (!contenderFor(id)) return false;
  if (contenderFor(id).kind === 'local') return true;
  if (id === 'gemini') return Boolean(env?.GEMINI_API_KEY);
  if (id === 'openai') return Boolean(env?.OPENAI_API_KEY);
  if (id === 'anthropic') return Boolean(env?.ANTHROPIC_API_KEY);
  if (id === 'deepseek') return Boolean(env?.DEEPSEEK_API_KEY);
  return false;
}

export function catalogue(env = {}) {
  return CONTENDERS.map(item => ({
    ...item,
    configured: item.kind === 'local' ? true : isConfigured(env, item.id),
    status: item.kind === 'local'
      ? 'Ready now · deterministic local engine'
      : isConfigured(env, item.id) ? 'Key configured; a live call is still required' : 'API key not configured'
  }));
}

/** Judges are deterministic. Only a local rubric judge ships today. */
export const JUDGE = {
  id: 'sj-rubric-v1',
  label: 'SJ Rubric Judge',
  kind: 'deterministic',
  disclaimer: 'A deterministic rubric, not a human reviewer and not a second AI model. It measures structure, specificity, coverage, safety framing and, in code mode, shipped code. Prefer your own vote when it disagrees.'
};

export const RUBRIC = [
  { id: 'structure', label: 'Structure', weight: 20, hint: 'Headings, numbered steps and scannable grouping.' },
  { id: 'specificity', label: 'Specificity', weight: 25, hint: 'Concrete details: numbers, named steps, exact commands or APIs.' },
  { id: 'coverage', label: 'Coverage', weight: 25, hint: 'How much of the actual prompt is addressed.' },
  { id: 'safety', label: 'Honesty & safety', weight: 15, hint: 'Discloses limits instead of inventing facts, providers or actions.' },
  { id: 'code', label: 'Code & artifacts', weight: 15, hint: 'Runnable code, balanced fences and no TODO placeholders (code mode weights this fully).' }
];

const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'you', 'are', 'was', 'were', 'how', 'what', 'why', 'when', 'which', 'can', 'could', 'should', 'would', 'please', 'make', 'made', 'need', 'want', 'give', 'about', 'then', 'than', 'them', 'they', 'have', 'has', 'had', 'but', 'not', 'all', 'any', 'our', 'out', 'use', 'using', 'will', 'just', 'also', 'some', 'more', 'most', 'very', 'each', 'over', 'under', 'between', 'like', 'such']);

export function keywords(text) {
  return [...new Set(String(text || '').toLowerCase().split(/[^a-z0-9+#.]+/).filter(token => token.length > 2 && !STOPWORDS.has(token)))].slice(0, 24);
}

/** Extract fenced code blocks so code battles can show artifacts and previews. */
export function extractArtifacts(text) {
  const source = String(text || '');
  const artifacts = [];
  const fence = /```([A-Za-z0-9+#-]*)\r?\n([\s\S]*?)```/g;
  let match;
  while ((match = fence.exec(source)) !== null) {
    const language = (match[1] || 'text').toLowerCase();
    const code = match[2].replace(/\s+$/, '');
    if (!code.trim()) continue;
    const kind = language === 'html' ? 'preview' : language === 'svg' ? 'image' : language === 'mermaid' ? 'diagram' : 'code';
    artifacts.push({ index: artifacts.length, language, kind, code, bytes: code.length });
  }
  return artifacts.slice(0, 6);
}

/** A judge must never treat "provider not configured" as an answer. */
function isNonAnswer(text) {
  return /not configured|not connected yet|no cloud request was made|no external ai call|could not reach|provider is unavailable|needsprovider/i.test(String(text || '')) && String(text || '').length < 900;
}

function scoreStructure(text) {
  const headings = (text.match(/^#{1,4}\s+/gm) || []).length + (text.match(/^\d+\.\s+/gm) || []).length;
  const bullets = (text.match(/^[-*•]\s+/gm) || []).length;
  const paragraphs = text.split(/\n{2,}/).filter(Boolean).length;
  let score = 0;
  if (headings >= 3) score += 60; else if (headings >= 1) score += 40;
  if (bullets >= 3) score += 25; else if (bullets >= 1) score += 10;
  if (paragraphs >= 2) score += 15;
  return Math.min(100, score);
}

function scoreSpecificity(text) {
  const numbers = (text.match(/\b\d+(?:\.\d+)?%?\b/g) || []).length;
  const commands = (text.match(/`[^`\n]{2,60}`/g) || []).length;
  const properNouns = (text.match(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)?\b/g) || []).length;
  const lengthScore = Math.min(40, Math.round(Math.log2(text.length + 1) * 4));
  return Math.min(100, Math.min(30, numbers * 4) + Math.min(25, commands * 5) + Math.min(15, properNouns) + lengthScore);
}

function scoreCoverage(text, promptKeywords) {
  if (!promptKeywords.length) return 60;
  const haystack = text.toLowerCase();
  const hits = promptKeywords.filter(word => haystack.includes(word)).length;
  return Math.round((hits / promptKeywords.length) * 100);
}

function scoreSafety(text) {
  const honest = /(not (?:a )?claim|disclaimer|assumption|verify|requires?|cannot|can't|no external|not configured|uncertain|limitation)/i.test(text);
  const overclaim = /(guaranteed|100% secure|fully compliant|production[- ]ready out of the box|definitely works)/i.test(text);
  let score = honest ? 85 : 45;
  if (overclaim) score -= 35;
  if (isNonAnswer(text)) score = 0;
  return Math.max(0, Math.min(100, score));
}

function scoreCode(text, mode) {
  const artifacts = extractArtifacts(text);
  const fences = (text.match(/```/g) || []).length;
  const balanced = fences % 2 === 0;
  const todos = (text.match(/\b(TODO|FIXME|HACK|your code here)\b/gi) || []).length;
  let score = 20;
  if (artifacts.length) score += 45;
  if (balanced) score += 15;
  else score -= 25;
  if (artifacts.some(item => item.kind === 'preview')) score += 15;
  score -= Math.min(30, todos * 10);
  if (mode !== 'code' && !artifacts.length) score = Math.max(score, 30);
  return Math.max(0, Math.min(100, score));
}

/**
 * Scores one response. Returns 0-100 plus sub-scores and human-readable notes so
 * a vote that disagrees can point at exactly which dimension is wrong.
 */
export function judgeResponse({ content, prompt, mode = 'text', latencyMs = 0, isLocal = false }) {
  const text = String(content || '');
  if (!text.trim() || isNonAnswer(text)) {
    return {
      score: 0,
      subscores: { structure: 0, specificity: 0, coverage: 0, safety: 0, code: 0 },
      notes: [isNonAnswer(text) ? 'No answer was produced (provider not configured or unreachable).' : 'Empty response.'],
      nonAnswer: true
    };
  }
  const promptKeywords = keywords(prompt);
  const subscores = {
    structure: scoreStructure(text),
    specificity: scoreSpecificity(text),
    coverage: scoreCoverage(text, promptKeywords),
    safety: scoreSafety(text),
    code: scoreCode(text, mode)
  };
  const weights = mode === 'code'
    ? { structure: 15, specificity: 20, coverage: 20, safety: 10, code: 35 }
    : { structure: 20, specificity: 25, coverage: 25, safety: 15, code: 15 };
  const raw = Object.entries(weights).reduce((total, [key, weight]) => total + subscores[key] * weight, 0) / 100;
  // A slightly slower answer is not a worse answer; latency only breaks near-ties.
  const latencyAdjust = latencyMs > 8000 ? -2 : 0;
  const score = Math.max(0, Math.min(100, Math.round(raw + latencyAdjust)));
  const notes = [];
  const strongest = Object.entries(subscores).sort((a, b) => b[1] - a[1])[0];
  const weakest = Object.entries(subscores).sort((a, b) => a[1] - b[1])[0];
  const label = id => RUBRIC.find(item => item.id === id)?.label || id;
  notes.push(`Strongest dimension: ${label(strongest[0])} (${strongest[1]}/100).`);
  notes.push(`Weakest dimension: ${label(weakest[0])} (${weakest[1]}/100).`);
  if (subscores.coverage < 50) notes.push('Several prompt keywords are never addressed.');
  if (mode === 'code' && !extractArtifacts(text).length) notes.push('Code mode: no fenced artifact was produced.');
  if (mode !== 'code' && isLocal) notes.push('Local engine: deterministic template, not a generated model answer.');
  return { score, subscores, notes, nonAnswer: false };
}

/** Expected score for a rating pair (standard Elo). */
export function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Updates two ratings from an outcome for side A: 1 win, 0.5 draw, 0 loss.
 * Returns the deltas so the UI can show "+12 / −12".
 */
export function updateRatings(ratingA, ratingB, outcome, k = K_FACTOR) {
  const expectedA = expectedScore(ratingA, ratingB);
  const delta = Math.round(k * (outcome - expectedA));
  return { a: delta, b: -delta, expectedA };
}

/** Aggregate a battle's responses into a winner when the user does not vote. */
export function judgeVerdict(responses) {
  // "Stored status" is authoritative: a failed or not-configured call is not an
  // answer even if its stored error text could look like prose.
  const scored = responses.map(item => ({
    side: item.side,
    engine: item.engine,
    score: item.status && item.status !== 'ok' ? 0 : (item.score ?? 0),
    nonAnswer: Boolean(item.nonAnswer) || (Boolean(item.status) && item.status !== 'ok')
  }));
  const answered = scored.filter(item => !item.nonAnswer);
  if (answered.length < 2) return { winner: null, reason: 'Fewer than two contenders produced an answer, so the judge withheld a verdict.' };
  const ranked = [...answered].sort((a, b) => b.score - a.score);
  const [best, next] = ranked;
  if (best.score - next.score <= 3) return { winner: 'tie', reason: `Top two scores are within 3 points (${best.score} vs ${next.score}); the judge calls this a tie.` };
  return { winner: best.side, reason: `Highest rubric score: side ${best.side.toUpperCase()} (${best.score}) vs ${next.score}.` };
}

/** Normalises a stored rubric payload for display. */
export function rubricTable() {
  return RUBRIC.map(item => ({ ...item }));
}
