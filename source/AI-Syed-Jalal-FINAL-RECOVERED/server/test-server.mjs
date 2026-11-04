import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// Playwright owns this disposable database. Never point it at the preview data.
const root = fileURLToPath(new URL('../', import.meta.url));
await rm(resolve(root, '.data/e2e'), { recursive: true, force: true });
process.env.DATA_DIR = '.data/e2e';
// Each browser spec signs in with its own disposable preview account. Keep the
// production default (10/min/IP) but give the suite room to run end to end.
process.env.PREVIEW_SESSION_PER_MINUTE = '200';
await import('./dev.mjs');
