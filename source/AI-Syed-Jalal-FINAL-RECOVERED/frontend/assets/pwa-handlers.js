'use strict';
/*
 * pwa-handlers.js — the scripts behind share-target.html and protocol.html.
 *
 * Both pages receive something from outside the app and must behave the same
 * way about it: show it as received, store nothing, and let the person decide
 * what happens next. Saving is the existing, explicit confirmation route
 * (/api/assistant/confirm) that JalalAi already uses — a share does not get a
 * shortcut around the confirmation the app demands everywhere else.
 */
(() => {
  const $ = id => document.getElementById(id);
  let csrf = '', user = null;

  async function api(path, options = {}) {
    const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(csrf && options.method && options.method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}), ...options.headers };
    const response = await fetch('/api' + path, { ...options, headers, credentials: 'same-origin', signal: AbortSignal.timeout(30000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.error || `Request failed (${response.status})`); error.status = response.status; throw error; }
    return data;
  }

  // Same guard as notes.js: the static-host flag is set by a plain head script,
  // and a save must never be attempted against an API a static host cannot run.
  const onStaticHost = () => window.AJ_STATIC_HOST ?? /\.github\.io$/.test(location.hostname);

  async function whoAmI() {
    if (onStaticHost()) return null;
    try { const session = await api('/me'); csrf = session.csrfToken || ''; user = session.authenticated ? session.user : null; }
    catch { user = null; }
    return user;
  }

  async function saveNote(text, statusEl) {
    if (onStaticHost()) {
      statusEl.textContent = 'Static preview: saving needs the secure application server. Use Copy instead, or open Quick Notes and download it.';
      return false;
    }
    await whoAmI();
    if (!user) { statusEl.textContent = 'Not saved: sign in on the home page first. Your text is still here.'; return false; }
    try {
      await api('/assistant/confirm', { method: 'POST', body: JSON.stringify({ confirmed: true, action: { type: 'create_note', content: text.slice(0, 4000) } }) });
      statusEl.textContent = 'Saved to your private workspace.';
      return true;
    } catch (error) { statusEl.textContent = 'Could not save: ' + error.message; return false; }
  }

  // ------------------------------------------------------------ share target --
  function initShare() {
    const params = new URLSearchParams(location.search);
    const share = window.AJSurfaces ? window.AJSurfaces.describeShare(params) : null;
    const state = $('shareState');
    if (!share) {
      state.textContent = 'Nothing shared';
      $('nothing').hidden = false;
      $('nothingText').textContent = 'This page is a share target: another app on your device can send text or a link here, and it will appear on this page. Opening it directly means there is nothing to show.';
      return;
    }
    state.textContent = 'Received just now';
    $('shared').hidden = false;
    $('shareText').textContent = share.text || 'No text was shared.';
    $('shareUrl').textContent = share.url || 'No link was shared.';
    const draft = [share.title, share.text, share.url].filter(Boolean).join('\n\n');
    $('captureText').value = draft.slice(0, 4000);

    $('captureForm').addEventListener('submit', async event => {
      event.preventDefault();
      const text = $('captureText').value.trim();
      if (!text) { $('shareStatus').textContent = 'Write something first.'; return; }
      $('saveShareBtn').disabled = true;
      await saveNote(text, $('shareStatus'));
      $('saveShareBtn').disabled = false;
    });
    $('askAiBtn').onclick = () => {
      const text = $('captureText').value.trim();
      if (!text) { $('shareStatus').textContent = 'Nothing to ask about yet.'; return; }
      try { sessionStorage.setItem('aj-share-prompt-v1', text.slice(0, 4000)); } catch { /* private mode */ }
      location.href = 'jalalai.html#shared';
    };
    $('copyShareBtn').onclick = async () => {
      try { await navigator.clipboard.writeText($('captureText').value); $('shareStatus').textContent = 'Copied.'; }
      catch { $('shareStatus').textContent = 'The browser blocked clipboard access. Select the text and copy it manually.'; }
    };
  }

  // -------------------------------------------------------------- protocol ----
  function initProtocol() {
    const raw = new URLSearchParams(location.search).get('url');
    const parsed = window.AJSurfaces ? window.AJSurfaces.readProtocolUrl() : null;
    const state = $('protocolState');
    const status = $('protocolStatus');
    if (!raw || !parsed) {
      state.textContent = 'No link in the address';
      $('rawUrl').textContent = 'This page is the handler for the web+ajalal:// scheme. It was opened directly, so there is no incoming link to show.';
      $('askBtn').disabled = $('noteBtn').disabled = $('copyBtn').disabled = true;
      return;
    }
    $('rawUrl').textContent = parsed.raw;
    const facts = $('facts');
    const rows = [
      ['Scheme', parsed.valid ? parsed.scheme : 'unreadable'],
      ['Host', parsed.valid ? (parsed.host || 'none') : 'unreadable'],
      ['Format', parsed.valid ? 'Parsed as a URL' : 'Not a valid URL'],
    ];
    for (const [label, value] of rows) {
      const box = document.createElement('div');
      box.className = 'fact';
      const b = document.createElement('b');
      b.textContent = label;
      box.append(b, document.createTextNode(value));
      facts.appendChild(box);
    }
    if (!parsed.valid) {
      state.textContent = 'Link could not be read';
      $('warning').hidden = false;
      $('warningText').textContent = 'This link is not a URL the browser can parse. Do not treat it as safe to open; it was simply passed to the app as text.';
    } else {
      state.textContent = 'Link received';
      if (parsed.scheme !== 'web+ajalal') {
        $('warning').hidden = false;
        $('warningText').textContent = `This handler expects the web+ajalal scheme but received ${parsed.scheme}. The link is shown as-is; the app will not act on it.`;
      }
    }

    const subject = parsed.valid ? parsed.href : parsed.raw;
    $('askBtn').onclick = () => {
      try { sessionStorage.setItem('aj-share-prompt-v1', `Review this link and tell me how to check whether it is safe: ${subject}`.slice(0, 4000)); } catch { /* private mode */ }
      location.href = 'jalalai.html#shared';
    };
    $('noteBtn').onclick = async () => {
      $('noteBtn').disabled = true;
      await saveNote(`Link received via web+ajalal:\n${subject}`, status);
      $('noteBtn').disabled = false;
    };
    $('copyBtn').onclick = async () => {
      try { await navigator.clipboard.writeText(subject); status.textContent = 'Copied.'; }
      catch { status.textContent = 'The browser blocked clipboard access. Select the link and copy it manually.'; }
    };
  }

  function start() {
    if (document.getElementById('captureForm')) initShare();
    if (document.getElementById('protocolPanel')) initProtocol();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
