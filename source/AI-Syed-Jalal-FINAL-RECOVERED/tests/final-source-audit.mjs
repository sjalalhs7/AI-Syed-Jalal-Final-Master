import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';
const root=path.resolve(new URL('..',import.meta.url).pathname);
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
assert.ok(fs.existsSync(path.join(root,'catalog/index.html'))); assert.ok(fs.existsSync(path.join(root,'catalog/catalog.js'))); assert.ok(fs.existsSync(path.join(root,'catalog/catalog.css')));
assert.match(read('catalog/index.html'),/Beginner|Intermediate|Advanced/i); assert.match(read('catalog/catalog.js'),/goal/); assert.match(read('catalog/catalog.js'),/User stories/);
assert.ok(fs.existsSync(path.join(root,'integrations/local-llm/README.md'))); assert.ok(fs.existsSync(path.join(root,'integrations/ossu/README.md')));
assert.match(read('backend/server.mjs'),/X-CSRF-Token/); assert.match(read('backend/server.mjs'),/CORS_ORIGIN cannot be \* in production/);
for(const f of ['HANDOFF.md','FINAL-AUDIT.md'])assert.ok(fs.existsSync(path.join(root,'docs/final',f)));
console.log('FINAL SOURCE AUDIT PASS: catalog + integration contracts + security markers + handoff present');
