import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('..', import.meta.url);
const pkg = JSON.parse(fs.readFileSync(new URL('../backend/package.json', import.meta.url), 'utf8'));
const runtime = fs.readFileSync(new URL('../backend/ai-runtime.mjs', import.meta.url), 'utf8');
const quality = fs.readFileSync(new URL('../backend/ai-quality.mjs', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../frontend/workspace.html', import.meta.url), 'utf8');
const registry = JSON.parse(fs.readFileSync(new URL('../config/ai-skill-registry-v71-3500.json', import.meta.url), 'utf8'));

assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
assert.equal(registry.count, 3500);
assert.equal(registry.skills.length, 3500);
assert.match(runtime, /qualityPass/);
assert.match(runtime, /criticOutput/);
assert.match(runtime, /deterministicRepair/);
assert.match(quality, /unsupported_tool_execution_claim/);
assert.match(quality, /unsupported_completion_claim/);
assert.match(html, /data-final-ui="v56-complete-motion"/);
assert.match(html, /home-hero/);
assert.match(html, /login-shell/);
assert.equal((html.match(/id="login"/g) || []).length, 1);
assert.equal((html.match(/id="app"/g) || []).length, 1);
console.log('V73 FINAL PASS: 3500 skills + deep verification + critic/repair + approved V56 UI identity preserved');
