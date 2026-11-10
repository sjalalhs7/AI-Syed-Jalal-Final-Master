/* Group secondary destinations without removing them. The original links stay
   in the HTML for no-script/static access, and only crowded topbars opt in. */
(() => {
  'use strict';
  function mount() {
    const nav = document.querySelector('.topbar > nav[aria-label="Main navigation"]');
    if (!nav || nav.querySelector('details')) return;
    const links = [...nav.querySelectorAll(':scope > a')];
    if (links.length <= 4) return;

    // Keep the voice assistant and workspace/help readily accessible where
    // present; leave every existing destination in the same navigation.
    const primary = [];
    for (const href of ['jarvis.html', 'workspace.html', 'guide.html']) {
      const link = links.find(item => item.getAttribute('href') === href);
      if (link && primary.length < 2) primary.push(link);
    }
    for (const link of links) if (primary.length < 2 && !primary.includes(link)) primary.push(link);

    const menu = document.createElement('details');
    menu.className = 'aj-compact-menu';
    const summary = document.createElement('summary');
    summary.className = 'btn'; summary.textContent = 'More';
    const choices = document.createElement('div'); choices.className = 'aj-compact-links';
    for (const link of links) if (!primary.includes(link)) choices.appendChild(link);
    menu.append(summary, choices); nav.appendChild(menu);
    nav.classList.add('aj-compact-nav');
    nav.closest('.topbar')?.classList.add('has-compact-navigation');
    document.addEventListener('click', event => { if (menu.open && !menu.contains(event.target)) menu.open = false; });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menu.open) { menu.open = false; summary.focus(); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
