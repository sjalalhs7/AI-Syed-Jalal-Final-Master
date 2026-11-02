import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = new URL('../../', import.meta.url).pathname;
const required = [
  'frontend/index.html',
  'frontend/workspace.html',
  'frontend/v120/catalog/index.html',
  'frontend/v120/catalog/app.js',
  'frontend/v120/catalog/styles.css',
  'frontend/v120/modules/personality-core.js',
  'frontend/v120/modules/ux-ui-pro-max.js',
  'frontend/assets/v120-design-tokens.json',
  'docs/v120/AI-ASSISTANT-CONTRACT.md'
];
for (const rel of required) assert.ok(fs.existsSync(path.join(root, rel)), `missing ${rel}`);
const tokens = JSON.parse(fs.readFileSync(path.join(root,'frontend/assets/v120-design-tokens.json'),'utf8'));
assert.deepEqual(tokens.palette, {coral:'#FF6F61',deepBlue:'#0B1F3A',emerald:'#18B981',gold:'#F4C95D'});
const html = fs.readFileSync(path.join(root,'frontend/v120/catalog/index.html'),'utf8');
assert.match(html,/project|catalog/i);
console.log('V120 STAGING PASS: V100 baseline + V120 modules/catalog present');
