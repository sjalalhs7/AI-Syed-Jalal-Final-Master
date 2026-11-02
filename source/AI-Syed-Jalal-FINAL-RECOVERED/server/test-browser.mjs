import chromium from '@sparticuz/chromium';
import { createRequire } from 'node:module';
import { brotliDecompressSync } from 'node:zlib';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
// npm-distributed Chromium avoids a browser CDN. Extract its compatibility
// libraries on Debian as well as Amazon Linux; no system packages are needed.
await chromium.executablePath();
const libraryPath = join(tmpdir(), 'al2023', 'lib');
const require = createRequire(import.meta.url);
const packageRoot = require.resolve('@sparticuz/chromium').replace(/build\/index\.js$/, '');
if (!existsSync(libraryPath)) {
  mkdirSync(join(tmpdir(), 'al2023'), { recursive: true });
  const result = spawnSync('tar', ['-xf', '-', '-C', join(tmpdir(), 'al2023')], { input: brotliDecompressSync(readFileSync(packageRoot + 'bin/al2023.tar.br')), stdio: ['pipe', 'inherit', 'inherit'] });
  if (result.status) throw new Error('Could not extract Chromium compatibility libraries');
}
const result = spawnSync(process.execPath, [fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url)), 'test', ...process.argv.slice(2)], {
  stdio: 'inherit', env: { ...process.env, LD_LIBRARY_PATH: [libraryPath, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') }
});
process.exit(result.status ?? 1);
