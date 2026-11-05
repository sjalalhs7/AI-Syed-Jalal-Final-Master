// V149: let an Administrator set AI provider keys at runtime.
//
// Keys normally come from Cloudflare environment secrets. That requires a
// dashboard visit and a redeploy, which is why "add an API key" was effectively
// impossible for the owner. This module stores a key in app_settings and layers
// it over the environment at request time.
//
// Honesty rules enforced here:
//  - A key that is present is reported as "key configured", never as "working".
//    Only a real provider call can prove a key works; nothing here fakes that.
//  - The stored key is never returned by any route. Responses expose only the
//    last four characters.

const PROVIDERS = ['gemini', 'openai', 'anthropic', 'deepseek', 'elevenlabs'];

/** Never echo a secret. Show enough to recognise it, not enough to use it. */
export function maskKey(value) {
  const text = String(value || '');
  if (!text) return '';
  if (text.length <= 8) return '••••';
  return '••••••••' + text.slice(-4);
}

/** Keys stored in app_settings, as { provider: key }. Never returned to clients. */
export async function storedKeys(db) {
  try {
    const rows = await db.query("SELECT value FROM app_settings WHERE key='provider_keys'");
    const value = rows?.[0]?.value;
    return value && typeof value === 'object' ? value : {};
  } catch {
    // A database that predates this table simply has no stored keys.
    return {};
  }
}

/**
 * Environment first, then stored keys fill the gaps. An Admin-set key must never
 * silently override a deployment secret the owner already configured.
 */
export async function effectiveEnv(env, db) {
  const stored = await storedKeys(db);
  const merged = { ...env };
  const map = {
    gemini: 'GEMINI_API_KEY',
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    elevenlabs: 'ELEVENLABS_API_KEY'
  };
  for (const provider of PROVIDERS) {
    const name = map[provider];
    if (!merged[name] && stored[provider]) merged[name] = stored[provider];
  }
  return merged;
}

/** Which providers have a key from either source, and where it came from. */
export async function providerStates(env, db) {
  const stored = await storedKeys(db);
  const map = {
    gemini: 'GEMINI_API_KEY', openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY', elevenlabs: 'ELEVENLABS_API_KEY'
  };
  return PROVIDERS.map(provider => {
    const name = map[provider];
    const fromEnv = Boolean(env[name]);
    const fromDb = Boolean(stored[provider]);
    const source = fromEnv ? 'environment' : fromDb ? 'admin-console' : 'none';
    const key = env[name] || stored[provider] || '';
    return {
      provider,
      configured: fromEnv || fromDb,
      source,
      hint: key ? maskKey(key) : '',
      // Presence of a key is not proof the provider accepts it.
      status: fromEnv || fromDb ? 'Key configured; live call not yet verified' : 'No key configured'
    };
  });
}

export const PROVIDER_IDS = PROVIDERS;
