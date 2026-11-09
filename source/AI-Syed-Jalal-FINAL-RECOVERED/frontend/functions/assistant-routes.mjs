import { localAssistant, proposedAssistantAction, isSimpleGreeting, PROFILE_IDS } from './assistant-core.mjs';
import { providerConfiguration, aggregateProviderConfiguration } from './provider-settings.mjs';
import { AGENT_TOOLS, recordRun, runAgent } from './agent-runtime.mjs';
import { critique, runReview } from './expert-critic.mjs';
import { pageStatus } from './page-inventory.mjs';
import { buildPage, describePage, parseSpec, PALETTES, SECTIONS } from './page-builder.mjs';
import { VOICE_SURFACES } from './voice-surfaces.mjs';
import { answerAll, routePrompt, specialistCatalogue } from './all-in-one.mjs';

// Cloud context is optional and transient. Bound it independently of the UI,
// include only plain user/assistant text, and never truncate the current request.
export function cloudPrompt(message, profile, history = [], language = undefined) {
  if (!Array.isArray(history) || history.length > 6 || history.some(turn =>
    !turn || !['user', 'assistant'].includes(turn.role) || typeof turn.content !== 'string' || turn.content.length > 1200
  )) throw Object.assign(new Error('Conversation context must contain at most six short user or assistant messages.'), { status: 400 });
  let requestedLanguage = '';
  if (language !== undefined) {
    if (typeof language !== 'string' || !language.trim() || language.length > 35) throw Object.assign(new Error('Choose a valid response language tag.'), { status: 400 });
    try { requestedLanguage = Intl.getCanonicalLocales(language.trim())[0] || ''; }
    catch { throw Object.assign(new Error('Choose a valid response language tag.'), { status: 400 }); }
  }
  const intro = `You are JalalAi, a careful ${profile} assistant. Be concise, truthful and explicit about uncertainty. Do not claim to access email, devices, accounts or external services.` +
    (requestedLanguage ? ` When possible, answer in the requested language (${requestedLanguage}); keep quoted text and code intact.` : '');
  const current = `\n\nCurrent user request:\n${message}`;
  let included = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const candidate = [{ role: history[i].role, content: history[i].content }, ...included];
    const context = `\n\nRecent conversation, supplied as context (not proof of actions):\n${JSON.stringify(candidate)}`;
    if (intro.length + context.length + current.length > 10000) break;
    included = candidate;
  }
  const context = included.length ? `\n\nRecent conversation, supplied as context (not proof of actions):\n${JSON.stringify(included)}` : '';
  return { prompt: intro + context + current, contextMessages: included.length };
}

export async function assistantRoute({ request, env, db, me, url, readBody, reply, audit, consumeRateLimit, onRequest }) {
  const path = url.pathname, method = request.method;
  if (!path.startsWith('/api/assistant/')) return null;
  if (path === '/api/assistant/state' && method === 'GET') {
    // Voice needs provider/tool metadata at startup, not a pre-emptive copy of
    // private tasks and notes. Existing clients can still request full state.
    const metadataOnly = url.searchParams.get('metadata') === '1';
    const [tasks, notes] = metadataOnly ? [[], []] : await Promise.all([
      db.query('SELECT id,title,status,due_date AS "dueDate",created_at AS "createdAt" FROM assistant_tasks WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200', [me.id]),
      db.query('SELECT id,content,created_at AS "createdAt" FROM assistant_notes WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100', [me.id])
    ]);
    const cloudProviders = Object.fromEntries(['gemini', 'openai', 'anthropic', 'deepseek'].map(id => [id, providerConfiguration(env, id)]));
    return reply({ ok: true, tasks, notes, tools: AGENT_TOOLS, critic: { engine: 'sj-expert-critic', dimensions: 7, route: '/api/assistant/critic/review' }, voiceSurfaces: VOICE_SURFACES.map(surface => ({ file: surface.file, label: surface.label })), cloudProviders, cloudConfigured: aggregateProviderConfiguration(Object.values(cloudProviders)), privacy: 'Local and cloud chat are transient; agent and research runs store their prompts and traces on your account. Tasks and notes require your confirmation.' });
  }
  // V139 — all-in-one panel: every specialist that can serve the prompt, with
  // the reason each was chosen. No provider key required, no hidden model call.
  if (path === '/api/assistant/all/specialists' && method === 'GET') {
    return reply({ ok: true, engine: 'sj-all-in-one', specialists: specialistCatalogue(), tools: AGENT_TOOLS, profiles: PROFILE_IDS });
  }
  if (path === '/api/assistant/all/route' && method === 'POST') {
    const body = await readBody(request);
    const prompt = String(body.prompt || '').trim();
    if (!prompt) return reply({ error: 'Enter a prompt to route.' }, 400);
    return reply({ ok: true, engine: 'sj-all-in-one', prompt, routed: routePrompt(prompt, 3) });
  }
  if (path === '/api/assistant/all/answer' && method === 'POST') {
    if (!await consumeRateLimit(db, 'assistant-all', me.id, 10, 5)) return reply({ error: 'All-in-one answers are limited to ten per minute.' }, 429, { 'Retry-After': '60' });
    const body = await readBody(request);
    const prompt = String(body.prompt || '').trim();
    if (!prompt) return reply({ error: 'Enter a prompt first.' }, 400);
    if (prompt.length > 4000) return reply({ error: 'Keep the prompt under 4,000 characters.' }, 400);
    const only = Array.isArray(body.only) ? body.only.map(String).slice(0, 4) : null;
    const panel = await answerAll({ prompt, db, me, env, limit: 3, only });
    await audit(db, me, 'ASSISTANT_ALL_IN_ONE', `${panel.counts.specialists} specialist(s): ${panel.routed.map(item => item.id).join(',')}`, request);
    return reply(panel);
  }

  // V141 — page builder. Deterministic output, audited by the same rules Toolbench
  // publishes, so "it built a page" is a downloadable file rather than a claim.
  if (path === '/api/assistant/pagebuilder' && method === 'GET') {
    return reply({
      ok: true, engine: 'sj-page-builder', palettes: Object.entries(PALETTES).map(([id, item]) => ({ id, name: item.name })),
      sections: SECTIONS, note: 'Composes a single-file landing page from known sections. It is not a general code generator and the output is pattern-audited, not proven correct.'
    });
  }
  if (path === '/api/assistant/pagebuilder' && method === 'POST') {
    if (!await consumeRateLimit(db, 'assistant-pagebuilder', me.id, 8, 5)) return reply({ error: 'Page builds are limited to eight per minute.' }, 429, { 'Retry-After': '60' });
    const body = await readBody(request);
    const brief = String(body.brief || '').trim();
    if (brief.length < 3) return reply({ error: 'Describe the page you want in a sentence.' }, 400);
    if (brief.length > 600) return reply({ error: 'Keep the brief under 600 characters.' }, 400);
    // An explicit palette or section list overrides what the brief implied; anything
    // the caller omits stays as parsed, so the UI can show the parse before building.
    const spec = parseSpec(brief);
    if (PALETTES[String(body.palette || '')]) spec.palette = String(body.palette);
    if (Array.isArray(body.sections) && body.sections.length) {
      spec.sections = body.sections.map(String).filter(name => SECTIONS.includes(name));
      if (!spec.sections.includes('footer')) spec.sections.push('footer');
    }
    const result = buildPage(spec);
    await audit(db, me, 'ASSISTANT_PAGE_BUILD', `${result.sections.join('+')} · ${result.bytes} bytes · ${result.audit.findings.length} audit finding(s)`, request);
    return reply({
      ok: true, engine: 'sj-page-builder', html: result.html, bytes: result.bytes,
      sections: result.sections, palette: result.palette, spec: result.spec, audit: result.audit,
      summary: describePage(result), simulated: false,
      limits: [
        'This is a composed landing page from known sections, not bespoke generated code.',
        'It loads nothing external and sends nothing anywhere: no fonts, scripts, images or analytics.',
        'The self-audit is deterministic pattern matching; it cannot prove the page is correct or secure.',
        'Replace the contact section with a real route before publishing — it is a placeholder.'
      ]
    });
  }

  // V138 — expert review. Stored evidence only: every finding cites what it read.
  if (path === '/api/assistant/critic/review' && method === 'POST') {
    if (!await consumeRateLimit(db, 'assistant-critic', me.id, 6, 30)) return reply({ error: 'Reviews are limited to six per minute.' }, 429, { 'Retry-After': '30' });
    const pages = await pageStatus(env);
    let review;
    try { review = await runReview({ db, me, env, pages, runtime: { toolTimeoutMs: 9000 } }); }
    catch { return reply({ ok: false, code: 'CRITIC_EVIDENCE_UNAVAILABLE', error: 'The review could not read its database evidence. Check Audit & Health for missing tables or access problems. No schema changes were made.' }, 503); }
    const id = crypto.randomUUID();
    try {
      await db.query('INSERT INTO expert_reviews(id,user_id,mode,score,verdict,dimensions,findings,counts,duration_ms) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9)',
        [id, me.id, 'full', review.score, review.verdict, JSON.stringify(review.dimensions), JSON.stringify(review.findings), JSON.stringify(review.counts), review.durationMs]);
      review.id = id;
    } catch { review.id = null; }
    await audit(db, me, 'ASSISTANT_EXPERT_REVIEW', `${review.verdict} (${review.score}/100), ${review.findings.length} finding(s)`, request);
    return reply(review);
  }
  if (path === '/api/assistant/critic/reviews' && method === 'GET') {
    const rows = await db.query('SELECT id,score,verdict,counts,created_at AS "createdAt" FROM expert_reviews WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20', [me.id]);
    return reply({ ok: true, reviews: rows, engine: 'sj-expert-critic' });
  }
  if (path === '/api/assistant/critic/review' && method === 'GET') {
    const rows = await db.query('SELECT id,score,verdict,dimensions,findings,counts,duration_ms AS "durationMs",created_at AS "createdAt" FROM expert_reviews WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1', [me.id]);
    return reply(rows.length ? { ok: true, review: rows[0], engine: 'sj-expert-critic' } : { ok: true, review: null, engine: 'sj-expert-critic', note: 'No review has been run on this account yet.' });
  }
  if (path === '/api/assistant/chat' && method === 'POST') {
    if (!await consumeRateLimit(db, 'assistant-minute', me.id, 30, 2)) return reply({ error: 'Please wait a moment before sending another message.' }, 429, { 'Retry-After': '60' });
    const body = await readBody(request), message = String(body.message || '').trim(), profile = String(body.profile || 'general');
    if (!message || message.length > (body.mode === 'cloud' ? 9500 : 10000)) return reply({ error: 'Enter a message between 1 and 10,000 characters (9,500 for cloud mode).' }, 400);
    if (!PROFILE_IDS.includes(profile)) return reply({ error: 'Choose a supported assistant profile.' }, 400);

    // Saving is always an explicit proposal, even when Research is selected.
    if (body.mode === 'research' && proposedAssistantAction(message)) return reply(localAssistant(message, profile));

    // Agent mode: a bounded, multi-step tool run whose trace is stored as evidence.
    if (body.mode === 'agent') {
      if (!await consumeRateLimit(db, 'assistant-agent', me.id, 12, 5)) return reply({ error: 'Agent runs are limited to twelve per minute.' }, 429, { 'Retry-After': '60' });
      const run = await runAgent({ prompt: message, db, me, env, profile });
      // A cancelled task/note proposal must not leave its contents in agent
      // history before the user has explicitly confirmed saving it.
      try { run.id = run.action ? null : await recordRun({ db, me, prompt: message, result: run, surface: 'assistant' }); } catch { run.id = null; }
      await audit(db, me, 'ASSISTANT_AGENT_RUN', `${run.steps.length} step(s), tools: ${run.trace.tools.join(',') || 'none'}`, request);
      return reply(run);
    }

    // Research: a real, attributed Wikipedia lookup rather than an invented answer.
    if (body.mode === 'research' || (body.mode !== 'cloud' && !/^search (?:records|workspace)\b/i.test(message) && /^(?:research|look up|search(?: the web)?(?: for)?)\b/i.test(message))) {
      const run = await runAgent({ prompt: /^(?:research|look up|search)/i.test(message) ? message : `research: ${message}`, db, me, env, profile });
      try { run.id = await recordRun({ db, me, prompt: message, result: run, surface: 'assistant' }); } catch { run.id = null; }
      await audit(db, me, 'ASSISTANT_RESEARCH', 'Wikipedia research run', request);
      return reply(run);
    }

    // V138 — the critic profile reviews this deployment instead of printing a checklist.
    if (profile === 'critic' && !body.mode) {
      if (!await consumeRateLimit(db, 'assistant-critic', me.id, 6, 30)) return reply({ error: 'Reviews are limited to six per minute.' }, 429, { 'Retry-After': '30' });
      const pages = await pageStatus(env);
      let review;
      try { review = await critique({ db, me, env, pages, runtime: { toolTimeoutMs: 9000 } }, message); }
      catch { return reply({ ok: false, code: 'CRITIC_EVIDENCE_UNAVAILABLE', error: 'The review could not read its database evidence. Check Audit & Health for missing tables or access problems. No schema changes were made.' }, 503); }
      await audit(db, me, 'ASSISTANT_EXPERT_REVIEW', `Chat review: ${review.verdict} (${review.score}/100)`, request);
      return reply(review);
    }

    const result = localAssistant(message, profile);
    // The built-in greeting is English. Keep the free local response for an
    // English (or unspecified) language, but let an explicitly selected cloud
    // provider respond in another requested language instead of speaking English
    // with an Urdu or other non-English voice.
    let localGreeting = isSimpleGreeting(message) && body.language === undefined;
    if (isSimpleGreeting(message) && typeof body.language === 'string' && body.language.length <= 35) {
      try { localGreeting = Intl.getCanonicalLocales(body.language.trim())[0]?.split('-')[0] === 'en'; }
      catch { /* cloudPrompt will reject the invalid tag */ }
    }
    if (body.mode !== 'cloud' || result.action || (result.tool && !result.needsProvider) || localGreeting) return reply(result);
    const provider = String(body.provider || 'gemini');
    const configured = providerConfiguration(env, provider);
    if (configured !== true) return reply({ ...result, cloudError: configured === null
      ? 'Stored provider settings could not be read, so this provider’s configuration is unknown. The local tool response is shown instead; no cloud request was made.'
      : 'This cloud provider is not configured. The local tool response is shown instead; no cloud request was made.' });
    const headers = new Headers(request.headers); headers.delete('content-length'); headers.set('content-type', 'application/json');
    const target = new URL(request.url); target.pathname = '/api/ai/run';
    let prepared;
    try { prepared = cloudPrompt(message, profile, body.history ?? [], body.language); }
    catch (error) { return reply({ error: error.message }, error.status || 400); }
    const response = await onRequest({ request: new Request(target, { method: 'POST', headers, body: JSON.stringify({ prompt: prepared.prompt, provider, agentId: profile === 'critic' || profile === 'planner' ? 'analysis' : profile, privacyMode: true }) }), env });
    const data = await response.json();
    if (!response.ok) return reply({ ...result, cloudError: data.error || 'Cloud AI is unavailable.', mode: 'local-fallback' });
    return reply({ ...data, mode: 'cloud', simulated: false, contextMessages: prepared.contextMessages });
  }
  if (path === '/api/assistant/confirm' && method === 'POST') {
    const body = await readBody(request);
    if (body.confirmed !== true) return reply({ error: 'Explicit confirmation is required.' }, 400);
    const action = body.action || {};
    if (action.type === 'create_task') {
      const title = String(action.title || '').trim();
      if (!title || title.length > 500) return reply({ error: 'Task title must be 1–500 characters.' }, 400);
      const rows = await db.query('INSERT INTO assistant_tasks(id,user_id,title) VALUES($1,$2,$3) RETURNING id,title,status', [crypto.randomUUID(), me.id, title]);
      await audit(db, me, 'ASSISTANT_TASK_CREATE', 'User confirmed task creation', request);
      return reply({ ok: true, task: rows[0], output: `Saved task: ${title}` });
    }
    if (action.type === 'create_note') {
      const content = String(action.content || '').trim();
      if (!content || content.length > 4000) return reply({ error: 'Note must be 1–4,000 characters.' }, 400);
      const rows = await db.query('INSERT INTO assistant_notes(id,user_id,content) VALUES($1,$2,$3) RETURNING id,content', [crypto.randomUUID(), me.id, content]);
      await audit(db, me, 'ASSISTANT_NOTE_CREATE', 'User confirmed note creation', request);
      return reply({ ok: true, note: rows[0], output: 'Note saved to your private workspace.' });
    }
    return reply({ error: 'Unsupported action. No external action was executed.' }, 400);
  }
  if (path === '/api/assistant/agent/tools' && method === 'GET') {
    return reply({ ok: true, tools: AGENT_TOOLS, limits: { maxSteps: 7, timeoutMs: 9000, perMinute: 12 }, note: 'These are the only tools that exist, all deterministic. Writes (tasks, notes) always require an explicit confirmation call. The same list is runnable by hand at /toolbench.html.' });
  }
  if (path === '/api/assistant/agent/runs' && method === 'GET') {
    const rows = await db.query('SELECT id,prompt,surface,steps,tools,failures,duration_ms AS "durationMs",needs_provider AS "needsProvider",created_at AS "createdAt" FROM agent_runs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20', [me.id]);
    return reply({ ok: true, total: rows.length, runs: rows });
  }
  const runMatch = path.match(/^\/api\/assistant\/agent\/runs\/([a-f0-9-]{36})$/);
  if (runMatch && method === 'GET') {
    const rows = await db.query('SELECT id,prompt,surface,steps,tools,failures,duration_ms AS "durationMs",needs_provider AS "needsProvider",created_at AS "createdAt" FROM agent_runs WHERE id=$1 AND user_id=$2', [runMatch[1], me.id]);
    if (!rows.length) return reply({ error: 'Agent run not found.' }, 404);
    return reply({ ok: true, run: rows[0] });
  }
  if (path === '/api/assistant/tasks' && method === 'GET') return reply({ tasks: await db.query('SELECT id,title,status,due_date AS "dueDate",created_at AS "createdAt" FROM assistant_tasks WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200', [me.id]) });
  if (path === '/api/assistant/notes' && method === 'GET') return reply({ notes: await db.query('SELECT id,content,created_at AS "createdAt" FROM assistant_notes WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100', [me.id]) });
  const taskMatch = path.match(/^\/api\/assistant\/tasks\/([a-f0-9-]{36})$/);
  if (taskMatch && ['PATCH', 'DELETE'].includes(method)) {
    if (method === 'DELETE') {
      const rows = await db.query('DELETE FROM assistant_tasks WHERE id=$1 AND user_id=$2 RETURNING id', [taskMatch[1], me.id]);
      if (!rows.length) return reply({ error: 'Task not found.' }, 404);
      await audit(db, me, 'ASSISTANT_TASK_DELETE', 'Task deleted by owner', request);
      return reply({ ok: true });
    }
    const body = await readBody(request);
    if (!['open', 'done'].includes(body.status)) return reply({ error: 'Status must be open or done.' }, 400);
    const rows = await db.query('UPDATE assistant_tasks SET status=$3,updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING id,status', [taskMatch[1], me.id, body.status]);
    if (!rows.length) return reply({ error: 'Task not found.' }, 404);
    return reply({ ok: true, task: rows[0] });
  }
  const noteMatch = path.match(/^\/api\/assistant\/notes\/([a-f0-9-]{36})$/);
  if (noteMatch && method === 'DELETE') {
    const rows = await db.query('DELETE FROM assistant_notes WHERE id=$1 AND user_id=$2 RETURNING id', [noteMatch[1], me.id]);
    if (!rows.length) return reply({ error: 'Note not found.' }, 404);
    await audit(db, me, 'ASSISTANT_NOTE_DELETE', 'Note deleted by owner', request);
    return reply({ ok: true });
  }
  return reply({ error: 'Assistant route not found.' }, 404);
}
