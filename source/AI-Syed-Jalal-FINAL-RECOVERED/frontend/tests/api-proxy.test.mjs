import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../functions/api/[[path]].js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { onRequest } = await import(moduleUrl);

function context({ env = {}, url = "https://site.example/api/health?full=1", method = "GET", path = "health", headers = {} } = {}) {
  return {
    env,
    params: { path },
    request: new Request(url, { method, headers, ...(method === "GET" || method === "HEAD" ? {} : { body: JSON.stringify({ sample: true }) }) }),
  };
}

test("returns explicit 503 JSON when backend origin is missing", async () => {
  const response = await onRequest(context());
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).code, "BACKEND_NOT_CONFIGURED");
});

test("rejects invalid protocols and credentials in backend URL", async () => {
  for (const origin of ["ftp://api.example", "https://user:pass@api.example"]) {
    const response = await onRequest(context({ env: { BACKEND_API_URL: origin } }));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "BACKEND_CONFIG_INVALID");
  }
});

test("forwards method, API path, query, and request body to configured origin", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let captured;
  globalThis.fetch = async (request) => {
    captured = request;
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const response = await onRequest(context({
    env: { BACKEND_API_URL: "https://api.example/" },
    url: "https://site.example/api/auth/login?source=mobile",
    method: "POST",
    path: ["auth", "login"],
    headers: { "content-type": "application/json", "x-csrf-token": "test-token" },
  }));

  assert.equal(response.status, 200);
  assert.equal(captured.url, "https://api.example/api/auth/login?source=mobile");
  assert.equal(captured.method, "POST");
  assert.deepEqual(await captured.json(), { sample: true });
  assert.equal(captured.headers.get("x-forwarded-host"), "site.example");
  assert.equal(captured.headers.get("x-forwarded-proto"), "https");
  assert.equal((await response.json()).ok, true);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("maps upstream network failures to explicit 502 JSON", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => { throw new Error("upstream unavailable"); };

  const response = await onRequest(context({ env: { BACKEND_API_URL: "https://api.example" } }));
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, "BACKEND_UNREACHABLE");
});
