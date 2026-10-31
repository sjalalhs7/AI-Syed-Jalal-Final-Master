function getStoredApiBase() {
  try {
    return localStorage.getItem('aj-v31-api') || localStorage.getItem('aj-v122-api') || '';
  } catch {
    return '';
  }
}

export function getApiBase() {
  const fromMeta = document.querySelector('meta[name="ai-api-base"]')?.content || '';
  // On a hosted site, use its own origin unless an explicit meta override exists.
  // Old localStorage overrides can point to retired deployments and break login/API calls.
  const hostedOrigin = location.protocol.startsWith('http') ? location.origin : '';
  const raw = fromMeta || hostedOrigin || getStoredApiBase();
  return raw.replace(/\/$/, '');
}

export const API = Object.freeze({
  chat: () => `${getApiBase()}/api/chat`,
});
