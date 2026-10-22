function getStoredApiBase() {
  try {
    return localStorage.getItem('aj-v31-api') || localStorage.getItem('aj-v122-api') || '';
  } catch {
    return '';
  }
}

export function getApiBase() {
  const fromMeta = document.querySelector('meta[name="ai-api-base"]')?.content || '';
  const raw = fromMeta || getStoredApiBase() || (location.protocol.startsWith('http') ? location.origin : '');
  return raw.replace(/\/$/, '');
}

export const API = Object.freeze({
  chat: () => `${getApiBase()}/api/chat`,
});
