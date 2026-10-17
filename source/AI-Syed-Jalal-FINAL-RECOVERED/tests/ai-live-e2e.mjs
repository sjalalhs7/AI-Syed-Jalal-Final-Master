import assert from 'node:assert/strict';
const base=(process.argv[2]||process.env.API_URL||'http://127.0.0.1:8787').replace(/\/$/,'');
const username=process.env.E2E_USERNAME||'admin'; const password=process.env.E2E_PASSWORD;
if(!password){console.error('AI LIVE E2E BLOCKED: set E2E_PASSWORD.');process.exit(2)}
let cookie='',csrf='';
async function req(path,opts={}){const h={'Content-Type':'application/json',...(opts.headers||{})};if(cookie)h.Cookie=cookie;if(csrf&&opts.method&&opts.method!=='GET')h['X-CSRF-Token']=csrf;const r=await fetch(base+path,{...opts,headers:h});const sc=r.headers.get('set-cookie');if(sc)cookie=sc.split(';')[0];const d=await r.json().catch(()=>({}));return {r,d}}
let x=await req('/api/auth/login',{method:'POST',body:JSON.stringify({username,password})});assert.equal(x.r.status,200,JSON.stringify(x.d));
x=await req('/api/csrf');csrf=x.d.token;assert.ok(csrf);
x=await req('/api/ai/capabilities');assert.equal(x.r.status,200);const configured=(x.d.providers||[]).filter(p=>p.configured).map(p=>p.id);if(!configured.length){console.error('AI LIVE E2E BLOCKED: no provider credentials configured. Set GEMINI_API_KEY, DEEPSEEK_API_KEY, OPENAI_API_KEY, or a configured OmniRoute.');process.exit(2)}
const primary=process.env.E2E_AI_PROVIDER||configured[0];const fallback=(process.env.E2E_AI_FALLBACK||configured.find(p=>p!==primary)||'').split(',').filter(Boolean);
x=await req('/api/ai/run',{method:'POST',body:JSON.stringify({agentId:x.d.agents?.[0]?.id,provider:primary,fallbackProviders:fallback,prompt:'Reply with exactly: LIVE AI E2E PASS'})});assert.equal(x.r.status,200,JSON.stringify(x.d));assert.ok(x.d.output);assert.equal(x.d.provider,primary);console.log(`AI LIVE E2E PASS: ${primary}${fallback.length?' with fallback '+fallback.join(','):''}`);
