'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const TEXT_FILE = /\.(txt|md|markdown|csv|json|js|mjs|ts|tsx|jsx|py|html|css|xml|ya?ml|log|sql)$/i;
  let user = null, csrf = '', busy = false, requestController = null, recognition = null, listening = false;
  let conversations = [], currentId = null, messages = [], models = [], attachments = [], lastReply = '';
  let mode = 'chat', modelA = 'local', modelB = 'local-critic', history = true, searchTimer = null;

  const setStatus = text => { $('status').textContent = text; };
  async function api(path, options = {}) {
    const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(csrf && options.method && options.method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}), ...options.headers };
    const response = await fetch('/api' + path, { ...options, headers, credentials: 'same-origin', signal: options.signal || AbortSignal.timeout(90000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.error || `Request failed (${response.status})`); error.status = response.status; error.data = data; throw error; }
    return data;
  }
  function modelLabel(id) { return models.find(m => m.id === id)?.label || id; }
  function updateControls() {
    $('sendBtn').disabled = !user || busy || !$('prompt').value.trim();
    $('micBtn').disabled = !user || busy;
    $('attachBtn').disabled = !user || busy;
    $('readBtn').disabled = !lastReply;
    $('stopBtn').disabled = !busy && !listening && !window.speechSynthesis?.speaking;
    $('accountBtn').textContent = user ? 'Sign out' : 'Sign in';
    $('charCount').textContent = `${$('prompt').value.length} / 10000`;
    $('renameBtn').disabled = !currentId;
    $('deleteBtn').disabled = !currentId;
  }
  function renderModelOptions() {
    for (const [select, value] of [[$('modelA'), modelA], [$('modelB'), modelB]]) {
      const previous = value;
      select.replaceChildren();
      for (const model of models) {
        const option = new Option(model.label + (model.local ? '' : model.configured ? ' · configured' : ' · not configured'), model.id);
        select.add(option);
      }
      select.value = models.some(m => m.id === previous) ? previous : 'local';
    }
    modelA = $('modelA').value; modelB = $('modelB').value;
    const configuredCloud = models.filter(m => !m.local && m.configured).length;
    $('providerStatus').textContent = configuredCloud ? `${configuredCloud} cloud engine(s) configured · live call still required` : 'Local engines ready · cloud keys not configured';
    const list = $('providerList'); list.replaceChildren();
    for (const model of models) {
      const li = document.createElement('li');
      const name = document.createElement('span'); name.textContent = model.label;
      const state = document.createElement('span'); state.className = 'state ' + (model.configured ? 'ok' : 'warn'); state.textContent = model.local ? 'local' : model.configured ? 'key set' : 'no key';
      li.append(name, state); list.appendChild(li);
    }
  }
  function renderConversations() {
    const list = $('conversationList'); list.replaceChildren();
    if (!conversations.length) { const empty = document.createElement('p'); empty.className = 'hint'; empty.textContent = 'No saved conversations yet.'; list.appendChild(empty); return; }
    for (const conversation of conversations) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'conversation-item' + (conversation.id === currentId ? ' active' : '');
      const title = document.createElement('span'); title.className = 'title'; title.textContent = conversation.title;
      const badge = document.createElement('span'); badge.className = 'mode-badge'; badge.textContent = conversation.mode;
      button.append(title, badge);
      button.onclick = () => selectConversation(conversation.id);
      list.appendChild(button);
    }
  }
  function fileChips(container, items, removable = false) {
    container.replaceChildren();
    for (const [index, file] of items.entries()) {
      const chip = document.createElement('span'); chip.className = removable ? 'attachment-chip' : 'file-chip'; chip.textContent = `📄 ${file.name} · ${Math.ceil((file.size || file.text?.length || 0) / 1024)} KB`;
      if (removable) { const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '✕'; remove.setAttribute('aria-label', `Remove ${file.name}`); remove.onclick = () => { attachments.splice(index, 1); renderAttachments(); }; chip.appendChild(remove); }
      container.appendChild(chip);
    }
  }
  function renderAttachments() { fileChips($('attachments'), attachments, true); }
  function contentNode(text) {
    const wrapper = document.createElement('div'); wrapper.className = 'content';
    const parts = String(text || '').split(/```/);
    parts.forEach((part, index) => {
      if (index % 2 === 1) { const pre = document.createElement('pre'); const code = document.createElement('code'); code.textContent = part.replace(/^[a-z0-9+-]*\n/i, ''); pre.appendChild(code); wrapper.appendChild(pre); }
      else if (part) { const span = document.createElement('span'); span.textContent = part; wrapper.appendChild(span); }
    });
    return wrapper;
  }
  function actionBox(action) {
    const box = document.createElement('div'); box.className = 'confirmation';
    const prompt = document.createElement('p'); prompt.textContent = action.type === 'create_task' ? `Save task: ${action.title}` : `Save private note: ${action.content}`;
    const confirm = document.createElement('button'); confirm.className = 'btn small primary'; confirm.type = 'button'; confirm.textContent = 'Confirm & save';
    const cancel = document.createElement('button'); cancel.className = 'btn small'; cancel.type = 'button'; cancel.textContent = 'Cancel';
    confirm.onclick = async () => {
      confirm.disabled = cancel.disabled = true;
      try { const data = await api('/assistant/confirm', { method: 'POST', body: JSON.stringify({ confirmed: true, action }) }); box.replaceChildren(document.createTextNode(data.output)); }
      catch (error) { setStatus(error.message); confirm.disabled = cancel.disabled = false; }
    };
    cancel.onclick = () => box.replaceChildren(document.createTextNode('Cancelled. Nothing was saved.'));
    box.append(prompt, confirm, cancel); return box;
  }
  function stepsNode(steps) {
    const details = document.createElement('details'); details.className = 'steps';
    const summary = document.createElement('summary'); summary.textContent = `Agent workflow · ${steps.length} steps`; details.appendChild(summary);
    for (const step of steps) { const node = document.createElement('div'); node.className = 'step'; const title = document.createElement('strong'); title.textContent = `${step.title} · ${step.status}`; const body = document.createElement('p'); body.textContent = step.output; node.append(title, body); details.appendChild(node); }
    return details;
  }
  function messageNode(message) {
    const node = document.createElement('article'); node.className = 'message ' + message.role;
    const meta = document.createElement('div'); meta.className = 'meta';
    meta.textContent = message.role === 'user' ? 'You' : `${modelLabel(message.provider)} · ${message.mode}${message.side ? ' · side ' + message.side.toUpperCase() : ''}`;
    node.append(meta, contentNode(message.content));
    if (message.attachments?.length) { const files = document.createElement('div'); files.className = 'message-attachments'; fileChips(files, message.attachments); node.appendChild(files); }
    if (message.steps?.length) node.appendChild(stepsNode(message.steps));
    if (message.action) node.appendChild(actionBox(message.action));
    if (message.role === 'assistant') {
      lastReply = message.content;
      const actions = document.createElement('div'); actions.className = 'message-actions';
      const read = document.createElement('button'); read.type = 'button'; read.className = 'btn small'; read.textContent = 'Read aloud'; read.onclick = () => speak(message.content);
      const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'btn small'; copy.textContent = 'Copy'; copy.onclick = async () => { try { await navigator.clipboard.writeText(message.content); setStatus('Copied.'); } catch { setStatus('Clipboard unavailable. Select the text to copy.'); } };
      actions.append(read, copy); node.appendChild(actions);
    }
    return node;
  }
  function compareNode(pair) {
    const wrapper = document.createElement('div'); wrapper.className = 'compare-block';
    const grid = document.createElement('div'); grid.className = 'compare-grid';
    for (const message of pair) {
      const card = document.createElement('article'); card.className = 'compare-card' + (message.vote === message.side ? ' winner' : '');
      const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = `Side ${message.side.toUpperCase()} · ${modelLabel(message.provider)}`;
      card.append(meta, contentNode(message.content));
      if (message.steps?.length) card.appendChild(stepsNode(message.steps));
      if (message.action) card.appendChild(actionBox(message.action));
      grid.appendChild(card);
    }
    const vote = document.createElement('div'); vote.className = 'compare-vote';
    const comparisonId = pair[0]?.comparisonId;
    for (const [value, label] of [['a', 'A is better'], ['tie', 'Tie'], ['b', 'B is better']]) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'vote-btn' + (pair[0]?.vote === value ? ' selected' : ''); button.textContent = label;
      button.onclick = async () => {
        if (!history || !currentId || !comparisonId) { setStatus('Votes are saved with history enabled.'); return; }
        button.disabled = true;
        try { await api(`/platform/conversations/${currentId}/vote`, { method: 'POST', body: JSON.stringify({ comparisonId, vote: value }) }); for (const message of pair) message.vote = value; renderMessages(); setStatus('Vote saved.'); }
        catch (error) { setStatus(error.message); button.disabled = false; }
      };
      vote.appendChild(button);
    }
    wrapper.append(grid, vote); return wrapper;
  }
  function renderMessages() {
    const container = $('messages'); container.replaceChildren();
    $('emptyState').hidden = messages.length > 0;
    let index = 0;
    while (index < messages.length) {
      const message = messages[index];
      if (message.role === 'assistant' && message.mode === 'compare' && message.comparisonId) {
        const pair = [message];
        if (messages[index + 1]?.comparisonId === message.comparisonId) { pair.push(messages[index + 1]); index += 1; }
        container.appendChild(compareNode(pair));
      } else container.appendChild(messageNode(message));
      index += 1;
    }
    container.scrollTop = container.scrollHeight;
    updateControls();
  }
  async function loadConversations(query = '') {
    const data = await api('/platform/conversations' + (query ? '?q=' + encodeURIComponent(query) : ''));
    conversations = data.conversations || []; renderConversations();
  }
  async function selectConversation(id) {
    if (busy) return;
    try {
      const data = await api('/platform/conversations/' + id);
      currentId = id; messages = data.messages || [];
      const conversation = data.conversation;
      mode = conversation.mode; modelA = conversation.modelA; modelB = conversation.modelB; history = conversation.history;
      $('conversationTitle').textContent = conversation.title;
      $('historyToggle').checked = history;
      setMode(mode, false); renderModelOptions(); renderMessages(); renderConversations(); closeSidebar();
      setStatus(history ? 'Conversation loaded.' : 'Transient conversation · messages are not saved.');
    } catch (error) { setStatus(error.message); }
  }
  function newConversation() {
    if (busy) return;
    currentId = null; messages = []; attachments = []; lastReply = '';
    $('conversationTitle').textContent = 'New conversation';
    renderAttachments(); renderMessages(); renderConversations(); closeSidebar();
    $('prompt').focus(); setStatus('New conversation. History is ' + (history ? 'on' : 'off') + '.');
  }
  function setMode(next, persist = true) {
    mode = next;
    document.querySelectorAll('.mode-tab').forEach(tab => { const active = tab.dataset.mode === mode; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); });
    $('modelBField').hidden = mode !== 'compare';
    $('modeHint').textContent = mode === 'agent' ? 'Agent mode · bounded plan → draft → review workflow. No autonomous external actions.' : mode === 'compare' ? 'Compare mode · two engines answer side by side. Vote for the better result.' : 'Direct mode · one engine, fast answers and local tools.';
    if (persist && currentId) api(`/platform/conversations/${currentId}`, { method: 'PATCH', body: JSON.stringify({ mode, modelA, modelB }) }).catch(error => setStatus(error.message));
  }
  async function ensureConversation(firstMessage) {
    if (currentId) return currentId;
    const data = await api('/platform/conversations', { method: 'POST', body: JSON.stringify({ title: history ? (firstMessage.slice(0, 80) || 'New conversation') : 'Private conversation', mode, modelA, modelB, history }) });
    currentId = data.conversation.id; $('conversationTitle').textContent = data.conversation.title;
    await loadConversations($('conversationSearch').value.trim());
    return currentId;
  }
  async function send(text) {
    text = String(text || $('prompt').value).trim();
    if (!user) { setStatus('Please sign in first.'); return; }
    if (busy || !text) return;
    stopVoice(); busy = true; $('prompt').value = ''; updateControls(); setStatus('Working… Stop cancels waiting for the reply.');
    const sentAttachments = attachments.slice(); attachments = []; renderAttachments();
    requestController = new AbortController();
    try {
      const id = await ensureConversation(text);
      const data = await api(`/platform/conversations/${id}/messages`, { method: 'POST', signal: requestController.signal, body: JSON.stringify({ content: text, mode, modelA, modelB, history, attachments: sentAttachments }) });
      messages.push(...(data.messages || []));
      if (!data.ok) setStatus(data.error || 'The request could not complete.');
      else setStatus(mode === 'compare' ? 'Comparison ready. Vote for the better answer.' : mode === 'agent' ? 'Agent workflow completed.' : 'Reply received.');
      renderMessages(); await loadConversations($('conversationSearch').value.trim());
      if (data.messages?.length) { const conversation = conversations.find(c => c.id === id); if (conversation) $('conversationTitle').textContent = conversation.title; }
    } catch (error) {
      if (error.name === 'AbortError') setStatus('Request cancelled. If history is on, check the conversation before retrying a saved action.');
      else { setStatus(error.message); if (error.data?.messages) { messages.push(...error.data.messages); renderMessages(); } }
    } finally { busy = false; requestController = null; updateControls(); }
  }
  function stopVoice() {
    if (recognition) { recognition.onend = null; try { recognition.abort(); } catch {} recognition = null; }
    listening = false; $('micBtn').textContent = '🎙'; $('micBtn').setAttribute('aria-pressed', 'false');
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    updateControls();
  }
  function speak(text) {
    if (!('speechSynthesis' in window)) { setStatus('Speech output is not supported by this browser.'); return; }
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(String(text).slice(0, 5000)); speech.lang = 'en-US';
    speech.onend = speech.onerror = updateControls;
    window.speechSynthesis.speak(speech); updateControls();
  }
  async function signIn() {
    const session = await api('/me'); csrf = session.csrfToken || '';
    if (!session.authenticated) {
      user = null; $('authGate').hidden = false; $('conversationArea').hidden = true;
      const health = await api('/health'); $('demoBtn').hidden = !health.localPreview;
      $('gateMessage').textContent = health.localPreview ? 'Disposable preview: use test data only. Start the preview to explore Agent Studio.' : 'Sign in with your workspace account to use Agent Studio.';
      updateControls(); return;
    }
    user = session.user; $('authGate').hidden = true; $('conversationArea').hidden = false;
    const state = await api('/platform/state'); models = state.models || []; renderModelOptions();
    $('privacyNote').textContent = state.privacy || $('privacyNote').textContent;
    await loadConversations(); newConversation(); setStatus('Ready · signed in as ' + user.username); updateControls();
  }
  function exportConversation(format) {
    if (!messages.length) { setStatus('Nothing to export yet.'); return; }
    const title = $('conversationTitle').textContent || 'conversation';
    let blob, filename;
    if (format === 'json') { blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), title, mode, modelA, modelB, messages }, null, 2)], { type: 'application/json' }); filename = 'sj-agent-conversation.json'; }
    else { const lines = [`# ${title}`, '', `Mode: ${mode} · A: ${modelLabel(modelA)}${mode === 'compare' ? ' · B: ' + modelLabel(modelB) : ''}`, '']; for (const message of messages) { lines.push(`## ${message.role === 'user' ? 'You' : modelLabel(message.provider)}${message.side ? ' (side ' + message.side.toUpperCase() + ')' : ''}`, '', message.content, ''); } blob = new Blob([lines.join('\n')], { type: 'text/markdown' }); filename = 'sj-agent-conversation.md'; }
    const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`Exported ${filename}.`);
  }
  function closeSidebar() { $('sidebar').classList.remove('open'); }

  $('composer').onsubmit = event => { event.preventDefault(); send(); };
  $('prompt').addEventListener('input', updateControls);
  $('prompt').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(); } });
  document.querySelectorAll('[data-prompt]').forEach(button => button.onclick = () => send(button.dataset.prompt));
  document.querySelectorAll('.mode-tab').forEach(tab => tab.onclick = () => setMode(tab.dataset.mode));
  $('modelA').onchange = () => { modelA = $('modelA').value; if (currentId) api(`/platform/conversations/${currentId}`, { method: 'PATCH', body: JSON.stringify({ modelA }) }).catch(error => setStatus(error.message)); };
  $('modelB').onchange = () => { modelB = $('modelB').value; if (currentId) api(`/platform/conversations/${currentId}`, { method: 'PATCH', body: JSON.stringify({ modelB }) }).catch(error => setStatus(error.message)); };
  $('historyToggle').onchange = async () => {
    history = $('historyToggle').checked;
    if (!history && messages.length && !window.confirm('Turn history off? Existing messages in this conversation will be deleted from the server. Current screen text stays until you leave.')) { history = true; $('historyToggle').checked = true; return; }
    if (currentId) { try { await api(`/platform/conversations/${currentId}`, { method: 'PATCH', body: JSON.stringify({ history }) }); if (!history) { messages = []; $('conversationTitle').textContent = 'Private conversation'; renderMessages(); await loadConversations($('conversationSearch').value.trim()); } setStatus(history ? 'History enabled.' : 'History disabled. New messages are transient.'); } catch (error) { setStatus(error.message); } }
    else setStatus(history ? 'History enabled for the next conversation.' : 'History disabled. New messages are transient.');
  };
  $('newChatBtn').onclick = newConversation;
  $('conversationSearch').oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => loadConversations($('conversationSearch').value.trim()).catch(error => setStatus(error.message)), 250); };
  $('renameBtn').onclick = async () => { if (!currentId) return; const title = window.prompt('Conversation title:', $('conversationTitle').textContent); if (!title?.trim()) return; try { const data = await api(`/platform/conversations/${currentId}`, { method: 'PATCH', body: JSON.stringify({ title: title.trim() }) }); $('conversationTitle').textContent = data.conversation.title; await loadConversations($('conversationSearch').value.trim()); } catch (error) { setStatus(error.message); } };
  $('deleteBtn').onclick = async () => { if (!currentId || !window.confirm('Delete this conversation and its messages? This cannot be undone.')) return; try { await api(`/platform/conversations/${currentId}`, { method: 'DELETE' }); newConversation(); await loadConversations($('conversationSearch').value.trim()); setStatus('Conversation deleted.'); } catch (error) { setStatus(error.message); } };
  $('attachBtn').onclick = () => $('fileInput').click();
  $('fileInput').onchange = async () => {
    const files = Array.from($('fileInput').files || []); $('fileInput').value = '';
    for (const file of files) {
      if (attachments.length >= 4) { setStatus('Attach at most four files.'); break; }
      if (!TEXT_FILE.test(file.name)) { setStatus(`Unsupported file type: ${file.name}. Use text/code files.`); continue; }
      if (file.size > 120000) { setStatus(`${file.name} is too large. Maximum 120,000 characters.`); continue; }
      const text = await file.text();
      if (attachments.reduce((sum, item) => sum + item.text.length, 0) + text.length > 240000) { setStatus('Attached text is too large. Remove a file and retry.'); break; }
      attachments.push({ name: file.name, text, size: text.length });
    }
    renderAttachments(); updateControls();
  };
  $('micBtn').onclick = () => {
    if (listening) { stopVoice(); setStatus('Microphone stopped.'); return; }
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) { setStatus('Voice input is not supported in this browser. Type your message instead.'); return; }
    stopVoice(); recognition = new Speech(); recognition.lang = 'en-US'; recognition.interimResults = true; recognition.continuous = false;
    recognition.onstart = () => { listening = true; $('micBtn').textContent = '■'; $('micBtn').setAttribute('aria-pressed', 'true'); setStatus('Listening… your browser may use its speech service.'); updateControls(); };
    recognition.onresult = event => { $('prompt').value = Array.from(event.results).map(r => r[0].transcript).join(' '); updateControls(); if (event.results[event.results.length - 1].isFinal) { stopVoice(); setStatus('Transcript ready. Review it, then press Send.'); } };
    recognition.onerror = event => { stopVoice(); setStatus(event.error === 'not-allowed' ? 'Microphone permission was denied. Allow it in browser settings or keep typing.' : `Voice input failed (${event.error}). You can still type.`); };
    recognition.onend = () => { listening = false; $('micBtn').textContent = '🎙'; $('micBtn').setAttribute('aria-pressed', 'false'); updateControls(); };
    try { recognition.start(); } catch { stopVoice(); setStatus('The microphone could not start. Try again or type your message.'); }
  };
  $('readBtn').onclick = () => speak(lastReply);
  $('stopBtn').onclick = () => { stopVoice(); if (requestController) requestController.abort(); setStatus('Stopped.'); };
  $('exportBtn').onclick = event => exportConversation(event.shiftKey ? 'json' : 'markdown');
  $('themeBtn').onclick = () => { const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'; document.documentElement.dataset.theme = next; localStorage.setItem('sj-agent-theme', next); };
  $('toolsBtn').onclick = () => { const panel = $('toolsPanel'); panel.hidden = !panel.hidden; $('studio').classList.toggle('tools-open', !panel.hidden); };
  $('toolsClose').onclick = () => { $('toolsPanel').hidden = true; $('studio').classList.remove('tools-open'); };
  $('sidebarOpen').onclick = () => $('sidebar').classList.add('open');
  $('sidebarClose').onclick = closeSidebar;
  $('demoBtn').onclick = async () => { $('demoBtn').disabled = true; try { await api('/demo', { method: 'POST', body: '{}' }); await signIn(); } catch (error) { setStatus(error.message); $('gateMessage').textContent = error.message; } finally { $('demoBtn').disabled = false; } };
  $('accountBtn').onclick = async () => { if (!user) { location.href = 'index.html'; return; } if (!window.confirm('Sign out of this device?')) return; try { await api('/auth/logout', { method: 'POST', body: '{}' }); user = null; csrf = ''; messages = []; conversations = []; currentId = null; stopVoice(); await signIn(); } catch (error) { setStatus(error.message); } };
  document.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); newConversation(); } if (event.key === 'Escape') { closeSidebar(); $('toolsPanel').hidden = true; $('studio').classList.remove('tools-open'); } });
  window.addEventListener('pagehide', () => { stopVoice(); requestController?.abort(); });
  const savedTheme = localStorage.getItem('sj-agent-theme'); if (savedTheme === 'light' || savedTheme === 'dark') document.documentElement.dataset.theme = savedTheme;
  setMode('chat', false);
  signIn().catch(error => { $('authGate').hidden = false; $('conversationArea').hidden = true; $('gateMessage').textContent = 'The server could not be reached. Start the application server and reload. ' + error.message; });
})();
