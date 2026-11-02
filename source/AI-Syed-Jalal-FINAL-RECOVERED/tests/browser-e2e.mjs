import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const url=process.argv[2]||process.env.FRONTEND_URL||'http://127.0.0.1:8080/';
const chrome=process.env.CHROMIUM||'chromium'; const port=process.env.CDP_PORT||9222;
const p=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',`--remote-debugging-port=${port}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 let wsUrl=''; for(let i=0;i<50;i++){try{const v=await fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.json());wsUrl=v.webSocketDebuggerUrl;break}catch{} await sleep(100)}
 if(!wsUrl)throw new Error('Chromium CDP unavailable');
 const ws=new WebSocket(wsUrl); await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej}); let id=0; const pending=new Map(); ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}};
 const cmd=(method,params={})=>new Promise((res,rej)=>{const n=++id;pending.set(n,m=>m.error?rej(new Error(m.error.message)):res(m.result));ws.send(JSON.stringify({id:n,method,params}))});
 await cmd('Page.enable'); await cmd('Runtime.enable'); await cmd('Page.navigate',{url}); await sleep(1200);
 async function evaljs(expression){const r=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});return r.result?.value}
 const result=await evaljs(`(async()=>{document.querySelector('#demoBtn')?.click();await new Promise(r=>setTimeout(r,700));const navs=[...document.querySelectorAll('[data-nav]')].map(x=>x.dataset.nav).filter(Boolean);const unique=[...new Set(navs)];const out=[];for(const v of unique){const b=[...document.querySelectorAll('[data-nav]')].find(x=>x.dataset.nav===v);b?.click();await new Promise(r=>setTimeout(r,80));out.push({v,active:document.querySelector('#view-'+v)?.classList.contains('active')});}document.querySelector('[data-approval="open"]')?.click();await new Promise(r=>setTimeout(r,100));const approval=!!document.querySelector('#approvalModal:not(.hidden)');return {unique,failed:out.filter(x=>!x.active),approval};})()`);
 assert.deepEqual(result.failed,[]); assert.equal(result.approval,true); console.log(`BROWSER E2E PASS: ${result.unique.length} navigation targets + approval modal`); ws.close();
}catch(e){console.error('BROWSER E2E BLOCKED/FAILED:',e.message);process.exit(2)}finally{p.kill('SIGTERM')}
