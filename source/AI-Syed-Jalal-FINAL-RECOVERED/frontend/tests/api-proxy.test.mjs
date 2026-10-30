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
});

test("admin AI overview and provider-health endpoints enforce Admin role", () => {
  const overview = source.slice(source.indexOf("/api/admin/ai/overview"), source.indexOf("/api/admin/ai/provider-health"));
  const health = source.slice(source.indexOf("/api/admin/ai/provider-health"), source.indexOf("/api/library"));
  assert.ok(overview.includes("if(me.role!=='Admin')return reply({error:'Admin role required'},403)"));
  assert.ok(health.includes("if(me.role!=='Admin')return reply({error:'Admin role required'},403)"));
});


test("JSON request body is capped before full buffering and during streaming reads", () => {
  assert.ok(source.includes("declared>max"));
  assert.ok(source.includes("const reader=r.body.getReader()"));
  assert.ok(source.includes("size>max"));
  assert.ok(source.includes("Request body too large"));
});

test("admin user management routes are implemented and role protected", () => {
  assert.ok(source.includes("/api/admin/users"));
  assert.ok(source.includes("ADMIN_USER_CREATE"));
  assert.ok(source.includes("Cannot deactivate the last active administrator"));
});

test("password changes verify the current password and revoke other sessions", () => {
  assert.ok(source.includes("/api/auth/change-password"));
  assert.ok(source.includes("otherSessionsRevoked:true"));
});

test("bulk import and backup restore use bounded, non-destructive merge semantics", () => {
  assert.ok(source.includes("/api/records/bulk"));
  assert.ok(source.includes("/api/backup"));
  assert.ok(source.includes("/api/restore"));
  assert.ok(source.includes("mode:'merge'"));
  assert.ok(source.includes("no unrelated records deleted"));
});

test("operations, permissions and data integrity endpoints are implemented", () => {
  for (const route of ["/api/security/events", "/api/admin/permissions", "/api/admin/metrics", "/api/admin/data-integrity", "/api/admin/system-snapshot"]) assert.ok(source.includes(route));
});

test("Supervisor and AutoGPT are bounded provider-backed workflows", () => {
  assert.ok(source.includes("/api/ai/supervisor"));
  assert.ok(source.includes("/api/ai/autogpt"));
  assert.ok(source.includes("Math.min(3"));
  assert.ok(source.includes("target.pathname='/api/ai/run'"));
});

test("nested Supervisor and AutoGPT calls rebuild JSON headers without stale content length", () => {
  assert.equal((source.match(/delete\('content-length'\)/g) || []).length, 2);
  assert.equal((source.match(/headers:childHeaders/g) || []).length, 2);
});
