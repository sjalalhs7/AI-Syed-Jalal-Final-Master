import { VOICE_SURFACES, surfaceShipsContract } from './voice-surfaces.mjs';

// A list of intended public pages is not proof that they are deployed. When an
// asset binding exists, check the actual response and a page-specific marker;
// otherwise report unknown rather than claiming a build-time gate ran here.
export const PAGE_INVENTORY = Object.freeze([
  { file: 'index.html', label: 'Homepage + login', marker: 'id="login"' },
  { file: 'ai-hub.html', label: 'AI Hub discovery', marker: 'id="experienceSearch"' },
  { file: 'agent.html', label: 'Agent Studio', marker: 'id="studio"' },
  { file: 'jalalai.html', label: 'JalalAi assistant', marker: 'id="quickStart"' },
  { file: 'workspace.html', label: 'Workspace', marker: 'id="view-data"' },
  { file: 'dashboard.html', label: 'Dashboard', marker: 'id="v-home"' },
  { file: 'guide.html', label: 'Start here guide', marker: 'id="guideStatus"' },
  { file: 'agent-lab.html', label: 'Agent Lab self-check', marker: 'id="skillsStatus"' },
  { file: 'arena.html', label: 'Arena battles', marker: 'id="statAgree"' },
  { file: 'jarvis.html', label: 'JARVIS voice console', marker: 'id="micIndicator"' },
  { file: 'critic.html', label: 'Expert Critic review', marker: 'id="dimsPanel"' },
  { file: 'refactor-plan.html', label: 'Architecture and merge decisions', marker: 'id="decisions"' },
  { file: 'allinone.html', label: 'All-in-one specialist panel', marker: 'id="routeHint"' },
  { file: 'toolbench.html', label: 'Toolbench', marker: 'id="toolCount"' },
  { file: 'pagebuilder.html', label: 'Page Builder', marker: 'id="buildForm"' },
  { file: 'notes.html', label: 'Quick Notes', marker: 'id="draftState"' },
  { file: 'share-target.html', label: 'Shared content', marker: 'id="shareState"' },
  { file: 'protocol.html', label: 'Link review', marker: 'id="protocolState"' },
  { file: 'capabilities.html', label: 'App capabilities', marker: 'id="capRows"' }
]);

export async function pageStatus(env) {
  const unknown = page => ({ file: page.file, label: page.label, exists: null, closesHtml: null, voiceContract: null, source: 'not probed' });
  if (!env?.ASSETS || typeof env.ASSETS.fetch !== 'function') return PAGE_INVENTORY.map(unknown);
  return Promise.all(PAGE_INVENTORY.map(async page => {
    try {
      const response = await env.ASSETS.fetch(new Request('https://assets.local/' + page.file));
      if (response.status === 404) return { ...unknown(page), exists: false, source: 'asset returned 404' };
      if (!response.ok) return { ...unknown(page), source: `asset probe returned HTTP ${response.status}` };
      const html = await response.text();
      if (!html.includes(page.marker)) return { ...unknown(page), exists: false, source: 'asset returned unexpected content' };
      const contract = VOICE_SURFACES.some(item => item.file === page.file) ? surfaceShipsContract(html) : null;
      return { file: page.file, label: page.label, exists: true, closesHtml: /<\/html>\s*$/i.test(html), voiceContract: contract, source: 'asset response' };
    } catch {
      return { ...unknown(page), source: 'asset probe failed' };
    }
  }));
}
