const CACHE='aj-v156-jarvis-welcome';
const ASSETS=['./','./index.html','./guide.html','./capabilities.html','./protocol.html','./assets/guide.js','./assets/guide.css','./assets/jalalai.js','./assets/jalalai.css','./assets/preview-entry.js','./assets/pwa-surfaces.css','./assets/pwa-handlers.js','./manifest.webmanifest','./assets/app-mark.svg','./assets/alsyed-jalal-logo.svg','./assets/v101-palette.css','./assets/ai-widget.js','./assets/agent.js','./assets/agent.css','./assets/host-mode.js','./assets/speech-preferences.js','./assets/app-icons/icon-192.png','./assets/app-icons/icon-512.png','./assets/app-icons/icon-maskable-512.png','./assets/app-icons/apple-touch-icon-180.png','./assets/approved-sj-rainbow-crown.svg','./assets/visual-system.css','./assets/visual-theme.js','./assets/jarvis-welcome.js','./assets/jarvis-welcome.js?v=156','./assets/jarvis-welcome.css?v=156','./assets/jarvis-welcome-ur-pk.mp3','./assets/content-report.css','./assets/content-report.js','./components/AIWidget/AIWidget.js','./components/AIWidget/AIWidget.css','./config/api.js','./assets/brand/favicon.svg','./widgets/widget-data.json','./widgets/new-note-template.json'];

self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('aj-v')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const req=e.request,url=new URL(req.url);
  // Never touch non-GET, cross-origin (API on another origin) or /api traffic: authenticated data must not be cached.
  const apiPrefix=new URL('api/',self.location).pathname;
  if(req.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.pathname.startsWith(apiPrefix)||url.pathname.endsWith('/jalalai.html')||url.pathname.endsWith('/workspace.html')||url.pathname.endsWith('/dashboard.html')||url.pathname.endsWith('/agent.html')||url.pathname.endsWith('/agent-lab.html')||url.pathname.endsWith('/arena.html')||url.pathname.endsWith('/jarvis.html')||url.pathname.endsWith('/critic.html')||url.pathname.endsWith('/refactor-plan.html')||url.pathname.endsWith('/allinone.html')||url.pathname.endsWith('/toolbench.html')||url.pathname.endsWith('/pagebuilder.html')||url.pathname.endsWith('/notes.html')||url.pathname.endsWith('/share-target.html'))return;
  // Pages: network first so deployments show up immediately; cache is offline fallback only.
  if(url.searchParams.has('token')||url.searchParams.has('session'))return;
  const publicPage=['/','/index.html','/guide.html','/capabilities.html','/protocol.html','/roadmaps.html','/visual-styles.html'].some(p=>url.pathname===p||url.pathname.endsWith(p));
  if(req.mode==='navigate'&&!publicPage){e.respondWith(fetch(req));return}
  if(req.mode==='navigate'){
    e.respondWith(fetch(req).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(req,copy));return r}).catch(()=>caches.match(req).then(r=>r||caches.match('./'))));
    return;
  }
  // Static assets: stale-while-revalidate.
  e.respondWith(caches.match(req).then(hit=>{const net=fetch(req).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(req,copy))}return r}).catch(()=>hit);return hit||net}));
});

/* ---------------------------------------------------------------------------
 * OS widgets (Windows 11 Widgets Board, Edge).
 *
 * The widget is rendered from a static Adaptive Card template plus a static
 * data file. Nothing account-scoped is fetched here: an installed widget can
 * render before the user signs in, so it must never carry another account's
 * data, and a failed fetch must leave the previous content in place.
 * ------------------------------------------------------------------------- */
const WIDGET_TAG='aj-new-note';

async function widgetDefinition(widget){
  try{
    if(widget&&widget.definition)return widget.definition;
    const reg=await caches.match(new URL('./manifest.webmanifest',self.location).href);
    const manifest=reg?await reg.json():null;
    const def=manifest&&Array.isArray(manifest.widgets)?manifest.widgets.find(w=>w.tag===WIDGET_TAG):null;
    return def||null;
  }catch{return null}
}

async function refreshWidget(widget){
  if(!self.widgets||typeof self.widgets.updateByTag!=='function')return;
  const def=await widgetDefinition(widget);
  if(!def)return;
  const base=self.location.href;
  try{
    const [template,data]=await Promise.all([def.ms_ac_template,def.data].map(path=>path?fetch(new URL(path,base),{cache:'no-cache'}).then(r=>r.ok?r.json():null):Promise.resolve(null)));
    if(!template)return;
    await self.widgets.updateByTag(def.tag||WIDGET_TAG,{template,data:data||{}});
  }catch{/* Offline or the host dropped the widget: keep the last good content. */}
}

// Remove a refresh job created by older versions. Current widgets refresh on
// install/resume only; this app does not register background sync.
async function removeLegacyWidgetRefresh(){
  try{await self.registration.periodicSync?.unregister('aj-widget-refresh')}catch{}
}
self.addEventListener('activate',e=>e.waitUntil(removeLegacyWidgetRefresh()));
self.addEventListener('widgetinstall',e=>e.waitUntil(refreshWidget(e.widget)));
self.addEventListener('widgetresume',e=>e.waitUntil(refreshWidget(e.widget)));

// A tap anywhere on the widget opens a new note. If the app is already open we
// focus that window and navigate it, so the user never ends up with duplicates.
self.addEventListener('widgetclick',e=>e.waitUntil((async()=>{
  const target=new URL('./notes.html?new=1&from=widget',self.location).href;
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=windows.find(client=>client.url.startsWith(new URL('./',self.location).href));
  if(existing){try{await existing.focus();if('navigate' in existing)await existing.navigate(target);return}catch{}}
  await self.clients.openWindow(target);
})()));

self.addEventListener('widgetuninstall',e=>e.waitUntil(removeLegacyWidgetRefresh()));
