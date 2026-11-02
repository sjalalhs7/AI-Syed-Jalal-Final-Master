import crypto from 'node:crypto';

const catalogUrl = new URL('../config/ai-agent-catalog-v42.json', import.meta.url);
const catalog = await import(catalogUrl, { with: { type: 'json' } }).then(m => m.default);

const providers = {
  deepseek: {
    label: 'DeepSeek',
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    key: process.env.DEEPSEEK_API_KEY,
    model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro'
  },
  openai: {
    label: 'OpenAI-compatible',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    key: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-5.6'
  },
  omniroute: {
    label: 'OmniRoute',
    baseUrl: process.env.OMNIROUTE_URL || 'http://localhost:20128',
    key: process.env.OMNIROUTE_KEY,
    model: process.env.OMNIROUTE_MODEL || 'auto'
  }
};

const tools = [
  { type: 'function', function: { name: 'get_current_time', description: 'Get the current server time in ISO-8601.', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'list_ai_capabilities', description: 'Return the actual Al-Syed Jalal AI agent, skill, provider and orchestration inventory.', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'get_data_stats', description: 'Return central record counts and data statistics.', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'search_records', description: 'Search central records by a safe free-text query.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Search term.' } }, required: ['query'], additionalProperties: false } } }
];

function inventory() {
  return {
    catalogVersion: catalog.version,
    executableAgentProfiles: catalog.roles.length,
    catalogRoles: catalog.catalog_roles,
    legacyRuntimeAgentRoles: catalog.runtime_agents,
    providers: Object.entries(providers).map(([id,p]) => ({ id, label: p.label, configured: Boolean(p.key || id === 'omniroute' && p.baseUrl), model: p.model, baseUrl: p.baseUrl })),
    orchestration: ['manager', 'handoff', 'agents-as-tools', 'tool-calling', 'guardrails', 'human-approval', 'sessions', 'audit-tracing'],
    capabilities: ['planning','data','compliance','security','documents','analytics','operations','communication','quality','human-approval','recovery','knowledge','DeepSeek tool calling','OpenAI-compatible routing','OmniRoute gateway']
  };
}

function agentById(id) { return catalog.roles.find(a => a.id === id) || catalog.roles[0]; }

function systemPrompt(agent) {
  const skills = Array.isArray(agent.skills) ? agent.skills : [];
  return [
    `You are ${agent.name}, an executable specialist inside Al-Syed Jalal AI.`,
    `Agent group: ${agent.group}.`,
    skills.length ? `Specialist skills: ${skills.join(', ')}.` : '',
    'Work as a tool-using specialist. Be factual, concise and operational.',
    'Never claim a tool was executed if it was not. Never invent database results.',
    'For consequential actions, request human approval rather than silently changing data.',
    'If another specialist is required, state the handoff target explicitly instead of pretending a handoff occurred.'
  ].filter(Boolean).join(' ');
}

async function executeTool(name, args, db) {
  if (name === 'get_current_time') return { now: new Date().toISOString() };
  if (name === 'list_ai_capabilities') return inventory();
  if (name === 'get_data_stats') {
    const q = await db.query("SELECT (SELECT count(*)::int FROM records) AS total_records, (SELECT count(*)::int FROM records WHERE deleted_at IS NULL) AS active_records, (SELECT count(DISTINCT region)::int FROM records WHERE deleted_at IS NULL AND region <> '') AS regions, (SELECT count(DISTINCT sector)::int FROM records WHERE deleted_at IS NULL AND sector <> '') AS sectors");
    return q.rows[0];
  }
  if (name === 'search_records') {
    const q = String(args?.query || '').trim();
    if (!q) return { records: [] };
    const like = `%${q.replace(/[%_]/g, c => '\\' + c)}%`;
    const r = await db.query("SELECT id,name,region,sector,status,notes,updated_at AS \"updatedAt\" FROM records WHERE deleted_at IS NULL AND (name ILIKE $1 OR region ILIKE $1 OR sector ILIKE $1 OR status ILIKE $1 OR notes ILIKE $1) ORDER BY updated_at DESC LIMIT 25", [like]);
    return { records: r.rows };
  }
  throw new Error(`Tool ${name} is not available`);
}

async function callChat(provider, messages, extra={}) {
  const p = providers[provider];
  if (!p) throw new Error(`Unknown provider: ${provider}`);
  if (!p.key) throw new Error(`${p.label} is not configured. Set the corresponding API key/environment variables on the backend.`);
  const url = p.baseUrl.replace(/\/$/, '') + '/chat/completions';
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}` };
  const body = { model: extra.model || p.model, messages, tools, tool_choice: 'auto', temperature: 0.2, max_tokens: Number(extra.maxTokens || 4000) };
  if (provider === 'deepseek' && extra.thinking === true) body.thinking = { type: 'enabled' };
  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(Number(process.env.AI_REQUEST_TIMEOUT_MS || 90000)) });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { throw new Error(`Provider returned non-JSON HTTP ${r.status}`); }
  if (!r.ok) throw new Error(data?.error?.message || `Provider HTTP ${r.status}`);
  return data;
}

export function getAgentInventory() { return { ...inventory(), agents: catalog.roles.map(a => ({ ...a, executable: true, executionModel: 'shared-provider-runtime' })) }; }

export async function runAgent({ agentId, provider='deepseek', model, prompt, thinking=false, db, fallbackProviders=[] }) {
  const agent = agentById(agentId);
  if (!prompt || String(prompt).trim().length < 2) throw new Error('A prompt is required.');
  const requestedProviders = [provider, ...fallbackProviders].filter((v,i,a)=>v && a.indexOf(v)===i);
  const messages = [
    { role: 'system', content: systemPrompt(agent) },
    { role: 'user', content: String(prompt).trim() }
  ];
  const traceId = crypto.randomUUID();
  const toolTrace = [];
  const providerTrace = [];
  let activeProvider = requestedProviders[0] || 'deepseek';
  for (let round=0; round<8; round++) {
    let data;
    let lastError;
    for (const candidate of [activeProvider, ...requestedProviders.filter(p=>p!==activeProvider)]) {
      try {
        data = await callChat(candidate, messages, { model: candidate===activeProvider ? model : undefined, thinking });
        activeProvider = candidate;
        providerTrace.push({ provider: candidate, ok: true, at: new Date().toISOString() });
        break;
      } catch (e) {
        lastError = e;
        providerTrace.push({ provider: candidate, ok: false, error: e.message, at: new Date().toISOString() });
      }
    }
    if (!data) throw lastError || new Error('No AI provider available.');
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('Provider returned no assistant message.');
    messages.push(msg);
    const calls = msg.tool_calls || [];
    if (!calls.length) {
      return {
        traceId, agent, provider: activeProvider,
        model: data.model || model || providers[activeProvider].model,
        output: msg.content || '', toolCalls: toolTrace,
        providerTrace, orchestration: { rounds: round + 1, fallbackUsed: activeProvider !== provider },
        usage: data.usage || null
      };
    }
    for (const call of calls) {
      const name = call.function?.name;
      let args = {};
      try { args = JSON.parse(call.function?.arguments || '{}'); } catch { throw new Error(`Invalid tool arguments for ${name}`); }
      const started = Date.now();
      let result;
      try { result = await executeTool(name, args, db); }
      catch (e) { result = { error: e.message }; }
      toolTrace.push({ name, args, durationMs: Date.now()-started, ok: !result?.error });
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  throw new Error('Agent exceeded the maximum tool-calling rounds.');
}
