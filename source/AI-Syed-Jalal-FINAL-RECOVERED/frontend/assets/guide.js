'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const state = (id, text, kind = '') => { const node = $(id); node.textContent = text; node.className = 'guide-state ' + kind; };
  async function json(path, options = {}) { const response = await fetch('/api' + path, { ...options, credentials: 'same-origin', signal: AbortSignal.timeout(10000) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`); return data; }
  async function load() {
    try {
      const [health, ready, session] = await Promise.all([json('/health'), json('/ready'), json('/me')]);
      $('guideStatus').textContent = health.localPreview ? 'Local preview · ready' : 'Application online';
      state('appState', ready.ready ? 'Ready · database connected' : 'Setup required', ready.ready ? 'ok' : 'warn');
      const cloud = Boolean(health.assistant?.cloudConfigured);
      state('cloudState', cloud ? 'Key configured · live test required' : 'Not configured · local tools work', cloud ? 'warn' : 'ok');
      $('startMessage').textContent = health.localPreview ? 'Choose “Start preview for me”, or open JalalAi and sign in. No AI key is needed for the built-in tools.' : 'Open JalalAi and sign in with your account. Local tools work without an AI key.';
      $('sandboxNote').textContent = health.localPreview ? 'Disposable shared sandbox: use test data only. Workspace records are shared; tasks and notes are account-scoped.' : 'Production access uses your configured server database and account permissions.';
      $('guidePreviewBtn').hidden = !health.localPreview;
      const recognition = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
      const synthesis = Boolean(window.speechSynthesis);
      state('voiceState', recognition && synthesis ? 'Input + output supported' : recognition ? 'Input supported · output unavailable' : synthesis ? 'Typing + read-aloud available' : 'Typing available', recognition || synthesis ? 'ok' : 'warn');
      state('sessionState', session.authenticated ? 'Signed in · ' + session.user.role : 'Not signed in', session.authenticated ? 'ok' : 'warn');
      $('sessionHelp').textContent = session.authenticated ? 'You can open JalalAi or the Workspace now.' : 'Use the preview button or sign in from the homepage.';
    } catch (error) {
      $('guideStatus').textContent = 'Connection unavailable';
      state('appState', 'Server not reachable', 'warn');
      $('startMessage').textContent = 'The application server is not reachable. Start it with npm run dev, then reload this page.';
      state('cloudState', 'Unknown'); state('voiceState', 'Unknown'); state('sessionState', 'Unknown');
    }
  }
  $('guidePreviewBtn').onclick = async () => {
    const button = $('guidePreviewBtn'); button.disabled = true; button.textContent = 'Preparing…';
    try { const session = await json('/me'); await json('/demo', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(session.csrfToken ? { 'X-CSRF-Token': session.csrfToken } : {}) }, body: '{}' }); location.href = 'jalalai.html'; }
    catch (error) { $('startMessage').textContent = error.message; button.disabled = false; button.textContent = 'Try again'; }
  };
  load();
})();
