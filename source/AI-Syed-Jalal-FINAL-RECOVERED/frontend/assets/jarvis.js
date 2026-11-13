'use strict';
/* JARVIS is a voice and text interface to the authenticated assistant. The
 * browser owns speech; only transcripts are sent to the application. There is
 * no wake word, OS control, hidden listening, or unconfirmed save. */
(() => {
  const $ = id => document.getElementById(id);
  const PROVIDER_NAMES = Object.freeze({ gemini: 'Google Gemini', openai: 'OpenAI', anthropic: 'Anthropic Claude', deepseek: 'DeepSeek', omniroute: 'OmniRoute' });
  // Exact, fixed app destinations only: never turn dictated text into a URL.
  const DESTINATIONS = Object.freeze({
    'home': 'index.html', 'homepage': 'index.html', 'guide': 'guide.html', 'start here': 'guide.html',
    'notes': 'notes.html', 'quick notes': 'notes.html', 'workspace': 'workspace.html',
    'assistant': 'jalalai.html', 'jalalai': 'jalalai.html', 'jalal ai': 'jalalai.html',
    'agent studio': 'agent.html', 'agent lab': 'agent-lab.html', 'dashboard': 'dashboard.html',
    'toolbench': 'toolbench.html', 'page builder': 'pagebuilder.html', 'arena': 'arena.html',
    'capabilities': 'capabilities.html', 'all in one': 'allinone.html', 'critic': 'critic.html',
    'roadmaps': 'roadmaps.html'
  });
  let user = null, csrf = '', busy = false, controller = null, runningPrompt = '';
  let recognition = null, starting = false, listening = false, startedAt = 0, recognitionTimer = null;
  let utterance = null, speaking = false, speechTimer = null;
  let conversationActive = false, resumeTimer = null, silenceRetries = 0, lastReply = '', cloudTurns = [], contextVersion = 0;
  let state = { tools: [], cloudProviders: {} }, providerTouched = false, modeTouched = false;

  const setStatus = text => { $('status').textContent = text; };

  function cloudStatusUnknown() {
    const value = state.cloudProviders?.[$('provider').value];
    return $('mode').value === 'cloud' && value !== true && value !== false;
  }
  function updateControls() {
    const micPending = starting || listening;
    $('sendBtn').disabled = !user || busy || micPending || cloudStatusUnknown() || !$('prompt').value.trim();
    $('talkBtn').disabled = !user || busy;
    $('conversationBtn').disabled = !user || (busy && !conversationActive);
    $('conversationBtn').textContent = conversationActive ? 'End conversation' : 'Start conversation';
    $('conversationBtn').setAttribute('aria-pressed', String(conversationActive));
    $('speakBtn').disabled = !lastReply || busy || micPending;
    $('stopBtn').disabled = !busy && !micPending && !speaking && !conversationActive && !resumeTimer;
    $('talkBtn').textContent = micPending ? 'Stop listening' : conversationActive && speaking ? 'Interrupt & speak' : 'Dictate once';
    $('talkBtn').setAttribute('aria-pressed', String(micPending));
    $('stopBtn').setAttribute('aria-pressed', String(micPending || busy || speaking || conversationActive));
    $('prompt').readOnly = micPending;
    const visual = listening ? 'listening' : starting ? 'starting' : busy ? 'thinking' : speaking ? 'speaking' : 'idle';
    $('core').dataset.state = visual;
    $('wave').dataset.state = visual;
    $('micIndicator').textContent = listening ? 'Mic on' : starting ? 'Mic starting' : 'Mic off';
    $('micIndicator').dataset.active = String(listening);
  }

  async function api(path, options = {}, timeoutMs = 65000) {
    const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(csrf && options.method && options.method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}), ...options.headers };
    // A caller's Stop signal and the deadline must both work, including in
    // browsers without AbortSignal.timeout/any. Keep the deadline active until
    // the entire response body is read, not merely until headers arrive.
    const request = new AbortController(), caller = options.signal;
    const forwardAbort = () => request.abort();
    if (caller?.aborted) forwardAbort();
    else caller?.addEventListener('abort', forwardAbort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; request.abort(); }, timeoutMs);
    try {
      const response = await fetch('/api' + path, { ...options, headers, credentials: 'same-origin', signal: request.signal });
      const data = await response.json().catch(error => {
        if (request.signal.aborted || error?.name !== 'SyntaxError') throw error;
        if (response.ok) throw new Error('The application response was unreadable. The server may still finish; check before retrying.');
        return {};
      });
      if (request.signal.aborted) throw Object.assign(new Error('Request aborted.'), { name: 'AbortError' });
      if (!response.ok) {
        const error = new Error(data?.error || `Request failed (${response.status})`);
        error.status = response.status; error.code = data?.code; throw error;
      }
      return data;
    } catch (error) {
      if (timedOut) throw Object.assign(new Error('The request timed out. The server may still finish; check before retrying.'), { name: 'TimeoutError' });
      throw error;
    } finally {
      clearTimeout(timer);
      caller?.removeEventListener('abort', forwardAbort);
    }
  }

  function requireAssistantResponse(result) {
    if (result?.ok !== true || typeof result.output !== 'string' || !result.output.trim()) {
      throw new Error('The application response was incomplete. The server may still finish; check history or saved actions before retrying.');
    }
    return result;
  }

  function requireSavedAction(data, action) {
    const isTask = action?.type === 'create_task', isNote = action?.type === 'create_note';
    const saved = isTask ? data?.task : isNote ? data?.note : null;
    const matches = isTask ? saved?.title === action.title : isNote && saved?.content === action.content;
    if (data?.ok !== true || typeof data.output !== 'string' || !data.output.trim() || typeof saved?.id !== 'string' || !saved.id || !matches) {
      throw new Error('The save response could not be verified.');
    }
    return data;
  }

  function voiceSupport() {
    return {
      speak: Boolean(window.speechSynthesis) && typeof window.SpeechSynthesisUtterance === 'function',
      listen: Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
      voices: window.AJSpeech?.supported ? window.AJSpeech.list().length : 0
    };
  }

  function describeSupport() {
    const support = voiceSupport();
    const input = support.listen ? 'Microphone input: available (permission and browser service required)' : 'Microphone input: not available in this browser — type instead';
    const output = support.speak ? `Read-aloud: available${support.voices ? ` (${support.voices} voice(s) detected)` : ' (no named voices exposed yet; system default may work)'}` : 'Read-aloud: not supported — replies stay as text';
    $('voiceDiagnostics').textContent = `${input} · ${output}`;
    return support;
  }

  // The selected tag is only a request to the browser/provider, not a claim
  // that the device has a matching recognizer or voice installed.
  function speechLanguage() {
    const raw = ($('speechLanguage').value === 'custom' ? $('customLanguage').value : $('speechLanguage').value).trim();
    if (!raw || raw.length > 35) return null;
    try { return Intl.getCanonicalLocales(raw)[0] || null; } catch { return null; }
  }

  function describeLanguage() {
    const custom = $('speechLanguage').value === 'custom';
    const lang = speechLanguage();
    $('customLanguageField').hidden = !custom;
    $('customLanguage').setAttribute('aria-invalid', String(custom && !lang));
    $('languageHelp').textContent = lang ? 'Language tag accepted; speech availability still depends on your browser and device.' : 'Enter a valid language tag, for example fr-CA.';
    const preferred = window.AJSpeech?.preferredId();
    const voice = preferred && window.AJSpeech?.list().find(item => window.AJSpeech.voiceId(item) === preferred);
    const hint = $('voiceLanguageHint');
    if (!lang) hint.textContent = 'Enter a valid speech language before starting the microphone or read-aloud.';
    else if (preferred && !voice) hint.textContent = 'Your saved voice is not currently available on this device. It remains saved; another compatible voice or the browser default may be used.';
    else if (voice && voice.lang.toLowerCase().split('-')[0] !== lang.toLowerCase().split('-')[0]) hint.textContent = `Recognition requests ${lang}, but your saved voice speaks ${voice.lang}. Your voice choice is preserved; choose a matching voice or system default for this language.`;
    else hint.textContent = `Recognition requests ${lang}. Voice and recognition availability depend on your device; the language setting does not guarantee translation.`;
  }

  function requireSpeechLanguage() {
    const lang = speechLanguage();
    if (!lang) { describeLanguage(); setStatus('Enter a valid speech language code, for example fr-CA.'); }
    return lang;
  }

  function clearContext() { cloudTurns = []; contextVersion++; }

  function endConversation() {
    conversationActive = false; silenceRetries = 0;
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = null;
    updateControls();
  }

  function stopSpeaking() {
    if (speechTimer) clearTimeout(speechTimer);
    speechTimer = null;
    if (utterance) utterance.onstart = utterance.onend = utterance.onerror = null;
    utterance = null;
    try { window.speechSynthesis?.cancel?.(); } catch { /* already stopped */ }
    speaking = false;
    updateControls();
  }

  function scheduleNextTurn(message = 'Reply complete. Starting the microphone for the next turn; press Stop to end the conversation.') {
    if (!conversationActive || document.hidden || !user) return;
    if (resumeTimer) clearTimeout(resumeTimer);
    setStatus(message);
    resumeTimer = setTimeout(() => {
      resumeTimer = null;
      if (conversationActive && !document.hidden && !busy) startListening();
      else updateControls();
    }, 350);
    updateControls();
  }

  function speak(text, onComplete) {
    window.AJWelcome?.interruptForAssistant();
    if (!text) { onComplete?.(false); return; }
    const lang = requireSpeechLanguage();
    if (!lang) { onComplete?.(false); return; }
    if (!voiceSupport().speak) {
      setStatus('This browser cannot speak the reply. It stays available as text.');
      onComplete?.(false);
      return;
    }
    stopSpeaking();
    const previousStatus = $('status').textContent;
    const full = String(text), clipped = full.length > 4000;
    const next = new window.SpeechSynthesisUtterance(full.slice(0, 4000));
    if (window.AJSpeech) window.AJSpeech.apply(next, { lang });
    else next.lang = lang;
    utterance = next; speaking = true; updateControls();
    setStatus('Preparing to speak the reply…');
    const finish = (ok, errorText = '') => {
      if (utterance !== next) return;
      if (speechTimer) clearTimeout(speechTimer);
      speechTimer = null; utterance = null; speaking = false; updateControls();
      setStatus(ok ? previousStatus + (clipped ? ' Read-aloud was limited to the first 4,000 characters.' : '') : errorText);
      onComplete?.(ok);
    };
    const speechTimedOut = message => {
      if (utterance !== next) return;
      next.onstart = next.onend = next.onerror = null;
      try { window.speechSynthesis.cancel(); } catch { /* already stopped */ }
      finish(false, message);
    };
    next.onstart = () => {
      if (utterance !== next) return;
      if (speechTimer) clearTimeout(speechTimer);
      // Some devices start an utterance but never deliver an end/error event.
      // Allow a generous duration based on length, while leaving Stop usable.
      const limit = Math.min(600000, Math.max(60000, 30000 + next.text.length * 300));
      speechTimer = setTimeout(() => speechTimedOut('Speech did not finish. Playback stopped; the reply is still shown as text.'), limit);
      setStatus(clipped ? 'Speaking the first 4,000 characters of the reply…' : 'Speaking the reply…'); updateControls();
    };
    next.onend = () => finish(true);
    next.onerror = event => finish(false, `The browser could not speak (${event.error || 'speech error'}). Check the selected voice and device volume; the reply is still shown as text.`);
    // A speech API can exist even when no voice ever starts. Do not wait forever.
    speechTimer = setTimeout(() => speechTimedOut('No speech started. Check your device voices and volume; the reply is still shown as text.'), 10000);
    try { window.speechSynthesis.speak(next); }
    catch { finish(false, 'The browser could not start speech. The reply is still shown as text.'); }
  }

  function stopListening() {
    if (recognitionTimer) clearTimeout(recognitionTimer);
    recognitionTimer = null;
    if (recognition) {
      const stopping = recognition; recognition = null;
      // Some engines dispatch a final result while aborting. Detach first so a
      // cancelled voice command can never start a request.
      stopping.onstart = stopping.onresult = stopping.onend = stopping.onerror = null;
      try { stopping.abort(); } catch { /* already stopped */ }
    }
    starting = false; listening = false; updateControls();
  }

  function startListening() {
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = null;
    window.AJWelcome?.interruptForAssistant();
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) { endConversation(); setStatus('Voice input is not supported in this browser (try Chrome or Edge). Type the message instead.'); return; }
    if (!user) { endConversation(); setStatus('Sign in first, then start listening.'); return; }
    if (window.isSecureContext === false) { endConversation(); setStatus('Microphone access requires HTTPS or localhost. Open the secure application or type instead.'); return; }
    // An automatically sent turn must never append and send an existing draft,
    // including one typed while a previous reply spoke. One-shot dictation with
    // auto-send off still lets the user add to and review a draft.
    if ((conversationActive || $('autoRun').checked) && $('prompt').value.trim()) {
      endConversation(); stopListening(); stopSpeaking();
      setStatus('Voice stopped: send or clear your draft before automatic voice sending. The draft was not sent.'); return;
    }
    if (conversationActive && $('mode').value === 'cloud' && state.cloudProviders?.[$('provider').value] !== true) {
      const knownMissing = state.cloudProviders?.[$('provider').value] === false;
      endConversation();
      const missingMessage = $('provider').value === 'omniroute'
        ? 'OmniRoute needs both a server key and endpoint. Choose local tools or ask an administrator to configure them.'
        : 'This AI provider has no server key configured. Choose local tools or ask an administrator to configure a provider.';
      setStatus(knownMissing ? missingMessage : 'AI provider configuration is unknown. Choose local tools or retry when settings are available.');
      return;
    }
    const lang = requireSpeechLanguage();
    if (!lang) { endConversation(); return; }
    stopSpeaking(); stopListening();
    const base = $('prompt').value.trim();
    let session;
    try { session = new Speech(); } catch { endConversation(); setStatus('The browser could not create a speech session. You can still type.'); return; }
    recognition = session; starting = true;
    session.lang = lang;
    session.interimResults = true; session.continuous = false;
    setStatus('Starting the microphone. Allow access if your browser asks.'); updateControls();
    recognitionTimer = setTimeout(() => {
      if (recognition !== session || !starting) return;
      endConversation(); stopListening();
      setStatus('The microphone did not start. Check browser permissions, then try again or type.');
    }, 20000);
    const armIdleTimeout = () => {
      if (recognitionTimer) clearTimeout(recognitionTimer);
      recognitionTimer = setTimeout(() => {
        if (recognition !== session) return;
        endConversation(); stopListening();
        setStatus('No final speech arrived for 90 seconds. Microphone off; review any text before sending.');
      }, 90000);
    };
    session.onstart = () => {
      if (recognition !== session) return;
      if (recognitionTimer) clearTimeout(recognitionTimer);
      recognitionTimer = null; starting = false; listening = true; startedAt = Date.now();
      armIdleTimeout();
      setStatus(conversationActive ? 'Listening… each final transcript will be sent. Press Stop to end the conversation.' : 'Listening… press Stop or the talk button to cancel.');
      updateControls();
    };
    session.onresult = event => {
      if (recognition !== session || !event.results?.length) return;
      const transcript = Array.from(event.results).map(result => result[0]?.transcript || '').join(' ').trim();
      const combined = [base, transcript].filter(Boolean).join(' ');
      const limit = $('prompt').maxLength;
      $('prompt').value = combined.slice(0, limit); updateControls();
      if (!event.results[event.results.length - 1].isFinal) { armIdleTimeout(); return; }
      const text = $('prompt').value.trim();
      stopListening();
      if (combined.length > limit) {
        endConversation(); setStatus('The transcript exceeded 2,000 characters and was shortened. Nothing was sent; review it before sending.'); return;
      }
      if (!transcript) { endConversation(); setStatus('No final speech was recognised. Try again, or type your message.'); return; }
      silenceRetries = 0;
      const ms = Date.now() - startedAt;
      setStatus(`Heard: “${transcript}” (${ms} ms). Review it, then press Send.`);
      if ((conversationActive || $('autoRun').checked) && text) runCommand(text, { voice: true });
    };
    session.onerror = event => {
      if (recognition !== session) return;
      if (event.error === 'no-speech' && conversationActive && silenceRetries < 1 && !document.hidden) {
        silenceRetries++;
        stopListening();
        scheduleNextTurn('No speech detected. Trying once more; press Stop to end the conversation.');
        return;
      }
      endConversation(); stopListening();
      const reasons = {
        'not-allowed': 'Microphone permission was denied. Allow it in your browser settings, or type the command.',
        'service-not-allowed': 'The browser speech service is not permitted. Check browser settings, or type the command.',
        'no-speech': 'No speech was detected. Try again and speak closer to the microphone.',
        'audio-capture': 'No microphone was found on this device. Type the command instead.',
        network: 'The browser’s speech service could not be reached. You can still type while the application is online.',
        aborted: 'Listening was interrupted. Press Dictate once or Start conversation to try again.'
      };
      setStatus(reasons[event.error] || `Voice input failed (${event.error || 'unknown error'}). You can still type.`);
    };
    session.onend = () => {
      if (recognition !== session) return;
      const partial = Boolean($('prompt').value.trim());
      endConversation(); stopListening();
      setStatus(partial ? 'Listening ended without a final transcript. Review the text or try again.' : 'Listening ended without a final transcript. Press Dictate once or Start conversation to try again.');
    };
    try { session.start(); }
    catch { endConversation(); stopListening(); setStatus('The microphone could not start. Check browser permissions, or type the command.'); }
  }

  function addMessage(text, role = 'assistant', meta = 'JARVIS') {
    const node = document.createElement('div'); node.className = 'message ' + role;
    const label = document.createElement('div'); label.className = 'meta'; label.textContent = meta; node.appendChild(label);
    const content = document.createElement('span'); content.textContent = String(text || ''); node.appendChild(content);
    if (role === 'assistant') {
      lastReply = String(text || '');
      const actions = document.createElement('div'); actions.className = 'message-actions';
      const repeat = document.createElement('button'); repeat.type = 'button'; repeat.className = 'btn small'; repeat.textContent = 'Speak again';
      repeat.onclick = () => { if (busy) return; endConversation(); stopListening(); speak(text); };
      actions.appendChild(repeat); if (window.AJReport) actions.appendChild(window.AJReport.button(text, 'jarvis')); node.appendChild(actions);
    }
    $('chatlog').appendChild(node); $('chatlog').scrollTop = $('chatlog').scrollHeight;
    updateControls(); return node;
  }

  function renderTrace(result) {
    const box = $('lastTrace');
    if (Array.isArray(result?.steps)) $('traceDetails').open = true;
    if (!result || !Array.isArray(result.steps)) {
      box.className = 'agent-trace-empty';
      box.textContent = result?.tool ? `Local command: ${result.tool}. No agent trace was recorded.` : 'This reply did not use the agent runtime, so there is no tool trace.';
      $('traceNote').textContent = result?.cloudError || (result?.mode === 'cloud' ? 'Cloud text was sent to the selected provider; this was not an agent tool run.' : 'A task or note is only saved after you confirm.');
      return;
    }
    box.className = 'agent-trace'; box.replaceChildren();
    const head = document.createElement('div'); head.className = 'agent-trace-head';
    head.textContent = `${result.steps.length} step(s) · ${result.trace?.attempted ?? result.trace?.toolCalls ?? 0} attempted · ${result.trace?.toolCalls ?? 0} successful tool result(s) · ${result.trace?.failures ?? 0} failure(s) · ${result.trace?.totalMs ?? 0} ms`;
    box.appendChild(head);
    for (const step of result.steps) {
      const row = document.createElement('div'); row.className = 'agent-step' + (step.ok ? '' : ' failed');
      const title = document.createElement('strong'); title.textContent = `${step.ok ? '✓' : '✕'} ${step.title} · ${step.tool} · ${step.ms} ms`;
      const body = document.createElement('p'); body.textContent = step.ok ? step.observation : `FAILED: ${step.observation}`;
      row.append(title, body); box.appendChild(row);
    }
    $('traceNote').textContent = result.trace?.failures
      ? 'A tool step failed. Review the trace before retrying; this agent run did not use a cloud model.'
      : result.needsProvider ? 'This agent run did not use a model. Some requests may need Cloud AI for generated prose.'
      : 'Agent prompts and traces may be saved to your account. Writes require your explicit confirmation.';
  }

  // In local mode the assistant returns a tool intent. Resolve it with the same
  // authenticated endpoints used by JalalAi instead of merely saying "opening".
  async function resolveLocalTool(result, signal) {
    const readTasks = result.tool === 'list_tasks' || result.tool === 'list_tasks_and_notes';
    const readNotes = result.tool === 'list_notes' || result.tool === 'list_tasks_and_notes';
    if (readTasks || readNotes) {
      if (result.taskStatus !== undefined && !['open', 'done'].includes(result.taskStatus)) throw new Error('The requested task filter was not understood. Try again.');
      const [tasksData, notesData] = await Promise.all([
        readTasks ? api('/assistant/tasks' + (result.taskStatus ? '?status=' + encodeURIComponent(result.taskStatus) : ''), { signal }) : null,
        readNotes ? api('/assistant/notes', { signal }) : null
      ]);
      if ((readTasks && !Array.isArray(tasksData?.tasks)) || (readNotes && !Array.isArray(notesData?.notes))) throw new Error('The requested saved items could not be read. Try again.');
      const parts = [];
      const taskLabel = result.taskStatus === 'open' ? 'open tasks' : result.taskStatus === 'done' ? 'completed tasks' : 'tasks';
      if (readTasks) parts.push(tasksData.tasks.length ? `Your ${taskLabel}:\n` + tasksData.tasks.map(t => `${t.status === 'done' ? '✓' : '○'} ${t.title}`).join('\n') : `No ${taskLabel} saved yet.`);
      if (readNotes) parts.push(notesData.notes.length ? 'Your private notes:\n' + notesData.notes.map(n => `• ${n.content}`).join('\n') : 'No notes saved yet.');
      return { ...result, output: parts.join('\n\n') };
    }
    if (result.tool === 'search_records') {
      const data = await api('/records?limit=200&q=' + encodeURIComponent(result.query), { signal });
      if (!Array.isArray(data.records)) throw new Error('Workspace records could not be read. Try again.');
      const records = data.records;
      return { ...result, output: records.length ? 'Workspace records:\n' + records.map(r => `• ${r.name || r.id}: ${r.notes || r.status || 'Record'}`).join('\n') : `No workspace records match “${result.query}”.` };
    }
    return result;
  }

  function destinationFor(text) {
    const clean = text.toLowerCase().trim().replace(/[.!?]+$/, '').replace(/\s+/g, ' ');
    const match = clean.match(/^(?:please )?(?:jarvis[ ,]+)?(?:open|go to) (?:the )?(.+?)(?: please)?$/);
    return match && Object.hasOwn(DESTINATIONS, match[1]) ? DESTINATIONS[match[1]] : '';
  }

  function speechText(result, displayedOutput) {
    if (result.cloudError) return displayedOutput;
    if (Array.isArray(result.steps)) {
      const observations = result.steps.map(step => step.ok ? step.observation : `A step failed: ${step.observation}`).join('\n');
      return (observations || displayedOutput) + (result.action ? ' Please review and confirm before saving.' : '');
    }
    return displayedOutput;
  }

  function cancelRunning(restore = true) {
    if (!controller) return false;
    const active = controller; controller = null; busy = false;
    active.abort();
    if (restore && runningPrompt && !$('prompt').value.trim()) $('prompt').value = runningPrompt;
    runningPrompt = ''; updateControls(); return true;
  }

  // Changing where text is sent or which language is captured ends the active
  // turn. An aborted browser request may already be running on the server.
  function stopForConfigurationChange() {
    if (!conversationActive && !starting && !listening && !speaking && !busy && !resumeTimer) return '';
    endConversation(); stopListening(); stopSpeaking();
    const wasRunning = cancelRunning();
    return wasRunning ? ' Voice stopped; the server may still finish the previous request.' : ' Voice stopped; microphone off.';
  }

  async function runCommand(text, { voice = false } = {}) {
    text = String(text || $('prompt').value).trim();
    if (!user) { setStatus('Sign in first.'); return; }
    if (busy || !text) return;
    // Keyboard submission must respect the same microphone guard as the
    // disabled Send button; never submit a partial recognition result.
    if (starting || listening) { setStatus('Stop listening and review the transcript before sending.'); return; }
    if ($('mode').value === 'cloud' && !requireSpeechLanguage()) return;
    const destination = destinationFor(text);
    if (destination) {
      endConversation(); stopListening(); stopSpeaking();
      setStatus('Opening the requested application page…');
      location.href = destination; return;
    }
    if (cloudStatusUnknown()) {
      endConversation(); stopListening(); stopSpeaking();
      setStatus('Provider configuration is unknown. Choose local tools or retry when settings are available.');
      updateControls(); return;
    }
    stopListening(); stopSpeaking();
    busy = true; runningPrompt = text; $('prompt').value = '';
    addMessage(text, 'user', 'You · voice or typed');
    updateControls(); setStatus('Working… Stop ends listening and stops waiting; the server may still finish the request.');
    const requestController = new AbortController(); controller = requestController;
    const mode = $('mode').value;
    // 'Jarvis, ...' is a spoken command prefix, not an always-on wake word.
    const command = text.replace(/^(?:hey\s+)?jarvis(?:\s*[,!:]\s*|\s+)/i, '').trim() || text;
    const payload = { message: command, profile: $('profile').value, mode: $('mode').value, provider: $('provider').value, supportsCombinedReads: true, supportsTaskStatusFilter: true };
    if (mode === 'cloud') {
      payload.language = speechLanguage();
      if (voice) payload.voice = true;
    }
    const rememberAtSend = mode === 'cloud' && $('rememberContext').checked;
    const requestContextVersion = contextVersion;
    if (rememberAtSend) payload.history = cloudTurns;
    try {
      let result = requireAssistantResponse(await api('/assistant/chat', { method: 'POST', signal: requestController.signal, body: JSON.stringify(payload) }));
      result = await resolveLocalTool(result, requestController.signal);
      if (controller !== requestController || requestController.signal.aborted) return;
      controller = null; busy = false; runningPrompt = '';
      if (result.mode === 'cloud' && rememberAtSend && $('rememberContext').checked && requestContextVersion === contextVersion && $('provider').value === payload.provider) {
        cloudTurns = [...cloudTurns, { role: 'user', content: text.slice(0, 1200) }, { role: 'assistant', content: String(result.output || '').slice(0, 1200) }].slice(-6);
      }
      const label = result.cloudError ? 'JARVIS · local fallback (cloud unavailable)'
        : result.mode === 'agent' ? `JARVIS · agent runtime (${result.trace?.toolCalls ?? 0} successful tool result(s))`
        : result.mode === 'cloud' ? `JARVIS · cloud ${result.provider}` : 'JARVIS · local tools';
      const output = result.cloudError ? `${result.cloudError}\n\nLocal response:\n${result.output}` : String(result.output || 'No reply was returned.');
      if (result.cloudError) setStatus(result.cloudError);
      else if (result.mode === 'agent') setStatus(result.trace?.failures ? `Finished with ${result.trace.failures} failed step(s) — read the trace.` : `Finished · ${result.trace?.toolCalls ?? 0} successful tool result(s) in ${result.trace?.totalMs ?? 0} ms.`);
      else setStatus(result.mode === 'cloud' ? 'Cloud reply received.' : 'Reply ready.');
      addMessage(output, 'assistant', label); renderTrace(result);
      if (result.action) {
        endConversation(); addConfirmation(result);
        setStatus('Review the proposed save and choose Confirm & save or Cancel. Nothing has been saved yet.');
      } else if (result.cloudError || result.trace?.failures) {
        endConversation();
      }
      updateControls();
      if ($('handsFree').checked && !document.hidden) {
        speak(speechText(result, output), ok => {
          if (conversationActive && ok) scheduleNextTurn();
          else if (conversationActive && !ok) { endConversation(); setStatus($('status').textContent + ' Conversation stopped.'); }
        });
      } else if (conversationActive && !document.hidden) scheduleNextTurn();
    } catch (error) {
      if (controller !== requestController) return;
      controller = null; busy = false; runningPrompt = ''; endConversation();
      if (!$('prompt').value.trim()) $('prompt').value = text;
      if (error.status === 401) {
        user = null; clearContext(); $('loginBanner').hidden = false; $('loginMessage').textContent = 'Your session has expired. Sign in again to continue.'; $('connectionStatus').textContent = 'Sign-in required';
      }
      const message = error.name === 'TimeoutError' ? 'The request timed out. The server may still finish; check before retrying.' : (error.message || 'The request could not complete.');
      setStatus(message); addMessage(message, 'assistant error', 'Command could not complete'); updateControls();
    }
  }

  function addConfirmation(result) {
    const box = document.createElement('div'); box.className = 'confirmation';
    const line = document.createElement('p');
    line.textContent = result.action.type === 'create_task' ? `Save task: ${result.action.title}` : `Save private note: ${result.action.content}`;
    const confirm = document.createElement('button'); confirm.type = 'button'; confirm.className = 'btn small primary'; confirm.textContent = 'Confirm & save';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'btn small'; cancel.textContent = 'Cancel'; cancel.style.marginLeft = '8px';
    confirm.onclick = async () => {
      confirm.disabled = cancel.disabled = true; setStatus('Saving your confirmed action…');
      let data;
      try {
        data = requireSavedAction(await api('/assistant/confirm', { method: 'POST', body: JSON.stringify({ confirmed: true, action: result.action }) }, 20000), result.action);
      } catch (error) {
        // A lost response can mean the server already saved it. Do not invite an
        // immediate duplicate save; the user can check their workspace first.
        if (!box.isConnected) return;
        const message = 'Could not verify the save. The server may still finish; check your tasks or notes before trying again.';
        box.replaceChildren(document.createTextNode(message)); setStatus(message); return;
      }
      if (!box.isConnected) return;
      box.replaceChildren(document.createTextNode(data.output)); lastReply = data.output; updateControls(); setStatus('Saved after your confirmation.');
      if ($('handsFree').checked && !document.hidden) {
        try { speak(data.output); } catch { setStatus('Save confirmed, but the browser could not start speech.'); }
      }
    };
    cancel.onclick = () => { box.replaceChildren(document.createTextNode('Cancelled. Nothing was saved.')); setStatus('Save cancelled. Nothing was saved.'); };
    box.append(line, confirm, cancel); $('chatlog').appendChild(box); $('chatlog').scrollTop = $('chatlog').scrollHeight;
  }

  function updateProviderStatus() {
    const selected = $('provider').value;
    const configured = state.cloudProviders?.[selected];
    const omni = selected === 'omniroute';
    let text = 'Provider configuration is unknown. Retry when settings are available or choose local tools.';
    if (configured === true) text = omni
      ? 'OmniRoute has a server key and endpoint configured. A real response still requires a successful provider request.'
      : `${PROVIDER_NAMES[selected]} has a server key configured. A real response still requires a successful provider request.`;
    else if (configured === false) text = omni
      ? 'OmniRoute needs both a server key and endpoint. Choose local tools or ask an administrator to configure them.'
      : `No server key is configured for ${PROVIDER_NAMES[selected]}. Choose a configured provider or ask an administrator to set one up.`;
    $('cloudStatus').textContent = text;
  }

  async function refreshState() {
    state = await api('/assistant/state?metadata=1&includeOmniRoute=1');
    const providers = state.cloudProviders || {};
    const options = Array.from($('provider').options);
    for (const option of options) {
      const value = providers[option.value];
      const configuredLabel = option.value === 'omniroute' ? ' · key & endpoint configured' : ' · key configured';
      option.textContent = `${PROVIDER_NAMES[option.value]}${value === true ? configuredLabel : value === false ? ' · not configured' : ' · status unknown'}`;
      option.disabled = value !== true && value !== false;
    }
    const selected = providers[$('provider').value];
    if ((!providerTouched && selected !== true) || (selected !== true && selected !== false)) {
      // Only select options this page actually has. An older cached HTML page or
      // a future provider in the response must not select a nonexistent value.
      const first = options.find(option => providers[option.value] === true) || options.find(option => providers[option.value] === false);
      $('provider').value = first?.value || '';
    }
    const values = options.map(option => providers[option.value]);
    const supportedCloud = values.includes(true) ? true : values.every(value => value === false) ? false : null;
    const cloud = $('mode').querySelector('option[value="cloud"]');
    if (cloud) cloud.textContent = supportedCloud === true ? 'Cloud AI — provider configured (not live-tested)' : supportedCloud === false ? 'Cloud AI — not configured' : 'Cloud AI — status unknown';
    // Prefer open-ended chat only when a specific provider has a known key.
    // Nothing is sent until the user speaks or submits, and an explicit engine
    // choice made while metadata was loading is never overridden.
    if (!modeTouched && !busy && !conversationActive && !starting && !listening && providers[$('provider').value] === true) $('mode').value = 'cloud';
    updateProviderStatus(); updateModeLabel();
  }

  function updateModeLabel() {
    const mode = $('mode').value;
    $('cloudOptions').hidden = mode !== 'cloud';
    const provider = PROVIDER_NAMES[$('provider').value] || 'the selected provider';
    const configured = state.cloudProviders?.[$('provider').value];
    const omni = $('provider').value === 'omniroute';
    let help = 'AI provider configuration is unknown. Choose local tools or retry when settings are available.';
    if (mode !== 'cloud') help = 'Agent and local modes use limited tools, not general AI chat. Cloud AI needs a working provider and may incur charges.';
    else if (configured === true) help = omni
      ? 'AI chat sends text to the configured OmniRoute endpoint, which may forward it. Configuration does not prove a response; charges may apply.'
      : `AI chat sends text to ${provider}. A key does not prove a response; provider charges may apply.`;
    else if (configured === false) help = omni
      ? 'OmniRoute needs both a server key and endpoint. Choose local tools or ask an administrator to configure them.'
      : `${provider} has no server key configured. Choose local tools or ask an administrator to configure it.`;
    $('engineHelp').textContent = help;
    $('contextSummary').textContent = $('rememberContext').checked ? '· memory on' : '· memory off';
    $('voiceMode').textContent = mode === 'agent' ? `Agent mode · ${state.tools?.length || 'bounded'} tools with trace`
      : mode === 'research' ? 'Research · live Wikipedia with cited links'
      : mode === 'cloud' ? 'Cloud AI · sends text to the selected provider'
      : 'Local tools · no AI key required';
    updateControls();
  }

  async function signIn() {
    const session = await api('/me'); csrf = session.csrfToken || '';
    if (!session.authenticated) {
      user = null; $('loginBanner').hidden = false;
      const health = await api('/health'); $('demoBtn').hidden = !health.localPreview;
      $('loginMessage').textContent = health.localPreview ? 'Disposable preview: use test data only. Tasks and notes are account-scoped.' : 'Sign in with your account to use the voice assistant.';
      $('connectionStatus').textContent = health.localPreview ? 'Local preview · not production' : 'Secure account required';
      setStatus(health.localPreview ? 'Choose “Try the local preview” to start.' : 'Sign in to begin.'); updateControls(); return;
    }
    user = session.user; $('loginBanner').hidden = true;
    await refreshState(); $('connectionStatus').textContent = 'Connected · ' + user.username;
    setStatus($('mode').value === 'cloud' ? 'AI chat selected; its configured key has not been live-tested. Your microphone is off.' : 'Ready. Your microphone is off.'); updateControls();
  }

  $('consoleForm').onsubmit = event => { event.preventDefault(); runCommand(); };
  $('prompt').addEventListener('input', updateControls);
  $('prompt').addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); runCommand(); }
  });
  document.querySelectorAll('[data-prompt]').forEach(button => button.onclick = () => {
    if (busy) return;
    if ($('prompt').value.trim()) { setStatus('Your draft is unchanged. Send or clear it before using an example.'); return; }
    stopForConfigurationChange();
    if (button.dataset.mode && $('mode').value !== button.dataset.mode) {
      modeTouched = true; clearContext(); $('mode').value = button.dataset.mode; updateModeLabel();
    }
    $('prompt').value = button.dataset.prompt; updateControls(); runCommand(button.dataset.prompt);
  });
  // A deliberate click is the permission to send final transcripts and reopen
  // the mic after a spoken reply. Nothing starts merely by opening this page.
  $('conversationBtn').onclick = () => {
    if (conversationActive) {
      endConversation(); stopListening(); stopSpeaking();
      const wasRunning = cancelRunning();
      setStatus(wasRunning ? 'Stopped waiting; the server may still finish the request. Microphone off.' : 'Conversation stopped. Microphone off.');
      return;
    }
    conversationActive = true; silenceRetries = 0;
    startListening();
  };
  $('talkBtn').onclick = () => {
    if (starting || listening) { endConversation(); stopListening(); setStatus('Microphone stopped. Nothing is listening.'); return; }
    // While a continuous reply is speaking this is an explicit interruption;
    // startListening cancels speech before it opens the microphone.
    silenceRetries = 0;
    startListening();
  };
  $('speakBtn').onclick = () => { endConversation(); stopListening(); speak(lastReply); };
  $('stopBtn').onclick = () => {
    endConversation(); stopListening(); stopSpeaking();
    const wasRunning = cancelRunning();
    setStatus(wasRunning ? 'Stopped waiting; the server may still finish the request. Microphone off.' : 'Stopped. Microphone off; nothing is listening.');
  };
  $('clearChat').onclick = () => {
    endConversation(); stopListening(); stopSpeaking(); cancelRunning(false);
    clearContext(); lastReply = ''; $('prompt').value = ''; $('chatlog').replaceChildren();
    $('lastTrace').className = 'agent-trace-empty'; $('lastTrace').textContent = 'No run yet. Agent and research runs show their tool trace here.';
    $('traceDetails').open = false;
    $('traceNote').textContent = 'Clearing this screen does not delete saved tasks, notes or agent traces.';
    setStatus('Session cleared on this page. Saved tasks, notes and agent traces were not deleted.'); updateControls();
  };
  $('handsFree').onchange = () => {
    if (!$('handsFree').checked && speaking) { stopSpeaking(); setStatus('Read-aloud stopped.'); if (conversationActive) scheduleNextTurn(); }
  };
  $('autoRun').onchange = () => {
    const stopped = stopForConfigurationChange();
    if (stopped) setStatus('Dictation setting changed.' + stopped);
  };
  $('profile').onchange = () => {
    const stopped = stopForConfigurationChange();
    if (stopped) setStatus('Assistant profile changed.' + stopped);
  };
  $('rememberContext').onchange = () => {
    $('contextSummary').textContent = $('rememberContext').checked ? '· memory on' : '· memory off';
    if (!$('rememberContext').checked) {
      clearContext();
      setStatus('Cloud conversation context cleared from this page.' + (busy ? ' An in-flight request may still finish with what was already sent.' : ''));
    } else setStatus('Context will be remembered from the next successful cloud exchange on this page.');
  };
  $('provider').onchange = () => {
    const stopped = stopForConfigurationChange();
    providerTouched = true; clearContext(); updateProviderStatus(); updateModeLabel();
    setStatus('Provider changed; previous cloud context was cleared from this page.' + stopped);
  };
  $('mode').onchange = () => {
    const stopped = stopForConfigurationChange();
    modeTouched = true; clearContext(); updateModeLabel();
    setStatus('Response engine changed; previous cloud context was cleared from this page.' + stopped);
  };
  $('speechLanguage').onchange = () => {
    const stopped = stopForConfigurationChange(); describeLanguage();
    if (stopped) setStatus('Speech language changed.' + stopped);
  };
  $('customLanguage').addEventListener('input', () => {
    const stopped = stopForConfigurationChange(); describeLanguage();
    if (stopped) setStatus('Speech language changed.' + stopped);
  });
  window.addEventListener('aj-speech-voice-change', describeLanguage);
  $('demoBtn').onclick = async () => {
    $('demoBtn').disabled = true;
    try { await api('/demo', { method: 'POST' }); await signIn(); }
    catch (error) { setStatus(error.message); }
    finally { $('demoBtn').disabled = false; }
  };
  const moreNavigation = $('moreNavigation');
  document.addEventListener('click', event => { if (moreNavigation.open && !moreNavigation.contains(event.target)) moreNavigation.open = false; });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && moreNavigation.open) { moreNavigation.open = false; moreNavigation.querySelector('summary').focus(); }
  });

  if (window.AJSpeech) { window.AJSpeech.populate($('voice')); window.AJSpeech.refresh(); }
  describeSupport(); describeLanguage();
  if (window.speechSynthesis) window.speechSynthesis.addEventListener?.('voiceschanged', () => { describeSupport(); describeLanguage(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden || (!conversationActive && !starting && !listening && !speaking)) return;
    endConversation(); stopListening(); stopSpeaking();
    const wasRunning = cancelRunning();
    setStatus(wasRunning ? 'Voice stopped when this tab was hidden. The server may still finish the request.' : 'Voice stopped when this tab was hidden. Microphone off.');
  });
  window.addEventListener('pagehide', () => { endConversation(); stopListening(); stopSpeaking(); cancelRunning(false); clearContext(); });

  if (window.AJ_STATIC_HOST) {
    $('loginBanner').hidden = false; $('demoBtn').hidden = true;
    $('loginMessage').textContent = 'Static website preview: the voice assistant needs the secure application server for sign-in and tools. Open the secure app, or run npm run dev locally.';
    $('connectionStatus').textContent = 'Static preview · backend not connected';
    setStatus('Open the secure app or local preview to talk to JARVIS.'); updateControls();
  } else {
    signIn().catch(error => {
      user = null;
      const missingDatabase = error.code === 'DATABASE_NOT_CONFIGURED';
      $('connectionStatus').textContent = missingDatabase ? 'Database not configured' : error.status ? 'Sign-in unavailable' : 'Connection unavailable';
      setStatus(error.message);
      $('loginBanner').hidden = false;
      $('loginMessage').textContent = missingDatabase
        ? 'This deployment’s database is not configured. Sign-in and the voice assistant are unavailable here. Ask the site owner to configure it; no password was checked.'
        : error.status ? 'The application responded, but could not start a session. Try again or contact the site owner.'
        : 'The server could not be reached. Reload once the application server is running.';
      updateControls();
    });
  }
})();
