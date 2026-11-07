import { neon } from '@neondatabase/serverless';
import { scrypt } from 'scrypt-js';
import { localAssistant } from '../assistant-core.mjs';
import { assistantRoute } from '../assistant-routes.mjs';
import { platformRoute } from '../platform-routes.mjs';
import { agentRoute } from '../agent-routes.mjs';
import { contentReportRoute } from '../content-report-routes.mjs';
import { arenaRoute, arenaCatalogue } from '../arena-routes.mjs';
import libraryCatalog from '../../config/library-catalog.json';
import { SCHEMA_PARTS, REQUIRED_TABLES, destructiveStatements } from '../schema-bundle.mjs';
import { applySchemaRepair, missingTables } from '../schema-repair.mjs';
import { effectiveEnv, providerStates, maskKey, PROVIDER_IDS } from '../provider-settings.mjs';

const C = 'aj_session', TTL = 28800000, WRITERS = ['Admin','Manager','Data Operator'];
const reply = (data,status=200,headers={}) => Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(self), geolocation=()','Cross-Origin-Opener-Policy':'same-origin',...headers}});
const hex = b => Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
const random = n => crypto.getRandomValues(new Uint8Array(n));
const digest = async s => hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))));
const pass = async (p,s) => hex(await scrypt(new TextEncoder().encode(String(p)),new TextEncoder().encode(String(s)),16384,8,1,64));
const equal = (a,b) => {const x=new TextEncoder().encode(String(a)),y=new TextEncoder().encode(String(b));if(x.length!==y.length)return false;let d=0;for(let i=0;i<x.length;i++)d|=x[i]^y[i];return d===0};
const cookies = r => Object.fromEntries((r.headers.get('cookie')||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');if(i<0)return [x,''];const k=x.slice(0,i),v=x.slice(i+1);try{return [k,decodeURIComponent(v)]}catch{return [k,v]}}));
const storedKeysSafe = async db => {
  try{const r=await db.query("SELECT value FROM app_settings WHERE key='provider_keys'");const v=r?.[0]?.value;return v&&typeof v==='object'?v:{}}catch{return {}}
};
const rawToken = r => {const a=r.headers.get('authorization')||'';return a.startsWith('Bearer ')?a.slice(7):(cookies(r)[C]||'')};
const csrf = async (t,s) => {if(!s||s.length<32)throw Error('CSRF_SECRET is not configured');const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(s),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(new Uint8Array(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(t))))};
const readBody = async (r,max=1024*1024) => {const declared=Number(r.headers.get('content-length')||0);if(declared>max)throw Object.assign(Error('Request body too large'),{status:413});if(!r.body)return {};const reader=r.body.getReader(),chunks=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw Object.assign(Error('Request body too large'),{status:413})}chunks.push(value)}}finally{reader.releaseLock()}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}const t=new TextDecoder().decode(bytes);if(!t)return {};try{const value=JSON.parse(t);if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value}catch{throw Object.assign(Error('Invalid JSON body'),{status:400})}};
const sessionCookie = (t,env={}) => C+'='+t+'; Max-Age=28800; Path=/; HttpOnly;'+((env.DB_ADAPTER&&env.COOKIE_SECURE==='false')?'':' Secure;')+' SameSite=Lax';
async function audit(db,u,action,detail,req){try{await db.query('INSERT INTO audit_events(id,user_id,action,detail,ip,request_id) VALUES($1,$2,$3,$4,$5,$6)',[crypto.randomUUID(),u?u.id:null,action,detail,req.headers.get('CF-Connecting-IP')||'',req.headers.get('cf-ray')||null])}catch{}}
async function consumeRateLimit(db, scope, subject, capacity, refillSeconds){
 const subjectHash=await digest(subject),requestId=crypto.randomUUID();
 const rows=await db.query(`WITH stale AS (DELETE FROM auth_rate_limits WHERE updated_at<now()-interval '30 days' AND NOT (scope=$1 AND subject_hash=$2) RETURNING 1), applied AS (INSERT INTO auth_rate_limits(scope,subject_hash,tokens,updated_at,last_request_id) SELECT $1,$2,$3::numeric-1,now(),$5 FROM (SELECT count(*) FROM stale) cleanup ON CONFLICT(scope,subject_hash) DO UPDATE SET tokens=CASE WHEN auth_rate_limits.tokens+GREATEST(0,EXTRACT(EPOCH FROM (now()-auth_rate_limits.updated_at))/$4::numeric)>=1 THEN LEAST($3::numeric,auth_rate_limits.tokens+GREATEST(0,EXTRACT(EPOCH FROM (now()-auth_rate_limits.updated_at))/$4::numeric))-1 ELSE auth_rate_limits.tokens END,updated_at=CASE WHEN auth_rate_limits.tokens+GREATEST(0,EXTRACT(EPOCH FROM (now()-auth_rate_limits.updated_at))/$4::numeric)>=1 THEN now() ELSE auth_rate_limits.updated_at END,last_request_id=CASE WHEN auth_rate_limits.tokens+GREATEST(0,EXTRACT(EPOCH FROM (now()-auth_rate_limits.updated_at))/$4::numeric)>=1 THEN $5 ELSE auth_rate_limits.last_request_id END RETURNING last_request_id=$5 AS allowed) SELECT allowed FROM applied`,[scope,subjectHash,capacity,refillSeconds,requestId]);
 return rows[0]?.allowed===true;
}
async function rateLimited(db, req, action, max, windowSql, userId=null){
 const ip=req.headers.get('CF-Connecting-IP')||'';
 if(!ip)return true; // fail closed if the trusted edge IP is unavailable
 const sql=userId
  ? `SELECT count(*)::int AS n FROM ai_runs WHERE user_id=$1 AND created_at>now()-${windowSql}`
  : `SELECT count(*)::int AS n FROM audit_events WHERE action=$1 AND ip=$2 AND created_at>now()-${windowSql}`;
 const args=userId?[userId]:[action,ip];
 const rows=await db.query(sql,args);
 return Number(rows[0]?.n||0)>=max;
}
async function userFor(db,req){const t=rawToken(req);if(!t)return null;const a=await db.query('SELECT u.id,u.username,u.role,s.id AS session_id FROM sessions s JOIN app_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.active=true LIMIT 1',[await digest(t)]);return a[0]||null}
async function validCsrf(req,env){const t=rawToken(req),v=req.headers.get('x-csrf-token')||'';return !!(t&&v&&equal(await csrf(t,env.CSRF_SECRET||env.SESSION_SECRET||''),v))}
export async function onRequest(ctx){
 const request=ctx.request;
 const u=new URL(request.url),p=u.pathname.split('/').filter(Boolean);
 const baseEnv=ctx.env;
 // Layer Admin-set keys from app_settings over the deployment environment so a
 // key added in the Operations panel works immediately, with no redeploy.
 let env=baseEnv;
 try{
   if(baseEnv.DATABASE_URL||baseEnv.DB_ADAPTER){
     const probe=baseEnv.DB_ADAPTER||neon(baseEnv.DATABASE_URL);
     env=await effectiveEnv(baseEnv,probe);
   }
 }catch{ env=baseEnv }
 if(!u.pathname.startsWith('/api/'))return reply({ok:false,error:'Not found'},404);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{Allow:'GET,POST,PUT,PATCH,DELETE,OPTIONS','Cache-Control':'no-store'}});
 if(!env.DB_ADAPTER&&!env.DATABASE_URL)return reply({ok:false,error:'Neon DATABASE_URL is not configured',code:'DATABASE_NOT_CONFIGURED'},503);
 const db=env.DB_ADAPTER||neon(env.DATABASE_URL);
 try{
  if(u.pathname==='/api/health'&&request.method==='GET'){await db.query('SELECT 1');return reply({ok:true,service:'Al-Syed Jalal AI Cloudflare API',version:'V150',runtime:env.LOCAL_PREVIEW?'Local preview':'Cloudflare Pages Functions',database:env.LOCAL_PREVIEW?'PGlite (local PostgreSQL)':'Neon PostgreSQL',localPreview:Boolean(env.LOCAL_PREVIEW),assistant:{localTools:true,voiceInput:'browser-dependent',voiceOutput:'browser-speech',cloudConfigured:Boolean(env.GEMINI_API_KEY||env.OPENAI_API_KEY||env.ANTHROPIC_API_KEY||env.DEEPSEEK_API_KEY||((env.OMNIROUTE_API_KEY||env.OMNIROUTE_KEY)&&(env.OMNIROUTE_BASE_URL||env.OMNIROUTE_URL)))},databaseConnected:true})}
  if(u.pathname==='/api/chat'&&request.method==='POST'){const target=new URL(request.url);target.pathname='/api/ai/run';const response=await onRequest({request:new Request(target,request),env});if(!response.ok)return response;const result=await response.json();return reply({...result,reply:result.output||''},response.status)}
  if(u.pathname==='/api/demo'&&request.method==='POST'){if(!env.LOCAL_PREVIEW||!env.DB_ADAPTER)return reply({error:'Not found'},404);if(await userFor(db,request))return reply({ok:true,preview:true});if(!await consumeRateLimit(db,'preview-session',request.headers.get('CF-Connecting-IP')||'local',Math.max(1,Number(env.PREVIEW_SESSION_PER_MINUTE)||10),60))return reply({error:'Please wait before starting another preview account.'},429);const id=crypto.randomUUID(),token=hex(random(48)),salt=hex(random(16));await db.query("INSERT INTO app_users(id,username,role,salt,password_hash) VALUES($1,$2,'Admin',$3,$4)",[id,'preview-'+id.slice(0,8),salt,await pass(hex(random(24)),salt)]);await db.query('INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,$4)',[crypto.randomUUID(),id,await digest(token),new Date(Date.now()+TTL).toISOString()]);return reply({ok:true,preview:true},200,{'Set-Cookie':sessionCookie(token,env)})}
  if(u.pathname==='/api/version'&&request.method==='GET')return reply({app:'Al-Syed Jalal AI',version:'V150',release:'cloudflare-native'});
  if(u.pathname==='/api/ready'&&request.method==='GET'){await db.query('SELECT 1');const rows=await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");const have=(rows||[]).map(r=>r.table_name);const n=REQUIRED_TABLES.filter(t=>have.includes(t)).length;const missing=REQUIRED_TABLES.filter(t=>!have.includes(t));const ok=missing.length===0;const affected=missing.length?'Some features, including Arena, Agent Lab, the Expert Critic and content reports, may fail until their required tables exist.':'Nothing is missing.';return reply({ok,ready:ok,database:env.LOCAL_PREVIEW?'PGlite (local PostgreSQL)':'Neon PostgreSQL',schemaTables:n,required:REQUIRED_TABLES.length,missing,summary:`${n} of ${REQUIRED_TABLES.length} tables present. ${affected}`,howToFix:'Verify a restorable full database backup and rehearse on an isolated target. An Admin may then approve repair in Workspace Operations.',scope:'required table names only; columns, indexes, migration history, data and provider behavior are not checked',signInAffected:!(['app_users','sessions'].every(t=>have.includes(t)))},ok?200:503)}
  if(u.pathname==='/api/ai/capabilities'&&request.method==='GET'){const me=await userFor(db,request);if(!me)return reply({error:'Authentication required'},401);const providers=[{id:'openai',label:'OpenAI / ChatGPT',configured:Boolean(env.OPENAI_API_KEY),status:env.OPENAI_API_KEY?'Key configured; live call not yet verified':'API key not configured',model:env.OPENAI_MODEL||'gpt-4o-mini',adapter:'enabled'},{id:'anthropic',label:'Anthropic / Claude',configured:Boolean(env.ANTHROPIC_API_KEY),status:env.ANTHROPIC_API_KEY?'Key configured; live call not yet verified':'API key not configured',model:env.ANTHROPIC_MODEL||'claude-3-5-haiku-latest',adapter:'enabled'},{id:'deepseek',label:'DeepSeek',configured:Boolean(env.DEEPSEEK_API_KEY),status:env.DEEPSEEK_API_KEY?'Key configured; live call not yet verified':'API key not configured',model:env.DEEPSEEK_MODEL||'deepseek-chat',adapter:'enabled'},{id:'gemini',label:'Google Gemini',configured:Boolean(env.GEMINI_API_KEY),status:env.GEMINI_API_KEY?'Key configured; live call not yet verified':'API key not configured',model:env.GEMINI_MODEL||'gemini-2.5-flash',adapter:'enabled'},{id:'omniroute',label:'OmniRoute (OpenAI-compatible)',configured:Boolean((env.OMNIROUTE_API_KEY||env.OMNIROUTE_KEY)&&(env.OMNIROUTE_BASE_URL||env.OMNIROUTE_URL)),status:(env.OMNIROUTE_API_KEY||env.OMNIROUTE_KEY)&&(env.OMNIROUTE_BASE_URL||env.OMNIROUTE_URL)?'Key and endpoint configured; live call not yet verified':'Optional key/base URL not configured',model:env.OMNIROUTE_MODEL||'provider default',adapter:'enabled'}];const agents=[{id:'general',name:'General Assistant',group:'General',mode:'provider-backed text profile'},{id:'coding',name:'Coding Assistant',group:'Development',mode:'provider-backed text profile'},{id:'ux-ui-pro-max',name:'UX/UI Design Assistant',group:'Design',mode:'provider-backed text profile'},{id:'analysis',name:'Analysis Assistant',group:'Analysis',mode:'provider-backed text profile'},{id:'superpower',name:'Task Planning Assistant',group:'Planning',mode:'bounded text planning; no external tools'}];return reply({mode:providers.some(p=>p.configured)?'live-ready':'provider-keys-required',agents,executableAgentProfiles:agents.length,catalogRoles:120,agencyLayer:{profiles:303,execution:'profiles/catalog available in recovered backend; Cloudflare text endpoint does not execute every profile as a separate tool'},skillRegistry:{version:'V71.0.0',totalSkills:3500,domainCount:35,source:'recovered project config/ai-skill-index-v71.json'},skills:[],skillPacks:[],providers,status:'This API exposes five provider-backed text prompt profiles. They do not browse the web, query private records, use voice or medical tools, or execute external actions. The separate catalogue contains 120 role definitions and 3,500 reference skills across 35 domains; catalogue entries are not independent model instances. A configured provider key does not prove a successful live request.',runtime:{providers:Object.fromEntries(providers.map(p=>[p.id,{configured:p.configured,adapter:p.adapter}]))}})}
  // --- V149 admin-managed provider keys ----------------------------------------
  if(u.pathname==='/api/admin/providers'&&request.method==='GET'){
   const me=await userFor(db,request);if(!me)return reply({error:'Authentication required'},401);
   if(me.role!=='Admin')return reply({error:'Admin role required'},403);
   const states=await providerStates(env,db);
   return reply({providers:states,note:'A configured key is not proof the provider accepts it. Send a prompt to find out. Keys are never returned in full.'});
  }

  if(u.pathname==='/api/admin/providers'&&request.method==='POST'){
   const me=await userFor(db,request);if(!me)return reply({error:'Authentication required'},401);
   if(me.role!=='Admin')return reply({error:'Admin role required'},403);
   // This route precedes the shared mutation guard below, so enforce CSRF here.
   if(!await validCsrf(request,env))return reply({error:'CSRF protection: missing or invalid X-CSRF-Token'},403);
   if(!await consumeRateLimit(db,'provider-keys',me.id,10,600))return reply({error:'Too many key changes. Wait ten minutes.'},429);
   const x=await readBody(request);
   const provider=String(x.provider||'').toLowerCase();
   if(!PROVIDER_IDS.includes(provider))return reply({error:'Unknown provider. Choose one of: '+PROVIDER_IDS.join(', ')},400);
   const stored=await storedKeysSafe(db);
   if(x.remove===true){
     delete stored[provider];
   }else{
     const key=String(x.key||'').trim();
     if(key.length<8||key.length>400)return reply({error:'That does not look like an API key (expected 8-400 characters).'},400);
     if(/\s/.test(key))return reply({error:'API keys do not contain spaces. Check for a stray paste.'},400);
     stored[provider]=key;
   }
   await db.query("INSERT INTO app_settings(key,value,updated_at,updated_by) VALUES('provider_keys',$1::jsonb,now(),$2) ON CONFLICT(key) DO UPDATE SET value=$1::jsonb,updated_at=now(),updated_by=$2",[JSON.stringify(stored),me.username]);
   await audit(db,me,'PROVIDER_KEY_'+(x.remove===true?'REMOVED':'SET'),provider,request);
   return reply({ok:true,providers:await providerStates(env,db),note:'Saved. Send a prompt to verify the provider actually answers.'});
  }

  if(u.pathname==='/api/admin/ai/overview'&&request.method==='GET'){const me=await userFor(db,request);if(!me)return reply({error:'Authentication required'},401);if(me.role!=='Admin')return reply({error:'Admin role required'},403);const rows=await db.query("SELECT count(*)::int AS runs,count(*) FILTER (WHERE status='completed')::int AS completed,count(*) FILTER (WHERE status<>'completed')::int AS non_completed,0::int AS tokens FROM ai_runs WHERE created_at>now()-interval '24 hours'");const x=rows[0]||{};return reply({summary:{runs:Number(x.runs||0),completed:Number(x.completed||0),non_completed:Number(x.non_completed||0),tokens:Number(x.tokens||0)}})}
  if(u.pathname==='/api/admin/ai/provider-health'&&request.method==='GET'){const me=await userFor(db,request);if(!me)return reply({error:'Authentication required'},401);if(me.role!=='Admin')return reply({error:'Admin role required'},403);const providers=[{id:'openai',label:'OpenAI / ChatGPT',configured:Boolean(env.OPENAI_API_KEY),status:env.OPENAI_API_KEY?'Key configured; live call not yet verified':'API key not configured',model:env.OPENAI_MODEL||'gpt-4o-mini',adapter:'enabled'},{id:'anthropic',label:'Anthropic / Claude',configured:Boolean(env.ANTHROPIC_API_KEY),status:env.ANTHROPIC_API_KEY?'Key configured; live call not yet verified':'API key not configured',model:env.ANTHROPIC_MODEL||'claude-3-5-haiku-latest',adapter:'enabled'},{id:'deepseek',label:'DeepSeek',configured:Boolean(env.DEEPSEEK_API_KEY),status:env.DEEPSEEK_API_KEY?'Key configured; live call not yet verified':'API key not configured',model:env.DEEPSEEK_MODEL||'deepseek-chat',adapter:'enabled'},{id:'gemini',label:'Google Gemini',configured:Boolean(env.GEMINI_API_KEY),status:env.GEMINI_API_KEY?'Key configured; live call not yet verified':'API key not configured',model:env.GEMINI_MODEL||'gemini-2.5-flash',adapter:'enabled'},{id:'omniroute',label:'OmniRoute (OpenAI-compatible)',configured:Boolean((env.OMNIROUTE_API_KEY||env.OMNIROUTE_KEY)&&(env.OMNIROUTE_BASE_URL||env.OMNIROUTE_URL)),status:(env.OMNIROUTE_API_KEY||env.OMNIROUTE_KEY)&&(env.OMNIROUTE_BASE_URL||env.OMNIROUTE_URL)?'Key and endpoint configured; live call not yet verified':'Optional key/base URL not configured',model:env.OMNIROUTE_MODEL||'provider default',adapter:'enabled'}];return reply({providers,mode:providers.some(p=>p.configured)?'live-ready':'demo',note:'Key presence is not proof of successful provider authentication; run a test prompt to verify.'})}
  if(u.pathname==='/api/library'&&request.method==='GET'){const me=await userFor(db,request);if(!me)return reply({error:'Authentication required'},401);return reply({version:libraryCatalog.version,skillRegistry:{name:libraryCatalog.name,version:libraryCatalog.version,totalSkills:libraryCatalog.count,domainCount:libraryCatalog.domain_count},skills:libraryCatalog.skills,domains:libraryCatalog.domains,superpowers_skills:libraryCatalog.superpowers_skills,templates:libraryCatalog.templates,sources:libraryCatalog.sources})}
  // Admin-only schema repair. Missing table names indicate an incomplete schema,
  // not why it happened. Verify a full backup, rehearse on an isolated target,
  // and obtain explicit approval; a partial run may have committed work.
  if(u.pathname==='/api/admin/schema/repair'&&request.method==='POST'){
   const me=await userFor(db,request);if(!me)return reply({error:'Authentication required'},401);
   if(me.role!=='Admin')return reply({error:'Admin role required'},403);
   // This route precedes the shared mutation guard below, so enforce CSRF here.
   if(!await validCsrf(request,env))return reply({error:'CSRF protection: missing or invalid X-CSRF-Token'},403);
   const x=await readBody(request);
   const missingBefore=await missingTables(db);
   if(!missingBefore.length)return reply({ok:true,changed:false,message:'All required table names are present; no migrations were run. Columns, indexes and migration history were not checked.',tables:REQUIRED_TABLES.length,required:REQUIRED_TABLES.length});
   if(x.confirm!=='apply-schema-repair')return reply({error:'No migrations were run. After verifying a restorable full database backup, rehearsing on an isolated target, and obtaining authorization, send {"confirm":"apply-schema-repair"}.',preview:{missing:missingBefore,parts:SCHEMA_PARTS.length,transactional:false,warning:'Statements run individually; a failed repair can leave partial changes.'}},400);
   if(!await consumeRateLimit(db,'schema-repair',me.id,5,600))return reply({error:'Too many repair attempts. Wait ten minutes.'},429);
   const result=await applySchemaRepair(db);
   if(result.refused)return reply({error:result.error,unsafe:result.unsafe},500);
   await audit(db,me,'SCHEMA_REPAIR',`applied ${result.applied.length} parts; ${result.missing.length} tables still missing`,request);
   return reply({ok:result.ok,changed:result.changed,before:result.before,after:result.after,required:result.required,applied:result.applied,failed:result.failed,missing:result.missing},result.ok?200:207);
  }
  if(u.pathname==='/api/admin/diagnostics'&&request.method==='GET'){
  const me=await userFor(db,request);if(!me)return reply({error:'Authentication required'},401);
   if(me.role!=='Admin')return reply({error:'Admin role required'},403);
   const missing=await missingTables(db),missingSet=new Set(missing);
   const tables=REQUIRED_TABLES.filter(name=>!missingSet.has(name)),schemaOk=missing.length===0;
   const active=tables.includes('sessions')?await db.query('SELECT count(*)::int AS n FROM sessions WHERE revoked_at IS NULL AND expires_at>now()'):[];
   const ai=tables.includes('ai_runs')?await db.query("SELECT count(*)::int AS n FROM ai_runs WHERE status='running' AND created_at>now()-interval '10 minutes'"):[];
   return reply({ok:schemaOk,status:schemaOk?'healthy':'schema-incomplete',database:env.LOCAL_PREVIEW?'PGlite (local PostgreSQL)':'Neon PostgreSQL',checks:{database:true,schema:schemaOk,aiRuntime:true},schemaTables:tables.length,required:REQUIRED_TABLES.length,missing,tables,pool:{available:false,total:null,waiting:null},ai:{active:ai.length?Number(ai[0].n):null,maxConcurrent:null},sessions:{active:active.length?Number(active[0].n):null},note:'Schema checks required table names only, not columns, indexes, migration history or live features. Pool and edge process metrics are not exposed. AI runtime refers to the local assistant, not a live-tested cloud provider.'});
  }
  if(u.pathname==='/api/admin/audit'&&request.method==='GET'){const me=await userFor(db,request);if(!me)return reply({error:'Authentication required'},401);if(me.role!=='Admin')return reply({error:'Admin role required'},403);const limit=Math.min(100,Math.max(1,Number(u.searchParams.get('limit')||20)));const rows=await db.query('SELECT e.id,e.action,e.detail,e.created_at,u.username FROM audit_events e LEFT JOIN app_users u ON u.id=e.user_id ORDER BY e.created_at DESC LIMIT $1',[limit]);return reply({events:rows.map(x=>({id:x.id,time:x.created_at,user:x.username||'system',action:x.action,detail:x.detail||''}))})}
  // --- V150 first-run bootstrap -------------------------------------------------
  // Registration always creates a Viewer and there is no seeded administrator, so
  // a deployment whose accounts are all Viewers cannot reach ANY admin route —
  // including schema repair. The gate is "no Administrator exists" (not "no
  // users"), because a deployment with Viewers but no Admin was permanently
  // stranded. An existing account can claim the first Administrator slot by
  // proving its password; a brand-new name creates the first Admin.
  if(u.pathname==='/api/bootstrap/status'&&request.method==='GET'){
   try{
     const admins=Number((await db.query("SELECT count(*)::int AS n FROM app_users WHERE role='Admin' AND active=true"))[0]?.n||0);
     let users=0;
     try{const u=await db.query('SELECT count(*)::int AS n FROM app_users');users=Number(u[0]?.n||0)}catch{}
     let completed=false;
     try{const b=await db.query('SELECT completed_at FROM app_bootstrap WHERE id=true');completed=Boolean(b[0]?.completed_at)}catch{}
     const open=admins===0;
     return reply({available:open,users,admins,completed:!open,reason:open?'No Administrator exists on this deployment, so nobody can reach admin features. Create the first Administrator here. This closes permanently once an Administrator exists.':'An Administrator already exists.'});
   }catch(e){
     // app_users itself may be missing on a database that was never migrated.
     return reply({available:false,users:0,admins:0,completed:false,reason:'The database is not initialised yet: '+(e?.message||e)});
   }
  }

  if(u.pathname==='/api/bootstrap/admin'&&request.method==='POST'){
   const x=await readBody(request),name=String(x.username||'').trim(),password=String(x.password||'');
   if(!/^[A-Za-z0-9_.-]{3,40}$/.test(name))return reply({error:'Username must be 3-40 characters and use letters, numbers, dot, underscore or hyphen'},400);
   if(password.length<12)return reply({error:'Password must be at least 12 characters'},400);
   if(!/[A-Za-z]/.test(password)||!/[0-9]/.test(password))return reply({error:'Password must contain letters and numbers'},400);
   let bootstrapRateLimited=false;try{bootstrapRateLimited=await rateLimited(db,request,'BOOTSTRAP',5,"interval '1 hour'")}catch{} // audit_events may not exist on a partially migrated database; bootstrap must not be blocked by it
   if(bootstrapRateLimited)return reply({error:'Too many attempts. Try again later.'},429);
   // Re-check the Administrator gate inside the route so a second caller cannot
   // race in an Admin once one has been created.
   const admins=Number((await db.query("SELECT count(*)::int AS n FROM app_users WHERE role='Admin' AND active=true"))[0]?.n||0);
   if(admins>0)return reply({error:'An Administrator already exists on this deployment. Ask them to change your role.'},409);
   const existing=await db.query('SELECT id,username,role,salt,password_hash,active FROM app_users WHERE lower(username)=lower($1) LIMIT 1',[name]);
   if(existing.length){
     const usr=existing[0];
     if(!usr.active)return reply({error:'That account is inactive. Ask an Administrator to reactivate it.'},403);
     const ok=await equal(await pass(password,usr.salt),usr.password_hash);
     if(!ok)return reply({error:'That username exists and the password did not match. Use a different username, or enter the correct password to promote this account.'},401);
     if(usr.role==='Admin')return reply({ok:true,user:{id:usr.id,username:usr.username,role:'Admin'},message:'That account is already an Administrator.'},200,{'Set-Cookie':await bootstrapLoginSession(db,usr,env)});
     await db.query("UPDATE app_users SET role='Admin' WHERE id=$1",[usr.id]);
     const token=await bootstrapLoginSession(db,usr,env);
     await audit(db,{id:usr.id,username:usr.username,role:'Admin'},'BOOTSTRAP_ADMIN_PROMOTE','Existing account promoted to first Administrator',request);
     return reply({ok:true,user:{id:usr.id,username:usr.username,role:'Admin'},message:'Administrator created. You can now repair the schema and manage users.'},201,{'Set-Cookie':token});
   }
   const salt=hex(random(16)),id=crypto.randomUUID();
   await db.query("INSERT INTO app_users(id,username,role,salt,password_hash) VALUES($1,$2,'Admin',$3,$4)",[id,name,salt,await pass(password,salt)]);
   const token=await bootstrapLoginSession(db,{id,username:name,role:'Admin'},env);
   try{await db.query("UPDATE app_bootstrap SET completed_at=now(),completed_by=$1 WHERE id=true",[name])}catch{}
   await audit(db,{id,username:name,role:'Admin'},'BOOTSTRAP_ADMIN','First Administrator created',request);
   return reply({ok:true,user:{id,username:name,role:'Admin'},message:'Administrator created. You can now repair the schema and manage users.'},201,{'Set-Cookie':token});
  }

  async function bootstrapLoginSession(db,usr,env){
   const token=hex(random(48));
   await db.query('INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,$4)',[crypto.randomUUID(),usr.id,await digest(token),new Date(Date.now()+TTL).toISOString()]);
   return sessionCookie(token,env);
  }

  if(u.pathname==='/api/auth/register'&&request.method==='POST'){
   if(await rateLimited(db,request,'REGISTER',10,"interval '1 hour'"))return reply({error:'Registration limit reached. Please try again later.'},429,{'Retry-After':'3600'});
   const x=await readBody(request),name=String(x.username||'').trim(),password=String(x.password||'');
   if(!/^[A-Za-z0-9_.-]{3,40}$/.test(name))return reply({error:'Username must be 3–40 characters and use letters, numbers, dot, underscore or hyphen'},400);
   if(password.length<12||password.length>1024)return reply({error:'Password must be at least 12 characters'},400);
   if(!/[A-Za-z]/.test(password)||!/[0-9]/.test(password))return reply({error:'Password must contain letters and numbers'},400);
   const exists=await db.query('SELECT id FROM app_users WHERE lower(username)=lower($1) LIMIT 1',[name]);if(exists.length)return reply({error:'That username is already registered'},409);
   const salt=hex(random(16)),id=crypto.randomUUID();
   try{await db.query("INSERT INTO app_users(id,username,role,salt,password_hash) VALUES($1,$2,'Viewer',$3,$4)",[id,name,salt,await pass(password,salt)])}catch(e){if(String(e?.message||'').toLowerCase().includes('unique'))return reply({error:'That username is already registered'},409);throw e}
   const token=hex(random(48));await db.query('INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,$4)',[crypto.randomUUID(),id,await digest(token),new Date(Date.now()+TTL).toISOString()]);
   await audit(db,{id,username:name,role:'Viewer'},'REGISTER','Account created',request);
   return reply({user:{id,username:name,role:'Viewer'},session:'httpOnly-cookie'},201,{'Set-Cookie':sessionCookie(token,env)});
  }
  if(u.pathname==='/api/auth/login'&&request.method==='POST'){
   const x=await readBody(request),name=String(x.username||'').trim(),password=String(x.password||'');if(!name||!password||name.length>200||password.length>1024)return reply({error:'Username and password are required'},400);
   const loginIp=request.headers.get('CF-Connecting-IP')||'';if(!loginIp||!await consumeRateLimit(db,'login',loginIp,10,90))return reply({error:'Too many login attempts. Please wait before trying again.'},429,{'Retry-After':'90'});
   let found=await db.query('SELECT id,username,role,salt,password_hash FROM app_users WHERE username=$1 AND active=true LIMIT 1',[name]);
   if(!found.length){if(env.SEED_ADMIN_USERNAME&&String(env.SEED_ADMIN_PASSWORD||'').length>=12&&!/change-?me|replace/i.test(env.SEED_ADMIN_PASSWORD)){const salt=hex(random(16));await db.query("INSERT INTO app_users(id,username,role,salt,password_hash) VALUES($1,$2,'Admin',$3,$4) ON CONFLICT(username) DO NOTHING",[crypto.randomUUID(),String(env.SEED_ADMIN_USERNAME),salt,await pass(env.SEED_ADMIN_PASSWORD,salt)]);found=await db.query('SELECT id,username,role,salt,password_hash FROM app_users WHERE username=$1 AND active=true LIMIT 1',[name])}}
   const usr=found[0];if(!usr){await pass(password,'00000000000000000000000000000000');await audit(db,null,'LOGIN_FAILED','Unknown user',request);return reply({error:'Invalid credentials'},401)}
   if(!equal(await pass(password,usr.salt),usr.password_hash)){
    const seedName=String(env.SEED_ADMIN_USERNAME||''),seedPassword=String(env.SEED_ADMIN_PASSWORD||'');
    const mayRecover=usr.role==='Admin'&&name===seedName&&password===seedPassword&&seedPassword.length>=12&&!/change-?me|replace/i.test(seedPassword);
    if(!mayRecover){await audit(db,usr,'LOGIN_FAILED','Bad password',request);return reply({error:'Invalid credentials'},401)}
    const salt=hex(random(16)),hash=await pass(password,salt);
    const rotated=await db.query("UPDATE app_users SET salt=$1,password_hash=$2 WHERE id=$3 AND role='Admin' RETURNING id",[salt,hash,usr.id]);
    if(!rotated.length){await audit(db,usr,'LOGIN_FAILED','Admin recovery did not update account',request);return reply({error:'Invalid credentials'},401)}
    usr.salt=salt;usr.password_hash=hash;
   }
   const t=hex(random(48));await db.query('INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,$4)',[crypto.randomUUID(),usr.id,await digest(t),new Date(Date.now()+TTL).toISOString()]);await audit(db,usr,'LOGIN','Successful login',request);return reply({user:{id:usr.id,username:usr.username,role:usr.role},session:'httpOnly-cookie'},200,{'Set-Cookie':sessionCookie(t,env)});
  }
  if(u.pathname==='/api/csrf'&&request.method==='GET'){const t=rawToken(request);if(!t)return reply({error:'Authentication required'},401);return reply({token:await csrf(t,env.CSRF_SECRET||env.SESSION_SECRET||'')})}
  if(u.pathname==='/api/auth/logout'&&request.method==='POST'){const me=await userFor(db,request);if(!me)return reply({error:'Authentication required'},401);if(!await validCsrf(request,env))return reply({error:'CSRF protection: missing or invalid X-CSRF-Token'},403);await db.query('UPDATE sessions SET revoked_at=now() WHERE token_hash=$1',[await digest(rawToken(request))]);await audit(db,me,'LOGOUT','Session revoked',request);return reply({ok:true},200,{'Set-Cookie':C+'=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax'+((env.DB_ADAPTER&&env.COOKIE_SECURE==='false')?'':'; Secure')})}
  const me=await userFor(db,request);
  if(u.pathname==='/api/arena/catalogue'&&request.method==='GET')return reply(arenaCatalogue(env));
  // Static metadata (no account data) — a signed-out visitor must still be able to read
  // what this arena does and does not do. Rendered by arena.html before sign-in.
  if(u.pathname==='/api/arena/features'&&request.method==='GET'&&!me)return await arenaRoute({request,env,db,me:null,url:u,readBody,reply,audit,consumeRateLimit,onRequest});
  if(u.pathname==='/api/arena/prompts'&&request.method==='GET'&&!me)return await arenaRoute({request,env,db,me:null,url:u,readBody,reply,audit,consumeRateLimit,onRequest});
  // The toolbox catalogue is a static list of what the runtime can do. Publishing it
  // before sign-in lets Toolbench explain the product without inventing a list.
  if(u.pathname==='/api/agent/capabilities'&&request.method==='GET'&&!me)return await agentRoute({request,env,db,me:null,url:u,readBody,reply,audit,consumeRateLimit,onRequest});
  if(u.pathname==='/api/me'&&request.method==='GET')return reply(me?{authenticated:true,user:{id:me.id,username:me.username,role:me.role},csrfToken:await csrf(rawToken(request),env.CSRF_SECRET||env.SESSION_SECRET||'')}:{authenticated:false,user:null,csrfToken:null});
  if(!me)return reply({error:'Authentication required'},401);
  if(['POST','PUT','PATCH','DELETE'].includes(request.method)&&!await validCsrf(request,env))return reply({error:'CSRF protection: missing or invalid X-CSRF-Token'},403);
  const reportResponse=await contentReportRoute({request,db,me,url:u,readBody,reply,audit,consumeRateLimit});if(reportResponse)return reportResponse;
  const assistantResponse=await assistantRoute({request,env,db,me,url:u,readBody,reply,audit,consumeRateLimit,onRequest});if(assistantResponse)return assistantResponse;
  const platformResponse=await platformRoute({request,env,db,me,url:u,readBody,reply,audit,consumeRateLimit,onRequest});if(platformResponse)return platformResponse;
  const agentResponse=await agentRoute({request,env,db,me,url:u,readBody,reply,audit,consumeRateLimit,onRequest});if(agentResponse)return agentResponse;
  const arenaResponse=await arenaRoute({request,env,db,me,url:u,readBody,reply,audit,consumeRateLimit,onRequest});if(arenaResponse)return arenaResponse;
  if(u.pathname==='/api/voice/speak'&&request.method==='POST'){
   if(!env.ELEVENLABS_API_KEY)return reply({error:'ElevenLabs is not configured on the cloud project yet.',code:'VOICE_PROVIDER_NOT_CONFIGURED'},503);
   const voiceId=String(env.ELEVENLABS_VOICE_ID||'').trim();
   if(!voiceId)return reply({error:'ELEVENLABS_VOICE_ID is not configured on the cloud project.',code:'VOICE_ID_NOT_CONFIGURED'},503);
   const x=await readBody(request),speech=String(x.text||'').trim();
   if(!speech)return reply({error:'There is no reply text to speak.'},400);
   if(speech.length>2500)return reply({error:'Voice text is too long (maximum 2,500 characters).'},413);
   const count=await db.query("SELECT count(*)::int AS n FROM audit_events WHERE user_id=$1 AND action='VOICE_SPEAK_REQUEST' AND created_at>now()-interval '1 hour'",[me.id]);
   if(Number(count[0]?.n||0)>=30)return reply({error:'Voice limit reached (30 requests per hour). Please wait and retry.'},429,{'Retry-After':'3600'});
   await db.query('INSERT INTO audit_events(id,user_id,action,detail,ip,request_id) VALUES($1,$2,$3,$4,$5,$6)',[crypto.randomUUID(),me.id,'VOICE_SPEAK_REQUEST','ElevenLabs text-to-speech requested; text is not stored by the app',request.headers.get('CF-Connecting-IP')||'',request.headers.get('cf-ray')||null]);
   let upstream;
   try{upstream=await fetch('https://api.elevenlabs.io/v1/text-to-speech/'+encodeURIComponent(voiceId),{method:'POST',headers:{'xi-api-key':env.ELEVENLABS_API_KEY,'Content-Type':'application/json','Accept':'audio/mpeg'},body:JSON.stringify({text:speech,model_id:env.ELEVENLABS_MODEL_ID||'eleven_multilingual_v2',voice_settings:{stability:0.5,similarity_boost:0.75}}),signal:AbortSignal.timeout(20000)})}catch{return reply({error:'ElevenLabs could not be reached. Please retry shortly.',code:'VOICE_UPSTREAM_UNAVAILABLE'},502)}
   if(!upstream.ok){const status=upstream.status;return reply({error:status===401||status===403?'ElevenLabs rejected the cloud credentials or voice access.':status===429?'ElevenLabs rate limit reached. Please retry later.':'ElevenLabs could not generate speech.',code:'VOICE_GENERATION_FAILED',upstreamStatus:status},502)}
   const audio=await upstream.arrayBuffer();if(!audio.byteLength||audio.byteLength>12*1024*1024)return reply({error:'Generated audio was empty or exceeded the 12 MB limit.'},502);
   return new Response(audio,{status:200,headers:{'Content-Type':'audio/mpeg','Content-Length':String(audio.byteLength),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline; filename=jalalai-reply.mp3'}})
  }
  if(u.pathname==='/api/ai/run'&&request.method==='POST'){
   const x=await readBody(request,24*1024*1024),privacyMode=x.privacyMode===true;
   if(!await consumeRateLimit(db,'ai-minute',me.id,20,3))return reply({error:'AI request limit reached (20 per minute). Please wait and retry.'},429,{'Retry-After':'60'});
   if(!await consumeRateLimit(db,'ai-day',me.id,200,432))return reply({error:'Daily AI request limit reached (200 per day). Please retry tomorrow.'},429,{'Retry-After':'3600'});
   const prompt=String(x.prompt||'').trim(),agentId=String(x.agentId||'general').slice(0,80),attachments=Array.isArray(x.attachments)?x.attachments:[];
   if(privacyMode)await audit(db,me,'AI_CHAT_REQUEST','Private cloud chat request; prompt and response are not stored by the app',request);
   if(!prompt)return reply({error:'Enter a prompt before running the assistant'},400);
   if(prompt.length>10000)return reply({error:'Prompt is too long (maximum 10,000 characters)'},413);
   if(attachments.length>4)return reply({error:'Attach no more than four images per message'},413);
   const imageAttachments=[];for(const item of attachments){const type=String(item?.type||'').toLowerCase(),dataUrl=String(item?.dataUrl||'');if(!type.startsWith('image/')||!/^data:image\/(png|jpeg|jpg|webp|gif);base64,[a-z0-9+/=]+$/i.test(dataUrl))return reply({error:'Invalid image attachment. Supported images: PNG, JPEG, WEBP, or GIF.'},400);if(dataUrl.length>5_600_000)return reply({error:'Each image must be 4 MB or smaller'},413);imageAttachments.push({type,dataUrl,name:String(item?.name||'image').slice(0,180)})}
   const configs={
    openai:{key:env.OPENAI_API_KEY,model:env.OPENAI_MODEL||'gpt-4o-mini',label:'OpenAI / ChatGPT'},
    anthropic:{key:env.ANTHROPIC_API_KEY,model:env.ANTHROPIC_MODEL||'claude-3-5-haiku-latest',label:'Anthropic / Claude'},
    deepseek:{key:env.DEEPSEEK_API_KEY,model:env.DEEPSEEK_MODEL||'deepseek-chat',label:'DeepSeek'},
    gemini:{key:env.GEMINI_API_KEY,model:env.GEMINI_MODEL||'gemini-2.5-flash',label:'Google Gemini'},
    omniroute:{key:env.OMNIROUTE_API_KEY||env.OMNIROUTE_KEY,model:env.OMNIROUTE_MODEL||'openai/gpt-4o-mini',label:'OmniRoute'}
   };
   let provider=String(x.provider||'gemini').toLowerCase().slice(0,40);
   if(provider==='openai-compatible')provider='openai';
   if(provider==='auto')provider=['gemini','openai','anthropic','deepseek','omniroute'].find(k=>Boolean(configs[k].key))||'gemini';
   const cfg=configs[provider];
   if(!cfg)return reply({ok:false,error:'Unsupported provider. Choose OpenAI, Claude, DeepSeek, Gemini, or a configured OmniRoute endpoint.',code:'UNSUPPORTED_PROVIDER'},400);
   const traceId=crypto.randomUUID(),model=String(x.model||cfg.model).trim();
   if(!model||model.length>120||!/^[A-Za-z0-9._:/-]+$/.test(model))return reply({error:'Invalid model identifier (maximum 120 safe characters)'},400);
   const saveRun=async(status,output,trace)=>privacyMode?[]:db.query('INSERT INTO ai_runs(id,user_id,agent_id,provider,model,prompt,output,status,tool_calls,trace) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb) RETURNING created_at',[traceId,me.id,agentId,provider,model,prompt,output,status,JSON.stringify([]),JSON.stringify(trace)]);
   if(!cfg.key){
    const output='No external AI call was made because this provider has no server-side API key configured.';
    const row=await saveRun('not_configured',output,{mode:'not_configured',provider,thinking:Boolean(x.thinking)});
    await audit(db,me,'AI_RUN_NOT_CONFIGURED',provider,request);
    return reply({ok:false,traceId,provider,model,status:'not_configured',simulated:false,error:'This provider is not configured yet. Add its API key in Cloudflare Pages environment variables, then retry.',createdAt:row[0]?.created_at},503);
   }
   const agentNames={general:'Power AI Assistant',research:'Research Assistant',coding:'Coding Assistant',creative:'Creative Assistant',analysis:'Analysis Assistant',nexus:'General Assistant',aether:'Creative & Code Assistant',deepreason:'Reasoning Assistant',titan:'Fast Assistant',superpower:'Superpower Agent', 'open-gpt':'OpenGPT Assistant','ux-ui-pro-max':'UX/UI Pro Max',omniroute:'OmniRoute Assistant',omniverse:'Omniverse Intelligence','mission-orchestrator':'Mission Orchestrator','knowledge-vault':'Knowledge Vault','voice-agent':'Voice Assistant','health-agent':'Health Information Assistant',supervisor:'Supervisor Agent',autogpt:'AutoGPT Planner'};
   const specialistRules=agentId==='health-agent'?' For health topics, provide general educational information only, do not diagnose or prescribe, flag emergencies, and encourage qualified clinical care; state uncertainty and do not invent citations.':agentId==='ux-ui-pro-max'?' Focus on professional UX/UI, accessibility, responsive layouts, design tokens, and actionable implementation steps.':agentId==='mission-orchestrator'||agentId==='superpower'||agentId==='supervisor'||agentId==='autogpt'?' Break work into bounded steps, identify required tools and approvals, and never claim an external action ran unless a tool actually executed.':agentId==='voice-agent'?' Provide voice-agent design and scripts in text; do not claim audio capture or speech synthesis is active in this text API.':agentId==='knowledge-vault'?' Distinguish information actually provided or retrieved from assumptions; do not claim access to saved files unless a retrieval tool ran.':'';
   const systemPrompt='You are Al-Syed Jalal AI, a careful and capable '+(agentNames[agentId]||'Workspace Assistant')+'. Give useful, structured answers. Be honest about uncertainty and never claim to have run tools, browsed the web, edited files, or completed external actions unless those actions actually occurred.'+specialistRules;
   let url='',headers={'content-type':'application/json'},payload={};
   if(provider==='openai'||provider==='deepseek'||provider==='omniroute'){
    if(provider==='openai'){url='https://api.openai.com/v1/chat/completions';headers.authorization='Bearer '+cfg.key;}
    else if(provider==='deepseek'){url='https://api.deepseek.com/chat/completions';headers.authorization='Bearer '+cfg.key;}
    else {const base=String(env.OMNIROUTE_BASE_URL||env.OMNIROUTE_URL||'').trim().replace(/\/+$/,'');if(!base)return reply({ok:false,traceId,provider,model,status:'not_configured',error:'OMNIROUTE_BASE_URL is not configured on the server.'},503);try{if(new URL(base).protocol!=='https:')return reply({ok:false,error:'OmniRoute base URL must use HTTPS.'},400);}catch{return reply({ok:false,error:'OmniRoute base URL is invalid.'},400);}url=/\/chat\/completions$/i.test(base)?base:base+'/chat/completions';headers.authorization='Bearer '+cfg.key;}
    const userContent=imageAttachments.length?[{type:'text',text:prompt},...imageAttachments.map(a=>({type:'image_url',image_url:{url:a.dataUrl}}))]:prompt;if(imageAttachments.length&&provider==='deepseek')return reply({ok:false,error:'The selected DeepSeek endpoint is not enabled for image analysis here. Choose a vision-capable OpenAI, Gemini, Claude, or OmniRoute model.'},400);payload={model,messages:[{role:'system',content:systemPrompt},{role:'user',content:userContent}],temperature:0.4,max_tokens:2048};
   } else if(provider==='anthropic'){
    url='https://api.anthropic.com/v1/messages';headers['x-api-key']=cfg.key;headers['anthropic-version']='2023-06-01';
    const userContent=imageAttachments.length?[{type:'text',text:prompt},...imageAttachments.map(a=>({type:'image',source:{type:'base64',media_type:a.type,data:a.dataUrl.split(',')[1]}}))]:prompt;payload={model,max_tokens:2048,system:systemPrompt,messages:[{role:'user',content:userContent}]};
   } else {
    url='https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent';headers['x-goog-api-key']=cfg.key;
    const parts=[{text:prompt},...imageAttachments.map(a=>({inline_data:{mime_type:a.type,data:a.dataUrl.split(',')[1]}}))];payload={systemInstruction:{parts:[{text:systemPrompt}]},contents:[{role:'user',parts}],generationConfig:{maxOutputTokens:2048,thinkingConfig:{thinkingLevel:'low'}}};
   }
   let upstream,data;
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
   try{for(let attempt=0;attempt<3;attempt++){upstream=await fetch(url,{method:'POST',headers,body:JSON.stringify(payload),signal:controller.signal});data=await upstream.json().catch(()=>({}));if(upstream.ok||![408,429,500,502,503,504].includes(upstream.status)||attempt===2)break;await new Promise(resolve=>setTimeout(resolve,900*(2**attempt)));}}
   catch(err){clearTimeout(timer);const msg=err?.name==='AbortError'?'Provider request timed out after 45 seconds.':'Could not reach the selected AI provider.';const row=await saveRun('failed',msg,{mode:'provider_error',provider,model,error:err?.name||'network_error'});await audit(db,me,'AI_RUN_FAILED',provider+': network/timeout',request);return reply({ok:false,traceId,provider,model,status:'failed',error:msg,createdAt:row[0]?.created_at},502);}
   finally{clearTimeout(timer);}
   if(!upstream.ok){const providerMessage=String(data?.error?.message||data?.message||'').replace(/[\r\n\t]+/g,' ').slice(0,240);const overloaded=upstream.status===503&&(provider==='gemini'||/high demand|overload|temporarily unavailable/i.test(providerMessage));const msg=overloaded?'The AI provider is temporarily overloaded (HTTP 503). Automatic retries were attempted. Wait 30–60 seconds and retry; if this keeps happening, configure a second provider key in Cloudflare Pages and select that provider. No automatic provider failover is active.':'Provider request failed (HTTP '+upstream.status+').'+(providerMessage?' Provider says: '+providerMessage:' Check provider availability, API key, model access, and quota.');const retryAfter=overloaded?60:null;const row=await saveRun('failed',msg,{mode:'provider_error',provider,model,httpStatus:upstream.status,providerCode:data?.error?.status||null,retryable:[408,429,500,502,503,504].includes(upstream.status),retryAfterSeconds:retryAfter});await audit(db,me,'AI_RUN_FAILED',provider+': HTTP '+upstream.status,request);return reply({ok:false,traceId,provider,model,status:'failed',error:msg,code:overloaded?'PROVIDER_OVERLOADED':undefined,retryable:[408,429,500,502,503,504].includes(upstream.status),retryAfterSeconds:retryAfter,providerStatus:upstream.status,providerMessage:providerMessage||null,createdAt:row[0]?.created_at},502,overloaded?{'Retry-After':'60'}:{});}
   let output='';
   if(provider==='openai'||provider==='deepseek'||provider==='omniroute'){const v=data?.choices?.[0]?.message?.content;output=Array.isArray(v)?v.map(z=>z?.text||'').join('\n'):String(v||'');}
   else if(provider==='anthropic')output=(data?.content||[]).filter(z=>z?.type==='text').map(z=>z.text||'').join('\n');
   else output=(data?.candidates?.[0]?.content?.parts||[]).map(z=>z?.text||'').join('\n');
   if(!output.trim()){const msg='The provider returned no text output. Check the model and request settings.';const row=await saveRun('failed',msg,{mode:'provider_error',provider,model,reason:'empty_output'});await audit(db,me,'AI_RUN_FAILED',provider+': empty output',request);return reply({ok:false,traceId,provider,model,status:'failed',error:msg,createdAt:row[0]?.created_at},502);}
   const row=await saveRun('completed',output,{mode:'live',provider,model,thinking:Boolean(x.thinking),providerRequestCompleted:true});
   await audit(db,me,'AI_RUN_COMPLETED',provider+': '+model,request);
   return reply({ok:true,traceId,agentId,provider,model,status:'completed',simulated:false,output,createdAt:row[0]?.created_at});
  }
  if(u.pathname==='/api/ai/runs'&&request.method==='GET'){
   const limit=Math.min(50,Math.max(1,Number(u.searchParams.get('limit')||20)));
   const rows=await db.query('SELECT id,agent_id,provider,model,prompt,output,status,created_at FROM ai_runs WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2',[me.id,limit]);
   return reply({runs:rows.map(r=>({id:r.id,traceId:r.id,agentId:r.agent_id,provider:r.provider,model:r.model,prompt:r.prompt,output:r.output,status:r.status,createdAt:r.created_at})),count:rows.length});
  }
  if(u.pathname==='/api/auth/me'&&request.method==='GET')return reply({authenticated:true,user:{id:me.id,username:me.username,role:me.role},csrfToken:await csrf(rawToken(request),env.CSRF_SECRET||env.SESSION_SECRET||'')});
  if(u.pathname==='/api/auth/sessions'&&request.method==='GET'){const rows=await db.query('SELECT id,created_at AS createdat,expires_at AS expiresat,revoked_at AS revokedat FROM sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[me.id]);return reply({sessions:rows.map(x=>({id:x.id,createdAt:x.createdat,expiresAt:x.expiresat,revokedAt:x.revokedat}))})}
  if(u.pathname==='/api/auth/sessions'&&request.method==='DELETE'){await db.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL',[me.id,me.session_id]);await audit(db,me,'SESSION_REVOKE_ALL','Other active sessions revoked',request);return reply({ok:true})}
  if(u.pathname==='/api/records'&&request.method==='GET'){const page=Math.max(1,Number(u.searchParams.get('page')||1)),limit=Math.min(200,Math.max(1,Number(u.searchParams.get('limit')||100))),term=(u.searchParams.get('q')||'').slice(0,200),like='%'+term+'%',region=(u.searchParams.get('region')||'').slice(0,200),sector=(u.searchParams.get('sector')||'').slice(0,200),off=(page-1)*limit,where="deleted_at IS NULL AND ($1='' OR id ILIKE $2 OR name ILIKE $2 OR region ILIKE $2 OR sector ILIKE $2 OR status ILIKE $2 OR notes ILIKE $2) AND ($3='' OR region=$3) AND ($4='' OR sector=$4)";const [rs,cs]=await Promise.all([db.query('SELECT id,name,region,sector,status,notes,updated_at AS updatedat FROM records WHERE '+where+' ORDER BY updated_at DESC LIMIT $5 OFFSET $6',[term,like,region,sector,limit,off]),db.query('SELECT count(*)::int AS n FROM records WHERE '+where,[term,like,region,sector])]);return reply({records:rs.map(r=>({id:r.id,name:r.name,region:r.region,sector:r.sector,status:r.status,notes:r.notes,updatedAt:r.updatedat})),total:Number(cs[0]?.n||0),page,limit,pages:Math.max(1,Math.ceil(Number(cs[0]?.n||0)/limit))})}
  if(u.pathname==='/api/records'&&request.method==='POST'){if(!WRITERS.includes(me.role))return reply({error:'Role not permitted'},403);const x=await readBody(request),name=String(x.name||'').trim();if(!name||name.length>500)return reply({error:'name is required (maximum 500 characters)'},400);const r={id:String(x.id||'AJ-'+crypto.randomUUID().slice(0,8).toUpperCase()),name,region:String(x.region||'').slice(0,200),sector:String(x.sector||'').slice(0,200),status:String(x.status||'Active').slice(0,100),notes:String(x.notes||'').slice(0,10000)};await db.query('INSERT INTO records(id,name,region,sector,status,notes,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$7)',[r.id,r.name,r.region,r.sector,r.status,r.notes,me.id]);await db.query("INSERT INTO record_history(id,record_id,user_id,action,snapshot) SELECT $1,id,$2,'CREATE',to_jsonb(records) FROM records WHERE id=$3",[crypto.randomUUID(),me.id,r.id]);await audit(db,me,'CREATE',r.id,request);return reply({record:r},201)}
  if(p[1]==='records'&&p.length===3){const id=decodeURIComponent(p[2]);if(request.method==='GET'){const a=await db.query('SELECT id,name,region,sector,status,notes,updated_at AS updatedat FROM records WHERE id=$1 AND deleted_at IS NULL LIMIT 1',[id]);if(!a[0])return reply({error:'Not found'},404);const r=a[0];return reply({record:{id:r.id,name:r.name,region:r.region,sector:r.sector,status:r.status,notes:r.notes,updatedAt:r.updatedat}})}
   if(request.method==='PUT'){if(!WRITERS.includes(me.role))return reply({error:'Role not permitted'},403);const x=await readBody(request),a=await db.query('UPDATE records SET name=COALESCE($2,name),region=COALESCE($3,region),sector=COALESCE($4,sector),status=COALESCE($5,status),notes=COALESCE($6,notes),updated_by=$7,updated_at=now() WHERE id=$1 AND deleted_at IS NULL RETURNING id,name,region,sector,status,notes,updated_at AS updatedat',[id,x.name??null,x.region??null,x.sector??null,x.status??null,x.notes??null,me.id]);if(!a[0])return reply({error:'Not found'},404);await db.query("INSERT INTO record_history(id,record_id,user_id,action,snapshot) SELECT $1,id,$2,'UPDATE',to_jsonb(records) FROM records WHERE id=$3",[crypto.randomUUID(),me.id,id]);await audit(db,me,'UPDATE',id,request);const r=a[0];return reply({record:{id:r.id,name:r.name,region:r.region,sector:r.sector,status:r.status,notes:r.notes,updatedAt:r.updatedat}})}
   if(request.method==='DELETE'){if(!['Admin','Manager'].includes(me.role))return reply({error:'Role not permitted'},403);const a=await db.query('UPDATE records SET deleted_at=now(),deleted_by=$2,updated_by=$2,updated_at=now() WHERE id=$1 AND deleted_at IS NULL RETURNING id',[id,me.id]);if(!a[0])return reply({error:'Not found'},404);await db.query("INSERT INTO record_history(id,record_id,user_id,action,snapshot) SELECT $1,id,$2,'SOFT_DELETE',to_jsonb(records) FROM records WHERE id=$3",[crypto.randomUUID(),me.id,id]);await audit(db,me,'SOFT_DELETE',id,request);return reply({ok:true,softDeleted:true})}}
  if(u.pathname==='/api/meta'&&request.method==='GET'){const [r,s]=await Promise.all([db.query("SELECT DISTINCT region FROM records WHERE region<>'' AND deleted_at IS NULL ORDER BY region"),db.query("SELECT DISTINCT sector FROM records WHERE sector<>'' AND deleted_at IS NULL ORDER BY sector")]);return reply({regions:r.map(x=>x.region),sectors:s.map(x=>x.sector)})}
  if(u.pathname==='/api/stats'&&request.method==='GET'){const [t,r,s,a,d]=await Promise.all([db.query('SELECT count(*)::int AS n FROM records WHERE deleted_at IS NULL'),db.query('SELECT region,count(*)::int AS n FROM records WHERE deleted_at IS NULL GROUP BY region ORDER BY n DESC'),db.query('SELECT sector,count(*)::int AS n FROM records WHERE deleted_at IS NULL GROUP BY sector ORDER BY n DESC'),db.query('SELECT count(*)::int AS n FROM audit_events'),db.query('SELECT count(*)::int AS n FROM app_users WHERE active=true')]);return reply({total:Number(t[0]?.n||0),regions:Object.fromEntries(r.map(x=>[x.region||'Unassigned',Number(x.n)])),sectors:Object.fromEntries(s.map(x=>[x.sector||'Unassigned',Number(x.n)])),auditCount:Number(a[0]?.n||0),activeUsers:Number(d[0]?.n||0)})}
  if(u.pathname==='/api/approvals'&&request.method==='GET'){const a=await db.query("SELECT id,action,description,status,requested_by AS requestedby,created_at AS createdat,resolved_at AS resolvedat,resolved_by AS resolvedby FROM approvals WHERE status='pending' ORDER BY created_at ASC LIMIT 100");return reply({approvals:a.map(x=>({id:x.id,action:x.action,description:x.description,status:x.status,requestedBy:x.requestedby,createdAt:x.createdat,resolvedAt:x.resolvedat,resolvedBy:x.resolvedby}))})}
  if(u.pathname==='/api/approvals'&&request.method==='POST'){if(!['Admin','Manager'].includes(me.role))return reply({error:'Manager or Admin role required'},403);const x=await readBody(request),action=String(x.action||'').trim(),description=String(x.description||'').trim();if(!action||action.length>200)return reply({error:'action is required (maximum 200 characters)'},400);if(description.length>2000)return reply({error:'description must be at most 2,000 characters'},400);const id=crypto.randomUUID();await db.query('INSERT INTO approvals(id,action,description,requested_by) VALUES($1,$2,$3,$4)',[id,action,description,me.username]);await audit(db,me,'APPROVAL_REQUESTED',action+' · '+description,request);return reply({ok:true,approval:{id,action,description,status:'pending',requestedBy:me.username}},201)}
  if(p[1]==='approvals'&&p.length===3&&['PATCH','POST'].includes(request.method)){if(!['Admin','Manager'].includes(me.role))return reply({error:'Manager or Admin role required'},403);const x=await readBody(request),status=String(x.status||'');if(!['approved','rejected'].includes(status))return reply({error:'status must be approved or rejected'},400);const a=await db.query("UPDATE approvals SET status=$2,resolved_at=now(),resolved_by=$3 WHERE id=$1 AND status='pending' RETURNING id,action,description,status,requested_by AS requestedby,created_at AS createdat,resolved_at AS resolvedat,resolved_by AS resolvedby",[decodeURIComponent(p[2]),status,me.username]);if(!a[0])return reply({error:'Approval not found or already resolved'},404);await audit(db,me,'APPROVAL_'+status.toUpperCase(),a[0].action+' · '+a[0].description,request);const x2=a[0];return reply({ok:true,approval:{id:x2.id,action:x2.action,description:x2.description,status:x2.status,requestedBy:x2.requestedby,createdAt:x2.createdat,resolvedAt:x2.resolvedat,resolvedBy:x2.resolvedby}})}
  if(u.pathname==='/api/auth/change-password'&&request.method==='POST'){
   const x=await readBody(request),current=String(x.currentPassword||''),next=String(x.newPassword||'');
   if(next.length<12||next.length>1024||!/[A-Za-z]/.test(next)||!/[0-9]/.test(next))return reply({error:'New password must be at least 12 characters and include letters and numbers'},400);
   const row=await db.query('SELECT salt,password_hash FROM app_users WHERE id=$1 AND active=true',[me.id]);
   if(!row[0]||!equal(await pass(current,row[0].salt),row[0].password_hash))return reply({error:'Current password is incorrect'},401);
   const salt=hex(random(16));await db.query('UPDATE app_users SET salt=$1,password_hash=$2,updated_at=now() WHERE id=$3',[salt,await pass(next,salt),me.id]);
   await db.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL',[me.id,me.session_id]);
   await audit(db,me,'PASSWORD_CHANGED','Password changed; other sessions revoked',request);return reply({ok:true,otherSessionsRevoked:true});
  }
  if(u.pathname==='/api/admin/users'&&['GET','POST'].includes(request.method)){
   if(me.role!=='Admin')return reply({error:'Admin role required'},403);
   if(request.method==='GET'){const rows=await db.query('SELECT id,username,role,active,created_at FROM app_users ORDER BY created_at DESC LIMIT 500');return reply({users:rows.map(x=>({id:x.id,username:x.username,role:x.role,active:x.active,createdAt:x.created_at}))})}
   const x=await readBody(request),username=String(x.username||'').trim(),password=String(x.password||''),role=String(x.role||'Viewer');
   if(!/^[A-Za-z0-9_.-]{3,40}$/.test(username))return reply({error:'Username must be 3–40 safe characters'},400);
   if(password.length<12||password.length>1024||!/[A-Za-z]/.test(password)||!/[0-9]/.test(password))return reply({error:'Password must be at least 12 characters and include letters and numbers'},400);
   if(!['Admin','Manager','Data Operator','Viewer'].includes(role))return reply({error:'Invalid role'},400);
   const salt=hex(random(16)),id=crypto.randomUUID();
   try{await db.query('INSERT INTO app_users(id,username,role,salt,password_hash) VALUES($1,$2,$3,$4,$5)',[id,username,role,salt,await pass(password,salt)])}catch(e){if(String(e?.message||'').toLowerCase().includes('unique'))return reply({error:'Username already exists'},409);throw e}
   await audit(db,me,'ADMIN_USER_CREATE',username+' · '+role,request);return reply({user:{id,username,role,active:true,createdAt:new Date().toISOString()}},201);
  }
  if(p[1]==='admin'&&p[2]==='users'&&p.length===4&&request.method==='PATCH'){
   if(me.role!=='Admin')return reply({error:'Admin role required'},403);
   const id=decodeURIComponent(p[3]),x=await readBody(request);if(typeof x.active!=='boolean')return reply({error:'active must be true or false'},400);
   if(id===me.id&&!x.active)return reply({error:'You cannot deactivate your own account'},400);
   if(!x.active){const target=await db.query('SELECT role,active FROM app_users WHERE id=$1',[id]);if(!target[0])return reply({error:'User not found'},404);if(target[0].role==='Admin'&&target[0].active){const n=await db.query("SELECT count(*)::int AS n FROM app_users WHERE role='Admin' AND active=true");if(Number(n[0]?.n||0)<=1)return reply({error:'Cannot deactivate the last active administrator'},409)}}
   const rows=await db.query('UPDATE app_users SET active=$2,updated_at=now() WHERE id=$1 RETURNING id,username,role,active,created_at',[id,x.active]);if(!rows[0])return reply({error:'User not found'},404);
   if(!x.active)await db.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',[id]);
   await audit(db,me,'ADMIN_USER_STATUS',rows[0].username+' · '+(x.active?'activated':'deactivated'),request);const z=rows[0];return reply({user:{id:z.id,username:z.username,role:z.role,active:z.active,createdAt:z.created_at}});
  }
  if(u.pathname==='/api/records/bulk'&&request.method==='POST'){
   if(!WRITERS.includes(me.role))return reply({error:'Role not permitted'},403);
   const x=await readBody(request),input=Array.isArray(x.records)?x.records:[];if(!input.length)return reply({inserted:0,updated:0,skipped:0});if(input.length>5000)return reply({error:'Import batch exceeds 5,000 records'},413);
   const rows=[];let skipped=0;for(const v of input){const name=String(v?.name||'').trim();if(!name||name.length>500){skipped++;continue}rows.push([String(v.id||('AJ-'+crypto.randomUUID().slice(0,8).toUpperCase())).slice(0,200),name,String(v.region||'').slice(0,200),String(v.sector||'').slice(0,200),String(v.status||'Active').slice(0,100),String(v.notes||'').slice(0,10000),me.id])}
   if(!rows.length)return reply({inserted:0,updated:0,skipped});const values=[],tuples=rows.map((r,i)=>{const start=i*7;values.push(...r);return '('+r.map((_,j)=>'$'+(start+j+1)).join(',')+')'});
   const saved=await db.query('INSERT INTO records(id,name,region,sector,status,notes,created_by,updated_by) SELECT v.id,v.name,v.region,v.sector,v.status,v.notes,$'+(values.length+1)+',$'+(values.length+1)+' FROM (VALUES '+tuples.join(',')+') AS v(id,name,region,sector,status,notes,source_user) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,region=EXCLUDED.region,sector=EXCLUDED.sector,status=EXCLUDED.status,notes=EXCLUDED.notes,updated_by=$'+(values.length+1)+',updated_at=now(),deleted_at=NULL RETURNING (xmax=0) AS inserted',[...values,me.id]);
   const inserted=saved.filter(z=>z.inserted).length,updated=saved.length-inserted;await audit(db,me,'BULK_IMPORT','Inserted '+inserted+'; updated '+updated+'; skipped '+skipped,request);return reply({inserted,updated,skipped});
  }
  if(u.pathname==='/api/backup'&&request.method==='GET'){
   if(me.role!=='Admin')return reply({error:'Admin role required'},403);
   const rows=await db.query('SELECT id,name,region,sector,status,notes,updated_at AS "updatedAt" FROM records WHERE deleted_at IS NULL ORDER BY id');
   await audit(db,me,'BACKUP_EXPORT','Exported '+rows.length+' active records',request);return reply({format:'alsyed-jalal-backup',version:1,exportedAt:new Date().toISOString(),records:rows});
  }
  if(u.pathname==='/api/restore'&&request.method==='POST'){
   if(me.role!=='Admin')return reply({error:'Admin role required'},403);
   const x=await readBody(request),input=Array.isArray(x.records)?x.records:[];if(x.format!=='alsyed-jalal-backup'||!input.length)return reply({error:'A valid Al-Syed Jalal backup with records is required'},400);if(input.length>5000)return reply({error:'Restore is limited to 5,000 records per request'},413);
   const values=[],tuples=[];for(let i=0;i<input.length;i++){const v=input[i],name=String(v?.name||'').trim(),id=String(v?.id||'');if(!name||name.length>500||!id||id.length>200)return reply({error:'Backup contains an invalid record'},400);const a=[id,name,String(v.region||'').slice(0,200),String(v.sector||'').slice(0,200),String(v.status||'Active').slice(0,100),String(v.notes||'').slice(0,10000)];const n=values.length;values.push(...a);tuples.push('('+a.map((_,j)=>'$'+(n+j+1)).join(',')+')')}
   const saved=await db.query('INSERT INTO records(id,name,region,sector,status,notes,created_by,updated_by) SELECT v.id,v.name,v.region,v.sector,v.status,v.notes,$'+(values.length+1)+',$'+(values.length+1)+' FROM (VALUES '+tuples.join(',')+') AS v(id,name,region,sector,status,notes) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,region=EXCLUDED.region,sector=EXCLUDED.sector,status=EXCLUDED.status,notes=EXCLUDED.notes,updated_by=$'+(values.length+1)+',updated_at=now(),deleted_at=NULL RETURNING id',[...values,me.id]);
   await audit(db,me,'BACKUP_RESTORE','Restored/upserted '+saved.length+' records; no unrelated records deleted',request);return reply({ok:true,restoredRecords:saved.length,mode:'merge'});
  }
  if(u.pathname==='/api/security/events'&&request.method==='GET'){
   if(me.role!=='Admin')return reply({error:'Admin role required'},403);const rows=await db.query('SELECT e.action,e.detail,e.created_at,u.username FROM audit_events e LEFT JOIN app_users u ON u.id=e.user_id ORDER BY e.created_at DESC LIMIT 100');return reply({events:rows.map(z=>({action:z.action,detail:z.detail,user:z.username||'system',time:z.created_at}))});
  }
  if(u.pathname==='/api/admin/permissions'&&request.method==='GET'){
   if(me.role!=='Admin')return reply({error:'Admin role required'},403);return reply({permissions:{Admin:['all permissions','user management','backup and restore','system diagnostics'],Manager:['read records','create and update records','soft-delete records','resolve approvals'], 'Data Operator':['read records','create and update records','bulk import'],Viewer:['read records','view dashboards']}});
  }
  if(u.pathname==='/api/admin/metrics'&&request.method==='GET'){
   if(me.role!=='Admin')return reply({error:'Admin role required'},403);const [runs,events,sessions]=await Promise.all([db.query("SELECT count(*)::int AS requests,count(*) FILTER(WHERE status<>'completed')::int AS errors FROM ai_runs WHERE created_at>now()-interval '24 hours'"),db.query("SELECT count(*)::int AS n FROM audit_events WHERE created_at>now()-interval '24 hours' AND action LIKE '%RATE_LIMIT%'"),db.query('SELECT count(*)::int AS n FROM sessions WHERE revoked_at IS NULL AND expires_at>now()')]);return reply({process:{uptimeSeconds:null,metric:'not exposed by stateless Pages runtime'},requests:{requests:Number(runs[0]?.requests||0),errors:Number(runs[0]?.errors||0),rateLimited:Number(events[0]?.n||0),scope:'AI runs and recorded rate-limit events, last 24h'},db:{connections:null,max_connections:null,activeSessions:Number(sessions[0]?.n||0)}});
  }
  if(u.pathname==='/api/admin/data-integrity'&&request.method==='GET'){
   if(me.role!=='Admin')return reply({error:'Admin role required'},403);const [a,b,c,d]=await Promise.all([db.query("SELECT count(*)::int AS n FROM records WHERE deleted_at IS NULL AND btrim(name)=''"),db.query('SELECT count(*)::int AS n FROM record_history h LEFT JOIN records r ON r.id=h.record_id WHERE r.id IS NULL'),db.query('SELECT count(*)::int AS n FROM documents d LEFT JOIN records r ON r.id=d.record_id WHERE d.record_id IS NOT NULL AND r.id IS NULL AND d.deleted_at IS NULL'),db.query('SELECT count(*)::int AS n FROM (SELECT lower(username) FROM app_users GROUP BY lower(username) HAVING count(*)>1) q')]);const checks={recordsMissingName:Number(a[0]?.n||0),orphanHistory:Number(b[0]?.n||0),orphanDocuments:Number(c[0]?.n||0),duplicateUsernames:Number(d[0]?.n||0)};return reply({ok:Object.values(checks).every(v=>v===0),status:Object.values(checks).every(v=>v===0)?'clean':'issues_found',checks});
  }
  if(u.pathname==='/api/admin/system-snapshot'&&request.method==='GET'){
   if(me.role!=='Admin')return reply({error:'Admin role required'},403);const [r,d,s,a,ai,reg,sec]=await Promise.all([db.query('SELECT count(*) FILTER(WHERE deleted_at IS NULL)::int AS active,count(*) FILTER(WHERE deleted_at IS NOT NULL)::int AS deleted FROM records'),db.query('SELECT count(*)::int AS n FROM documents WHERE deleted_at IS NULL'),db.query('SELECT count(*)::int AS n FROM sessions WHERE revoked_at IS NULL AND expires_at>now()'),db.query("SELECT count(*)::int AS n FROM audit_events WHERE created_at>now()-interval '24 hours'"),db.query("SELECT count(*)::int AS n FROM ai_runs WHERE status='running' AND created_at>now()-interval '10 minutes'"),db.query("SELECT region,count(*)::int AS count FROM records WHERE deleted_at IS NULL GROUP BY region ORDER BY count DESC LIMIT 8"),db.query("SELECT sector,count(*)::int AS count FROM records WHERE deleted_at IS NULL GROUP BY sector ORDER BY count DESC LIMIT 8")]);return reply({records:{active:Number(r[0]?.active||0),deleted:Number(r[0]?.deleted||0)},documents:Number(d[0]?.n||0),sessions:{active:Number(s[0]?.n||0)},audit24h:{total:Number(a[0]?.n||0)},ai:{active:Number(ai[0]?.n||0),maxConcurrent:null,queued:null},pool:{total:null,idle:null,waiting:null,source:'Neon connection pool metrics are not exposed to this Pages Function'},process:{uptimeSeconds:null,source:'stateless edge runtime'},regions:reg.map(z=>({region:z.region,count:Number(z.count)})),sectors:sec.map(z=>({sector:z.sector,count:Number(z.count)}))});
  }
  if(u.pathname==='/api/ai/supervisor'&&request.method==='POST'){
   const x=await readBody(request),goal=String(x.goal||'').trim(),max=Math.min(3,Math.max(1,Number(x.maxTasks)||3)),childHeaders=new Headers(request.headers);childHeaders.delete('content-length');childHeaders.set('content-type','application/json');if(goal.length<2||goal.length>5000)return reply({error:'Goal must be 2–5,000 characters'},400);const roles=['analysis','research','coding'].slice(0,max),results=[];for(let i=0;i<roles.length;i++){const task='Supervisor task '+(i+1)+' ('+roles[i]+'): '+goal+'\nProvide only this specialist perspective, key findings and actionable next step.';const target=new URL(request.url);target.pathname='/api/ai/run';const rr=await onRequest({request:new Request(target,{method:'POST',headers:childHeaders,body:JSON.stringify({prompt:task,provider:x.provider||'gemini',agentId:roles[i]})}),env});const data=await rr.json();results.push({agentId:roles[i],status:rr.ok?'completed':'failed',output:data.output||'',error:data.error||null,traceId:data.traceId||null});if(!rr.ok)break}return reply({status:results.every(z=>z.status==='completed')?'completed':'partial',summary:results.map(z=>z.output).filter(Boolean).join('\n\n'),results});
  }
  if(u.pathname==='/api/ai/autogpt'&&request.method==='POST'){
   const x=await readBody(request),goal=String(x.goal||'').trim(),max=Math.min(3,Math.max(1,Number(x.maxIterations)||3)),childHeaders=new Headers(request.headers);childHeaders.delete('content-length');childHeaders.set('content-type','application/json');if(goal.length<2||goal.length>5000)return reply({error:'Goal must be 2–5,000 characters'},400);const steps=[];let context='';for(let i=1;i<=max;i++){const prompt='Bounded AutoGPT planning iteration '+i+' of '+max+'. Goal: '+goal+'\nPrevious iteration: '+context.slice(0,3500)+'\nReturn the next concrete plan/refinement. Do not claim external tools or actions were executed.';const target=new URL(request.url);target.pathname='/api/ai/run';const rr=await onRequest({request:new Request(target,{method:'POST',headers:childHeaders,body:JSON.stringify({prompt,provider:x.provider||'gemini',agentId:x.agentId||'autogpt'})}),env});const data=await rr.json();steps.push({iteration:i,status:rr.ok?'completed':'failed',output:data.output||'',error:data.error||null,traceId:data.traceId||null});if(!rr.ok)break;context=data.output||''}return reply({status:steps.every(z=>z.status==='completed')?'completed':'partial',iteration:steps.length,steps});
  }
  return reply({ok:false,error:'Route not yet migrated to Cloudflare API',code:'ROUTE_NOT_IMPLEMENTED'},501)
 }catch(e){const status=Number(e?.status)||500;
  // Hide internals in production, but never hide them from the local preview —
  // a bare "Internal server error" made a real failure undiagnosable.
  const detail=env.LOCAL_PREVIEW?String(e?.message||e).slice(0,300):undefined;
  return reply({ok:false,error:status>=500?'Internal server error':e.message,code:status===500?'INTERNAL_ERROR':'REQUEST_ERROR',...(detail?{detail}:{})},status)}
}
