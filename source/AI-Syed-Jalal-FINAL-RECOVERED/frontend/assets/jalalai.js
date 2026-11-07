'use strict';
(() => {
  const $ = id => document.getElementById(id);
  let user = null, csrf = '', busy = false, recognition = null, listening = false, speech = null, lastReply = '', state = { tasks: [], notes: [] }, requestController = null;
  const setStatus = text => { $('status').textContent = text; };
  async function api(path, options = {}) {
    const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(csrf && options.method && options.method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}), ...options.headers };
    const response = await fetch('/api' + path, { ...options, headers, credentials: 'same-origin', signal: options.signal || AbortSignal.timeout(65000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.error || `Request failed (${response.status})`); error.status = response.status; throw error; }
    return data;
  }
  function updateControls() {
    $('sendBtn').disabled = !user || busy || !$('prompt').value.trim();
    $('micBtn').disabled = !user || busy;
    $('readBtn').disabled = !lastReply;
    $('stopBtn').disabled = !busy && !listening && !window.speechSynthesis?.speaking;
    $('accountBtn').textContent = user ? 'Sign out' : 'Sign in';
  }
  function stopVoice() {
    if (recognition) { recognition.onend = null; try { recognition.abort(); } catch {} recognition = null; }
    listening = false; $('micBtn').textContent = '🎙 Speak'; $('micBtn').setAttribute('aria-pressed', 'false');
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    updateControls();
  }
  function speak(text) {
    if (!('speechSynthesis' in window)) { setStatus('Speech output is not supported by this browser. The reply remains available as text.'); return; }
    window.speechSynthesis.cancel();
    speech = new SpeechSynthesisUtterance(text.slice(0, 5000)); speech.lang = $('speechLanguage').value || 'en-US';
    if (window.AJSpeech) window.AJSpeech.apply(speech, { lang: speech.lang });
    else {
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find(v => v.lang.replace('_', '-').toLowerCase() === speech.lang.toLowerCase()) || voices.find(v => v.lang.startsWith(speech.lang.split('-')[0]));
      if (voice) speech.voice = voice;
    }
    speech.onend = speech.onerror = () => { speech = null; updateControls(); };
    window.speechSynthesis.speak(speech); updateControls();
  }
  function addMessage(text, role = 'assistant', meta = 'JalalAi · local tools', result = null) {
    const node = document.createElement('div'); node.className = 'message ' + role;
    const label = document.createElement('div'); label.className = 'meta'; label.textContent = meta; node.appendChild(label);
    const content = document.createElement('span'); content.textContent = text; node.appendChild(content);
    if (role === 'assistant') {
      const actions = document.createElement('div'); actions.className = 'message-actions';
      const read = document.createElement('button'); read.type = 'button'; read.className = 'btn small'; read.textContent = 'Read aloud'; read.onclick = () => speak(text); actions.appendChild(read); if (window.AJReport) actions.appendChild(window.AJReport.button(text, 'jalalai')); node.appendChild(actions);
      lastReply = text;
    }
    if (result?.action) {
      const box = document.createElement('div'); box.className = 'confirmation';
      const prompt = document.createElement('p'); prompt.textContent = result.action.type === 'create_task' ? `Save task: ${result.action.title}` : `Save private note: ${result.action.content}`;
      const confirm = document.createElement('button'); confirm.className = 'btn small primary'; confirm.type = 'button'; confirm.textContent = 'Confirm & save';
      const cancel = document.createElement('button'); cancel.className = 'btn small'; cancel.type = 'button'; cancel.textContent = 'Cancel'; cancel.style.marginLeft = '8px';
      confirm.onclick = async () => {
        confirm.disabled = cancel.disabled = true;
        try { const data = await api('/assistant/confirm', { method: 'POST', body: JSON.stringify({ confirmed: true, action: result.action }) }); box.replaceChildren(document.createTextNode(data.output)); await refreshState(); }
        catch (error) { setStatus(error.message); confirm.disabled = cancel.disabled = false; }
      };
      cancel.onclick = () => { box.replaceChildren(document.createTextNode('Cancelled. Nothing was saved.')); };
      box.append(prompt, confirm, cancel); node.appendChild(box);
    }
    $('chatlog').appendChild(node); $('chatlog').scrollTop = $('chatlog').scrollHeight; updateControls();
    return node;
  }
  async function refreshState() {
    state = await api('/assistant/state');
    for (const [id, items, kind] of [['tasks', state.tasks, 'task'], ['notes', state.notes, 'note']]) {
      const list = $(id); list.replaceChildren();
      if (!items.length) { const empty = document.createElement('li'); empty.className = 'empty'; empty.textContent = `No ${id} yet.`; list.appendChild(empty); }
      for (const item of items) {
        const li = document.createElement('li'); li.className = item.status === 'done' ? 'done' : '';
        if (kind === 'task') { const check = document.createElement('input'); check.type = 'checkbox'; check.checked = item.status === 'done'; check.setAttribute('aria-label', `Complete ${item.title}`); check.onchange = async () => { check.disabled = true; try { await api('/assistant/tasks/' + item.id, { method: 'PATCH', body: JSON.stringify({ status: check.checked ? 'done' : 'open' }) }); await refreshState(); } catch (error) { setStatus(error.message); check.checked = !check.checked; check.disabled = false; } }; li.appendChild(check); }
        const text = document.createElement('span'); text.textContent = item.title || item.content; li.appendChild(text);
        const del = document.createElement('button'); del.type = 'button'; del.className = 'btn small danger'; del.textContent = 'Delete'; del.setAttribute('aria-label', `Delete ${kind}: ${item.title || item.content}`); del.onclick = async () => { if (!window.confirm(`Delete this ${kind}? This cannot be undone.`)) return; del.disabled = true; try { await api(`/assistant/${kind}s/${item.id}`, { method: 'DELETE' }); await refreshState(); } catch (error) { setStatus(error.message); del.disabled = false; } }; li.appendChild(del); list.appendChild(li);
      }
    }
    $('taskCount').textContent = state.tasks.filter(t => t.status === 'open').length;
    $('mode').querySelector('option[value="cloud"]').textContent = state.cloudConfigured ? 'Cloud AI (server key configured)' : 'Cloud AI (not configured)';
    $('cloudStatus').textContent = state.cloudConfigured ? 'A server provider key is configured. Cloud responses still require a successful live request.' : 'No cloud AI key is configured. Local tools work now; open-ended AI answers are not available.';
  }
  function agentTrace(result) {
    // Renders the real tool trace: what ran, how long, and what it returned.
    const box = document.createElement('div');
    box.className = 'agent-trace';
    const head = document.createElement('div');
    head.className = 'agent-trace-head';
    head.textContent = `Agent trace · ${result.steps.length} step(s) · ${result.trace?.toolCalls ?? 0} tool call(s) · ${result.trace?.failures ?? 0} failure(s) · ${result.trace?.totalMs ?? 0} ms`;
    box.appendChild(head);
    for (const step of result.steps) {
      const row = document.createElement('div');
      row.className = 'agent-step' + (step.ok ? '' : ' failed');
      const title = document.createElement('strong');
      title.textContent = `${step.ok ? '✓' : '✕'} ${step.title} · ${step.tool} · ${step.ms} ms`;
      const body = document.createElement('p');
      body.textContent = step.observation;
      row.append(title, body);
      box.appendChild(row);
    }
    const note = document.createElement('p');
    note.className = 'hint';
    note.textContent = 'These are the only tools that ran. Writes (tasks, notes) still need your explicit confirmation.';
    box.appendChild(note);
    return box;
  }
  async function loadAgentTools() {
    try {
      const data = await api('/assistant/agent/tools');
      $('agentTools').textContent = 'Tools available: ' + data.tools.map(tool => tool.label).join(', ') + '. Every call is shown with its result.';
    } catch { $('agentTools').textContent = 'Tool list unavailable right now.'; }
  }
  async function runTool(result) {
    if (result.tool === 'list_tasks') addMessage(state.tasks.length ? state.tasks.map(t => `${t.status === 'done' ? '✓' : '○'} ${t.title}`).join('\n') : 'No tasks yet. Try “add task: Review the proposal”.', 'assistant', 'JalalAi · your saved tasks');
    if (result.tool === 'list_notes') addMessage(state.notes.length ? state.notes.map(n => '• ' + n.content).join('\n') : 'No notes yet. Try “save note: Your note”.', 'assistant', 'JalalAi · your private notes');
    if (result.tool === 'search_records') {
      const response = await api('/records?limit=200&q=' + encodeURIComponent(result.query));
      const matches = response.records || [];
      addMessage(matches.length ? matches.map(row => `• ${row.name || row.id}: ${row.notes || row.status || 'Record'}`).join('\n') : `No workspace records match “${result.query}”.`, 'assistant', 'JalalAi · workspace search');
    }
  }
  async function send(text) {
    text = String(text || $('prompt').value).trim();
    if (!user) { setStatus('Please sign in first.'); return; }
    if (busy || !text) return;
    stopVoice(); busy = true; $('prompt').value = ''; addMessage(text, 'user', 'You'); updateControls(); setStatus('Working… Stop cancels waiting for the reply.');
    requestController = new AbortController();
    try {
      const result = await api('/assistant/chat', { method: 'POST', signal: requestController.signal, body: JSON.stringify({ message: text, profile: $('profile').value, mode: $('mode').value, provider: $('provider').value }) });
      const label = result.mode === 'agent' ? 'JalalAi · agent runtime (real tool trace)'
        : result.mode === 'cloud' ? `JalalAi · cloud ${result.provider}`
        : result.mode === 'local-fallback' ? 'JalalAi · local fallback (cloud unavailable)'
        : 'JalalAi · local tools / guidance';
      if (result.cloudError) setStatus(result.cloudError);
      else if (result.mode === 'agent') setStatus(result.trace?.failures ? `Agent finished with ${result.trace.failures} failed step(s) — see the trace.` : `Agent finished · ${result.trace?.toolCalls ?? 0} tool call(s) in ${result.trace?.totalMs ?? 0} ms.`);
      else setStatus(result.mode === 'cloud' ? 'Cloud reply received.' : 'Local tools completed the request.');
      const node = addMessage(result.output, 'assistant', label, result);
      if (result.mode === 'agent' && Array.isArray(result.steps)) node.appendChild(agentTrace(result));
      await runTool(result); await refreshState();
      if ($('voiceReply').checked) speak(result.output);
    } catch (error) {
      const cancelled = error.name === 'AbortError';
      setStatus(cancelled ? 'Request cancelled. Check your tasks before retrying a saved action.' : error.message);
      if (!cancelled) addMessage(error.message, 'assistant error', 'Request could not complete');
    } finally { busy = false; requestController = null; updateControls(); }
  }
  async function signIn() {
    const session = await api('/me'); csrf = session.csrfToken;
    if (!session.authenticated) {
      user = null; $('loginBanner').hidden = false; $('quickStart').hidden = false; $('sendBtn').disabled = true;
      const health = await api('/health'); $('demoBtn').hidden = !health.localPreview;
      $('loginMessage').textContent = health.localPreview ? 'Disposable preview: use test data only. Tasks and notes are account-scoped; workspace records are shared in this sandbox.' : 'Sign in with your account to use JalalAi and your private workspace.';
      $('connectionStatus').textContent = health.localPreview ? 'Local preview · not production' : 'Secure account required';
      setStatus(health.localPreview ? 'Choose “Try the local preview” to get started.' : 'Sign in to begin.'); updateControls(); return;
    }
    user = session.user; $('loginBanner').hidden = true; $('quickStart').hidden = true; await refreshState(); $('connectionStatus').textContent = 'Connected · ' + user.username; setStatus('Ready. Your microphone is off.'); updateControls();
  }
  // Hand-off from the share target and the protocol handler: the text the other
  // app sent is placed in the composer so the person reviews it before sending.
  // It is never sent automatically.
  function adoptHandoff() {
    let text = '';
    try { text = sessionStorage.getItem('aj-share-prompt-v1') || ''; sessionStorage.removeItem('aj-share-prompt-v1'); } catch { return; }
    if (!text) return;
    $('prompt').value = text.slice(0, 10000);
    updateControls();
    addMessage('Received from another app. It is in the composer so you can review or edit it before sending — nothing has been sent yet.', 'assistant', 'JalalAi · shared content');
    setStatus('Shared content is in your composer. Press Send when you are ready.');
  }
  $('chatForm').onsubmit = event => { event.preventDefault(); send(); };
  $('prompt').addEventListener('input', updateControls);
  $('prompt').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(); } });
  document.querySelectorAll('[data-prompt]').forEach(button => button.onclick = () => send(button.dataset.prompt));
  $('mode').onchange = () => {
    const mode = $('mode').value;
    $('providerField').hidden = mode !== 'cloud';
    $('agentField').hidden = !['agent', 'research'].includes(mode);
    if (['agent', 'research'].includes(mode)) loadAgentTools();
    $('modeLabel').textContent = mode === 'cloud' ? 'Cloud AI · sends your message to the selected provider'
      : mode === 'agent' ? 'Agent runtime · bounded tool calls with a visible trace'
      : mode === 'research' ? 'Research · live Wikipedia search with cited links'
      : 'Local tools · no AI key required';
  };
  $('micBtn').onclick = () => {
    if (listening) { stopVoice(); setStatus('Microphone stopped.'); return; }
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) { setStatus('Voice input is not supported in this browser. Type your message, or try a browser with Web Speech support.'); return; }
    stopVoice(); recognition = new Speech(); recognition.lang = $('speechLanguage').value || 'en-US'; recognition.interimResults = true; recognition.continuous = false;
    recognition.onstart = () => { listening = true; $('micBtn').textContent = '■ Stop mic'; $('micBtn').setAttribute('aria-pressed', 'true'); setStatus('Listening… press Stop mic to cancel. Your browser may use its speech service.'); updateControls(); };
    recognition.onresult = event => { const result = Array.from(event.results).map(r => r[0].transcript).join(' '); $('prompt').value = result; updateControls(); if (event.results[event.results.length - 1].isFinal) { stopVoice(); setStatus('Transcript ready. Review it, then press Send.'); } };
    recognition.onerror = event => { stopVoice(); setStatus(event.error === 'not-allowed' ? 'Microphone permission was denied. Allow it in browser settings or keep typing.' : `Voice input failed (${event.error}). You can still type.`); };
    recognition.onend = () => { listening = false; $('micBtn').textContent = '🎙 Speak'; $('micBtn').setAttribute('aria-pressed', 'false'); updateControls(); };
    try { recognition.start(); } catch { stopVoice(); setStatus('The microphone could not start. Try again or type your message.'); }
  };
  $('readBtn').onclick = () => speak(lastReply);
  $('stopBtn').onclick = () => { stopVoice(); if (requestController) requestController.abort(); setStatus('Stopped.'); };
  $('clearChat').onclick = () => { if (busy || !window.confirm('Clear this chat? Saved tasks and notes are kept.')) return; stopVoice(); lastReply = ''; $('chatlog').replaceChildren(); addMessage('Chat cleared. Your saved tasks and notes are unchanged.', 'assistant', 'JalalAi · session reset'); };
  $('demoBtn').onclick = async () => { $('demoBtn').disabled = true; try { await api('/demo', { method: 'POST' }); await signIn(); } catch (error) { setStatus(error.message); } finally { $('demoBtn').disabled = false; } };
  $('accountBtn').onclick = async () => { if (!user) { location.href = 'index.html?next=jalalai.html'; return; } if (!window.confirm('Sign out of this device?')) return; try { await api('/auth/logout', { method: 'POST', body: '{}' }); user = null; csrf = ''; lastReply = ''; state = { tasks: [], notes: [] }; $('chatlog').replaceChildren(); for (const id of ['tasks', 'notes']) $(id).replaceChildren(); stopVoice(); await signIn(); } catch (error) { setStatus(error.message); } };
  $('exportBtn').onclick = () => { const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), tasks: state.tasks, notes: state.notes }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = 'jalalai-private-export.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  function loadVoices() {
    if (!('speechSynthesis' in window)) return;
    // One shared catalogue + remembered choice across JalalAi, Workspace and Agent Studio.
    if (window.AJSpeech) { window.AJSpeech.populate($('voice')); window.AJSpeech.refresh(); return; }
    const voices = window.speechSynthesis.getVoices();
    $('voice').replaceChildren(new Option('System default', ''));
    for (const voice of voices) $('voice').add(new Option(`${voice.name} (${voice.lang})`, `${voice.name}|${voice.lang}`));
  }
  if ('speechSynthesis' in window) { loadVoices(); window.speechSynthesis.addEventListener('voiceschanged', loadVoices); }
  window.addEventListener('pagehide', () => { stopVoice(); requestController?.abort(); });
  if (window.AJ_STATIC_HOST) {
    $('loginBanner').hidden = false; $('quickStart').hidden = false; $('demoBtn').hidden = true; $('demoBtn').disabled = true; $('demoBtn').style.display = 'none'; $('sendBtn').disabled = true;
    $('loginMessage').textContent = 'Static website preview: JalalAi needs the secure application server for sign-in, tasks, notes and AI. Open the secure app, or run npm run dev locally. See Setup options in the banner.';
    $('connectionStatus').textContent = 'Static preview · backend not connected'; setStatus('Open the secure app or local preview to begin.'); updateControls();
  } else signIn().then(adoptHandoff).catch(error => { $('connectionStatus').textContent = 'Connection unavailable'; setStatus(error.message); $('loginBanner').hidden = false; $('loginMessage').textContent = 'The server could not be reached. Reload after the application server is running.'; });
})();
