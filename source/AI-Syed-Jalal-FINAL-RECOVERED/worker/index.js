/**
 * AI Syed Jalal API gateway.
 *
 * The Node API must be deployed separately and BACKEND_API_URL must be set
 * as a Worker secret/variable to its origin (for example, https://api.example.com).
 * This Worker deliberately returns a clear 503 until that dependency is configured.
 */
export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);

    if (incoming.pathname === "/healthz") {
      return Response.json({
        ok: true,
        service: "ai-syed-jalal-api-gateway",
        backendConfigured: Boolean(env.BACKEND_API_URL),
      }, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    if (!incoming.pathname.startsWith("/api/")) {
      return Response.json(
        { ok: false, error: "Not found", code: "NOT_FOUND" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (!env.BACKEND_API_URL) {
      return Response.json(
        { ok: false, error: "API backend is not configured", code: "BACKEND_NOT_CONFIGURED" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    let origin;
    try {
      origin = new URL(env.BACKEND_API_URL);
      if (!["https:", "http:"].includes(origin.protocol) || origin.username || origin.password) {
        throw new Error("Invalid backend origin");
      }
      if (origin.pathname !== "/" || origin.search || origin.hash) {
        throw new Error("BACKEND_API_URL must be an origin without a path, query, or fragment");
      }
    } catch {
      return Response.json(
        { ok: false, error: "API backend configuration is invalid", code: "BACKEND_CONFIG_INVALID" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    const target = new URL(origin.origin);
    target.pathname = incoming.pathname.replace(/^\/api/, "/api");
    target.search = incoming.search;

    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.set("x-forwarded-host", incoming.host);
    headers.set("x-forwarded-proto", incoming.protocol.slice(0, -1));

    try {
      const upstream = await fetch(new Request(target.toString(), new Request(request, { headers })));
      const responseHeaders = new Headers(upstream.headers);
      responseHeaders.set("Cache-Control", "no-store");
      responseHeaders.delete("set-cookie2");
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      });
    } catch {
      return Response.json(
        { ok: false, error: "API backend is unreachable", code: "BACKEND_UNREACHABLE" },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }
  },
};
