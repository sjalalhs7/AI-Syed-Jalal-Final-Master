import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../functions/api/[[path]].js", import.meta.url), "utf8");

test("API explicitly reports missing Neon configuration instead of pretending readiness", () => {
  assert.ok(source.includes("DATABASE_NOT_CONFIGURED"));
  assert.ok(source.includes("if(!env.DATABASE_URL)"));
});

test("chat forwards to the provider-backed AI route, not a canned demo response", () => {
  assert.ok(source.includes("target.pathname='/api/ai/run'"));
  assert.ok(source.includes("reply:result.output||''"));
  assert.ok(!source.includes("mode:'demo',simulated:true,reply:"));
});

test("OmniRoute capability detection accepts the same aliases as execution", () => {
  assert.ok(source.includes("env.OMNIROUTE_API_KEY||env.OMNIROUTE_KEY"));
  assert.ok(source.includes("env.OMNIROUTE_BASE_URL||env.OMNIROUTE_URL"));
  assert.ok(source.includes("configured:Boolean((env.OMNIROUTE_API_KEY||env.OMNIROUTE_KEY)&&(env.OMNIROUTE_BASE_URL||env.OMNIROUTE_URL))"));
});

test("admin provider health accepts OmniRoute alternate key and endpoint names", () => {
  const health = source.slice(source.indexOf("/api/admin/ai/provider-health"), source.indexOf("/api/library"));
  assert.ok(health.includes("env.OMNIROUTE_API_KEY||env.OMNIROUTE_KEY"));
  assert.ok(health.includes("env.OMNIROUTE_BASE_URL||env.OMNIROUTE_URL"));
  assert.ok(health.includes("live call not yet verified"));
});

test("API route rejects paths outside /api", () => {
  assert.ok(source.includes("if(!u.pathname.startsWith('/api/'))return reply({ok:false,error:'Not found'},404)"));
});
