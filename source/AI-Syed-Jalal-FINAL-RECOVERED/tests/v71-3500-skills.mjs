import fs from 'node:fs';
const p=new URL('../config/ai-skill-registry-v71-3500.json',import.meta.url);
const d=JSON.parse(fs.readFileSync(p,'utf8'));
if(d.count!==3500 || d.skills.length!==3500) throw new Error(`Expected 3500 skills, got ${d.count}/${d.skills.length}`);
if(new Set(d.skills.map(x=>x.id)).size!==3500) throw new Error('Duplicate skill IDs');
if(new Set(d.skills.map(x=>x.domain)).size!==35) throw new Error('Expected 35 domains');
for(const x of d.skills){for(const k of ['id','name','domain','family','objective','inputs','outputs','quality_gates','safety','routing_keywords','verification','failure_policy']) if(!(k in x)) throw new Error(`Missing ${k} in ${x.id}`);}
console.log(`V71 PASS: ${d.count} skills / ${new Set(d.skills.map(x=>x.domain)).size} domains`);
