'use strict';
// Reports are sent only after the user reviews and submits this form. Text is
// rendered with DOM properties and is never interpreted as markup.
(() => {
  const source = document.currentScript?.dataset.surface || 'home';
  let dialog, form, excerpt, details, category, status, submit;

  function ensureDialog() {
    if (dialog) return;
    dialog = document.createElement('dialog');
    dialog.className = 'aj-report-dialog';
    dialog.setAttribute('aria-labelledby', 'aj-report-title');
    dialog.innerHTML = `<form class="aj-report-form">
      <h2 id="aj-report-title">Report AI content</h2>
      <p>Review and edit the text before submitting. The excerpt, reason and your account name will be stored for an administrator to review. Do not include information you do not want to share. No report is sent until you submit.</p>
      <label>Reason <select name="category" required><option value="offensive">Offensive or hateful</option><option value="unsafe">Unsafe or harmful</option><option value="misleading">Misleading</option><option value="other">Other</option></select></label>
      <label>Content to report (up to 5,000 characters)<textarea name="excerpt" maxlength="5000" rows="6" required></textarea></label>
      <label>Additional context (optional, up to 1,000 characters)<textarea name="details" maxlength="1000" rows="3"></textarea></label>
      <div class="aj-report-actions"><button type="submit">Submit report</button><button type="button" class="aj-report-close">Close</button></div>
      <p class="aj-report-status" role="status" aria-live="polite"></p>
    </form>`;
    document.body.appendChild(dialog);
    form = dialog.querySelector('form'); excerpt = form.elements.excerpt; details = form.elements.details;
    category = form.elements.category; status = dialog.querySelector('.aj-report-status'); submit = form.querySelector('[type=submit]');
    dialog.querySelector('.aj-report-close').addEventListener('click', () => dialog.close());
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!excerpt.value.trim()) { status.textContent = 'Enter the content you want to report.'; return; }
      submit.disabled = true; status.textContent = 'Sending report…';
      try {
        if (window.AJ_STATIC_HOST) throw new Error('Reports need the secure app server. Open the secure app and sign in.');
        const meResponse = await fetch('/api/me', { credentials: 'same-origin', signal: AbortSignal.timeout(15000) });
        const me = await meResponse.json().catch(() => ({}));
        if (!meResponse.ok || !me.authenticated || !me.csrfToken) throw new Error('Sign in to the secure app before reporting content.');
        const response = await fetch('/api/content-reports', { method: 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(15000),
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken },
          body: JSON.stringify({ surface: dialog.dataset.surface, category: category.value, excerpt: excerpt.value, details: details.value }) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'The report could not be submitted.');
        status.textContent = 'Report submitted for administrator review. No immediate response is guaranteed.';
      } catch (error) {
        status.textContent = error?.message || 'The report could not be submitted. Try again.';
        submit.disabled = false;
      }
    });
  }

  function open(text = '', surface = source) {
    ensureDialog();
    form.reset(); dialog.dataset.surface = surface;
    excerpt.value = String(text || '').slice(0, 5000);
    status.textContent = String(text || '').length > 5000 ? 'Only the first 5,000 characters were included. Edit the excerpt before submitting.' : '';
    submit.disabled = false;
    if (!dialog.open) dialog.showModal();
    excerpt.focus();
  }
  function button(text, surface = source) {
    const node = document.createElement('button');
    node.type = 'button'; node.className = 'btn small aj-report-button'; node.textContent = 'Report reply';
    node.setAttribute('aria-label', 'Report this AI reply');
    node.addEventListener('click', () => open(text, surface));
    return node;
  }
  window.AJReport = { open, button };
  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-ai-report-open]');
    if (!trigger) return;
    const target = trigger.dataset.aiReportTarget && document.getElementById(trigger.dataset.aiReportTarget);
    open(target?.textContent || '', source);
  });
})();
