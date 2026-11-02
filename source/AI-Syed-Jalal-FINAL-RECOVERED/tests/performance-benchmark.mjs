import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
const base=(process.env.SMOKE_URL||'http://127.0.0.1:8787').replace(/\/$/,'');
const username=process.env.BENCH_USER||'admin'; const password=process.env.BENCH_PASSWORD||'';
const sizes=(process.env.BENCH_SIZES||'10000,50000,100000').split(',').map(Number).filter(Boolean);
const concurrency=Number(process.env.BENCH_CONCURRENCY||20);
async function req(path,opts={}){const r=await fetch(base+path,{...opts,headers:{'content-type':'application/json',...(opts.headers||{})}});const data=await r.json().catch(()=>({}));assert.ok(r.ok,`${path} HTTP ${r.status}: ${data.error||''}`);return data}
async function login(){if(!password)return null;const x=await req('/api/auth/login',{method:'POST',body:JSON.stringify({username,password})});return x.token}
function records(n,offset=0){return Array.from({length:n},(_,i)=>({id:`BENCH-${offset+i+1}`,name:`Benchmark Record ${offset+i+1}`,region:i%2?'North':'Central',sector:i%3?'Operations':'Verification',status:'Active',notes:'V40 performance benchmark'}))}
const token=await login(); const headers=token?{authorization:`Bearer ${token}`}:{}, results=[];
for(const n of sizes){const all=records(n);const t0=performance.now();for(let i=0;i<all.length;i+=5000){await req('/api/records/bulk',{method:'POST',headers,body:JSON.stringify({records:all.slice(i,i+5000)})})}const importMs=performance.now()-t0;const t1=performance.now();await req('/api/records?page=1&limit=100&q=Benchmark');const listMs=performance.now()-t1;const t2=performance.now();await req('/api/records?page=1&limit=100&region=North');const filterMs=performance.now()-t2;const t3=performance.now();await Promise.all(Array.from({length:concurrency},()=>req('/api/records?page=1&limit=100&q=Benchmark')));const concurrentMs=performance.now()-t3;results.push({records:n,importMs:Math.round(importMs),listMs:Math.round(listMs),filterMs:Math.round(filterMs),concurrentMs:Math.round(concurrentMs),concurrency});console.log(JSON.stringify(results.at(-1)));}
console.log(JSON.stringify({suite:'V40 performance benchmark',base,sizes,results},null,2));
