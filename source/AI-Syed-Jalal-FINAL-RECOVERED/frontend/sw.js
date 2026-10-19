const CACHE='aj-v121-shell';
const ASSETS=['./','./index.html','./workspace.html','./dashboard.html','./manifest.webmanifest','./assets/app-mark.svg','./assets/alsyed-jalal-logo.svg','./assets/v101-palette.css','./assets/ai-widget.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const req=e.request,url=new URL(req.url);
  // Never touch non-GET, cross-origin (API on another origin) or /api traffic: authenticated data must not be cached.
  if(req.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  // Pages: network first so deployments show up immediately; cache is offline fallback only.
  if(req.mode==='navigate'){
    e.respondWith(fetch(req).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(req,copy));return r}).catch(()=>caches.match(req).then(r=>r||caches.match('./'))));
    return;
  }
  // Static assets: stale-while-revalidate.
  e.respondWith(caches.match(req).then(hit=>{const net=fetch(req).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(req,copy))}return r}).catch(()=>hit);return hit||net}));
});
