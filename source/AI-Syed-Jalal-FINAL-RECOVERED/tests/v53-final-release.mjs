import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const exists=f=>fs.existsSync(path.join(root,f));

for(const f of ['frontend/index.html','frontend/index.html.js','frontend/manifest.webmanifest','frontend/robots.txt','frontend/sitemap.xml','frontend/updates.xml','frontend/llms.txt','README-V53-FINAL.md','DISCOVERY-SEO-GROWTH-V53.md','V53-FINAL-DISCOVERY-MANIFEST.txt']) assert.equal(exists(f),true,`missing ${f}`);
const html=read('frontend/index.html');
for(const needle of ['rel="canonical"','og:title','twitter:card','application/ld+json','AI-Syed Jalal — Professional AI Workspace']) assert.match(html,new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),`missing ${needle}`);
assert.match(read('frontend/robots.txt'),/Sitemap:\s+https:\/\/sjalalhs7\.github\.io\/employee-register\/sitemap\.xml/);
assert.match(read('frontend/sitemap.xml'),/<loc>https:\/\/sjalalhs7\.github\.io\/employee-register\/<\/loc>/);
const manifest=JSON.parse(read('frontend/manifest.webmanifest')); assert.equal(manifest.name,'AI-Syed Jalal — Professional AI Workspace'); assert.equal(manifest.start_url,'./');
assert.match(read('backend/server.mjs'),/const VERSION='V53'/);
assert.match(read('backend/package.json'),/"version": "53\.0\.0"/);
assert.match(read('frontend/sw.js'),/aj-v53-shell-v1/);
console.log('V53 FINAL DISCOVERY: PASS');
