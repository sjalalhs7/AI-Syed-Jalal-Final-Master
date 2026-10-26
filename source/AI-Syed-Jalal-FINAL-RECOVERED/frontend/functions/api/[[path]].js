/** Same-origin API proxy for Cloudflare Pages. Configure BACKEND_API_URL to the Node API origin. */
export async function onRequest({ request, env }) {
  const incoming = new URL(request.url);
  if (!incoming.pathname.startsWith('/api/')) {
    return Response.json({ ok: false, error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }
  if (!env.BACKEND_API_URL) {
    return Response.json(
      { ok: false, error: 'API backend is not configured', code: 'BACKEND_NOT_CONFIGURED' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  let backendOrigin;
  try {
    const parsed = new URL(env.BACKEND_API_URL);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      throw new Error('Expected an HTTPS origin only');
    }
    backendOrigin = parsed.origin;
  } catch {
    return Response.json(
      { ok: false, error: 'API backend configuration is invalid', code: 'BACKEND_CONFIG_INVALID' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const target = new URL(backendOrigin);
  target.pathname = incoming.pathname;
  target.search = incoming.search;
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.set('x-forwarded-host', incoming.host);
  headers.set('x-forwarded-proto', 'https');
  try {
    const upstreamRequest = new Request(target.toString(), new Request(request, { headers }));
    const upstream = await fetch(upstreamRequest);
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.set('Cache-Control', 'no-store');
    responseHeaders.delete('set-cookie2');
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      { ok: false, error: 'API backend is unreachable', code: 'BACKEND_UNREACHABLE' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
