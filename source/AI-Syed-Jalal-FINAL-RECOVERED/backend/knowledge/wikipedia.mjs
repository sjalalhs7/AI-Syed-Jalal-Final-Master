const API_URL = 'https://en.wikipedia.org/w/api.php';
const MAX_QUERY_LENGTH = 200;
function stripHtml(value = '') {
  return String(value).replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;|&#39;/g, "'").replace(/\s+/g, ' ').trim();
}
export async function searchWikipedia(query, options = {}) {
  const q = String(query ?? '').trim();
  if (q.length < 2) throw new TypeError('Wikipedia query must contain at least 2 characters.');
  if (q.length > MAX_QUERY_LENGTH) throw new RangeError('Wikipedia query must be 200 characters or fewer.');
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is unavailable in this runtime.');
  const url = new URL(API_URL);
  url.search = new URLSearchParams({ action: 'query', list: 'search', srsearch: q, srlimit: String(Math.min(5, Math.max(1, Number(options.limit) || 5))), format: 'json', formatversion: '2', origin: '*' }).toString();
  const response = await fetchImpl(url, { headers: { Accept: 'application/json', 'User-Agent': 'AI-Syed-Jalal/1.0 (Wikipedia knowledge adapter)' }, signal: AbortSignal.timeout(Math.min(10000, Math.max(1000, Number(options.timeoutMs) || 8000))) });
  if (!response?.ok) throw new Error('Wikipedia API returned HTTP ' + (response?.status ?? 'unknown') + '.');
  const payload = await response.json();
  const hits = Array.isArray(payload?.query?.search) ? payload.query.search : [];
  return { source: 'Wikipedia', attribution: 'Text is from Wikipedia contributors and is available under CC BY-SA; consult the linked page for attribution and license details.', retrievedAt: new Date().toISOString(), query: q, results: hits.map(hit => ({ title: String(hit.title || ''), snippet: stripHtml(hit.snippet || ''), pageId: Number(hit.pageid) || null, url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(String(hit.title || '').replace(/ /g, '_')) })).filter(hit => hit.title && hit.url) };
}
