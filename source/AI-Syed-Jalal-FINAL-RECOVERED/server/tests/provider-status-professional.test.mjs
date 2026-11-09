import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { buildApi, root } from '../build.mjs';
import { effectiveEnv, providerConfiguration, aggregateProviderConfiguration, unavailableProviderEnv } from '../../frontend/functions/provider-settings.mjs';

const storedKey = 'local-test-stored-gemini-key-987654';
const envKey = 'local-test-deployment-openai-key-123456';

test('provider configuration distinguishes absent, unknown, stored and deployment states', async () => {
  const empty = await effectiveEnv({}, { query: async () => [] });
  assert.equal(providerConfiguration(empty, 'gemini'), false);
  assert.equal(providerConfiguration(empty, 'omniroute'), false);
  const stored = await effectiveEnv({ GEMINI_API_KEY: envKey }, { query: async () => [{ value: { gemini: storedKey, openai: storedKey } }] });
  assert.equal(stored.GEMINI_API_KEY, envKey, 'a stored key must not override a deployment key');
  assert.equal(stored.OPENAI_API_KEY, storedKey);
  assert.equal(providerConfiguration(stored, 'gemini'), true);
  assert.equal(providerConfiguration(stored, 'openai'), true);
  for (const bad of [null, [], 'invalid', { gemini: { secret: 'invalid' } }]) {
    const unreadable = await effectiveEnv({ OPENAI_API_KEY: envKey }, { query: async () => [{ value: bad }] });
    assert.equal(providerConfiguration(unreadable, 'gemini'), null);
    assert.equal(providerConfiguration(unreadable, 'openai'), true);
    assert.equal(providerConfiguration(unreadable, 'omniroute'), false);
    assert.equal(JSON.stringify(unreadable).includes('provider settings readable'), false);
  }
  const failed = unavailableProviderEnv({ OMNIROUTE_KEY: 'local-test-only', OMNIROUTE_URL: 'https://example.invalid' });
  assert.equal(providerConfiguration(failed, 'gemini'), null);
  assert.equal(providerConfiguration(failed, 'omniroute'), true, 'OmniRoute is environment-only');
  assert.equal(aggregateProviderConfiguration([false, false]), false);
  assert.equal(aggregateProviderConfiguration([false, null]), null);
  assert.equal(aggregateProviderConfiguration([true, null]), true);
});

test('all provider surfaces report unreadable settings without sending cloud requests', async () => {
  // This in-memory database and the credentials are disposable test fixtures.
  const db = await PGlite.create();
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  let lastAuthorization = '';
  let failSettings = false;
  try {
    await db.exec(await readFile(resolve(root, 'backend/db/schema.sql'), 'utf8'));
    for (const name of (await readdir(resolve(root, 'backend/db/migrations'))).filter(name => name.endsWith('.sql')).sort()) {
      await db.exec(await readFile(resolve(root, 'backend/db/migrations', name), 'utf8'));
    }
    await buildApi();
    const { onRequest } = await import('../../.data/api.mjs');
    const env = {
      DB_ADAPTER: { query: async (sql, params = []) => {
        if (failSettings && sql.includes("SELECT value FROM app_settings WHERE key='provider_keys'")) throw new Error('simulated read failure');
        return (await db.query(sql, params)).rows;
      } },
      LOCAL_PREVIEW: 'true', COOKIE_SECURE: 'false',
      CSRF_SECRET: 'provider-status-test-secret-at-least-32-characters'
    };
    globalThis.fetch = async (_url, options) => {
      providerCalls++;
      lastAuthorization = options?.headers?.authorization || '';
      return Response.json({ choices: [{ message: { content: 'Response from a mocked provider' } }] });
    };
    const client = (cookie = '') => async (path, method = 'GET', body, token = '') => {
      const response = await onRequest({ request: new Request('https://preview.test/api' + path, {
        method, headers: { 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.162', ...(cookie ? { cookie } : {}), ...(token ? { 'x-csrf-token': token } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      }), env });
      return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] || '' };
    };
    const demo = await client()('/demo', 'POST', {});
    assert.equal(demo.status, 200);
    const admin = client(demo.cookie);
    const token = (await admin('/me')).data.csrfToken;
    const noKeys = await admin('/ai/capabilities');
    assert.ok(noKeys.data.providers.every(item => item.configured === false));
    assert.equal(noKeys.data.mode, 'provider-keys-required');
    assert.equal((await admin('/health')).data.assistant.cloudConfigured, false);

    await db.query("INSERT INTO app_settings(key,value,updated_by) VALUES('provider_keys',$1::jsonb,'test')", [JSON.stringify({ gemini: storedKey })]);
    const readable = await admin('/ai/capabilities');
    assert.equal(readable.data.providers.find(item => item.id === 'gemini').configured, true);
    assert.equal(readable.data.providers.find(item => item.id === 'openai').configured, false);
    assert.ok(!JSON.stringify(readable.data).includes(storedKey));

    failSettings = true;
    const cap = await admin('/ai/capabilities');
    assert.equal(cap.status, 200);
    assert.equal(cap.data.mode, 'provider-status-unknown');
    for (const item of cap.data.providers.filter(item => item.id !== 'omniroute')) {
      assert.equal(item.configured, null);
      assert.match(item.status, /configuration is unknown/i);
      assert.equal(cap.data.runtime.providers[item.id].configured, null);
    }
    assert.equal(cap.data.providers.find(item => item.id === 'omniroute').configured, false);
    assert.equal((await admin('/health')).data.assistant.cloudConfigured, null);
    const managed = await admin('/admin/providers');
    assert.ok(managed.data.providers.every(item => item.configured === null && item.source === 'unknown'));
    const health = await admin('/admin/ai/provider-health');
    assert.equal(health.data.mode, 'provider-status-unknown');
    assert.equal(health.data.providers.find(item => item.id === 'gemini').configured, null);
    const assistant = await admin('/assistant/state?metadata=1');
    assert.equal(assistant.data.cloudConfigured, null);
    assert.ok(Object.values(assistant.data.cloudProviders).every(value => value === null));
    const studio = await admin('/platform/state');
    assert.ok(studio.data.models.filter(model => !model.local && model.id !== 'omniroute').every(model => model.configured === null));
    assert.ok(studio.data.models.filter(model => model.local).every(model => model.configured === true));
    const lab = await admin('/agent/capabilities');
    assert.ok(lab.data.providers.every(item => item.configured === null));
    const arena = await admin('/arena/catalogue');
    assert.ok(arena.data.engines.filter(item => item.kind === 'cloud').every(item => item.configured === null));

    const direct = await admin('/ai/run', 'POST', { prompt: 'A local test prompt', provider: 'gemini', privacyMode: true }, token);
    assert.equal(direct.status, 503);
    assert.equal(direct.data.code, 'PROVIDER_STATUS_UNKNOWN');
    assert.equal(direct.data.status, 'failed');
    assert.match(direct.data.error, /unknown; no cloud request was made/i);
    const assistantRun = await admin('/assistant/chat', 'POST', { message: 'Write a short story', mode: 'cloud', provider: 'gemini' }, token);
    assert.equal(assistantRun.status, 200);
    assert.match(assistantRun.data.cloudError, /configuration is unknown/i);
    assert.match(assistantRun.data.cloudError, /no cloud request was made/i);
    const voice = await admin('/voice/speak', 'POST', { text: 'Local test' }, token);
    assert.equal(voice.status, 503);
    assert.equal(voice.data.code, 'PROVIDER_STATUS_UNKNOWN');
    const check = await admin('/agent/self-check', 'POST', { engine: 'cloud', provider: 'gemini' }, token);
    assert.equal(check.status, 503);
    assert.equal(check.data.code, 'PROVIDER_STATUS_UNKNOWN');
    assert.match(check.data.error, /No request was made to the provider/);
    const invalid = await admin('/agent/self-check', 'POST', { engine: 'cloud', provider: 'imaginary' }, token);
    assert.equal(invalid.status, 400);
    assert.equal(invalid.data.code, 'UNSUPPORTED_PROVIDER');

    const conversation = await admin('/platform/conversations', 'POST', { title: 'Disposable', modelA: 'gemini', history: false }, token);
    assert.equal(conversation.status, 201);
    const message = await admin(`/platform/conversations/${conversation.data.conversation.id}/messages`, 'POST', { content: 'A local test prompt', modelA: 'gemini', history: false }, token);
    assert.equal(message.status, 200);
    assert.match(JSON.stringify(message.data), /configuration is unknown/i);
    const battle = await admin('/arena/battles', 'POST', { prompt: 'plan: Review a test project', contenders: ['local-planner', 'gemini'], blind: false }, token);
    assert.equal(battle.status, 201);
    const cloud = battle.data.responses.find(item => item.engine === 'gemini');
    assert.equal(cloud.status, 'failed');
    assert.equal(cloud.score, 0);
    assert.match(cloud.content, /configuration is unknown/i);
    assert.equal(providerCalls, 0, 'unreadable settings must never trigger a provider request');

    env.OPENAI_API_KEY = envKey;
    const partial = await admin('/ai/capabilities');
    assert.equal(partial.data.mode, 'live-ready');
    assert.equal(partial.data.providers.find(item => item.id === 'openai').configured, true);
    assert.equal(partial.data.providers.find(item => item.id === 'gemini').configured, null);
    assert.equal((await admin('/health')).data.assistant.cloudConfigured, true);
    assert.equal((await admin('/assistant/state?metadata=1')).data.cloudConfigured, true);
    const known = await admin('/ai/run', 'POST', { prompt: 'A local test prompt', provider: 'openai', privacyMode: true }, token);
    assert.equal(known.status, 200);
    assert.equal(providerCalls, 1);
    assert.equal(lastAuthorization, 'Bearer ' + envKey, 'a deployment key remains usable during settings failure');
    assert.ok(!JSON.stringify(known.data).includes(envKey));
    assert.ok(!JSON.stringify(partial.data).includes(envKey));

    failSettings = false;
    const recovered = await admin('/ai/capabilities');
    assert.equal(recovered.data.providers.find(item => item.id === 'gemini').configured, true);
    assert.deepEqual((await db.query("SELECT value FROM app_settings WHERE key='provider_keys'")).rows[0].value, { gemini: storedKey });

    // Mock the provider rather than spending money or using live credentials.
    // Gemini 2.5 does not accept the Gemini 3-only thinkingLevel field.
    let geminiRequest;
    globalThis.fetch = async (url, options) => {
      providerCalls++;
      geminiRequest = { url: String(url), headers: options.headers, body: JSON.parse(options.body) };
      return Response.json({ candidates: [{ content: { parts: [{ text: 'Mocked Gemini answer' }] } }] });
    };
    const gemini = await admin('/assistant/chat', 'POST', { message: 'Tell me about this project', mode: 'cloud', provider: 'gemini', language: 'ur-PK' }, token);
    assert.equal(gemini.status, 200);
    assert.equal(gemini.data.output, 'Mocked Gemini answer');
    assert.match(geminiRequest.url, /gemini-2\.5-flash:generateContent/);
    assert.equal(geminiRequest.headers['x-goog-api-key'], storedKey);
    assert.deepEqual(geminiRequest.body.generationConfig, { maxOutputTokens: 2048 });
    assert.match(geminiRequest.body.contents[0].parts[0].text, /requested language \(ur-PK\)/);
    assert.ok(!JSON.stringify(gemini.data).includes(storedKey));

    const callsBeforeUnsupported = providerCalls;
    const unsupported = await admin('/ai/run', 'POST', { prompt: 'Test', provider: 'gemini', thinking: true }, token);
    assert.equal(unsupported.status, 400);
    assert.equal(unsupported.data.code, 'THINKING_CONTROL_UNAVAILABLE');
    assert.equal(providerCalls, callsBeforeUnsupported);

    // An upstream error can echo a key. Neither the response nor run history
    // should contain provider-supplied error text or the credential.
    globalThis.fetch = async () => Response.json({ error: { message: 'Rejected secret ' + storedKey, status: storedKey } }, { status: 401 });
    const rejected = await admin('/ai/run', 'POST', { prompt: 'Test rejected key', provider: 'gemini' }, token);
    assert.equal(rejected.status, 502);
    assert.equal(rejected.data.code, 'PROVIDER_ACCESS_REJECTED');
    assert.match(rejected.data.error, /rejected credentials or model access/i);
    assert.ok(!JSON.stringify(rejected.data).includes(storedKey));
    const recorded = await db.query('SELECT output,trace FROM ai_runs WHERE id=$1', [rejected.data.traceId]);
    assert.ok(!JSON.stringify(recorded.rows).includes(storedKey));
    const fallback = await admin('/assistant/chat', 'POST', { message: 'Tell me a story', mode: 'cloud', provider: 'gemini' }, token);
    assert.match(fallback.data.cloudError, /rejected credentials or model access/i);
    assert.ok(!JSON.stringify(fallback.data).includes(storedKey));

    await db.query("UPDATE app_settings SET value='[\"invalid\"]'::jsonb WHERE key='provider_keys'");
    const malformed = await admin('/ai/capabilities');
    assert.equal(malformed.data.providers.find(item => item.id === 'gemini').configured, null);
    assert.equal(malformed.data.providers.find(item => item.id === 'openai').configured, true);
  } finally {
    globalThis.fetch = originalFetch;
    await db.close();
  }
});
