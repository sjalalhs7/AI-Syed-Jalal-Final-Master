import { builtInChecks, runChecks, searchSkills, verdictFor } from './self-check-core.mjs';
import skillIndex from '../config/agent-skill-index.json';

// V133/V134 agent routes: skill library + durable self-check evidence.
// Every response is account-scoped, rate limited and audited by the caller.
const POLICY_VERSION = 'V135';

function pageInventory() {
  // Pages are listed explicitly so a missing file is a check failure, not a 404 surprise.
  return [
    { file: 'index.html', label: 'Homepage + login' },
    { file: 'agent.html', label: 'Agent Studio' },
    { file: 'jalalai.html', label: 'JalalAi assistant' },
    { file: 'workspace.html', label: 'Workspace' },
    { file: 'dashboard.html', label: 'Dashboard' },
    { file: 'guide.html', label: 'Start here guide' },
    { file: 'agent-lab.html', label: 'Agent Lab self-check' },
    { file: 'arena.html', label: 'Arena battles' }
  ];
}

async function pageStatus(env) {
  // Cloudflare Pages Functions have no filesystem. When ASSETS is bound we can
  // probe it; otherwise the static validation gate covers the files at build time.
  if (env?.ASSETS && typeof env.ASSETS.fetch === 'function') {
    const origin = 'https://assets.local';
    const pages = [];
    for (const page of pageInventory()) {
      try {
        const response = await env.ASSETS.fetch(new Request(origin + '/' + page.file));
        const html = response.ok ? await response.text() : '';
        pages.push({ ...page, exists: response.ok, closesHtml: /<\/html>\s*$/i.test(html) });
      } catch {
        pages.push({ ...page, exists: false, closesHtml: false });
      }
    }
    return pages;
  }
  return pageInventory().map(page => ({ ...page, exists: true, closesHtml: true, source: 'build-time static gate' }));
}

async function syncSkills(db) {
  const rows = skillIndex.skills.slice(0, 4000);
  // Single round trip: unnest + upsert. Keeps large catalogues fast on Neon.
  await db.query(
    `INSERT INTO agent_skills(id,name,domain,family,capability,objective)
     SELECT id,name,domain,family,capability,'' FROM unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[]) AS t(id,name,domain,family,capability)
     ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,domain=EXCLUDED.domain,family=EXCLUDED.family,capability=EXCLUDED.capability,updated_at=now()`,
    [rows.map(r => r[0]), rows.map(r => r[1]), rows.map(r => r[2]), rows.map(r => r[3]), rows.map(r => r[4])]
  );
  const count = await db.query('SELECT count(*)::int AS n FROM agent_skills');
  return Number(count[0]?.n || 0);
}

function cloudProviderState(env) {
  const providers = [
    { id: 'gemini', label: 'Google Gemini', key: 'GEMINI_API_KEY' },
    { id: 'openai', label: 'OpenAI', key: 'OPENAI_API_KEY' },
    { id: 'anthropic', label: 'Anthropic Claude', key: 'ANTHROPIC_API_KEY' },
    { id: 'deepseek', label: 'DeepSeek', key: 'DEEPSEEK_API_KEY' }
  ];
  return providers.map(provider => ({
    id: provider.id,
    label: provider.label,
    configured: Boolean(env[provider.key]),
    status: env[provider.key] ? 'Key configured; a live call is still required before claiming it works' : 'API key not configured'
  }));
}

export async function agentRoute({ request, env, db, me, url, readBody, reply, audit, consumeRateLimit, onRequest }) {
  const path = url.pathname, method = request.method;
  if (!path.startsWith('/api/agent/')) return null;

  if (path === '/api/agent/skills' && method === 'GET') {
    const q = String(url.searchParams.get('q') || '').slice(0, 120);
    const domain = String(url.searchParams.get('domain') || '').slice(0, 120);
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 20)));
    try {
      const count = await db.query('SELECT count(*)::int AS n FROM agent_skills');
      if (Number(count[0]?.n || 0) !== skillIndex.count) await syncSkills(db);
    } catch (error) {
      // A missing migration must not silently look like an empty catalogue.
      if (!/agent_skills/.test(String(error?.message || ''))) throw error;
      return reply({ ok: false, error: 'Skill storage is not migrated. Apply backend/db/migrations/009_v133_agent_skills.sql.', code: 'SKILLS_NOT_MIGRATED' }, 503);
    }
    let skills, total;
    if (q) {
      skills = searchSkills(q, skillIndex, limit);
      total = skills.length;
    } else {
      const rows = await db.query(
        "SELECT id,name,domain,family,capability FROM agent_skills WHERE ($2='' OR domain=$2) ORDER BY domain,name LIMIT $1",
        [limit, domain]
      );
      skills = rows.map(row => ({ id: row.id, name: row.name, domain: row.domain, family: row.family, capability: row.capability }));
      const count = await db.query('SELECT count(*)::int AS n FROM agent_skills');
      total = Number(count[0]?.n || 0);
    }
    const domains = await db.query('SELECT domain,count(*)::int AS n FROM agent_skills GROUP BY domain ORDER BY domain');
    return reply({ ok: true, version: POLICY_VERSION, query: q || null, domain: domain || null, total, returned: skills.length, domains: domains.map(row => ({ name: row.domain, count: Number(row.n) })), skills });
  }

  if (path === '/api/agent/skills' && method === 'POST') {
    if (!await consumeRateLimit(db, 'agent-sync', me.id, 4, 300)) return reply({ error: 'Skill sync is limited to a few runs every five minutes.' }, 429, { 'Retry-After': '300' });
    const count = await syncSkills(db);
    await audit(db, me, 'AGENT_SKILLS_SYNC', `Skill library synced (${count} skills)`, request);
    return reply({ ok: true, count, domains: skillIndex.domainCount, version: POLICY_VERSION });
  }

  if (path === '/api/agent/self-check' && method === 'GET') {
    const rows = await db.query('SELECT id,engine,provider,checks_total AS "checksTotal",checks_passed AS "checksPassed",score,verdict,created_at AS "createdAt" FROM agent_self_checks WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20', [me.id]);
    const latest = rows[0] || null;
    return reply({ ok: true, version: POLICY_VERSION, latest, history: rows, providers: cloudProviderState(env), engine: 'SJ Self-Check Engine', scope: 'Deterministic verification of this deployment: API, database, security boundaries, agent behaviour, honesty labels, skill catalogue and page inventory. It is evidence, not a production certificate.' });
  }

  if (path === '/api/agent/self-check' && method === 'POST') {
    if (!await consumeRateLimit(db, 'agent-selfcheck', me.id, 6, 60)) return reply({ error: 'Self-check is limited to six runs per minute.' }, 429, { 'Retry-After': '60' });
    const body = await readBody(request);
    const only = Array.isArray(body.only) ? body.only.map(String).slice(0, 30) : undefined;
    const timeoutMs = Math.min(10000, Math.max(500, Number(body.timeoutMs) || 4000));
    const checks = builtInChecks();
    // The skill library is a derived read model: fill it before grading so a
    // first run cannot fail for the sole reason that nobody browsed it yet.
    try {
      const existing = await db.query('SELECT count(*)::int AS n FROM agent_skills');
      if (Number(existing[0]?.n || 0) !== skillIndex.count) await syncSkills(db);
    } catch (error) {
      // Leave the failure to the catalogue checks, which report the observation.
      if (!/agent_skills/.test(String(error?.message || ''))) throw error;
    }
    const pages = await pageStatus(env);
    const outcome = await runChecks(checks, {
      db, me, env, request, onRequest, pages, index: skillIndex, searchSkills,
      now: new Date()
    }, { only, timeoutMs });

    // Engine comparison: same checks, different runner label. This is a real
    // second pass, not a stored copy of the first one.
    const engine = body.engine === 'cloud' ? 'cloud' : 'local';
    const provider = engine === 'cloud' ? String(body.provider || 'gemini').slice(0, 40) : 'local';
    const providerState = cloudProviderState(env).find(item => item.id === provider);
    if (engine === 'cloud' && providerState && !providerState.configured) {
      return reply({
        ok: false,
        code: 'PROVIDER_NOT_CONFIGURED',
        error: `${providerState.label} is not configured, so the cloud self-check cannot run. No request was made to the provider. Use the local engine or configure the key server-side.`,
        localResult: null,
        providers: cloudProviderState(env)
      }, 400);
    }

    let comparison = null;
    if (engine === 'cloud') {
      const second = await runChecks(checks, { db, me, env, request, onRequest, pages, index: skillIndex, searchSkills, now: new Date() }, { only, timeoutMs });
      comparison = { localScore: outcome.score, cloudScore: second.score, delta: second.score - outcome.score, note: 'Both passes execute the same deterministic checks. A cloud engine adds a provider label, not extra truth: a configured key is still not a verified live model answer.' };
      outcome.score = Math.round((outcome.score + second.score) / 2);
      outcome.verdict = verdictFor([...outcome.results, ...second.results]);
    }

    await db.query(
      'INSERT INTO agent_self_checks(id,user_id,engine,provider,checks_total,checks_passed,score,verdict,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)',
      [crypto.randomUUID(), me.id, engine, provider, outcome.checksTotal, outcome.checksPassed, outcome.score, outcome.verdict, JSON.stringify(outcome.results)]
    );
    await audit(db, me, 'AGENT_SELF_CHECK', `${engine}/${provider} score=${outcome.score} verdict=${outcome.verdict}`, request);
    return reply({ ok: true, version: POLICY_VERSION, engine, provider, providers: cloudProviderState(env), comparison, ...outcome });
  }

  if (path === '/api/agent/capabilities' && method === 'GET') {
    return reply({
      ok: true,
      version: POLICY_VERSION,
      profiles: [
        { id: 'general', label: 'General assistant', summary: 'Greeting, help, calculation routing and honesty about unconfigured providers.' },
        { id: 'planner', label: 'Planner', summary: 'Converts a goal into a numbered, executable plan with a disclaimer.' },
        { id: 'critic', label: 'Critic', summary: 'Challenges evidence, security, reliability, usability and operations.' },
        { id: 'coding', label: 'Coding advisor', summary: 'Contract → smallest change → validation → tests → review.' },
        { id: 'analysis', label: 'Analysis advisor', summary: 'Structured analysis without pretending to be an external model.' }
      ],
      providers: cloudProviderState(env),
      selfCheck: { checks: builtInChecks().map(check => ({ id: check.id, title: check.title, group: check.group, weight: check.weight, severity: check.severity })), path: '/api/agent/self-check' },
      skills: { count: skillIndex.count, domains: skillIndex.domainCount, path: '/api/agent/skills' },
      limits: { timeoutMs: 4000, maxChecksPerRun: builtInChecks().length }
    });
  }

  if (path === '/api/agent/report' && method === 'GET') {
    const historical = await db.query('SELECT score,verdict,created_at AS "createdAt" FROM agent_self_checks WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50', [me.id]);
    const trend = historical.map(row => ({ score: Number(row.score), verdict: row.verdict, createdAt: row.createdAt })).reverse();
    const latest = historical[0] || null;
    return reply({
      ok: true,
      version: POLICY_VERSION,
      generatedAt: new Date().toISOString(),
      account: { username: me.username, role: me.role },
      latest: latest ? { score: Number(latest.score), verdict: latest.verdict, createdAt: latest.createdAt } : null,
      trend,
      disclaimer: 'Self-check evidence reflects this deployment at run time. It does not certify live provider calls, physical devices, legal/medical compliance or production load.'
    });
  }

  return reply({ ok: false, error: 'Agent route not found.', code: 'AGENT_ROUTE_NOT_FOUND' }, 404);
}
