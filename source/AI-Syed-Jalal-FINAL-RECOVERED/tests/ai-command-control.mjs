import assert from 'node:assert/strict';
import { getAgentInventory } from '../backend/ai-runtime-v44.mjs';
const x=getAgentInventory();
assert.ok(x.executableAgentProfiles>=120);
assert.ok(x.runtime && x.runtime.maxConcurrent>=1);
assert.ok(Array.isArray(x.providers) && x.providers.length>=3);
assert.ok(Array.isArray(x.orchestration) && x.orchestration.includes('guardrails'));
console.log('V45 AI command-control test: PASS');
