import { localAssistant, PROFILE_IDS } from './assistant-core.mjs';

export async function assistantRoute({ request, env, db, me, url, readBody, reply, audit, consumeRateLimit, onRequest }) {
  const path = url.pathname, method = request.method;
  if (!path.startsWith('/api/assistant/')) return null;
  if (path === '/api/assistant/state' && method === 'GET') {
    const [tasks, notes] = await Promise.all([
      db.query('SELECT id,title,status,due_date AS "dueDate",created_at AS "createdAt" FROM assistant_tasks WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200', [me.id]),
      db.query('SELECT id,content,created_at AS "createdAt" FROM assistant_notes WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100', [me.id])
    ]);
    return reply({ ok: true, tasks, notes, cloudConfigured: Boolean(env.GEMINI_API_KEY || env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY || env.DEEPSEEK_API_KEY), privacy: 'Chat is transient. Only tasks and notes you explicitly confirm are saved.' });
  }
  if (path === '/api/assistant/chat' && method === 'POST') {
    if (!await consumeRateLimit(db, 'assistant-minute', me.id, 30, 2)) return reply({ error: 'Please wait a moment before sending another message.' }, 429, { 'Retry-After': '60' });
    const body = await readBody(request), message = String(body.message || '').trim(), profile = String(body.profile || 'general');
    if (!message || message.length > 10000) return reply({ error: 'Enter a message between 1 and 10,000 characters.' }, 400);
    if (!PROFILE_IDS.includes(profile)) return reply({ error: 'Choose a supported assistant profile.' }, 400);
    const result = localAssistant(message, profile);
    if (body.mode !== 'cloud' || result.action || result.tool || !result.needsProvider && /^(hi|hello|salam|assalam|hey)\b/i.test(message)) return reply(result);
    const provider = String(body.provider || 'gemini');
    const configs = { gemini: env.GEMINI_API_KEY, openai: env.OPENAI_API_KEY, anthropic: env.ANTHROPIC_API_KEY, deepseek: env.DEEPSEEK_API_KEY };
    if (!configs[provider]) return reply({ ...result, cloudError: 'This cloud provider is not configured. The local tool response is shown instead; no cloud request was made.' });
    const headers = new Headers(request.headers); headers.delete('content-length'); headers.set('content-type', 'application/json');
    const target = new URL(request.url); target.pathname = '/api/ai/run';
    const prompt = `You are JalalAi, a careful ${profile} assistant. Be concise, truthful and explicit about uncertainty. Do not claim to access email, devices, accounts or external services. User request:\n${message}`;
    const response = await onRequest({ request: new Request(target, { method: 'POST', headers, body: JSON.stringify({ prompt, provider, agentId: profile === 'critic' || profile === 'planner' ? 'analysis' : profile, privacyMode: true }) }), env });
    const data = await response.json();
    if (!response.ok) return reply({ ...result, cloudError: data.error || 'Cloud AI is unavailable.', mode: 'local-fallback' });
    return reply({ ...data, mode: 'cloud', simulated: false });
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
  if (path === '/api/assistant/tasks' && method === 'GET') return reply({ tasks: await db.query('SELECT id,title,status,due_date AS "dueDate",created_at AS "createdAt" FROM assistant_tasks WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200', [me.id]) });
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
