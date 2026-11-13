import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { buildApi, root } from '../build.mjs';

// This test owns an in-memory database and a fake credential. The upstream is
// replaced entirely: it never sends a request to Gemini or any live service.
test('a provider response whose body stalls reports the timeout, not empty output', async () => {
  const db = await PGlite.create();
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  let providerCalls = 0;
  const fixtureKey = 'fake-local-gemini-key-never-used';
  try {
    await db.exec(await readFile(resolve(root, 'backend/db/schema.sql'), 'utf8'));
    for (const name of (await readdir(resolve(root, 'backend/db/migrations'))).filter(name => name.endsWith('.sql')).sort()) {
      await db.exec(await readFile(resolve(root, 'backend/db/migrations', name), 'utf8'));
    }
    await buildApi();
    const { onRequest } = await import('../../.data/api.mjs');
    const env = {
      DB_ADAPTER: { query: async (sql, params = []) => (await db.query(sql, params)).rows },
      LOCAL_PREVIEW: 'true', COOKIE_SECURE: 'false', GEMINI_API_KEY: fixtureKey,
      CSRF_SECRET: 'provider-timeout-test-secret-at-least-32-characters'
    };
    const client = (cookie = '') => async (path, method = 'GET', body, token = '') => {
      const response = await onRequest({ request: new Request('https://preview.test/api' + path, {
        method, headers: { 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.163', ...(cookie ? { cookie } : {}), ...(token ? { 'x-csrf-token': token } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      }), env });
      return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] || '' };
    };
    const demo = await client()('/demo', 'POST', {});
    assert.equal(demo.status, 200);
    const admin = client(demo.cookie), token = (await admin('/me')).data.csrfToken;
    globalThis.setTimeout = (fn, ms, ...args) => originalSetTimeout(fn, ms === 45000 ? 25 : ms, ...args);
    globalThis.fetch = async (_url, options) => {
      providerCalls++;
      return { ok: true, status: 200, json: () => new Promise((_resolve, reject) => {
        const fail = () => reject(Object.assign(new Error('fixture body aborted'), { name: 'AbortError' }));
        if (options.signal.aborted) fail();
        else options.signal.addEventListener('abort', fail, { once: true });
      }) };
    };
    const direct = await admin('/ai/run', 'POST', { prompt: 'A disposable fixture prompt', provider: 'gemini', privacyMode: true }, token);
    assert.equal(direct.status, 502);
    assert.match(direct.data.error, /timed out after 45 seconds/i);
    assert.doesNotMatch(JSON.stringify(direct.data), /fixture body aborted|fake-local-gemini-key/);
    const chat = await admin('/assistant/chat', 'POST', { message: 'Explain this fixture', mode: 'cloud', provider: 'gemini' }, token);
    assert.equal(chat.status, 200);
    assert.equal(chat.data.mode, 'local-fallback');
    assert.match(chat.data.cloudError, /timed out after 45 seconds/i);
    assert.doesNotMatch(JSON.stringify(chat.data), /fixture body aborted|fake-local-gemini-key/);
    assert.equal(providerCalls, 2, 'a timeout is not silently retried');

    // A broken response stream is a network error, whereas malformed JSON
    // with an otherwise intact 200 response contains no usable model output.
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => { throw new TypeError('private fixture ' + fixtureKey); } });
    const broken = await admin('/ai/run', 'POST', { prompt: 'Fixture network interruption', provider: 'gemini', privacyMode: true }, token);
    assert.equal(broken.status, 502);
    assert.match(broken.data.error, /could not reach the selected AI provider/i);
    assert.doesNotMatch(JSON.stringify(broken.data), /private fixture|fake-local-gemini-key/);
    globalThis.fetch = async () => new Response('{invalid-json', { status: 200, headers: { 'Content-Type': 'application/json' } });
    const invalid = await admin('/ai/run', 'POST', { prompt: 'Fixture invalid JSON', provider: 'gemini', privacyMode: true }, token);
    assert.equal(invalid.status, 502);
    assert.match(invalid.data.error, /provider returned no text output/i);

    // Existing 429 retry behavior and sanitized status survive these changes.
    globalThis.setTimeout = (fn, ms, ...args) => originalSetTimeout(fn, ms === 45000 ? 1000 : [900, 1800].includes(ms) ? 2 : ms, ...args);
    let quotaCalls = 0;
    globalThis.fetch = async () => { quotaCalls++; return Response.json({ error: { message: 'private quota detail ' + fixtureKey } }, { status: 429 }); };
    const quota = await admin('/ai/run', 'POST', { prompt: 'Fixture quota', provider: 'gemini', privacyMode: true }, token);
    assert.equal(quota.status, 502);
    assert.equal(quota.data.code, 'PROVIDER_RATE_OR_QUOTA');
    assert.match(quota.data.error, /rate limit or quota/i);
    assert.doesNotMatch(JSON.stringify(quota.data), /private quota detail|fake-local-gemini-key/);
    assert.equal(quotaCalls, 3);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    await db.close();
  }
});
