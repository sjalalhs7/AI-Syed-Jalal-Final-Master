import assert from 'node:assert/strict';import fs from 'node:fs';
const l=JSON.parse(fs.readFileSync('config/upstream-library-v121.json','utf8'));
assert.equal(l.superpowers_skills.length,15);assert.ok(l.templates.length>=80);
for(const s of l.superpowers_skills)assert.ok(fs.existsSync(s.path),s.path);
assert.ok(fs.existsSync('integrations/upstream/superpowers/LICENSE'));assert.match(l.sources.openemr.status,/NOT MERGED/);
assert.ok(fs.existsSync('THIRD_PARTY_NOTICES.md'));console.log('V121 UPSTREAM PASS: 15 skills, '+l.templates.length+' templates, licenses recorded');
