from pathlib import Path
import json
root = Path("source/AI-Syed-Jalal-FINAL-RECOVERED")
assert (root / "backend/server.mjs").is_file()
(root / "backend/knowledge").mkdir(parents=True, exist_ok=True)
(root / "backend/knowledge/wikipedia.mjs").write_text("""const API_URL = 'https://en.wikipedia.org/w/api.php';
const MAX_QUERY_LENGTH = 200;
function stripHtml(value = '') {
  return String(value).replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;|&#39;/g, "'").replace(/\\\\s+/g, ' ').trim();
}
export async function searchWikipedia(query, options = {}) {
  const q = String(query ?? '').trim();
  if (q.length < 2) throw new TypeError('Wikipedia query must contain at least 2 characters.');
  if (q.length > MAX_QUERY_LENGTH) throw new RangeError('Wikipedia query must be 200 characters or fewer.');
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is unavailable in this runtime.');
  const url = new URL(API_URL);
  url.search = new URLSearchParams({ action: 'query', list: 'search', srsearch: q, srlimit: String(Math.min(5, Math.max(1, Number(options.limit) || 5))), format: 'json', formatversion: '2', origin: '*' }).toString();
  const response = await fetchImpl(url, { headers: { Accept: 'application/json', 'User-Agent': 'AI-Syed-Jalal/1.0 (Wikipedia knowledge adapter)' }, signal: AbortSignal.timeout(Math.min(10000, Math.max(1000, Number(options.timeoutMs) || 8000))) });
  if (!response?.ok) throw new Error('Wikipedia API returned HTTP ' + (response?.status ?? 'unknown') + '.');
  const payload = await response.json();
  const hits = Array.isArray(payload?.query?.search) ? payload.query.search : [];
  return { source: 'Wikipedia', attribution: 'Text is from Wikipedia contributors and is available under CC BY-SA; consult the linked page for attribution and license details.', retrievedAt: new Date().toISOString(), query: q, results: hits.map(hit => ({ title: String(hit.title || ''), snippet: stripHtml(hit.snippet || ''), pageId: Number(hit.pageid) || null, url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(String(hit.title || '').replace(/ /g, '_')) })).filter(hit => hit.title && hit.url) };
}
""", encoding="utf-8")
sp = root / "backend/server.mjs"
server = sp.read_text()
if "from './knowledge/wikipedia.mjs'" not in server:
    marker = "import { runSupervisor, runAutoGPT } from './agent-systems/index.mjs';"
    assert marker in server
    server = server.replace(marker, marker + "\nimport { searchWikipedia } from './knowledge/wikipedia.mjs';", 1)
if "/api/knowledge/wikipedia" not in server:
    marker = "  if(u.pathname==='/api/ai/capabilities'&&req.method==='GET')"
    assert marker in server
    route = """  if(u.pathname==='/api/knowledge/wikipedia'&&req.method==='GET'){
    const query=String(u.searchParams.get('q')||'').trim();
    if(query.length<2)return send(res,400,{error:'Query must contain at least 2 characters.'},req);
    if(query.length>200)return send(res,413,{error:'Query must be 200 characters or fewer.'},req);
    try{return send(res,200,await searchWikipedia(query),req)}
    catch(e){return send(res,502,{error:'Wikipedia search is temporarily unavailable. Please retry later.',source:'Wikipedia',retrievedAt:new Date().toISOString()},req)}
  }
"""
    server = server.replace(marker, route + marker, 1)
sp.write_text(server, encoding="utf-8")
rp = root / "backend/ai-runtime.mjs"
runtime = rp.read_text()
if "from './knowledge/wikipedia.mjs'" not in runtime:
    marker = "import { criticOutput, deterministicRepair } from './ai-quality.mjs';"
    assert marker in runtime
    runtime = runtime.replace(marker, marker + "\nimport { searchWikipedia } from './knowledge/wikipedia.mjs';", 1)
if "name: 'search_wikipedia'" not in runtime:
    marker = "const tools = ["
    tool = "  { type: 'function', function: { name: 'search_wikipedia', description: 'Search English Wikipedia for background knowledge; not a primary source for current or medical claims.', parameters: { type: 'object', properties: { query: { type: 'string', minLength: 2, maxLength: 200 }, limit: { type: 'integer', minimum: 1, maximum: 5 } }, required: ['query'], additionalProperties: false } } },\n"
    assert marker in runtime
    runtime = runtime.replace(marker, marker + "\n" + tool, 1)
if "name === 'search_wikipedia'" not in runtime:
    marker = "async function executeTool(name, args, db) {"
    assert marker in runtime, "Cannot locate existing AI tool execution function"
    runtime = runtime.replace(marker, marker + "\n  if (name === 'search_wikipedia') return await searchWikipedia(args?.query, { limit: args?.limit });", 1)
rp.write_text(runtime, encoding="utf-8")
regp = root / "config/v120-feature-registry.json"
reg = json.loads(regp.read_text())
reg.setdefault("features", {})["wikipediaKnowledgeAgent"] = "dedicated-search-adapter-and-ai-tool-added-live-unverified"
note = "Wikipedia adapter has deterministic mocked tests; live Wikimedia connectivity requires deployment E2E."
if note not in reg.setdefault("truthBoundary", []): reg["truthBoundary"].append(note)
regp.write_text(json.dumps(reg, indent=2) + "\n", encoding="utf-8")
pp = root / "backend/package.json"
pkg = json.loads(pp.read_text())
scripts = pkg.setdefault("scripts", {})
scripts["wikipedia-adapter"] = "node ../tests/wikipedia-adapter.mjs"
scripts["capability-contracts"] = "node ../tests/agent-capability-contracts.mjs"
rel = scripts.get("test:release", "")
for c in ["npm run wikipedia-adapter", "npm run capability-contracts"]:
    if c not in rel: rel += " && " + c
scripts["test:release"] = rel
pp.write_text(json.dumps(pkg, indent=2) + "\n", encoding="utf-8")
(root / "tests/wikipedia-adapter.mjs").write_text("""import assert from 'node:assert/strict';
import { searchWikipedia } from '../backend/knowledge/wikipedia.mjs';
let requested;
const fakeFetch = async (url, options) => ({ ok: true, status: 200, async json() { requested = { url: new URL(url), options }; return { query: { search: [{ pageid: 42, title: 'Artificial intelligence', snippet: 'A <span class="searchmatch">field</span> of study &amp; research.' }, { pageid: 7, title: 'Machine learning', snippet: 'A branch of AI.' }] } }; } });
const result = await searchWikipedia(' artificial intelligence ', { fetchImpl: fakeFetch, limit: 2 });
assert.equal(result.source, 'Wikipedia'); assert.equal(result.query, 'artificial intelligence'); assert.equal(result.results.length, 2); assert.equal(result.results[0].pageId, 42); assert.equal(result.results[0].snippet, 'A field of study & research.'); assert.equal(result.results[0].url, 'https://en.wikipedia.org/wiki/Artificial_intelligence'); assert.match(result.attribution, /Wikipedia contributors/); assert.ok(Number.isFinite(Date.parse(result.retrievedAt))); assert.equal(requested.url.searchParams.get('srsearch'), 'artificial intelligence'); assert.equal(requested.url.searchParams.get('srlimit'), '2'); assert.match(requested.options.headers['User-Agent'], /AI-Syed-Jalal/);
await assert.rejects(() => searchWikipedia('x', { fetchImpl: fakeFetch }), /at least 2/); await assert.rejects(() => searchWikipedia('x'.repeat(201), { fetchImpl: fakeFetch }), /200 characters/); await assert.rejects(() => searchWikipedia('network test', { fetchImpl: async () => ({ ok: false, status: 503 }) }), /HTTP 503/);
console.log('WIKIPEDIA ADAPTER PASS');
""", encoding="utf-8")
(root / "tests/agent-capability-contracts.mjs").write_text("""import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../',import.meta.url).pathname;
const registry=JSON.parse(fs.readFileSync(root+'config/v120-feature-registry.json','utf8'));
const server=fs.readFileSync(root+'backend/server.mjs','utf8');
const workspace=fs.readFileSync(root+'frontend/workspace.html','utf8');
const dashboard=fs.readFileSync(root+'frontend/dashboard.html','utf8');
assert.match(server,/\\/api\\/ai\\/supervisor/); assert.match(server,/\\/api\\/ai\\/autogpt/); assert.match(server,/csrfValid\\(req\\)/);
assert.match(workspace,/id="supervisorGoal"/); assert.match(workspace,/id="runSupervisorBtn"/); assert.match(workspace,/id="autogptGoal"/); assert.match(workspace,/id="runAutoGPTBtn"/); assert.match(dashboard,/roadmaps\\.html/);
assert.equal(registry.features.googleAiStudioGemini,'provider-adapter-present-live-unverified'); assert.equal(registry.features.wikipediaKnowledgeAgent,'dedicated-search-adapter-and-ai-tool-added-live-unverified'); assert.match(server,/\\/api\\/knowledge\\/wikipedia/);
const runtime=fs.readFileSync(root+'backend/ai-runtime.mjs','utf8'); assert.match(runtime,/name: 'search_wikipedia'/); assert.match(runtime,/searchWikipedia\\(args\\?\\.query/);
assert.equal(registry.features.healthMedicineAgent,'role-reference-only-safety-gates-required'); assert.equal(registry.features.professionalVoiceAssistant,'environment-dependent-not-e2e-verified');
console.log('AGENT CAPABILITY CONTRACTS PASS');
""", encoding="utf-8")
(root / "integrations/wikipedia").mkdir(parents=True, exist_ok=True)
(root / "integrations/wikipedia/README.md").write_text("# Wikipedia Knowledge Adapter\n\nAuthenticated API: GET /api/knowledge/wikipedia?q=...\n\nAI tool: search_wikipedia. Queries are bounded to 2–200 characters, results include attribution and retrieval time, and requests have an eight-second default timeout. Wikipedia is a background/discovery source, not a primary source for current events or clinical guidance. Live connectivity must be verified after deployment.\n\nOffline test: node tests/wikipedia-adapter.mjs.\n", encoding="utf-8")
(root / "docs/RECOVERY-UPDATE-2026-10-11.md").write_text("# Recovery Master Update — 2026-10-11\n\nThis additive sync adds the bounded Wikipedia adapter, authenticated API route, AI tool contract, deterministic tests, package scripts, and feature-registry truth state to the extracted source branch.\n\nOffline tests do not prove live Wikimedia, provider, PostgreSQL, browser/mobile, voice/camera, or production deployment. The locked Login/Homepage/Logo baseline is preserved.\n", encoding="utf-8")
print("SYNC PATCH APPLIED")
