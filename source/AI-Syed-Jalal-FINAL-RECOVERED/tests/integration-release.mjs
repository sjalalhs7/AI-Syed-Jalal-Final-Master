import assert from 'node:assert/strict';
const base=process.env.INTEGRATION_URL||'http://127.0.0.1:8787';
const username=process.env.TEST_ADMIN_USERNAME||'admin';
const password=process.env.TEST_ADMIN_PASSWORD||'Integration-Only-12345!';
async function req(path,opts={}){const r=await fetch(base+path,{...opts,headers:{'Content-Type':'application/json',...(opts.headers||{})}});let body={};try{body=await r.json()}catch{};return {r,body};}
let x=await req('/api/health'); assert.equal(x.r.status,200); assert.equal(x.body.version,'V39'); assert.ok(x.r.headers.get('x-request-id'));
x=await req('/api/ready'); assert.equal(x.r.status,200); assert.equal(x.body.ready,true);
x=await req('/api/version'); assert.equal(x.r.status,200); assert.equal(x.body.version,'V39');
x=await req('/api/auth/login',{method:'POST',body:JSON.stringify({username,password})}); assert.equal(x.r.status,200); assert.ok(x.body.token); const token=x.body.token;
x=await req('/api/me',{headers:{Authorization:`Bearer ${token}`}}); assert.equal(x.r.status,200); assert.equal(x.body.user.role,'Admin');
x=await req('/api/permissions',{headers:{Authorization:`Bearer ${token}`}}); assert.equal(x.r.status,200); assert.ok(x.body.roles.Admin);
x=await req('/api/admin/health-detail',{headers:{Authorization:`Bearer ${token}`}}); assert.equal(x.r.status,200); assert.equal(x.body.database,'ready');
x=await req('/api/admin/metrics',{headers:{Authorization:`Bearer ${token}`}}); assert.equal(x.r.status,200); assert.ok(x.body.db);
const record={id:`v39-${Date.now()}`,name:'V39 Integration Record',region:'Integration',sector:'QA',status:'Active',notes:'Automated release gate'};
x=await req('/api/records',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify(record)}); assert.equal(x.r.status,201);
x=await req(`/api/records/${record.id}`,{headers:{Authorization:`Bearer ${token}`}}); assert.equal(x.r.status,200); assert.equal(x.body.record.id,record.id);
x=await req(`/api/records/${record.id}`,{method:'DELETE',headers:{Authorization:`Bearer ${token}`}}); assert.equal(x.r.status,200);
x=await req('/api/auth/logout',{method:'POST',headers:{Authorization:`Bearer ${token}`}}); assert.equal(x.r.status,200);
console.log(JSON.stringify({ok:true,release:'V39',checks:['health','readiness','version','login','permissions','admin-health','admin-metrics','record-create','record-read','record-delete','logout']},null,2));
