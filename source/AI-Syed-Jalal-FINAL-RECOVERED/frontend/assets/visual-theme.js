/* One local visual preference for every surface of the same application.
   No account, content, API or database data is read or changed here. */
(() => {
  'use strict';
  const key = 'aj-site-theme-v2';
  const themes = {
    glass: { name: 'Glassmorphism', short: 'Glass', note: 'Airy & clear' },
    water: { name: 'Watermorphism', short: 'Water', note: 'Calm & fluid' },
    clay: { name: 'Claymorphism', short: 'Clay', note: 'Soft & sculpted' },
    ice: { name: 'Icemorphism', short: 'Ice', note: 'Crisp & frosted' },
    fire: { name: 'Firemorphism', short: 'Fire', note: 'Warm & bright' },
    rainbow: { name: 'Rainbowmorphism', short: 'Rainbow', note: 'Colour & light' }
  };
  let current = 'glass';
  try {
    // Bring forward a valid old style without modifying or deleting old preferences.
    const stored = localStorage.getItem(key) || localStorage.getItem('aj-site-theme-v1') || localStorage.getItem('aj-visual-theme');
    if (Object.prototype.hasOwnProperty.call(themes, stored)) current = stored;
  } catch (_) { /* The selector still works for this page if storage is blocked. */ }
  document.documentElement.dataset.ajTheme = current;

  function choiceMarkup(id) {
    const theme = themes[id];
    return `<button type="button" class="aj-theme-choice" data-theme-choice="${id}" aria-pressed="false" aria-label="Apply ${theme.name} theme"><span class="aj-choice-swatch" aria-hidden="true"></span><span class="aj-choice-copy"><strong>${theme.short}</strong><small>${theme.note}</small></span><span class="aj-choice-check" aria-hidden="true">✓</span></button>`;
  }
  function syncControls() {
    document.querySelectorAll('[data-theme-choice]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.themeChoice === current));
    });
    const status = document.getElementById('theme-status');
    if (status) status.textContent = `${themes[current].name} is active. Your choice is saved on this device when storage is available.`;
    const label = document.getElementById('aj-theme-current');
    if (label) label.textContent = themes[current].short;
  }
  function select(id) {
    if (!Object.prototype.hasOwnProperty.call(themes, id)) return;
    current = id;
    document.documentElement.dataset.ajTheme = id;
    try { localStorage.setItem(key, id); } catch (_) { /* Use the selection until the page closes. */ }
    syncControls();
    window.dispatchEvent(new CustomEvent('aj-theme-change', { detail: { theme: id } }));
  }
  function open() {
    const menu = document.getElementById('aj-theme-menu');
    const trigger = document.getElementById('aj-theme-trigger');
    if (!menu || !trigger) return;
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    const selected = menu.querySelector('[aria-pressed="true"]');
    if (selected) selected.focus();
  }
  function close(returnFocus = false) {
    const menu = document.getElementById('aj-theme-menu');
    const trigger = document.getElementById('aj-theme-trigger');
    if (!menu || !trigger) return;
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (returnFocus) trigger.focus();
  }
  window.AJTheme = Object.freeze({ select, open, close, current: () => current });

  function mount() {
    document.querySelectorAll('[data-theme-picker]').forEach(picker => {
      picker.innerHTML = Object.keys(themes).map(choiceMarkup).join('');
    });
    const studio = document.createElement('div');
    studio.className = 'aj-theme-studio';
    studio.innerHTML = `<div class="aj-theme-menu" id="aj-theme-menu" hidden><div class="aj-menu-heading"><span class="aj-menu-kicker">MAKE IT YOURS</span><strong>Choose your atmosphere</strong><p>One look across pages in this browser or app.</p></div><div class="aj-menu-choices" role="group" aria-label="Choose visual theme">${Object.keys(themes).map(choiceMarkup).join('')}</div></div><button type="button" class="aj-theme-trigger" id="aj-theme-trigger" aria-expanded="false" aria-controls="aj-theme-menu"><span class="aj-theme-trigger-icon" aria-hidden="true">✦</span><span>Themes</span><span id="aj-theme-current">${themes[current].short}</span></button>`;
    document.body.appendChild(studio);
    syncControls();
    studio.querySelector('#aj-theme-trigger').addEventListener('click', () => {
      const menu = document.getElementById('aj-theme-menu');
      if (menu.hidden) open(); else close();
    });
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-theme-choice]');
      if (button) { select(button.dataset.themeChoice); return; }
      if (!studio.contains(event.target) && !event.target.closest('[data-aj-theme-open]')) close();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !document.getElementById('aj-theme-menu').hidden) close(true);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
