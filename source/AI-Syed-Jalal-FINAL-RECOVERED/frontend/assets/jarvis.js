'use strict';
/*
 * JARVIS voice console.
 *
 * This page adds no new powers. It is a voice front end for the same bounded
 * agent runtime JalalAi uses: the transcript becomes an ordinary chat message,
 * the server runs the same four published tools, and the reply is read back by
 * the browser's speech engine.
 *
 * Deliberate design rules:
 * * The microphone is opened only on an explicit press and closed on the final
 *   transcript, an error, or Stop. There is no always-on listening.
 * * The reply is spoken only after it arrives, so the console never narrates a
 *   request that failed.
 * * If the browser has no speech engine, the console says so and stays usable by
 *   typing — it never silently pretends to listen or speak.
 */
(() => {
  const $ = id => document.getElementById(id);
  let user = null, csrf = '', busy = false, recognition = null, listening = false, speaking = false;
  let lastReply = '', startedAt = 0, state = { tasks: [], notes: [] }, controller = null;

  const setStatus = text => { $('status').textContent = text; };
  const setCore = (coreState, waveState = coreState) => {
    $('core').dataset.state = coreState;
    $('wave').dataset.state = waveState;
  };

  async function api(path, options = {}) {
    const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(csrf && options.method && options.method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}), ...options.headers };
    const response = await fetch('/api' + path, { ...options, headers, credentials: 'same-origin', signal: options.signal || AbortSignal.timeout(65000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.error || `Request failed (${response.status})`); error.status = response.status; throw error; }
    return data;
  }

  function updateControls() {
    const hasText = Boolean($('prompt').value.trim());
    $('sendBtn').disabled = !user || busy || !hasText;
    $('talkBtn').disabled = !user || busy;
    $('speakBtn').disabled = !lastReply || busy;
    $('stopBtn').disabled = !busy && !listening && !speaking;
    $('talkBtn').textContent = listening ? '■ Stop listening' : '🎙 Hold to talk';
    $('talkBtn').setAttribute('aria-pressed', String(listening));
    $('stopBtn').setAttribute('aria-pressed', String(listening || busy || speaking));
  }

  /* ---------------- speech out ---------------- */

  function voiceSupport() {
    const recognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    return {
      speak: Boolean(window.speechSynthesis) && typeof window.SpeechSynthesisUtterance === 'function',
      listen: Boolean(recognitionCtor),
      voices: window.AJSpeech?.supported ? window.AJSpeech.list().length : 0
    };
  }

  function describeSupport() {
    const support = voiceSupport();
    const parts = [];
    parts.push(support.listen ? 'Microphone input: available' : 'Microphone input: not available in this browser — type instead');
    parts.push(support.speak ? `Read-aloud: available${support.voices ? ` (${support.voices} voice(s) detected)` : ' (no named voices exposed yet)'}` : 'Read-aloud: not supported — replies stay as text');
    $('voiceDiagnostics').textContent = parts.join(' · ');
    return support;
  }

  function stopSpeaking() {
    if (window.speechSynthesis?.cancel) window.speechSynthesis.cancel();
    speaking = false; setCore(listening ? 'listening' : 'idle'); updateControls();
  }

  function speak(text) {
    if (!text) return;
    if (!voiceSupport().speak) { setStatus('This browser cannot speak the reply. It stays available as text.'); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(text).slice(0, 4000));
    const lang = $('speechLanguage').value || 'en-US';
    if (window.AJSpeech) window.AJSpeech.apply(utterance, { lang });
    else utterance.lang = lang;
    utterance.onstart = () => { speaking = true; setCore('speaking'); updateControls(); setStatus('Speaking the reply…'); };
    utterance.onend = utterance.onerror = () => {
      speaking = false; setCore(searchMode() ? 'research' : 'idle'); updateControls();
      // The spoken reply ends *after* the run finished. Do not overwrite the
      // outcome line (tool count, failure warning) the user needs to read.
    };
    window.speechSynthesis.speak(utterance);
    updateControls();
  }

  const searchMode = () => ['agent', 'research'].includes($('mode').value);

  /* ---------------- speech in ---------------- */

  function stopListening() {
    // Detach every handler first: some engines emit a final onresult during
    // abort(), which would otherwise start a run the user just cancelled.
    if (recognition) {
      const stopping = recognition;
      recognition = null;
      stopping.onstart = stopping.onresult = stopping.onend = stopping.onerror = null;
      try { stopping.abort(); } catch { /* already stopped */ }
    }
    listening = false; setCore('idle'); updateControls();
  }

  function startListening() {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) { setStatus('Voice input is not supported in this browser (try Chrome or Edge). Type the command instead.'); return; }
    if (!user) { setStatus('Sign in first, then press Hold to talk.'); return; }
    stopSpeaking(); stopListening();
    recognition = new Speech(); recognition.lang = $('speechLanguage').value || 'en-US';
    recognition.interimResults = true; recognition.continuous = false;
    recognition.onstart = () => {
      listening = true; startedAt = Date.now(); setCore('listening');
      setStatus('Listening… press Stop or the talk button to cancel. Your browser may use its own speech service.');
      updateControls();
    };
    recognition.onresult = event => {
      const transcript = Array.from(event.results).map(result => result[0].transcript).join(' ').trim();
      $('prompt').value = transcript; updateControls();
      const final = event.results[event.results.length - 1].isFinal;
      if (final) {
        stopListening();
        const ms = Date.now() - startedAt;
        setStatus(`Heard: “${transcript}” (${ms} ms). Review it, then press Run command.`);
        if ($('autoRun').checked && transcript) runCommand(transcript);
      }
    };
    recognition.onerror = event => {
      stopListening();
      const reasons = {
        'not-allowed': 'Microphone permission was denied. Allow it in your browser settings, or type the command.',
        'no-speech': 'No speech was detected. Press Hold to talk and speak a little closer to the microphone.',
        'audio-capture': 'No microphone was found on this device. Type the command instead.',
        network: 'The browser’s speech service could not be reached. Typing works offline.'
      };
      setStatus(reasons[event.error] || `Voice input failed (${event.error}). You can still type.`);
    };
    recognition.onend = () => { listening = false; setCore('idle'); updateControls(); };
    try { recognition.start(); } catch { stopListening(); setStatus('The microphone could not start. Try again, or type the command.'); }
  }

  /* ---------------- transcript rendering ---------------- */

  function addMessage(text, role = 'assistant', meta = 'JARVIS') {
    const node = document.createElement('div');
    node.className = 'message ' + role;
    const label = document.createElement('div'); label.className = 'meta'; label.textContent = meta; node.appendChild(label);
    const content = document.createElement('span'); content.textContent = text; node.appendChild(content);
    if (role === 'assistant') {
      lastReply = text;
      const actions = document.createElement('div'); actions.className = 'message-actions';
      const repeat = document.createElement('button'); repeat.type = 'button'; repeat.className = 'btn small';
      repeat.textContent = '🔊 Speak again'; repeat.onclick = () => speak(text);
      actions.appendChild(repeat); node.appendChild(actions);
    }
    $('chatlog').appendChild(node);
    $('chatlog').scrollTop = $('chatlog').scrollHeight;
    updateControls();
    return node;
  }

  function renderTrace(result) {
    const box = $('lastTrace');
    if (!result || !Array.isArray(result.steps)) {
      box.className = 'agent-trace-empty';
      box.textContent = result?.output ? 'This run used a single local answer, not a tool — no trace to show.' : 'No run yet.';
      return;
    }
    box.className = 'agent-trace';
    box.replaceChildren();
    const head = document.createElement('div');
    head.className = 'agent-trace-head';
    head.textContent = `${result.steps.length} step(s) · ${result.trace?.toolCalls ?? 0} tool call(s) · ${result.trace?.failures ?? 0} failure(s) · ${result.trace?.totalMs ?? 0} ms`;
    box.appendChild(head);
    for (const step of result.steps) {
      const row = document.createElement('div');
      row.className = 'agent-step' + (step.ok ? '' : ' failed');
      const title = document.createElement('strong');
      title.textContent = `${step.ok ? '✓' : '✕'} ${step.title} · ${step.tool} · ${step.ms} ms`;
      const body = document.createElement('p'); body.textContent = step.observation;
      row.append(title, body); box.appendChild(row);
    }
    $('traceNote').textContent = result.needsProvider
      ? 'This run needed a cloud model for a generated answer; none is configured, so no model output was invented.'
      : 'Tool calls are real. Writes still need your explicit confirmation.';
  }

  /* ---------------- run a command ---------------- */

  async function runCommand(text) {
    text = String(text || $('prompt').value).trim();
    if (!user) { setStatus('Sign in first.'); return; }
    if (busy || !text) return;
    stopListening(); stopSpeaking();
    busy = true; $('prompt').value = ''; setCore('thinking');
    addMessage(text, 'user', 'You (voice or typed)');
    updateControls(); setStatus('Working… Stop cancels waiting for the reply.');
    controller = new AbortController();
    try {
      const result = await api('/assistant/chat', {
        method: 'POST', signal: controller.signal,
        body: JSON.stringify({ message: text, profile: $('profile').value, mode: $('mode').value, provider: 'gemini' })
      });
      const label = result.mode === 'agent' ? `JARVIS · agent runtime (${result.trace?.toolCalls ?? 0} tool call(s))`
        : result.mode === 'cloud' ? `JARVIS · cloud ${result.provider}`
        : result.mode === 'local-fallback' ? 'JARVIS · local fallback (cloud unavailable)'
        : 'JARVIS · local tools';
      if (result.cloudError) setStatus(result.cloudError);
      else if (result.mode === 'agent') setStatus(result.trace?.failures ? `Finished with ${result.trace.failures} failed step(s) — read the trace.` : `Finished · ${result.trace?.toolCalls ?? 0} tool call(s) in ${result.trace?.totalMs ?? 0} ms.`);
      else setStatus('Reply ready.');
      addMessage(result.output, 'assistant', label);
      renderTrace(result);
      if (result.action) addConfirmation(result);
      await refreshState();
      if ($('handsFree').checked) speak(result.output);
    } catch (error) {
      const cancelled = error.name === 'AbortError';
      setStatus(cancelled ? 'Command cancelled.' : error.message);
      if (!cancelled) addMessage(error.message, 'assistant error', 'Command could not complete');
    } finally {
      busy = false; controller = null;
      setCore(listening ? 'listening' : 'idle');
      updateControls();
    }
  }

  function addConfirmation(result) {
    const box = document.createElement('div'); box.className = 'confirmation';
    const line = document.createElement('p');
    line.textContent = result.action.type === 'create_task' ? `Save task: ${result.action.title}` : `Save private note: ${result.action.content}`;
    const confirm = document.createElement('button'); confirm.type = 'button'; confirm.className = 'btn small primary'; confirm.textContent = 'Confirm & save';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'btn small'; cancel.textContent = 'Cancel'; cancel.style.marginLeft = '8px';
    confirm.onclick = async () => {
      confirm.disabled = cancel.disabled = true;
      try {
        const data = await api('/assistant/confirm', { method: 'POST', body: JSON.stringify({ confirmed: true, action: result.action }) });
        box.replaceChildren(document.createTextNode(data.output));
        await refreshState(); speak(data.output);
      } catch (error) { setStatus(error.message); confirm.disabled = cancel.disabled = false; }
    };
    cancel.onclick = () => { box.replaceChildren(document.createTextNode('Cancelled. Nothing was saved.')); };
    box.append(line, confirm, cancel);
    $('chatlog').appendChild(box);
  }

  async function refreshState() {
    state = await api('/assistant/state');
    const cloud = $('mode').querySelector('option[value="cloud"]');
    if (cloud) cloud.textContent = state.cloudConfigured ? 'Cloud AI (server key configured)' : 'Cloud AI (not configured)';
  }

  /* ---------------- session ---------------- */

  async function signIn() {
    const session = await api('/me'); csrf = session.csrfToken;
    if (!session.authenticated) {
      user = null; $('loginBanner').hidden = false;
      const health = await api('/health');
      $('demoBtn').hidden = !health.localPreview;
      $('loginMessage').textContent = health.localPreview
        ? 'Disposable preview: use test data only. Tasks and notes are account-scoped.'
        : 'Sign in with your account to use the voice console.';
      $('connectionStatus').textContent = health.localPreview ? 'Local preview · not production' : 'Secure account required';
      setStatus(health.localPreview ? 'Choose “Try the local preview” to start.' : 'Sign in to begin.');
      $('sendBtn').disabled = true; $('talkBtn').disabled = true; $('speakBtn').disabled = true; $('stopBtn').disabled = true;
      return;
    }
    user = session.user;
    $('loginBanner').hidden = true;
    await refreshState();
    $('connectionStatus').textContent = 'Connected · ' + user.username;
    setStatus('Ready. Your microphone is off.');
    updateControls();
  }

  /* ---------------- wiring ---------------- */

  $('consoleForm').onsubmit = event => { event.preventDefault(); runCommand(); };
  $('prompt').addEventListener('input', updateControls);
  $('prompt').addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); runCommand(); }
  });
  document.querySelectorAll('[data-prompt]').forEach(button => button.onclick = () => { $('prompt').value = button.dataset.prompt; updateControls(); runCommand(button.dataset.prompt); });
  $('talkBtn').onclick = () => { if (listening) { stopListening(); setStatus('Microphone stopped. Nothing is listening.'); } else startListening(); };
  $('speakBtn').onclick = () => speak(lastReply);
  $('stopBtn').onclick = () => {
    const wasRunning = Boolean(controller);
    stopListening(); stopSpeaking();
    if (controller) controller.abort();
    setStatus(wasRunning ? 'Stopped. The command was cancelled; nothing is listening.' : 'Stopped. Microphone off; nothing is listening.');
  };
  $('mode').onchange = () => {
    const mode = $('mode').value;
    $('voiceMode').textContent = mode === 'agent' ? 'Agent runtime · 4 published tools'
      : mode === 'research' ? 'Research · live Wikipedia with cited links'
      : mode === 'cloud' ? 'Cloud AI · sends your message to the selected provider'
      : 'Local tools · no AI key required';
    setCore(searchMode() ? 'research' : 'idle');
  };
  $('demoBtn').onclick = async () => {
    $('demoBtn').disabled = true;
    try { await api('/demo', { method: 'POST' }); await signIn(); }
    catch (error) { setStatus(error.message); }
    finally { $('demoBtn').disabled = false; }
  };

  // The shared preference module fills the voice list; re-read support once it has.
  if (window.AJSpeech) { window.AJSpeech.populate($('voice')); window.AJSpeech.refresh(); }
  describeSupport();
  if (window.speechSynthesis) window.speechSynthesis.addEventListener?.('voiceschanged', describeSupport);
  window.addEventListener('pagehide', () => { stopListening(); stopSpeaking(); controller?.abort(); });

  if (window.AJ_STATIC_HOST) {
    $('loginBanner').hidden = false; $('demoBtn').hidden = true;
    $('loginMessage').textContent = 'Static website preview: the voice console needs the secure application server for sign-in and tools. Open the secure app, or run npm run dev locally.';
    $('connectionStatus').textContent = 'Static preview · backend not connected';
    setStatus('Open the secure app or local preview to talk to JARVIS.');
    $('sendBtn').disabled = true; $('talkBtn').disabled = true; $('speakBtn').disabled = true; $('stopBtn').disabled = true;
    describeSupport();
  } else {
    signIn().catch(error => {
      $('connectionStatus').textContent = 'Connection unavailable';
      setStatus(error.message);
      $('loginBanner').hidden = false;
      $('loginMessage').textContent = 'The server could not be reached. Reload once the application server is running.';
    });
  }
})();
