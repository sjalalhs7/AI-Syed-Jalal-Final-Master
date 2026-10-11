import assert from 'node:assert/strict';
const base=(process.argv[2]||process.env.API_URL||'http://127.0.0.1:8787').replace(/\/$/,'');
const username=process.env.E2E_USERNAME||process.env.SEED_ADMIN_USERNAME||'admin';
const password=process.env.E2E_PASSWORD||process.env.SEED_ADMIN_PASSWORD;
if(!password){console.error('RUNTIME E2E BLOCKED: set E2E_PASSWORD to the seeded admin password.');process.exit(2)}
let cookie=''; let csrf='';
async function req(path,opts={}){
  const headers={'Content-Type':'application/json',...(opts.headers||{})};
  if(cookie)headers.Cookie=cookie;
  if(csrf && opts.method && opts.method!=='GET')headers['X-CSRF-Token']=csrf;
  const r=await fetch(base+path,{...opts,headers});
  const set=r.headers.get('set-cookie'); if(set) cookie=set.split(';')[0];
  const data=await r.json().catch(()=>({})); return {r,data};
}
let x=await req('/api/health'); assert.equal(x.r.status,200); assert.equal(x.data.ok,true);
x=await req('/api/ready'); assert.equal(x.r.status,200,`DB readiness failed: ${JSON.stringify(x.data)}`); assert.equal(x.data.ready,true);
x=await req('/api/auth/login',{method:'POST',body:JSON.stringify({username,password})}); assert.equal(x.r.status,200,`login failed: ${JSON.stringify(x.data)}`); assert.ok(cookie,'session cookie missing');
x=await req('/api/csrf'); assert.equal(x.r.status,200); csrf=x.data.token; assert.ok(csrf,'csrf token missing');
x=await req('/api/me'); assert.equal(x.r.status,200); assert.equal(x.data.user.username,username);
x=await req('/api/approvals'); assert.equal(x.r.status,200); assert.ok(Array.isArray(x.data.approvals));
if(x.data.approvals[0]){x=await req('/api/approvals/'+x.data.approvals[0].id,{method:'PATCH',body:JSON.stringify({status:'approved'})});assert.equal(x.r.status,200)}
x=await req('/api/auth/logout',{method:'POST'}); assert.equal(x.r.status,200);
x=await req('/api/me'); assert.equal(x.r.status,401,'revoked session remained usable');
console.log('RUNTIME E2E PASS: health + PostgreSQL readiness + login + session + CSRF + approval + logout/revocation');
