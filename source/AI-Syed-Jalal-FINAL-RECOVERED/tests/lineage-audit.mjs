import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const checks = [
  ['original V25 source archive', path.join(root, '..', 'ORIGINAL-V25-SOURCE', 'AI-Syed-Jalal-V25-FULL-PRODUCTION-MISSION-COMMAND-CENTER.tar.zst')],
  ['V40 README', path.join(root, 'README-V40-COMPLETE.md')],
  ['V39 integration test', path.join(root, 'tests', 'integration-release.mjs')],
  ['V40 performance benchmark', path.join(root, 'tests', 'performance-benchmark.mjs')],
  ['V40 print regression', path.join(root, 'tests', 'print-regression.mjs')],
  ['V40 DR documentation', path.join(root, 'docs', 'PERFORMANCE-DR-V40.md')],
  ['V41 agent catalog', path.join(root, 'config', 'ai-agent-catalog-v41.json')]
];
let failed=0;
for (const [name,file] of checks) {
  const ok=fs.existsSync(file);
  console.log(`${ok?'PASS':'FAIL'} ${name}: ${file}`);
  if(!ok) failed++;
}
const catalog=JSON.parse(fs.readFileSync(path.join(root,'config','ai-agent-catalog-v41.json'),'utf8'));
console.log(`PASS catalog roles: ${catalog.catalog_roles}`);
if(catalog.catalog_roles!==120) failed++;
if(failed) process.exit(1);
console.log('V41 lineage audit PASS');
