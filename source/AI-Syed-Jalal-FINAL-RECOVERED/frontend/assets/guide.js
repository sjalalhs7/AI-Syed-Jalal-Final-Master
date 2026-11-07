'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const state = (id, text, kind = '') => { const node = $(id); node.textContent = text; node.className = 'guide-state ' + kind; };
  async function json(path, options = {}) { const response = await fetch('/api' + path, { ...options, credentials: 'same-origin', signal: AbortSignal.timeout(10000) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`); return data; }

  // A valid 503 from /ready contains useful table-name evidence. A generic 503,
  // malformed response, or session error does not prove that tables are missing.
  async function readiness() {
    const response = await fetch('/api/ready', { credentials: 'same-origin', signal: AbortSignal.timeout(10000) });
    const data = await response.json().catch(() => null);
    if (!data || typeof data.ready !== 'boolean' ||
        !Number.isInteger(data.schemaTables) || !Number.isInteger(data.required) ||
        data.required < 1 || data.schemaTables < 0 || data.schemaTables > data.required ||
        !Array.isArray(data.missing) || data.missing.length !== data.required - data.schemaTables ||
        data.ready !== (data.missing.length === 0) ||
        (!response.ok && !(response.status === 503 && data.ready === false))) {
      throw new Error('Readiness details unavailable');
    }
    return data;
  }

  async function load() {
    if (window.AJ_STATIC_HOST) {
      $('guideStatus').textContent = 'Static website preview';
      state('appState', 'Backend not connected', 'warn');
      state('cloudState', 'Unknown · needs server', 'warn');
      state('sessionState', 'Sign-in unavailable here', 'warn');
      $('startMessage').textContent = 'This is a static website copy. Login, saved data and cloud AI require the secure application server or the local preview.';
      $('sandboxNote').textContent = 'Run npm ci && npm run dev in the application folder, then open /guide.html locally. For production, deploy the frontend with Cloudflare Pages Functions and configure Neon.';
      $('guidePreviewBtn').hidden = true;
      const recognition = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
      const synthesis = Boolean(window.speechSynthesis);
      state('voiceState', recognition || synthesis ? 'Browser speech APIs detected' : 'Typing available', recognition || synthesis ? 'ok' : 'warn');
      $('sessionHelp').textContent = 'Open the secure app server or local preview to sign in.';
      return;
    }

    const [healthResult, readyResult, sessionResult] = await Promise.allSettled([json('/health'), readiness(), json('/me')]);
    const health = healthResult.status === 'fulfilled' && healthResult.value.ok === true ? healthResult.value : null;
    const ready = readyResult.status === 'fulfilled' ? readyResult.value : null;
    const session = sessionResult.status === 'fulfilled' && typeof sessionResult.value.authenticated === 'boolean' ? sessionResult.value : null;
    const recognition = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
    const synthesis = Boolean(window.speechSynthesis);
    state('voiceState', recognition && synthesis ? 'Input + output APIs detected' : recognition ? 'Input API detected · output unavailable' : synthesis ? 'Typing + read-aloud API detected' : 'Typing available', recognition || synthesis ? 'ok' : 'warn');
    $('guidePreviewBtn').hidden = !(health?.localPreview && ready?.ready);

    if (!health) {
      $('guideStatus').textContent = 'Application health unavailable';
      state('appState', 'Server status unavailable', 'warn');
      state('cloudState', 'Unknown', 'warn');
      $('startMessage').textContent = 'Could not verify application health. Check the connection and try again; this does not identify the cause.';
      $('sandboxNote').textContent = 'The server could not confirm whether this is a preview or production connection.';
    } else {
      $('sandboxNote').textContent = health.localPreview ? 'Disposable shared sandbox: use test data only. Workspace records are shared; tasks and notes are account-scoped.' : 'Production access uses your configured server database and account permissions.';
      const configured = health.assistant?.cloudConfigured;
      state('cloudState', configured === true ? 'Key configured · live test required' : configured === false ? 'Not configured · local tools work' : 'Unknown', configured === false ? 'ok' : 'warn');
      if (!ready) {
        $('guideStatus').textContent = 'Application online · readiness unknown';
        state('appState', 'Readiness unavailable', 'warn');
        $('startMessage').textContent = 'Database readiness could not be checked. Before any schema repair, verify a restorable full database backup and rehearse on an isolated target.';
      } else if (!ready.ready) {
        $('guideStatus').textContent = 'Application online · setup incomplete';
        state('appState', `${ready.schemaTables}/${ready.required} required table names · incomplete`, 'warn');
        $('startMessage').textContent = `${ready.schemaTables} of ${ready.required} required table names are present. Some features may be unavailable. Before repair, verify a restorable full database backup and rehearse on an isolated target.`;
      } else {
        $('guideStatus').textContent = health.localPreview ? 'Local preview · ready' : 'Application online';
        state('appState', `${ready.schemaTables}/${ready.required} required table names · features unverified`, 'ok');
        $('startMessage').textContent = health.localPreview ? 'Choose “Start preview for me”, or open JalalAi and sign in. No AI key is needed for the built-in tools.' : 'Open Agent Studio and sign in with your account. Local tools work without an AI key.';
      }
    }

    if (!session) {
      state('sessionState', 'Session status unavailable', 'warn');
      $('sessionHelp').textContent = 'Could not check the current session. Try again before assuming sign-in works or is blocked.';
    } else if (session.authenticated) {
      state('sessionState', 'Signed in · ' + (session.user?.role || 'account'), 'ok');
      $('sessionHelp').textContent = 'You can open Agent Studio, JalalAi or the Workspace now.';
    } else if (ready?.signInAffected === true) {
      state('sessionState', 'Sign-in may be affected', 'warn');
      $('sessionHelp').textContent = 'Required sign-in table names are missing. Ask an Admin to investigate safely.';
    } else {
      state('sessionState', 'Not signed in', 'warn');
      $('sessionHelp').textContent = health?.localPreview && ready?.ready ? 'Use the preview button or sign in from the homepage.' : 'Sign in from the homepage.';
    }
  }
  $('guidePreviewBtn').onclick = async () => {
    const button = $('guidePreviewBtn'); button.disabled = true; button.textContent = 'Preparing…';
    try { const session = await json('/me'); await json('/demo', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(session.csrfToken ? { 'X-CSRF-Token': session.csrfToken } : {}) }, body: '{}' }); location.href = 'agent.html'; }
    catch (error) { $('startMessage').textContent = error.message; button.disabled = false; button.textContent = 'Try again'; }
  };
  load();
})();
