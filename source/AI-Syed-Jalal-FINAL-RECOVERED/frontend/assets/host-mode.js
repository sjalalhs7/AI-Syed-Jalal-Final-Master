'use strict';
(() => {
  // The standalone static archive sets this flag at packaging time; the
  // normal source deployment uses its actual host/API instead.
  const STATIC_PACKAGE = false;
  const params = new URLSearchParams(location.search);
  const staticHost = STATIC_PACKAGE || location.hostname.endsWith('.github.io') || location.protocol === 'file:' || params.get('static') === '1';
  window.AJ_STATIC_HOST = staticHost;
  window.AJ_HOST_MODE = staticHost ? 'static' : 'server';
  if (!staticHost) return;

  const setupUrl = 'guide.html#deployment';

  function announce() {
    if (document.getElementById('ajStaticHostBanner')) return;
    const secureAppUrl = document.querySelector('meta[name="secure-app-url"]')?.content || '';
    const banner = document.createElement('div');
    banner.id = 'ajStaticHostBanner';
    banner.setAttribute('role', 'status');
    banner.style.cssText = 'position:relative;z-index:9999;padding:10px 14px;background:#122036;color:#eaf2ff;border-bottom:1px solid #3b587e;font:13px/1.5 system-ui,sans-serif;display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:center;text-align:center';
    const text = document.createElement('span');
    text.textContent = 'Static website preview: account login, saved data and cloud AI need the secure application server.';
    banner.appendChild(text);
    if (secureAppUrl) {
      const app = document.createElement('a');
      app.href = secureAppUrl;
      app.textContent = 'Open secure app';
      app.style.cssText = 'color:#9ed0ff;font-weight:700';
      banner.appendChild(app);
    }
    const setup = document.createElement('a');
    setup.href = setupUrl;
    setup.textContent = 'Setup options';
    setup.style.cssText = 'color:#9ed0ff;font-weight:700';
    banner.appendChild(setup);
    document.body.prepend(banner);
  }

  function guardAuthForms() {
    const message = 'This static website copy cannot sign in by itself. Open the secure app server, or run the local preview with npm run dev. See Setup options.';
    for (const form of document.querySelectorAll('#f, #loginForm')) {
      const explain = () => {
        const error = form.querySelector('#err') || form.querySelector('.login-note p') || form.querySelector('.auth-note');
        if (error) { error.textContent = message; error.setAttribute('role', 'alert'); }
      };
      if (form.id === 'loginForm') explain();
      form.addEventListener('submit', event => {
        if (!window.AJ_STATIC_HOST) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        explain();
        if (!form.querySelector('#err') && !form.querySelector('.login-note p') && !form.querySelector('.auth-note')) window.alert(message);
      }, true);
    }
    const demo = document.getElementById('demoBtn') || document.getElementById('guidePreviewBtn');
    if (demo) { demo.hidden = true; demo.disabled = true; demo.style.display = 'none'; }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { announce(); guardAuthForms(); });
  else { announce(); guardAuthForms(); }
})();
