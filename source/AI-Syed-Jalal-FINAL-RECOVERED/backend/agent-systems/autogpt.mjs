import crypto from 'node:crypto';

function nextObjective(goal, iteration, prior) {
  if (iteration===0) return `Plan the first concrete step for this goal: ${goal}`;
  return `Continue this goal: ${goal}. Previous step result: ${String(prior?.output||'').slice(0,2500)}. Identify the next concrete, verifiable step. Do not claim completion without evidence.`;
}

export function createAutoGPTState({goal,maxIterations=5}={}) {
  const clean=String(goal||'').trim();
  if(clean.length<2) throw new Error('AutoGPT goal is required.');
  return {id:crypto.randomUUID(),type:'autogpt-session',goal:clean,maxIterations:Math.max(1,Math.min(10,Number(maxIterations)||5)),iteration:0,status:'ready',steps:[]};
}

export async function runAutoGPT({goal,runAgent,provider='deepseek',fallbackProviders=[],maxIterations=5,stopWhen, onStep}={}) {
  if(typeof runAgent!=='function') throw new Error('AutoGPT requires a runAgent function.');
  const state=createAutoGPTState({goal,maxIterations});
  let prior=null;
  for(let i=0;i<state.maxIterations;i++){
    const objective=nextObjective(state.goal,i,prior);
    const started=Date.now();
    try{
      const result=await runAgent({provider,fallbackProviders,prompt:objective});
      const step={iteration:i+1,objective,status:'completed',durationMs:Date.now()-started,output:result.output,traceId:result.traceId,provider:result.provider};
      state.steps.push(step); state.iteration=i+1; prior=step; onStep?.(step);
      if(typeof stopWhen==='function' && stopWhen(step,state)){state.status='completed';return state;}
    }catch(error){
      const step={iteration:i+1,objective,status:'failed',durationMs:Date.now()-started,error:String(error.message||error)};
      state.steps.push(step); state.iteration=i+1; state.status='failed'; onStep?.(step); return state;
    }
  }
  state.status='max-iterations';
  return state;
}
