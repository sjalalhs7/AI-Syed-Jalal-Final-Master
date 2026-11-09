'use strict';
/*
 * All-in-one panel.
 *
 * Design rule: the page shows the routing before the answer, and never renders a
 * specialist answer it did not receive. A failed specialist is displayed as
 * failed — there is no filler text and no substitute profile.
 */
(() => {
  const $ = id => document.getElementById(id);
  let user = null, csrf = '', busy = false, recognition = null, listening = false, controller = null;
  let specialists = [], chosen = new Set(), lastRoute = [], previewBusy = false, routeSequence = 0;

  async function api(path, options = {}) {
    const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(csrf && options.method && options.method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}), ...options.headers };
    const response = await fetch('/api' + path, { ...options, headers, credentials: 'same-origin', signal: options.signal || AbortSignal.timeout(60000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.error || `Request failed (${response.status})`); error.status = response.status; throw error; }
    return data;
  }

  const setStatus = text => { $('status').textContent = text; };
  function updateControls() {
    $('askBtn').disabled = !user || busy || !$('prompt').value.trim();
    $('previewRouteBtn').disabled = !user || busy || previewBusy || chosen.size > 0 || $('prompt').value.trim().length < 3;
    $('voiceBtn').disabled = !user || busy;
    $('stopBtn').disabled = !busy && !listening;
    $('askBtn').textContent = busy ? 'Working…' : 'Answer with every specialist ↗';
    $('voiceBtn').setAttribute('aria-pressed', String(listening));
  }

  /* ---------------- routing preview ---------------- */
  function invalidateRoute() {
    routeSequence += 1;
    $('routeBar').hidden = true;
  }
  async function previewRoute() {
    const prompt = $('prompt').value.trim();
    if (!user || busy || previewBusy || chosen.size || prompt.length < 3) return;
    const sequence = ++routeSequence;
    previewBusy = true; updateControls();
    setStatus('Requesting a routing preview from the app…');
    try {
      const data = await api('/assistant/all/route', { method: 'POST', body: JSON.stringify({ prompt }) });
      if (sequence !== routeSequence || prompt !== $('prompt').value.trim() || chosen.size) return;
      renderRoute(data.routed);
      setStatus('Routing preview received. Review it, then ask when ready.');
    } catch (error) {
      if (sequence === routeSequence) { $('routeBar').hidden = true; setStatus('Routing preview unavailable. ' + error.message); }
    } finally {
      previewBusy = false; updateControls();
    }
  }

  function renderRoute(routed) {
    lastRoute = routed;
    $('routeBar').hidden = !routed.length;
    const host = $('routeList');
    host.replaceChildren();
    for (const item of routed) {
      const li = document.createElement('li');
      const name = document.createElement('strong');
      name.textContent = specialists.find(s => s.id === item.id)?.label || item.id;
      const why = document.createElement('span');
      why.textContent = item.reason;
      li.append(name, why);
      host.appendChild(li);
    }
  }

  /* ---------------- answers ---------------- */
  function answerCard(answer) {
    const card = document.createElement('article');
    card.className = 'answer' + (answer.ok ? '' : ' failed');
    const head = document.createElement('div'); head.className = 'answer-head';
    const title = document.createElement('h2'); title.textContent = answer.label || answer.id;
    const ms = document.createElement('span'); ms.className = 'ms'; ms.textContent = `${answer.ok ? '✓' : '✕'} ${answer.ms} ms`;
    head.append(title, ms);
    const why = document.createElement('p'); why.className = 'why'; why.textContent = 'Why this specialist: ' + answer.reason;
    const body = document.createElement('pre'); body.className = 'answer-body';
    body.textContent = answer.ok ? answer.output : 'This specialist failed: ' + answer.error;
    card.append(head, why, body);
    if (answer.trace) {
      const trace = document.createElement('p'); trace.className = 'trace';
      trace.textContent = `${answer.trace.attempted ?? answer.trace.toolCalls} attempted · ${answer.trace.toolCalls} successful tool result(s) · ${answer.trace.failures} failure(s) · tools with results: ${answer.trace.tools.join(', ') || 'none'}`;
      card.appendChild(trace);
    }
    if (answer.needsProvider) {
      const note = document.createElement('p'); note.className = 'needs';
      note.textContent = answer.trace?.failures
        ? 'A tool step failed; review it before retrying. This panel did not call a cloud model; provider configuration was not checked here.'
        : 'This panel did not call a cloud model. Some requests need generated prose; provider configuration was not checked here.';
      card.appendChild(note);
    }
    if (answer.action) {
      const note = document.createElement('p'); note.className = 'needs';
      note.textContent = 'This is an unsaved proposal. Use JalalAi or JARVIS to prepare and confirm the save; this panel cannot confirm it.';
      card.appendChild(note);
    }
    const actions = document.createElement('div'); actions.className = 'answer-actions';
    const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'btn small'; copy.textContent = 'Copy';
    copy.onclick = async () => { try { await navigator.clipboard.writeText(body.textContent); copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy'; }, 1200); } catch { copy.textContent = 'Copy failed'; } };
    const read = document.createElement('button'); read.type = 'button'; read.className = 'btn small'; read.textContent = '🔊 Read';
    read.onclick = () => speak(body.textContent);
    actions.append(copy, read);
    if (answer.ok) card.appendChild(actions);
    return card;
  }

  function speak(text) {
    if (!window.speechSynthesis) { setStatus('This browser cannot speak; the text stays available.'); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(text).slice(0, 3000));
    if (window.AJSpeech) window.AJSpeech.apply(utterance, { lang: navigator.language || 'en-US' });
    window.speechSynthesis.speak(utterance);
  }

  async function ask(prompt) {
    prompt = String(prompt || $('prompt').value).trim();
    if (!user) { setStatus('Sign in first.'); return; }
    if (busy || !prompt) return;
    invalidateRoute(); busy = true; updateControls();
    $('answers').replaceChildren();
    setStatus('Asking every specialist that fits… Stop cancels the wait.');
    controller = new AbortController();
    const requestController = controller;
    const timeout = setTimeout(() => requestController.abort(), 60000);
    try {
      const body = { prompt };
      if (chosen.size) body.only = [...chosen];
      const panel = await api('/assistant/all/answer', { method: 'POST', body: JSON.stringify(body), signal: controller.signal });
      renderRoute(panel.routed);
      const host = $('answers');
      host.replaceChildren();
      const summary = document.createElement('p');
      summary.className = 'answer-summary';
      summary.textContent = `${panel.counts.specialists} specialist(s) answered in ${panel.durationMs} ms · ${panel.counts.ok} ok · ${panel.counts.failed} failed · no external model called.`;
      host.appendChild(summary);
      for (const answer of panel.answers) host.appendChild(answerCard(answer));
      const limits = document.createElement('ul');
      limits.className = 'panel-limits';
      for (const line of panel.limits) { const li = document.createElement('li'); li.textContent = line; limits.appendChild(li); }
      host.appendChild(limits);
      setStatus(panel.counts.failed ? `Finished with ${panel.counts.failed} failed specialist(s) — see the cards.` : `Finished · ${panel.counts.specialists} specialist(s).`);
    } catch (error) {
      if (error.name === 'AbortError') setStatus('Stopped waiting. The server may still finish the request.');
      else setStatus(error.status === 429 ? 'That is a lot of requests — wait a minute and try again.' : error.message);
    } finally {
      clearTimeout(timeout); busy = false; controller = null; updateControls();
    }
  }

  /* ---------------- specialist picker ---------------- */
  function renderPicker() {
    const host = $('picker');
    host.replaceChildren();
    for (const specialist of specialists) {
      const label = document.createElement('label');
      label.className = 'pick';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.value = specialist.id;
      box.onchange = () => {
        invalidateRoute();
        if (box.checked) chosen.add(specialist.id); else chosen.delete(specialist.id);
        if (chosen.size > 4) { box.checked = false; chosen.delete(specialist.id); setStatus('Pick at most four specialists.'); }
        $('routeHint').textContent = chosen.size ? `Answering only with: ${[...chosen].join(', ')}` : 'Preview routing sends this text to the app only when you tap Preview.';
        updateControls();
      };
      const text = document.createElement('span');
      text.innerHTML = '';
      const strong = document.createElement('strong'); strong.textContent = specialist.label;
      const note = document.createElement('small'); note.textContent = specialist.note;
      text.append(strong, note);
      label.append(box, text);
      host.appendChild(label);
    }
    $('pickerPanel').hidden = specialists.length === 0;
  }

  /* ---------------- voice ---------------- */
  function stopListening() {
    if (recognition) { const stopping = recognition; recognition = null; stopping.onstart = stopping.onresult = stopping.onend = stopping.onerror = null; try { stopping.abort(); } catch { /* stopped */ } }
    listening = false; updateControls();
  }

  function startListening() {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) { setStatus('Voice input is not supported in this browser (try Chrome or Edge). Type instead.'); return; }
    stopListening();
    recognition = new Speech(); recognition.lang = navigator.language || 'en-US'; recognition.interimResults = true; recognition.continuous = false;
    recognition.onstart = () => { listening = true; setStatus('Listening… speak your request.'); updateControls(); };
    recognition.onresult = event => {
      const transcript = Array.from(event.results).map(result => result[0].transcript).join(' ').trim();
      invalidateRoute(); $('prompt').value = transcript; updateControls();
      if (event.results[event.results.length - 1].isFinal) { stopListening(); setStatus('Heard you. Review the text, then send.'); }
    };
    recognition.onerror = event => { stopListening(); setStatus(event.error === 'not-allowed' ? 'Microphone permission denied — type instead.' : `Voice input failed (${event.error}). You can still type.`); };
    recognition.onend = () => { listening = false; updateControls(); };
    try { recognition.start(); } catch { stopListening(); setStatus('The microphone could not start. Type your request.'); }
  }

  /* ---------------- session ---------------- */
  async function signIn() {
    const session = await api('/me'); csrf = session.csrfToken;
    if (!session.authenticated) {
      user = null; $('loginBanner').hidden = false;
      const health = await api('/health');
      $('demoBtn').hidden = !health.localPreview;
      $('loginMessage').textContent = health.localPreview ? 'Disposable preview: use test data only.' : 'Sign in with your account to use the panel.';
      $('connectionStatus').textContent = health.localPreview ? 'Local preview · not production' : 'Secure account required';
      setStatus(health.localPreview ? 'Choose “Try the local preview” to start.' : 'Sign in to begin.');
      updateControls(); return;
    }
    user = session.user;
    $('loginBanner').hidden = true;
    const catalogue = await api('/assistant/all/specialists');
    specialists = catalogue.specialists || [];
    renderPicker();
    $('connectionStatus').textContent = `Connected · ${user.username}`;
    setStatus(`Ready · ${specialists.length} specialists available. Type a request.`);
    updateControls();
  }

  /* ---------------- wiring ---------------- */
  $('askForm').onsubmit = event => { event.preventDefault(); ask(); };
  $('prompt').addEventListener('input', () => { invalidateRoute(); updateControls(); });
  $('previewRouteBtn').onclick = previewRoute;
  $('prompt').addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); ask(); }
  });
  document.querySelectorAll('[data-prompt]').forEach(button => button.onclick = () => { invalidateRoute(); $('prompt').value = button.dataset.prompt; updateControls(); ask(); });
  $('voiceBtn').onclick = () => { if (listening) { stopListening(); setStatus('Microphone stopped.'); } else startListening(); };
  $('stopBtn').onclick = () => { stopListening(); if (controller) { controller.abort(); setStatus('Stopped waiting. The server may still finish the request.'); } else setStatus('Microphone stopped.'); };
  $('demoBtn').onclick = async () => { $('demoBtn').disabled = true; try { await api('/demo', { method: 'POST', body: '{}' }); await signIn(); } catch (error) { setStatus(error.message); } finally { $('demoBtn').disabled = false; } };
  window.addEventListener('pagehide', () => { stopListening(); controller?.abort(); });
  if (window.AJSpeech) window.AJSpeech.refresh();

  if (window.AJ_STATIC_HOST) {
    $('loginBanner').hidden = false; $('demoBtn').hidden = true;
    $('loginMessage').textContent = 'Static website preview: the panel needs the secure application server. Open the secure app, or run npm run dev locally.';
    $('connectionStatus').textContent = 'Static preview · backend not connected';
    setStatus('Open the secure app or local preview to use the panel.');
    updateControls();
  } else signIn().catch(error => {
    $('connectionStatus').textContent = 'Connection unavailable';
    setStatus(error.message);
    $('loginBanner').hidden = false;
    $('loginMessage').textContent = 'The server could not be reached. Reload once the application server is running.';
  });
})();
