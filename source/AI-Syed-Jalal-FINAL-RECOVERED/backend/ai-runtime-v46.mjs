import { runAgent as baseRunAgent, getAgentInventory as baseInventory } from './ai-runtime.mjs';

const maxConcurrent = Math.max(1, Number(process.env.AI_MAX_CONCURRENT || 8));
let active = 0;
const failures = new Map();
const blockedUntil = new Map();

async function gate(provider) {
  const until = blockedUntil.get(provider) || 0;
  if (until > Date.now()) throw new Error(`Provider ${provider} circuit is temporarily open.`);
  if (active >= maxConcurrent) throw new Error('AI runtime concurrency limit reached; retry shortly.');
  active++;
}
function release(){ active=Math.max(0,active-1); }
function record(provider, ok){
  const n=failures.get(provider)||0;
  if(ok){ failures.set(provider,0); blockedUntil.delete(provider); return; }
  const next=n+1; failures.set(provider,next);
  if(next>=Number(process.env.AI_PROVIDER_FAILURE_THRESHOLD||3)) blockedUntil.set(provider,Date.now()+Number(process.env.AI_PROVIDER_COOLDOWN_MS||30000));
}
export function getAgentInventory(){
  const x=baseInventory();
  return {...x,runtime:{maxConcurrent,active,providers:Object.fromEntries(x.providers.map(p=>[p.id,{failures:failures.get(p.id)||0,blockedUntil:blockedUntil.get(p.id)||0}]))}};
}
export async function runAgentV46(opts){
  const provider=opts.provider||'deepseek';
  await gate(provider);
  try{ const result=await baseRunAgent(opts); record(result.provider,true); return {...result,runtime:{maxConcurrent,activeAfterRun:active-1}}; }
  catch(e){ record(provider,false); throw e; }
  finally{ release(); }
}
export const runAgentV44 = runAgentV46;
