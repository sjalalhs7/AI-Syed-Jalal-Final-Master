// Playwright uses a disposable local database. Do not inherit live provider
// credentials, administrator seeds or repair unlocks from the invoking shell.
const EXCLUDED = [
  'DATABASE_URL', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY',
  'DEEPSEEK_API_KEY', 'ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID',
  'OMNIROUTE_API_KEY', 'OMNIROUTE_KEY', 'OMNIROUTE_BASE_URL', 'OMNIROUTE_URL',
  'SEED_ADMIN_USERNAME', 'SEED_ADMIN_PASSWORD', 'FIRST_ADMIN_SETUP_ENABLED', 'SESSION_SECRET', 'SCHEMA_REPAIR_ENABLED'
];

export function prepareTestEnvironment(env) {
  for (const name of EXCLUDED) delete env[name];
  env.NODE_ENV = 'test';
  env.DATA_DIR = '.data/e2e';
  env.CSRF_SECRET = 'disposable-browser-test-csrf-secret-not-for-production';
  // Each spec gets a disposable account, so the suite needs a larger local limit.
  env.PREVIEW_SESSION_PER_MINUTE = '200';
  return env;
}
