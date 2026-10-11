import crypto from 'node:crypto';
import { criticOutput, deterministicRepair } from './ai-quality.mjs';
import { searchWikipedia } from './knowledge/wikipedia.mjs';

const catalogUrl = new URL('../config/ai-agent-catalog-v42.json', import.meta.url);
const skillUrl = new URL('../config/ai-skill-registry-v71-3500.json', import.meta.url);
const agencyUrl = new URL('../config/agency/agency-agent-registry-v75.json', import.meta.url);
const agencyToolUrl = new URL('../config/agency/agency-tool-catalog-v75.json', import.meta.url);
const catalog = await import(catalogUrl, { with: { type: 'json' } }).then(m => m.default);
const skillRegistry = await import(skillUrl, { with: { type: 'json' } }).then(m => m.default);
const agencyRegistry = await import(agencyUrl, { with: { type: 'json' } }).then(m => m.default);
const agencyToolCatalog = await import(agencyToolUrl, { with: { type: 'json' } }).then(m => m.default);

const providers = {
  gemini: {
    label: 'Google Gemini / AI Studio',
    baseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
    key: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || 'gemini-3.8-flash'
  },
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
  { type: 'function', function: { name: 'search_wikipedia', description: 'Search English Wikipedia for background knowledge; not a primary source for current or medical claims.', parameters: { type: 'object', properties: { query: { type: 'string', minLength: 2, maxLength: 200 }, limit: { type: 'integer', minimum: 1, maximum: 5 } }, required: ['query'], additionalProperties: false } } },

  { type: 'function', function: { name: 'search_ai_skills', description: 'Search the 3,500-skill expert capability registry and return matching skill specifications.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Skill, domain or capability search terms.' }, limit: { type: 'integer', minimum: 1, maximum: 50 } }, required: ['query'], additionalProperties: false } } },
  { type: 'function', function: { name: 'search_agency_agents', description: 'Search imported Agency specialist capability profiles. These profiles are references; execution still requires a configured runtime.', parameters: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 25 } }, required: ['query'], additionalProperties: false } } },
  { type: 'function', function: { name: 'get_current_time', description: 'Get the current server time in ISO-8601.', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'list_ai_capabilities', description: 'Return the actual Al-Syed Jalal AI agent, skill, provider and orchestration inventory.', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'get_data_stats', description: 'Return central record counts and data statistics.', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'search_records', description: 'Search central records by a safe free-text query.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Search term.' } }, required: ['query'], additionalProperties: false } } }
];

function inventory() {
  return {
    catalogVersion: catalog.version,
    executableAgentProfiles: catalog.roles.length,
    importedAgencyProfiles: agencyRegistry.count,
    agencyToolTargets: agencyToolCatalog.count,
    skillRegistry: { version: skillRegistry.version, totalSkills: skillRegistry.count, domainCount: skillRegistry.domain_count },
    agencyLayer: { version: agencyRegistry.version, profiles: agencyRegistry.count, toolTargets: agencyToolCatalog.count, execution: 'prompt-profile references; configured runtime required' },
    catalogRoles: catalog.catalog_roles,
    legacyRuntimeAgentRoles: catalog.runtime_agents,
    providers: Object.entries(providers).map(([id,p]) => ({ id, label: p.label, configured: Boolean(p.key || id === 'omniroute' && p.baseUrl), model: p.model, baseUrl: p.baseUrl })),
    orchestration: ['manager', 'handoff', 'agents-as-tools', 'tool-calling', 'guardrails', 'human-approval', 'sessions', 'audit-tracing'],
    capabilities: ['3500 expert skill registry','skill search and routing','planning','data','compliance','security','documents','analytics','operations','communication','quality','human-approval','recovery','knowledge','DeepSeek tool calling','OpenAI-compatible routing','OmniRoute gateway','Google Gemini / AI Studio','Gemini Interactions API','Google Search grounding']
  };
}

function agentById(id) { return catalog.roles.find(a => a.id === id) || catalog.roles[0]; }

function findAgencyAgents(query, limit=10) {
  const q = String(query || '').trim().toLowerCase();
  const safeLimit = Math.min(25, Math.max(1, Number(limit) || 10));
  if (!q) return agencyRegistry.agents.slice(0, safeLimit);
  const terms = q.split(/\s+/).filter(Boolean);
  return agencyRegistry.agents.map(x => {
    const fields = [x.name,x.description,x.domain,x.personality,...(x.keywords||[])].map(v=>String(v||'').toLowerCase());
    let score=0; for (const term of terms) { if (fields[0]?.includes(term)) score+=8; if (fields[1]?.includes(term)) score+=5; if (fields[2]?.includes(term)) score+=4; if (fields.slice(3).some(v=>v.includes(term))) score+=2; }
    return {x,score};
  }).filter(v=>v.score>0).sort((a,b)=>b.score-a.score||a.x.id.localeCompare(b.x.id)).slice(0,safeLimit).map(v=>({...v.x,routingScore:v.score}));
}

function findSkills(query, limit=20) {
  const q = String(query || '').trim().toLowerCase();
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  if (!q) return skillRegistry.skills.slice(0, safeLimit);
  const terms = q.split(/\s+/).filter(Boolean);
  return skillRegistry.skills.map(x => {
    const fields = [x.name, x.domain, x.family, x.objective, ...(x.routing_keywords || [])].map(v => String(v || '').toLowerCase());
    let score = 0;
    for (const term of terms) {
      if (fields[0]?.includes(term)) score += 8;
      if (fields[1]?.includes(term)) score += 5;
      if (fields[2]?.includes(term)) score += 4;
      if (fields.slice(3).some(v => v.includes(term))) score += 3;
    }
    if (x.quality_gates?.length) score += 1;
    if (x.verification?.length) score += 1;
    return { x, score };
  }).filter(v => v.score > 0).sort((a,b) => b.score - a.score || a.x.id.localeCompare(b.x.id)).slice(0, safeLimit).map(v => ({ ...v.x, routingScore: v.score }));
}

function verifyOutput(output, selectedSkills=[], toolTrace=[]) {
  const text = String(output || '').trim();
  const issues = [];
  if (text.length < 2) issues.push('empty_or_too_short_output');
  if (/I (?:used|ran|executed|checked|verified) (?:a )?(?:tool|database|search)/i.test(text) && toolTrace.length === 0) issues.push('unsupported_tool_execution_claim');
  if (/^(done|completed|successfully completed)\.?$/i.test(text)) issues.push('unsupported_completion_claim');
  const gates = selectedSkills.flatMap(s => Array.isArray(s.quality_gates) ? s.quality_gates : []);
  const verificationPolicies = selectedSkills.flatMap(s => Array.isArray(s.verification) ? s.verification : []);
  const critic = criticOutput(text, selectedSkills, toolTrace);
  return {
    passed: issues.length === 0 && critic.passed,
    issues: [...issues, ...critic.findings.map(x => x.code).filter(x => !issues.includes(x))],
    selectedSkillCount: selectedSkills.length,
    qualityGateCount: gates.length,
    verificationPolicyCount: verificationPolicies.length,
    toolCallCount: toolTrace.length,
    critic
  };
}

function qualityPass(output, selectedSkills, toolTrace) {
  const initial = verifyOutput(output, selectedSkills, toolTrace);
  if (initial.passed) return { output, verification: initial, repaired: false, repairCount: 0 };
  const repairedOutput = deterministicRepair(output, initial.critic);
  const repaired = verifyOutput(repairedOutput, selectedSkills, toolTrace);
  return { output: repairedOutput, verification: repaired, repaired: repairedOutput !== output, repairCount: repairedOutput !== output ? 1 : 0, initialVerification: initial };
}

function systemPrompt(agent, prompt='') {
  const skills = Array.isArray(agent.skills) ? agent.skills : [];
  const matched = findSkills(prompt, 8);
  const matchedSummary = matched.map(x => `${x.id}: ${x.name} [${x.domain} / ${x.family}] score=${x.routingScore}`).join('; ');
  const qualitySummary = matched.flatMap(x => (x.quality_gates || []).slice(0,2)).join('; ');
  const verificationSummary = matched.flatMap(x => (x.verification || []).slice(0,2)).join('; ');
  return [
    `You are ${agent.name}, an executable specialist inside Al-Syed Jalal AI.`,
    `Agent group: ${agent.group}.`,
    skills.length ? `Specialist skills: ${skills.join(', ')}.` : '',
    matchedSummary ? `Dynamically selected expert skills from the 3,500-skill registry: ${matchedSummary}.` : '',
    agencyMatched.length ? `Imported Agency specialist references: ${agencyMatched.map(x=>x.name+' ['+x.domain+'] score='+x.routingScore).join('; ')}.` : '',
    qualitySummary ? `Relevant quality gates: ${qualitySummary}.` : '',
    verificationSummary ? `Relevant verification policies: ${verificationSummary}.` : '',
    'Use the selected skills only when relevant. Apply their quality gates, verification policy and failure policy.',
    'Before final delivery, check the result for factual support, task completion, tool-use honesty, and unresolved uncertainty.',
    'Work as a tool-using specialist. Be factual, concise and operational.',
    'Never claim a tool was executed if it was not. Never invent database results.',
    'For consequential actions, request human approval rather than silently changing data.',
    'If another specialist is required, state the handoff target explicitly instead of pretending a handoff occurred.'
  ].filter(Boolean).join(' ');
}

async function executeTool(name, args, db) {
  if (name === 'search_wikipedia') return await searchWikipedia(args?.query, { limit: args?.limit });
  if (name === 'get_current_time') return { now: new Date().toISOString() };
  if (name === 'list_ai_capabilities') return inventory();
  if (name === 'search_ai_skills') return { totalSkills: skillRegistry.count, results: findSkills(args?.query, Math.min(50, Math.max(1, Number(args?.limit || 20)))) };
  if (name === 'search_agency_agents') return { totalProfiles: agencyRegistry.count, results: findAgencyAgents(args?.query, Math.min(25, Math.max(1, Number(args?.limit || 10)))) };
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

function geminiTools() {
  const custom = tools.map(t => ({
    type: 'function',
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters
  }));
  if (String(process.env.GEMINI_ENABLE_GOOGLE_SEARCH || '').toLowerCase() === 'true') custom.push({ type: 'google_search', search_types: ['web_search'] });
  return custom;
}

function geminiText(interaction) {
  for (const step of interaction?.steps || []) {
    if (step?.type === 'model_output') {
      const text = (step.content || []).filter(x => x?.type === 'text').map(x => x.text || '').join('');
      if (text) return text;
    }
  }
  return interaction?.output_text || '';
}

async function callGemini(messages, extra={}) {
  const p = providers.gemini;
  if (!p.key) throw new Error('Google Gemini / AI Studio is not configured. Set GEMINI_API_KEY on the backend.');
  const system = messages.find(m => m.role === 'system')?.content || '';
  const user = [...messages].reverse().find(m => m.role === 'user')?.content || '';
  const url = p.baseUrl.replace(/\/$/, '') + '/interactions';
  const body = {
    model: extra.model || p.model,
    input: String(user),
    system_instruction: String(system),
    tools: geminiTools(),
    store: false,
    generation_config: {
      thinking_level: extra.thinking ? 'high' : 'medium',
      thinking_summaries: 'none',
      max_output_tokens: Number(extra.maxTokens || 4000)
    }
  };
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': p.key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Number(process.env.AI_REQUEST_TIMEOUT_MS || 90000))
  });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { throw new Error(`Gemini returned non-JSON HTTP ${r.status}`); }
  if (!r.ok) throw new Error(data?.error?.message || `Gemini HTTP ${r.status}`);
  return data;
}

async function callGeminiWithResults(messages, extra={}) {
  const p = providers.gemini;
  if (!p.key) throw new Error('Google Gemini / AI Studio is not configured. Set GEMINI_API_KEY on the backend.');
  const system = messages.find(m => m.role === 'system')?.content || '';
  const toolMessages = messages.filter(m => m.role === 'tool');
  const last = messages[messages.length - 1];
  const input = toolMessages.length ? toolMessages.map(m => ({ type: 'function_result', name: m.name, call_id: m.tool_call_id, result: [{ type: 'text', text: m.content }] })) : String(last?.content || '');
  const url = p.baseUrl.replace(/\/$/, '') + '/interactions';
  const body = {
    model: extra.model || p.model,
    input,
    system_instruction: String(system),
    tools: geminiTools(),
    store: false,
    generation_config: { thinking_level: extra.thinking ? 'high' : 'medium', thinking_summaries: 'none', max_output_tokens: Number(extra.maxTokens || 4000) }
  };
  if (extra.previousInteractionId) body.previous_interaction_id = extra.previousInteractionId;
  const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json','x-goog-api-key':p.key}, body:JSON.stringify(body), signal:AbortSignal.timeout(Number(process.env.AI_REQUEST_TIMEOUT_MS||90000)) });
  const text = await r.text(); let data; try { data=JSON.parse(text); } catch { throw new Error(`Gemini returned non-JSON HTTP ${r.status}`); }
  if(!r.ok) throw new Error(data?.error?.message || `Gemini HTTP ${r.status}`);
  return data;
}

async function callChat(provider, messages, extra={}) {
  if (provider === 'gemini') return callGemini(messages, extra);
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

function getAgentInventoryCore() { return { ...inventory(), agents: catalog.roles.map(a => ({ ...a, executable: true, executionModel: 'shared-provider-runtime' })) }; }

async function runAgentCore({ agentId, provider='deepseek', model, prompt, thinking=false, db, fallbackProviders=[] }) {
  const agent = agentById(agentId);
  if (!prompt || String(prompt).trim().length < 2) throw new Error('A prompt is required.');
  const requestedProviders = [provider, ...fallbackProviders].filter((v,i,a)=>v && a.indexOf(v)===i);
  const messages = [
    { role: 'system', content: systemPrompt(agent, prompt) },
    { role: 'user', content: String(prompt).trim() }
  ];
  const traceId = crypto.randomUUID();
  const toolTrace = [];
  const providerTrace = [];
  let activeProvider = requestedProviders[0] || 'deepseek';
  let geminiInteractionId = null;
  for (let round=0; round<8; round++) {
    let data;
    let lastError;
    for (const candidate of [activeProvider, ...requestedProviders.filter(p=>p!==activeProvider)]) {
      try {
        if (candidate === 'gemini') {
          if (!geminiInteractionId) data = await callGemini(messages, { model: candidate===activeProvider ? model : undefined, thinking, maxTokens: 4000 });
          else data = await callGeminiWithResults(messages, { model: candidate===activeProvider ? model : undefined, thinking, maxTokens: 4000, previousInteractionId: geminiInteractionId });
          geminiInteractionId = data.id || geminiInteractionId;
        } else {
          data = await callChat(candidate, messages, { model: candidate===activeProvider ? model : undefined, thinking });
        }
        activeProvider = candidate;
        providerTrace.push({ provider: candidate, ok: true, at: new Date().toISOString() });
        break;
      } catch (e) {
        lastError = e;
        providerTrace.push({ provider: candidate, ok: false, error: e.message, at: new Date().toISOString() });
      }
    }
    if (!data) throw lastError || new Error('No AI provider available.');
    if (activeProvider === 'gemini') {
      const functionSteps = (data.steps || []).filter(s => s?.type === 'function_call');
      const output = geminiText(data);
      if (!functionSteps.length) {
        const selectedSkills = findSkills(prompt, 8);
        const quality = qualityPass(output, selectedSkills, toolTrace);
        return { traceId, agent, selectedSkills, provider: activeProvider, model: data.model || model || providers.gemini.model, output: quality.output, toolCalls: toolTrace, providerTrace, verification: quality.verification, quality: { repaired: quality.repaired, repairCount: quality.repairCount, initialVerification: quality.initialVerification || null }, orchestration: { rounds: round + 1, fallbackUsed: activeProvider !== provider }, usage: data.usage || null, geminiInteractionId: data.id || null };
      }
      for (const step of functionSteps) {
        const name = step.name;
        const args = step.arguments || {};
        const started = Date.now();
        let result;
        try { result = await executeTool(name, args, db); } catch (e) { result = { error: e.message }; }
        toolTrace.push({ name, args, durationMs: Date.now()-started, ok: !result?.error });
        messages.push({ role: 'tool', name, tool_call_id: step.id, content: JSON.stringify(result) });
      }
      continue;
    }
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('Provider returned no assistant message.');
    messages.push(msg);
    const calls = msg.tool_calls || [];
    if (!calls.length) {
      const output = msg.content || '';
      const selectedSkills = findSkills(prompt, 8);
      const quality = qualityPass(output, selectedSkills, toolTrace);
      return {
        traceId, agent, selectedSkills, provider: activeProvider,
        model: data.model || model || providers[activeProvider].model,
        output: quality.output, toolCalls: toolTrace, verification: quality.verification,
        quality: { repaired: quality.repaired, repairCount: quality.repairCount, initialVerification: quality.initialVerification || null },
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


// V52 active runtime: consolidated queue, concurrency and provider-circuit controls.
const maxConcurrent = Math.max(1, Number(process.env.AI_MAX_CONCURRENT || 8));
const queueLimit = Math.max(1, Number(process.env.AI_QUEUE_LIMIT || 32));
const failureThreshold = Math.max(1, Number(process.env.AI_PROVIDER_FAILURE_THRESHOLD || 3));
const cooldownMs = Math.max(1000, Number(process.env.AI_PROVIDER_COOLDOWN_MS || 30000));
let active = 0;
let queued = 0;
const failures = new Map();
const blockedUntil = new Map();

function providerCircuitState() {
  const x = getAgentInventoryCore();
  return Object.fromEntries(x.providers.map(p => [p.id, {
    failures: failures.get(p.id) || 0,
    blockedUntil: blockedUntil.get(p.id) || 0,
    open: (blockedUntil.get(p.id) || 0) > Date.now()
  }]));
}

export function getAgentInventory() {
  const x = getAgentInventoryCore();
  return {
    ...x,
    runtime: {
      maxConcurrent,
      active,
      queueLimit,
      queued,
      providers: providerCircuitState()
    }
  };
}

async function acquire(provider) {
  if (queued >= queueLimit) throw new Error('AI runtime queue limit reached; retry shortly.');
  const until = blockedUntil.get(provider) || 0;
  if (until > Date.now()) throw new Error(`Provider ${provider} circuit is temporarily open.`);
  if (active >= maxConcurrent) throw new Error('AI runtime concurrency limit reached; retry shortly.');
  queued++;
  active++;
}

function release() {
  active = Math.max(0, active - 1);
  queued = Math.max(0, queued - 1);
}

function record(provider, ok) {
  const n = failures.get(provider) || 0;
  if (ok) {
    failures.set(provider, 0);
    blockedUntil.delete(provider);
    return;
  }
  const next = n + 1;
  failures.set(provider, next);
  if (next >= failureThreshold) blockedUntil.set(provider, Date.now() + cooldownMs);
}

export async function runAgent(opts) {
  const provider = opts?.provider || 'deepseek';
  await acquire(provider);
  try {
    const result = await runAgentCore(opts);
    record(result.provider || provider, true);
    return {
      ...result,
      runtime: { maxConcurrent, activeAfterRun: Math.max(0, active - 1), queueLimit }
    };
  } catch (error) {
    record(provider, false);
    throw error;
  } finally {
    release();
  }
}

export const runAgentV47 = runAgent;
export const runAgentV46 = runAgent;
export const runAgentV44 = runAgent;

// Historical V47/V48 lineage marker: ai-runtime-v47.mjs was an earlier layered runtime; V52 uses this consolidated active runtime.
