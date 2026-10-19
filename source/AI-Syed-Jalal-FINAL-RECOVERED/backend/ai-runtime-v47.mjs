import { runAgentV46, getAgentInventory as baseInventory } from './ai-runtime-v46.mjs';

const queueLimit = Math.max(1, Number(process.env.AI_QUEUE_LIMIT || 32));
let queued = 0;

export function getAgentInventory(){
  const x=baseInventory();
  return {...x,runtime:{...x.runtime,queueLimit,queued}};
}

export async function runAgentV47(opts){
  if(queued>=queueLimit) throw new Error('AI runtime queue limit reached; retry shortly.');
  queued++;
  try { return await runAgentV46(opts); }
  finally { queued=Math.max(0,queued-1); }
}
