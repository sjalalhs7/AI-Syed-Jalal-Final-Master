import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFile(join(root, name), 'utf8');
const [workspace, dashboard, homepage] = await Promise.all([
  read('workspace.html'), read('dashboard.html'), read('index.html')
]);

test('workspace does not expose demo login or simulated mission screens', () => {
  for (const marker of ['demoBtn', 'demo://local', 'demoApprovals', 'newMissionBtn',
    'view-missions', 'view-dashboard', 'view-agents', 'view-analytics', 'view-control']) {
    assert.equal(workspace.includes(marker), false, 'unexpected demo/mock UI marker: ' + marker);
  }
});

test('every workspace navigation target has a real view', () => {
  const targets = [...workspace.matchAll(/data-nav="([^"]+)"/g)].map((m) => m[1]);
  const views = new Set([...workspace.matchAll(/id="view-([^"]+)"/g)].map((m) => m[1]));
  assert.ok(targets.length > 0);
  for (const target of targets) assert.ok(views.has(target), 'missing workspace view: ' + target);
});

test('dashboard agent deep links open the actual agent catalogue', () => {
  assert.match(dashboard, /id="v-agents"/);
  assert.match(dashboard, /const requestedView=location\.hash\.slice\(1\)/);
  assert.ok(dashboard.includes('includes(requestedView))view(requestedView)'));
});

test('homepage advertises working tools, not unverified integrations', () => {
  for (const href of ['workspace.html#ai-command', 'dashboard.html#agents',
    'workspace.html#data', 'workspace.html#documents', 'visual-styles.html',
    'roadmaps.html', 'workspace.html#operations']) {
    assert.ok(homepage.includes(href), 'missing working tool link: ' + href);
  }
  for (const marker of ['OmniRoute', 'Omniverse', 'Voice Agent', 'Health Agent',
    'Knowledge Vault', 'Mission Orchestrator', 'OpenGPT Assistant',
    'Automation Agent', 'visual-library.html', 'projects.html']) {
    assert.equal(homepage.includes(marker), false, 'unverified launch remains: ' + marker);
  }
});

test('Viewer AI console does not depend on Admin-only endpoints', () => {
  const start = workspace.indexOf('async function renderAICommand()');
  const end = workspace.indexOf('function loadConnection()', start);
  assert.ok(start >= 0 && end > start);
  const loader = workspace.slice(start, end);
  assert.match(loader, /Promise\.all\(\[api\('\/api\/ai\/capabilities'\),api\('\/api\/ai\/runs\?limit=8'\)\]\)/);
  assert.match(loader, /state\.role==='Admin'/);
  assert.equal(loader.includes("api('/api/admin/ai/provider-health')"), false);
});

test('Dashboard security and audit navigation is restricted to Admin', () => {
  assert.match(dashboard, /currentRole=me\.role/);
  assert.match(dashboard, /secNav\.hidden=me\.role!=='Admin'/);
  assert.match(dashboard, /if\(v==='sec'&&currentRole!=='Admin'\)return/);
  assert.match(dashboard, /Admin only\. This section is hidden for other roles\./);
});

test('Data Vault exports central API records rather than the local IndexedDB store', () => {
  assert.match(workspace, /async function fetchAllCentralRecords\(\)/);
  assert.match(workspace, /api\('\/api\/records\?page='\+page\+'&limit=200'\)/);
  assert.match(workspace, /async function rowsForExport\(\)\{return remoteMode\(\)\?await fetchAllCentralRecords\(\):await all\(STORE\)\}/);
  const exportHandler = workspace.slice(workspace.indexOf("$('#exportBtn').onclick="), workspace.indexOf("$('#backupBtn').onclick="));
  assert.equal(exportHandler.includes('all(STORE)'), false);
});

test('Workspace hides write, backup, and Admin-only controls according to role', () => {
  assert.match(workspace, /const canWrite=\['Admin','Manager','Data Operator'\]\.includes\(state\.role\)/);
  assert.match(workspace, /\$\('#backupBtn'\)\.hidden=state\.role!=='Admin'/);
  assert.match(workspace, /\['operations','users'\]\.includes\(view\)&&state\.role!=='Admin'/);
  assert.equal(workspace.includes('Approval queue'), false);
  assert.equal(workspace.includes('renderApprovals'), false);
});

test('Operations Center labels only metrics the Pages runtime actually exposes', () => {
  assert.ok(workspace.includes('AI runs (24h):'));
  assert.ok(workspace.includes('Edge uptime, database pool connections, queue depth and concurrency are not exposed'));
  assert.ok(workspace.includes('Neon pool statistics and edge process uptime are unavailable'));
  assert.equal(workspace.includes('met.process.uptimeSeconds'), false);
  assert.equal(workspace.includes('snap.pool.total'), false);
});

test('Dashboard runs only configured providers and describes profiles honestly', () => {
  assert.match(dashboard, /Supported text profiles/);
  assert.match(dashboard, /AI Prompt Profiles/);
  assert.match(dashboard, /These are not autonomous agents/);
  assert.ok(dashboard.includes("$('#qgo').disabled=!first;$('#go').disabled=!first;"));
  assert.match(dashboard, /No AI provider key is configured/);
  assert.match(dashboard, /live test required/);
});

test('Connection page cannot locally assign server roles or fake a tenant', () => {
  assert.equal(workspace.includes('id="roleSelect"'), false);
  assert.equal(workspace.includes('id="tenantId"'), false);
  assert.equal(workspace.includes('Role selection is a local UI contract'), false);
  assert.equal(workspace.includes('GitHub Pages remains the static frontend'), false);
  assert.ok(workspace.includes('Account roles are assigned by the server'));
  assert.ok(workspace.includes('Sign in with an account registered in the central database.'));
});

test('Workspace AI run is disabled unless the API reports a configured provider', () => {
  assert.match(workspace, /providerSelect\.innerHTML=providers\.map/);
  assert.match(workspace, /No provider key is configured/);
});

test('All AI actions remain disabled without a configured provider', () => {
  assert.ok(workspace.includes("['#aiRunBtn','#runSupervisorBtn','#runAutoGPTBtn'].forEach(q=>{if($(q))$(q).disabled=true})"));
  assert.ok(workspace.includes("['#aiRunBtn','#runSupervisorBtn','#runAutoGPTBtn'].forEach(q=>{if($(q))$(q).disabled=!selected})"));
});
