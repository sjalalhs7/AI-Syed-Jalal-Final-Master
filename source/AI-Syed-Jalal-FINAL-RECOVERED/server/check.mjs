import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
let count = 0;
function check(code, name, module = false) {
  if (module) {
    const result = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: code, encoding: 'utf8' });
    if (result.status) throw new Error(name + ': ' + result.stderr);
  } else new vm.Script(code, { filename: name });
  count++;
}
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['node_modules', '.data', 'test-results', 'playwright-report'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.name.endsWith('.html')) {
      const html = await readFile(path, 'utf8');
      for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
        if (match[1].includes('src=') || /type=["']application\/(?:ld\+)?json/.test(match[1])) continue;
        check(match[2], path, match[1].includes('type="module"'));
      }
    } else if (/\.(mjs|js)$/.test(entry.name)) check(await readFile(path, 'utf8'), path, true);
  }
}
for (const dir of ['frontend', 'server', 'tests']) await walk(join(root, dir));
console.log(`PASS: ${count} JavaScript modules and inline scripts parsed.`);
const staticCheck = spawnSync(process.execPath, ['frontend/scripts/validate-static.mjs'], { cwd: root, stdio: 'inherit' });
if (staticCheck.status) process.exit(staticCheck.status);
