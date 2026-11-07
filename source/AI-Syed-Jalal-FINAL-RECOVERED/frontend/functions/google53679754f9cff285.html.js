// Cloudflare Pages normally redirects *.html to extensionless URLs. Search
// Console's file verification needs the exact file URL, so serve the existing
// public verification file at that URL without an intermediate redirect.
export function onRequest({ request }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  return new Response(request.method === 'HEAD' ? null : 'google-site-verification: google53679754f9cff285.html', {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
  });
}
