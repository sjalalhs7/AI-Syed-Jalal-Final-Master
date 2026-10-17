import assert from 'node:assert/strict'; import fs from 'node:fs';
const root=new URL('../',import.meta.url).pathname;
const d=JSON.parse(fs.readFileSync(root+'frontend/assets/roadmaps.json','utf8'));
const go=d.roadmaps.find(r=>r.id==='go'), sk=d.roadmaps.find(r=>r.id==='skills');
assert.equal(go.stages.length,15); assert.equal(go.projects.length,7); assert.equal(go.tools.length,10); assert.equal(go.careers.length,7); assert.equal(sk.stages.length,8);
for(const r of d.roadmaps) for(const s of r.stages){assert.ok(s.title&&s.topics.length&&s.goal)}
assert.ok(fs.existsSync(root+'frontend/roadmaps.html')); assert.match(fs.readFileSync(root+'frontend/dashboard.html','utf8'),/roadmaps\.html/);
assert.ok(fs.existsSync(root+'docs/REQUIREMENTS-V124.md'));
console.log('V124 ROADMAPS PASS: Go 15 stages, skills 8 groups, page + menu link + requirements register');
