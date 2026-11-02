import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
export const root = fileURLToPath(new URL('../', import.meta.url));
export async function buildApi() {
  await build({
    absWorkingDir: root,
    entryPoints: ['frontend/functions/api/[[path]].js'],
    outfile: '.data/api.mjs', bundle: true, platform: 'node', format: 'esm',
    external: ['@neondatabase/serverless'], target: 'node22', logLevel: 'warning'
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await buildApi();
