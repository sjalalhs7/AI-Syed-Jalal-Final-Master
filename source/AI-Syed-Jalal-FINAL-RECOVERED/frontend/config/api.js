const configured = (() => {
  try { return localStorage.getItem('aj-v122-api') || ''; } catch { return ''; }
})();

export function getApiBase() {
  const fromMeta = document.querySelector('meta[name="ai-api-base"]')?.content || '';
  const raw = fromMeta || configured || (location.protocol.startsWith('http') ? location.origin : '');
  return raw.replace(/\/$/, '');
}

export const API = Object.freeze({
  chat: () => `${getApiBase()}/api/chat`,
});
