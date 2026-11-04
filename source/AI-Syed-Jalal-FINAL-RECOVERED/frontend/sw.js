const CACHE='aj-v135-shell';
const ASSETS=['./','./index.html','./guide.html','./assets/guide.js','./assets/guide.css','./assets/jalalai.js','./assets/jalalai.css','./assets/preview-entry.js','./manifest.webmanifest','./assets/app-mark.svg','./assets/alsyed-jalal-logo.svg','./assets/v101-palette.css','./assets/ai-widget.js','./assets/agent.js','./assets/agent.css','./assets/host-mode.js','./assets/speech-preferences.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const req=e.request,url=new URL(req.url);
  // Never touch non-GET, cross-origin (API on another origin) or /api traffic: authenticated data must not be cached.
  const apiPrefix=new URL('api/',self.location).pathname;
  if(req.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.pathname.startsWith(apiPrefix)||url.pathname.endsWith('/jalalai.html')||url.pathname.endsWith('/workspace.html')||url.pathname.endsWith('/dashboard.html')||url.pathname.endsWith('/agent.html')||url.pathname.endsWith('/agent-lab.html')||url.pathname.endsWith('/arena.html')||url.pathname.endsWith('/jarvis.html')||url.pathname.endsWith('/critic.html')||url.pathname.endsWith('/refactor-plan.html')||url.pathname.endsWith('/allinone.html')||url.pathname.endsWith('/toolbench.html'))return;
  // Pages: network first so deployments show up immediately; cache is offline fallback only.
  if(url.searchParams.has('token')||url.searchParams.has('session'))return;
  const publicPage=['/','/index.html','/guide.html','/roadmaps.html','/visual-styles.html'].some(p=>url.pathname===p||url.pathname.endsWith(p));
  if(req.mode==='navigate'&&!publicPage){e.respondWith(fetch(req));return}
  if(req.mode==='navigate'){
    e.respondWith(fetch(req).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(req,copy));return r}).catch(()=>caches.match(req).then(r=>r||caches.match('./'))));
    return;
  }
  // Static assets: stale-while-revalidate.
  e.respondWith(caches.match(req).then(hit=>{const net=fetch(req).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(req,copy))}return r}).catch(()=>hit);return hit||net}));
});
