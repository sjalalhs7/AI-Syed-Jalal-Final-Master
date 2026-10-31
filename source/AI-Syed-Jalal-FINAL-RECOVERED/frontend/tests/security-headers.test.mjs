import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const headers = await readFile(new URL("../_headers", import.meta.url), "utf8");

test("static site ships a restrictive, same-origin Content Security Policy", () => {
  assert.match(headers, /Content-Security-Policy:/);
  assert.match(headers, /default-src 'self'/);
  assert.match(headers, /object-src 'none'/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(headers, /form-action 'self'/);
  assert.match(headers, /connect-src 'self'/);
});

test("CSP remains compatible with the existing inline UI and local assets", () => {
  assert.match(headers, /script-src 'self' 'unsafe-inline'/);
  assert.match(headers, /style-src 'self' 'unsafe-inline'/);
  assert.match(headers, /img-src 'self' data: blob: https:/);
  assert.match(headers, /worker-src 'self' blob:/);
});

test("baseline browser security headers remain configured", () => {
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /X-Frame-Options: DENY/);
  assert.match(headers, /Referrer-Policy: strict-origin-when-cross-origin/);
});
