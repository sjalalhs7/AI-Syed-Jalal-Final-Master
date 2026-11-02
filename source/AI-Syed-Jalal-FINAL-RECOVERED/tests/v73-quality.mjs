import assert from 'node:assert/strict';
import fs from 'node:fs';
import { criticOutput, deterministicRepair } from '../backend/ai-quality.mjs';

const runtime = fs.readFileSync(new URL('../backend/ai-runtime.mjs', import.meta.url), 'utf8');
assert.match(runtime, /criticOutput/);
assert.match(runtime, /deterministicRepair/);
assert.match(runtime, /qualityPass/);

const bad = criticOutput('I executed a tool and checked the database.', [], []);
assert.equal(bad.passed, false);
assert.ok(bad.findings.some(x => x.code === 'unsupported_tool_execution_claim'));
const repaired = deterministicRepair('I executed a tool and checked the database.', bad);
assert.match(repaired, /did not execute or verify/i);
const good = criticOutput('The analysis is complete and the limitations are stated.', [], []);
assert.equal(good.findings.some(x => x.severity === 'high'), false);
console.log('V73 PASS: deterministic critic + bounded auto-repair markers and behavior verified');
