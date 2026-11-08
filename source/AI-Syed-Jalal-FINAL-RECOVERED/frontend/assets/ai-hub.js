import { CATEGORIES, STARTERS, PROVIDERS, selectSkills, filterSkills, filterExperiences, skillPrompt } from './ai-hub-data.js?v=163';

const $ = id => document.getElementById(id);
const PAGE_SIZE = 12;
const HUB_DRAFT = 'aj-hub-draft-v1';
let category = 'all', skills = [], visibleSkills = PAGE_SIZE, providerRequest = 0;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function openPrompt(title, prompt) {
  $('promptTitle').textContent = title;
  $('promptDraft').value = prompt;
  $('draftStatus').textContent = '';
  $('openDraft').hidden = Boolean(window.AJ_STATIC_HOST);
  $('manualStudio').hidden = true;
  $('secureStudio').hidden = !window.AJ_STATIC_HOST;
  if (window.AJ_STATIC_HOST) $('draftStatus').textContent = 'Static preview: copy the prompt before opening the secure app; drafts cannot transfer between websites.';
  const dialog = $('promptDialog');
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  $('promptDraft').focus();
}

function actionNode(action) {
  if (action.type === 'link') {
    const link = element('a', 'hub-card-action', action.label + ' ↗');
    link.href = action.href;
    return link;
  }
  const button = element('button', 'hub-card-action', action.label + ' ↗');
  button.type = 'button';
  button.addEventListener('click', () => openPrompt(action.label, action.prompt));
  return button;
}

function experienceCard(item) {
  const card = element('article', 'hub-experience');
  card.dataset.experience = item.id;
  const top = element('div', 'hub-card-top');
  const icon = element('span', 'hub-card-icon', item.icon); icon.setAttribute('aria-hidden', 'true');
  const state = element('span', 'hub-state', item.status); state.dataset.tone = item.tone;
  top.append(icon, state);
  const details = element('details', 'hub-card-details');
  const summary = element('summary', '', 'What to expect');
  const list = element('dl');
  for (const [label, value] of [['Input', item.input], ['Output', item.output], ['Limits', item.limit]]) list.append(element('dt', '', label), element('dd', '', value));
  details.append(summary, list);
  card.append(top, element('p', 'hub-card-eyebrow', item.eyebrow), element('h3', '', item.title), element('p', '', item.description), details, actionNode(item.action));
  if (item.secondaryAction) card.append(actionNode(item.secondaryAction));
  return card;
}

function renderExperiences() {
  const query = $('experienceSearch').value;
  const matches = filterExperiences(category, query);
  $('experienceGrid').replaceChildren(...matches.map(experienceCard));
  if (!matches.length) $('experienceGrid').append(element('p', 'hub-empty', 'No categories match. Try another search or choose All.'));
  $('experienceStatus').textContent = `${matches.length} ${matches.length === 1 ? 'experience' : 'experiences'} shown${query.trim() ? ' for your search' : ''}.`;
  $('categoryFilters').querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.category === category)));
}

function renderFilters() {
  $('categoryFilters').replaceChildren(...CATEGORIES.map(item => {
    const button = element('button', 'hub-filter', item.label);
    button.type = 'button'; button.dataset.category = item.id;
    button.setAttribute('aria-pressed', String(item.id === category));
    button.addEventListener('click', () => { category = item.id; renderExperiences(); });
    return button;
  }));
}

function renderStarters() {
  $('starterGrid').replaceChildren(...STARTERS.map(item => {
    const card = element('article', 'hub-starter');
    const icon = element('span', 'hub-starter-icon', item.symbol); icon.setAttribute('aria-hidden', 'true');
    const button = element('button', 'hub-card-action', 'Prepare prompt ↗'); button.type = 'button';
    button.setAttribute('aria-label', `Prepare ${item.title} prompt`);
    button.addEventListener('click', () => openPrompt(item.title, item.prompt));
    card.append(icon, element('h3', '', item.title), element('p', '', item.description), button);
    return card;
  }));
}

function skillCard(skill) {
  const card = element('article', 'hub-skill');
  card.dataset.skillId = skill.id;
  const icon = element('span', 'hub-skill-symbol', '✳'); icon.setAttribute('aria-hidden', 'true');
  const body = element('div', 'hub-skill-body');
  const button = element('button', 'hub-card-action', 'Prepare prompt ↗'); button.type = 'button';
  button.setAttribute('aria-label', `Prepare ${skill.name} prompt`);
  button.addEventListener('click', () => openPrompt(skill.name, skillPrompt(skill)));
  body.append(element('h3', '', skill.name), element('p', '', `${skill.domain} · ${skill.family}`), button);
  card.append(icon, body);
  return card;
}

function renderSkills() {
  const matches = filterSkills(skills, $('skillSearch').value, $('skillDomain').value);
  const shown = Math.min(visibleSkills, matches.length);
  $('skillGrid').replaceChildren(...matches.slice(0, shown).map(skillCard));
  if (!matches.length) $('skillGrid').append(element('p', 'hub-empty', 'No curated skills match. Try another search or domain.'));
  $('skillStatus').textContent = `Showing ${shown} of ${matches.length} matching skill prompts · ${skills.length} curated in total.`;
  const more = $('loadMore');
  const returnFocus = document.activeElement === more && shown >= matches.length;
  more.hidden = shown >= matches.length;
  if (returnFocus) $('skillStatus').focus();
}

async function loadSkills() {
  $('retrySkills').hidden = true;
  $('loadMore').hidden = true;
  $('skillStatus').textContent = 'Loading skill index…';
  try {
    const response = await fetch('config/agent-skill-index.json', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Skill index unavailable');
    const index = await response.json();
    const selected = selectSkills(index);
    if (!selected.length) throw new Error('Skill index is empty or invalid');
    skills = selected;
    const counts = new Map();
    for (const skill of skills) counts.set(skill.domain, (counts.get(skill.domain) || 0) + 1);
    const domain = $('skillDomain'), previous = domain.value;
    domain.replaceChildren(new Option('All domains', ''), ...[...counts].map(([name, count]) => new Option(`${name} (${count})`, name)));
    if (counts.has(previous)) domain.value = previous;
    $('skillFact').textContent = String(skills.length);
    $('domainFact').textContent = String(counts.size);
    visibleSkills = PAGE_SIZE;
    renderSkills();
  } catch {
    skills = [];
    $('skillGrid').replaceChildren();
    $('skillFact').textContent = 'Unavailable';
    $('domainFact').textContent = '—';
    $('skillStatus').textContent = 'The skill index could not be loaded. Check your connection and retry.';
    $('retrySkills').hidden = false;
  }
}

function renderProviderRows(providers = [], fallback = 'Status not checked') {
  const byId = new Map(providers.map(item => [item?.id, item]));
  $('providerList').replaceChildren(...PROVIDERS.map(provider => {
    const row = element('div', 'hub-provider-row');
    const state = byId.get(provider.id);
    const label = state?.configured === true ? 'Key configured · not live-verified' : state?.configured === false ? 'Not configured' : fallback;
    row.append(element('strong', '', provider.label), element('span', '', label));
    return row;
  }));
}

async function json(path) {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Status request failed (${response.status})`);
  return response.json();
}

async function checkProviders() {
  const request = ++providerRequest;
  $('providerSignIn').hidden = true;
  if (window.AJ_STATIC_HOST) {
    renderProviderRows([], 'Secure app required');
    $('providerStatus').textContent = 'Static preview: provider setup cannot be checked here.';
    $('providerSignIn').href = 'https://ai-syed-jalal-live.pages.dev/ai-hub.html';
    $('providerSignIn').textContent = 'Open secure AI Hub ↗';
    $('providerSignIn').hidden = false;
    $('providerRetry').hidden = true;
    return;
  }
  $('providerStatus').textContent = 'Checking your session…';
  renderProviderRows([], 'Checking…');
  try {
    const session = await json('/api/me');
    if (request !== providerRequest) return;
    if (session.authenticated === false) {
      renderProviderRows([], 'Sign in to check');
      $('providerStatus').textContent = 'Sign in to check the provider configuration on this application server.';
      $('providerSignIn').hidden = false;
      return;
    }
    if (session.authenticated !== true) throw new Error('Invalid session response');
    const result = await json('/api/ai/capabilities');
    if (request !== providerRequest) return;
    if (!Array.isArray(result.providers)) throw new Error('Invalid provider response');
    renderProviderRows(result.providers, 'Status unavailable');
    const complete = PROVIDERS.every(provider => result.providers.some(item => item?.id === provider.id && typeof item.configured === 'boolean'));
    $('providerStatus').textContent = complete ? 'Configuration checked. A key does not prove a live provider response.' : 'Some provider statuses could not be read. No live provider response was verified.';
  } catch {
    if (request !== providerRequest) return;
    renderProviderRows([], 'Status unavailable');
    $('providerStatus').textContent = 'Provider status could not be checked. No provider availability was verified.';
  }
}

$('experienceSearch').addEventListener('input', renderExperiences);
for (const id of ['skillSearch', 'skillDomain']) $(id).addEventListener(id === 'skillSearch' ? 'input' : 'change', () => { visibleSkills = PAGE_SIZE; if (skills.length) renderSkills(); });
$('loadMore').addEventListener('click', () => { visibleSkills += PAGE_SIZE; renderSkills(); });
$('retrySkills').addEventListener('click', loadSkills);
$('providerRetry').addEventListener('click', checkProviders);
$('closePrompt').addEventListener('click', () => {
  const dialog = $('promptDialog');
  if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
});
$('openDraft').addEventListener('click', () => {
  const draft = $('promptDraft').value.trim();
  if (!draft) { $('draftStatus').textContent = 'Add a prompt before opening Agent Studio.'; $('promptDraft').focus(); return; }
  try {
    sessionStorage.setItem(HUB_DRAFT, draft);
    if (sessionStorage.getItem(HUB_DRAFT) !== draft) throw new Error('Draft storage unavailable');
    location.href = 'agent.html?draft=1';
  } catch {
    $('draftStatus').textContent = 'This browser blocked draft storage. Copy the prompt, open Agent Studio and paste it there.';
    $('manualStudio').hidden = false;
    $('promptDraft').focus(); $('promptDraft').select();
  }
});
$('copyDraft').addEventListener('click', async () => {
  const text = $('promptDraft').value;
  if (!text.trim()) { $('draftStatus').textContent = 'Add a prompt before copying.'; return; }
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(text);
    $('draftStatus').textContent = 'Prompt copied. Nothing has been sent to an AI provider.';
  } catch {
    $('promptDraft').focus(); $('promptDraft').select();
    $('draftStatus').textContent = 'Select and copy the highlighted prompt using your device’s copy command.';
  }
});

renderFilters(); renderExperiences(); renderStarters(); renderProviderRows();
loadSkills(); checkProviders();
