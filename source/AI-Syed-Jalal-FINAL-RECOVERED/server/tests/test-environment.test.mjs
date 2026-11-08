import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareTestEnvironment } from '../test-environment.mjs';

test('browser test server cannot inherit provider credentials, seed accounts or a repair unlock', () => {
  const sensitive = [
    'DATABASE_URL', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY',
    'DEEPSEEK_API_KEY', 'ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID',
    'OMNIROUTE_API_KEY', 'OMNIROUTE_KEY', 'OMNIROUTE_BASE_URL', 'OMNIROUTE_URL',
    'SEED_ADMIN_USERNAME', 'SEED_ADMIN_PASSWORD', 'SESSION_SECRET', 'SCHEMA_REPAIR_ENABLED'
  ];
  const input = Object.fromEntries(sensitive.map(name => [name, 'local-test-value']));
  Object.assign(input, { DATA_DIR: '/should/not/be/used', CSRF_SECRET: 'external-secret', NODE_ENV: 'production', PORT: '3100' });
  const result = prepareTestEnvironment(input);
  for (const name of sensitive) assert.equal(result[name], undefined, name);
  assert.equal(result.DATA_DIR, '.data/e2e');
  assert.equal(result.NODE_ENV, 'test');
  assert.equal(result.PORT, '3100');
  assert.equal(result.PREVIEW_SESSION_PER_MINUTE, '200');
  assert.ok(result.CSRF_SECRET.length >= 32);
  assert.notEqual(result.CSRF_SECRET, 'external-secret');
});
