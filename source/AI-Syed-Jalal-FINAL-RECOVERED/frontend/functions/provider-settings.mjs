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
const ENV_KEYS = {
  gemini: 'GEMINI_API_KEY', openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY', elevenlabs: 'ELEVENLABS_API_KEY'
};

// Private per-request metadata, never serialized into an API response. A known
// deployment key remains usable even if the optional settings store is down.
const SETTINGS_READABLE = Symbol('provider settings readable');

export function providerConfiguration(env, provider) {
  // OmniRoute is configured through deployment environment only, not app_settings.
  if (provider === 'omniroute') {
    const key = String(env?.OMNIROUTE_API_KEY || env?.OMNIROUTE_KEY || '').trim();
    const endpoint = String(env?.OMNIROUTE_BASE_URL || env?.OMNIROUTE_URL || '').trim();
    return Boolean(key && endpoint);
  }
  const name = ENV_KEYS[provider];
  if (!name) return false;
  if (env?.[name]) return true;
  return env?.[SETTINGS_READABLE] === false ? null : false;
}

// A positive result is known even if other providers are unknown. A negative
// result is known only when every relevant provider was checked successfully.
export function aggregateProviderConfiguration(states) {
  if (states.some(state => state === true)) return true;
  if (states.some(state => state == null)) return null;
  return false;
}

export function unavailableProviderEnv(env) {
  const merged = { ...env };
  Object.defineProperty(merged, SETTINGS_READABLE, { value: false });
  return merged;
}

/** Never echo a secret. Show enough to recognise it, not enough to use it. */
export function maskKey(value) {
  const text = String(value || '');
  if (!text) return '';
  if (text.length <= 8) return '••••';
  return '••••••••' + text.slice(-4);
}

// Keep read failures distinct from a successfully read empty settings row.
// The runtime can still use deployment keys when stored settings are unavailable,
// but an Admin must not be told that no stored key exists after a failed read.
async function readStoredKeys(db) {
  try {
    const rows = await db.query("SELECT value FROM app_settings WHERE key='provider_keys'");
    if (!Array.isArray(rows)) return { keys: {}, readable: false };
    if (!rows.length) return { keys: {}, readable: true };
    const value = rows[0]?.value;
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        PROVIDERS.some(provider => Object.hasOwn(value, provider) && typeof value[provider] !== 'string')) {
      return { keys: {}, readable: false };
    }
    return { keys: value, readable: true };
  } catch {
    return { keys: {}, readable: false };
  }
}

/**
 * Environment first, then stored keys fill the gaps. An Admin-set key must never
 * silently override a deployment secret the owner already configured.
 */
export async function effectiveEnv(env, db) {
  const { keys: stored, readable } = await readStoredKeys(db);
  const merged = { ...env };
  for (const provider of PROVIDERS) {
    const name = ENV_KEYS[provider];
    if (!merged[name] && stored[provider]) merged[name] = stored[provider];
  }
  Object.defineProperty(merged, SETTINGS_READABLE, { value: readable });
  return merged;
}

/** Which providers have a key from either source, and where it came from. */
export async function providerStates(env, db) {
  const { keys: stored, readable } = await readStoredKeys(db);
  return PROVIDERS.map(provider => {
    const name = ENV_KEYS[provider];
    const fromEnv = Boolean(env[name]);
    const fromDb = Boolean(stored[provider]);
    const source = fromEnv ? 'environment' : fromDb ? 'admin-console' : readable ? 'none' : 'unknown';
    const key = env[name] || stored[provider] || '';
    return {
      provider,
      configured: fromEnv || fromDb ? true : readable ? false : null,
      source,
      hint: key ? maskKey(key) : '',
      // Presence of a key is not proof the provider accepts it.
      status: fromEnv || fromDb ? 'Key configured; live call not yet verified' : readable ? 'No key configured' : 'Stored settings could not be read; configuration is unknown'
    };
  });
}

// Update one provider atomically. A read/modify/write cycle could replace
// unrelated keys after a transient read failure or a concurrent admin change.
// Refuse a malformed existing value rather than overwriting it. PostgreSQL's
// conflict update acquires the row lock and applies this expression to the
// latest value.
export async function updateStoredProviderKey(db, provider, key, updatedBy) {
  if (!PROVIDERS.includes(provider)) throw new Error('Unknown provider');
  const remove = key === null;
  const rows = await db.query(
    `INSERT INTO app_settings(key,value,updated_at,updated_by)
     VALUES('provider_keys',CASE WHEN $2::boolean THEN '{}'::jsonb ELSE jsonb_build_object($1::text,$3::text) END,now(),$4)
     ON CONFLICT(key) DO UPDATE SET
       value=CASE WHEN $2::boolean THEN app_settings.value - $1::text ELSE app_settings.value || EXCLUDED.value END,
       updated_at=now(),updated_by=EXCLUDED.updated_by
     WHERE jsonb_typeof(app_settings.value)='object'
     RETURNING key`,
    [provider, remove, key, updatedBy]
  );
  return rows.length === 1;
}

export const PROVIDER_IDS = PROVIDERS;
