import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assistantRoute } from '../../frontend/functions/assistant-routes.mjs';

const source = readFileSync(new URL('../../frontend/functions/api/[[path]].js', import.meta.url), 'utf8');

async function chat(body) {
  const request = new Request('https://app.example/api/assistant/chat', { method: 'POST' });
  const response = await assistantRoute({
    request, url: new URL(request.url), body,
    readBody: async () => body,
    db: {}, me: { id: 'test-user', role: 'Viewer' }, env: {},
    consumeRateLimit: async () => true,
    reply: (data, status = 200) => Response.json(data, { status })
  });
  return { status: response.status, body: await response.json() };
}

test('assistant chat rejects missing, non-text, and unsupported-mode requests as 400s', async () => {
  for (const body of [{}, { message: { prompt: 'hello' } }, { message: 'hello', mode: 'wrong' }]) {
    const result = await chat(body);
    assert.equal(result.status, 400);
    assert.equal(result.body.ok, false);
    assert.match(result.body.code, /^INVALID_/);
  }
});

test('local chat does not reject an unused provider selection', async () => {
  const result = await chat({ message: 'calculate 2 + 2', mode: 'local', provider: '' });
  assert.equal(result.status, 200);
  assert.match(result.body.output, /4/);
});

test('unexpected production API failures return a correlation ID and never expose exception details', () => {
  assert.match(source, /API_UNHANDLED_ERROR/);
  assert.match(source, /requestId,path:u\.pathname,method:request\.method/);
  assert.match(source, /status>=500\?\{requestId\}:\{\}/);
  assert.match(source, /env\.LOCAL_PREVIEW\?String\(e\?\.message\|\|e\)\.slice\(0,300\)/);
});

test('chat remains same-origin, authenticated, and CSRF-protected through the assistant route', () => {
  const client = readFileSync(new URL('../../frontend/assets/jalalai.js', import.meta.url), 'utf8');
  assert.match(client, /fetch\('\/api' \+ path/);
  assert.match(client, /credentials: 'same-origin'/);
  assert.match(source, /if\(!me\)return reply\(\{error:'Authentication required'\},401\)/);
  assert.match(source, /validCsrf\(request,env\)/);
  assert.match(client, /chat API route was not found \(404\)/);
});
