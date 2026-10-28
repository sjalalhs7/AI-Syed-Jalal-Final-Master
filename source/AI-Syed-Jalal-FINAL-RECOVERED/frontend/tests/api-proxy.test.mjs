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

test("malformed cookie encoding does not crash session parsing", () => {
  assert.ok(source.includes("try{return [k,decodeURIComponent(v)]}catch{return [k,v]}"));
});

test("API route rejects paths outside /api", () => {
  assert.ok(source.includes("if(!u.pathname.startsWith('/api/'))return reply({ok:false,error:'Not found'},404)"));
});

test("admin seed password can recover an existing Admin account only when the configured seed credentials match", () => {
  assert.ok(source.includes("const mayRecover=usr.role==='Admin'&&name===seedName&&password===seedPassword"));
  assert.ok(source.includes("seedPassword.length>=12&&!/change-?me|replace/i.test(seedPassword)"));
  assert.ok(source.includes("UPDATE app_users SET salt=$1,password_hash=$2 WHERE id=$3 AND role='Admin' RETURNING id"));
});

test("registration uses a role allowed by the database schema", () => {
  assert.ok(source.includes("VALUES($1,$2,'Viewer',$3,$4)"));
  assert.ok(!source.includes("VALUES($1,$2,'User',$3,$4)"));
});

test("login has a server-side IP rate limit", () => {
  assert.ok(source.includes("rateLimited(db,request,'LOGIN_FAILED',10,\"interval '15 minutes'\")"));
  assert.ok(source.includes("'Retry-After':'900'"));
});

test("AI requests have per-user minute and daily quotas", () => {
  assert.ok(source.includes("interval '1 minute'"));
  assert.ok(source.includes("interval '1 day'"));
  assert.ok(source.includes("AI request limit reached (20 per minute)"));
  assert.ok(source.includes("Daily AI request limit reached (200 per day)"));
}
... (output truncated, full output saved to: /mnt/files/.composio/output/bash_pony_stdout.txt)
Run 'cat /mnt/files/.composio/output/bash_pony_stdout.txt' to view the full output, or use 'head -n 100 /mnt/files/.composio/output/bash_pony_stdout.txt' / 'tail -n 100 /mnt/files/.composio/output/bash_pony_stdout.txt' to view parts of it.

test("admin AI overview and provider-health endpoints enforce Admin role", () => {
  const overview = source.slice(source.indexOf("/api/admin/ai/overview"), source.indexOf("/api/admin/ai/provider-health"));
  const health = source.slice(source.indexOf("/api/admin/ai/provider-health"), source.indexOf("/api/library"));
  assert.ok(overview.includes("if(me.role!=='Admin')return reply({error:'Admin role required'},403)"));
  assert.ok(health.includes("if(me.role!=='Admin')return reply({error:'Admin role required'},403)"));
});
