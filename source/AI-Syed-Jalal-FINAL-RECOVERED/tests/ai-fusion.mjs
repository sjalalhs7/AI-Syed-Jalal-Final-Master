import assert from 'node:assert/strict';
import { getAgentInventory } from '../backend/ai-runtime.mjs';
const x=getAgentInventory();
assert.equal(x.executableAgentProfiles,120);
assert.equal(x.catalogRoles,120);
assert.ok(x.providers.some(p=>p.id==='deepseek'));
assert.ok(x.providers.some(p=>p.id==='omniroute'));
assert.ok(x.capabilities.includes('DeepSeek tool calling'));
console.log('AI FUSION V43 PASS',JSON.stringify({agents:x.executableAgentProfiles,providers:x.providers.length,capabilities:x.capabilities.length}));
