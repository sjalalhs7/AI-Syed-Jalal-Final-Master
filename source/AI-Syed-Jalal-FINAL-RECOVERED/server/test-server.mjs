import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// Playwright owns this disposable database. Never point it at the preview data.
const root = fileURLToPath(new URL('../', import.meta.url));
await rm(resolve(root, '.data/e2e'), { recursive: true, force: true });
process.env.DATA_DIR = '.data/e2e';
await import('./dev.mjs');
