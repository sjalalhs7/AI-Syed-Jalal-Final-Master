import crypto from 'node:crypto';

const STOP_WORDS = new Set(['the','and','for','with','this','that','from','into','your','you','are','please','make','need','want']);
const ROLE_HINTS = [
  [/\b(code|coding|bug|software|api|backend|frontend|javascript|typescript)\b/i, ['software-architect','code-reviewer','backend-developer']],
  [/\b(design|ui|ux|interface|frontend|visual)\b/i, ['ui-ux-designer','frontend-developer']],
  [/\b(research|analysis|analyze|compare|investigate)\b/i, ['researcher','data-analyst']],
  [/\b(marketing|seo|content|brand)\b/i, ['marketing-specialist','content-creator']],
  [/\b(finance|financial|budget|accounting)\b/i, ['financial-analyst']],
  [/\b(health|medical|clinical)\b/i, ['health-advisor']],
  [/\b(education|course|learning|ossu)\b/i, ['education-specialist']]
];

function words(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(x => x && !STOP_WORDS.has(x));
}

function chooseRoles(goal, inventory) {
  const text = String(goal || '');
  const hints = ROLE_HINTS.flatMap(([re, roles]) => re.test(text) ? roles : []);
  const available = new Set((inventory?.agents || []).map(a => a.id));
  const chosen = hints.filter(x => available.has(x));
  if (chosen.length) return [...new Set(chosen)].slice(0, 4);
  const terms = words(text);
  const scored = (inventory?.agents || []).map(a => {
    const hay = `${a.id} ${a.name} ${a.group || ''} ${(a.skills || []).join(' ')}`.toLowerCase();
    return {id:a.id, score:terms.reduce((n,t)=>n+(hay.includes(t)?1:0),0)};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  return (scored.length ? scored : (inventory?.agents || []).slice(0,3).map(a=>({id:a.id}))).slice(0,4).map(x=>x.id);
}

export function createSupervisorPlan({goal, inventory, maxTasks=4}={}) {
  const clean = String(goal || '').trim();
  if (clean.length < 2) throw new Error('Supervisor goal is required.');
  const ids = chooseRoles(clean, inventory);
  const tasks = ids.slice(0, Math.max(1, Math.min(6, Number(maxTasks)||4))).map((agentId, i) => ({
    id: crypto.randomUUID(), order:i+1, agentId, objective: i===0 ? `Analyze and propose the best approach for: ${clean}` : `Contribute specialist analysis to the goal: ${clean}`,
    status:'planned'
  }));
  return {id:crypto.randomUUID(), type:'supervisor-plan', goal:clean, tasks, policy:{maxTasks:tasks.length, requireApproval:false, noArbitraryTools:true}};
}

export async function runSupervisor({goal, inventory, runAgent, provider='deepseek', fallbackProviders=[], maxTasks=4, onTask}={}) {
  if (typeof runAgent !== 'function') throw new Error('Supervisor requires a runAgent function.');
  const plan = createSupervisorPlan({goal, inventory, maxTasks});
  const results=[];
  for (const task of plan.tasks) {
    const started=Date.now();
    try {
      const result=await runAgent({agentId:task.agentId, provider, fallbackProviders, prompt:task.objective});
      const item={...task,status:'completed',durationMs:Date.now()-started,output:result.output,traceId:result.traceId,provider:result.provider};
      results.push(item); onTask?.(item);
    } catch (error) {
      const item={...task,status:'failed',durationMs:Date.now()-started,error:String(error.message||error)};
      results.push(item); onTask?.(item);
    }
  }
  const completed=results.filter(x=>x.status==='completed');
  return { ...plan, status: completed.length ? (completed.length===results.length?'completed':'partial') : 'failed', results, summary:{total:results.length,completed:completed.length,failed:results.length-completed.length} };
}
