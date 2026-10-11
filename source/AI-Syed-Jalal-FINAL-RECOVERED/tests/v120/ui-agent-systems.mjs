import assert from 'node:assert/strict'; import fs from 'node:fs';
const root=new URL('../../',import.meta.url).pathname; const html=fs.readFileSync(root+'frontend/workspace.html','utf8'); const server=fs.readFileSync(root+'backend/server.mjs','utf8');
assert.match(html,/id="supervisorGoal"/); assert.match(html,/runSupervisorBtn/); assert.match(html,/runAutoGPTBtn/); assert.match(server,/\/api\/ai\/supervisor/); assert.match(server,/\/api\/ai\/autogpt/);
console.log('V120 AGENT SYSTEM UI/API CONTRACT PASS');
