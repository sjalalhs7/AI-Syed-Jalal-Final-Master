import http from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { buildApi, root } from './build.mjs';

// This server is a local/preview adapter. Production still uses Cloudflare + Neon.
// Never enable the demo bootstrap on a production deployment.
const production = process.env.NODE_ENV === 'production';
if (production) throw new Error('Use Cloudflare Pages for production; dev.mjs is a local preview adapter.');
const dataDir = resolve(root, process.env.DATA_DIR || '.data/postgres');
if (!dataDir.startsWith(resolve(root, '.data') + sep)) throw new Error('DATA_DIR must stay inside .data');
await mkdir(dataDir, { recursive: true });
const db = new PGlite(dataDir);
await db.exec(await readFile(resolve(root, 'backend/db/schema.sql'), 'utf8'));
await db.exec(await readFile(resolve(root, 'backend/db/migrations/002_v43_ai_runs.sql'), 'utf8'));
  await db.exec(await readFile(resolve(root, 'backend/db/migrations/005_v127_auth_rate_limits.sql'), 'utf8'));
  await db.exec(await readFile(resolve(root, 'backend/db/migrations/007_v129_agent_platform.sql'), 'utf8'));
await db.exec(await readFile(resolve(root, 'backend/db/migrations/009_v133_agent_skills.sql'), 'utf8'));
await db.exec(await readFile(resolve(root, 'backend/db/migrations/010_v134_message_actions.sql'), 'utf8'));
await db.exec(await readFile(resolve(root, 'backend/db/migrations/011_v135_arena.sql'), 'utf8'));
await db.exec(await readFile(resolve(root, 'backend/db/migrations/012_v136_agent_runtime.sql'), 'utf8'));
await db.exec(await readFile(resolve(root, 'server/assistant-schema.sql'), 'utf8'));
let localSecret = process.env.CSRF_SECRET;
if (!localSecret) { const secretPath = resolve(root, '.data/session-secret'); try { localSecret = (await readFile(secretPath, 'utf8')).trim(); } catch { localSecret = randomBytes(32).toString('hex'); await writeFile(secretPath, localSecret, { mode: 0o600 }); } }
await buildApi();
const { onRequest } = await import('../.data/api.mjs');
const env = { ...process.env, LOCAL_PREVIEW: 'true', DATABASE_URL: 'local-pglite', CSRF_SECRET: localSecret, COOKIE_SECURE: 'false' };
const adapter = { query: async (sql, params = []) => (await db.query(sql, params)).rows };
const frontend = resolve(root, 'frontend');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      headers.set('CF-Connecting-IP', req.socket.remoteAddress || 'local');
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 25 * 1024 * 1024) { res.writeHead(413); res.end('Request too large'); return; } chunks.push(chunk); }
      const body = Buffer.concat(chunks);
      const request = new Request('http://localhost' + req.url, { method: req.method, headers, ...(body.length ? { body } : {}) });
      const response = await onRequest({ request, env: { ...env, DB_ADAPTER: adapter } });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    let path = resolve(frontend, '.' + decodeURIComponent(url.pathname));
    if (path !== frontend && !path.startsWith(frontend + sep)) { res.writeHead(403); res.end(); return; }
    if (url.pathname.endsWith('/')) path = resolve(path, 'index.html');
    if (!(await stat(path)).isFile()) throw new Error('Not a file');
    const content = await readFile(path);
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'microphone=(self), camera=(), geolocation=()' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (error) {
    if (!res.headersSent) res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});
const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => console.log(`AI-Syed Jalal preview: http://0.0.0.0:${port}\nLocal PostgreSQL-compatible storage: .data/postgres\nCloud AI: ${env.GEMINI_API_KEY || env.OPENAI_API_KEY ? 'configured (not yet live-verified)' : 'not configured; local assistant tools remain available'}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(async () => { await db.close(); process.exit(0); }));
