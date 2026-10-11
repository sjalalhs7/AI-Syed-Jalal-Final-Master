import assert from 'node:assert/strict';
import { createSupervisorPlan, runSupervisor } from '../../backend/agent-systems/supervisor.mjs';
import { createAutoGPTState, runAutoGPT } from '../../backend/agent-systems/autogpt.mjs';

const inventory={agents:[
 {id:'software-architect',name:'Software Architect',group:'Engineering',skills:['architecture']},
 {id:'ui-ux-designer',name:'UI/UX Designer',group:'Design',skills:['ui','ux']},
 {id:'researcher',name:'Researcher',group:'Research',skills:['research']}
]};
const plan=createSupervisorPlan({goal:'Build a secure frontend and API architecture',inventory});
assert.equal(plan.type,'supervisor-plan'); assert.ok(plan.tasks.length>=1); assert.ok(plan.tasks.some(x=>x.agentId==='software-architect'));
const calls=[];
const supervisor=await runSupervisor({goal:'Research and design the API',inventory,runAgent:async x=>{calls.push(x);return {output:`done ${x.agentId}`,traceId:x.agentId,provider:'mock'}}});
assert.equal(supervisor.status,'completed'); assert.equal(supervisor.summary.failed,0); assert.equal(calls.length,supervisor.tasks.length);
const state=createAutoGPTState({goal:'Verify release readiness',maxIterations:3}); assert.equal(state.status,'ready'); assert.equal(state.maxIterations,3);
let n=0;
const auto=await runAutoGPT({goal:'Verify release readiness',maxIterations:3,runAgent:async x=>({output:`step ${++n}`,traceId:String(n),provider:'mock'}),stopWhen:s=>s.iteration>=2});
assert.equal(auto.status,'completed'); assert.equal(auto.steps.length,2);
console.log('V120 AGENT SYSTEMS PASS',JSON.stringify({supervisor:supervisor.summary,autogpt:{status:auto.status,steps:auto.steps.length}}));
