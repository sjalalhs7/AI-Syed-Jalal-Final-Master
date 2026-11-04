import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
export const root = fileURLToPath(new URL('../', import.meta.url));
export async function buildApi() {
  // Test files run in parallel (node --test), and more than one calls this.
  // Write to a unique temp file, then rename, so a reader can never observe a
  // half-written bundle and two writers cannot interleave.
  const { rename, mkdir } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  await mkdir(resolve(root, '.data'), { recursive: true });
  const temp = resolve(root, `.data/api.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.mjs`);
  await build({
    absWorkingDir: root,
    entryPoints: ['frontend/functions/api/[[path]].js'],
    outfile: temp, bundle: true, platform: 'node', format: 'esm',
    external: ['@neondatabase/serverless'], target: 'node22', logLevel: 'warning'
  });
  await rename(temp, resolve(root, '.data/api.mjs'));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await buildApi();
