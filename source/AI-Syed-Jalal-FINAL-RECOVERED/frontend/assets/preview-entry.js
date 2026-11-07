'use strict';
(() => {
  // Only the server can enable this button. The demo endpoint requires a local database adapter.
  if (window.AJ_STATIC_HOST) return;
  fetch('/api/health', { credentials: 'same-origin', signal: AbortSignal.timeout(10000) })
    .then(response => response.ok ? response.json() : null).then(health => {
      if (!health?.localPreview) return;
      window.ajLocalPreview = true;
      const form = document.querySelector('#loginForm') || document.querySelector('#f');
      if (!form) return;
      const button = document.createElement('button'); button.type = 'button'; button.id = 'previewAccessBtn'; button.className = 'btn'; button.style.cssText = 'width:100%;margin-top:12px'; button.textContent = 'Try the local preview';
      const note = document.createElement('p'); note.className = 'muted'; note.style.cssText = 'font-size:12px;margin-top:8px'; note.textContent = 'Disposable shared sandbox: use test data only. No production data or credentials are used. Other sandbox testers may see shared records.';
      button.onclick = async () => {
        if (window.workspaceReady) await window.workspaceReady;
        button.disabled = true; button.textContent = 'Preparing your preview…';
        try {
          let csrf = '';
          if (document.querySelector('#loginForm')) { const session = await fetch('/api/me', { credentials: 'same-origin' }).then(r => r.json()); csrf = session.csrfToken || ''; }
          const response = await fetch('/api/demo', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) }, body: '{}' });
          if (!response.ok) throw new Error((await response.json()).error || 'Preview could not start');
          if (document.querySelector('#loginForm')) { const session = await fetch('/api/me', { credentials: 'same-origin' }).then(r => r.json()); if (!session.authenticated) throw new Error('Preview session was not established'); location.reload(); } else {
            if (typeof window.AJNavigateAfterSignIn === 'function') window.AJNavigateAfterSignIn();
            else location.href = 'dashboard.html';
          }
        } catch (error) { note.textContent = error.message; note.setAttribute('role', 'alert'); button.disabled = false; button.textContent = 'Try the local preview'; }
      };
      form.append(button, note);
    }).catch(() => {});
})();
