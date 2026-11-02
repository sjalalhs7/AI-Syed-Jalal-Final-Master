import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../worker/index.js';

const originalFetch = globalThis.fetch;
test.after(() => { globalThis.fetch = originalFetch; });
const call = (path, env = {}) => worker.fetch(new Request('https://gateway.test' + path), env);

test('worker gateway reports health and refuses missing backend configuration', async () => {
  const health = await call('/healthz'); assert.equal(health.status, 200); assert.equal((await health.json()).backendConfigured, false);
  const missing = await call('/api/health'); assert.equal(missing.status, 503); assert.equal((await missing.json()).code, 'BACKEND_NOT_CONFIGURED');
  const notFound = await call('/'); assert.equal(notFound.status, 404);
});

test('worker gateway validates backend origin and proxies API requests without storing secrets', async () => {
  const invalid = await call('/api/health', { BACKEND_API_URL: 'https://user:pass@example.com/api' }); assert.equal(invalid.status, 503); assert.equal((await invalid.json()).code, 'BACKEND_CONFIG_INVALID');
  let seen;
  globalThis.fetch = async request => { seen = request; return Response.json({ ok: true }, { headers: { 'Set-Cookie': 'session=abc' } }); };
  const response = await call('/api/health?x=1', { BACKEND_API_URL: 'https://api.example.com' });
  assert.equal(response.status, 200); assert.equal(seen.url, 'https://api.example.com/api/health?x=1'); assert.equal(seen.headers.get('x-forwarded-host'), 'gateway.test'); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('set-cookie'), 'session=abc');
  globalThis.fetch = async () => { throw new Error('offline'); };
  const unreachable = await call('/api/health', { BACKEND_API_URL: 'https://api.example.com' }); assert.equal(unreachable.status, 502); assert.equal((await unreachable.json()).code, 'BACKEND_UNREACHABLE');
});
