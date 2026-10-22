/**
 * Cloudflare Pages same-origin API proxy.
 *
 * Configure BACKEND_API_URL to the origin of the deployed Node API, e.g.
 * https://api.example.com (no trailing /api path). Do not put credentials
 * in this variable. If the backend is not configured, return an explicit
 * 503 instead of silently falling through to the static-site 404 page.
 */
export async function onRequest(context) {
  const configuredOrigin = context.env.BACKEND_API_URL;
  if (!configuredOrigin) {
    return Response.json(
      { ok: false, error: "API backend is not configured", code: "BACKEND_NOT_CONFIGURED" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  let backendOrigin;
  try {
    backendOrigin = new URL(configuredOrigin);
    if (!["https:", "http:"].includes(backendOrigin.protocol)) throw new Error("Unsupported protocol");
    if (backendOrigin.username || backendOrigin.password) throw new Error("Credentials are not allowed in BACKEND_API_URL");
  } catch {
    return Response.json(
      { ok: false, error: "API backend configuration is invalid", code: "BACKEND_CONFIG_INVALID" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const incoming = new URL(context.request.url);
  const rawPath = context.params?.path;
  const apiPath = Array.isArray(rawPath) ? rawPath.join("/") : (rawPath || "");
  const target = new URL(backendOrigin.origin);
  target.pathname = `/api/${apiPath}`.replace(/\/{2,}/g, "/");
  target.search = incoming.search;

  const headers = new Headers(context.request.headers);
  headers.delete("host");
  headers.set("x-forwarded-host", incoming.host);
  headers.set("x-forwarded-proto", incoming.protocol.slice(0, -1));

  try {
    const upstreamRequest = new Request(target.toString(), new Request(context.request, { headers }));
    const upstreamResponse = await fetch(upstreamRequest);
    const responseHeaders = new Headers(upstreamResponse.headers);
    responseHeaders.set("Cache-Control", "no-store");
    responseHeaders.delete("set-cookie2");
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      { ok: false, error: "API backend is unreachable", code: "BACKEND_UNREACHABLE" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
