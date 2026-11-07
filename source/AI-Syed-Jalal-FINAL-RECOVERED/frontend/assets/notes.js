'use strict';
/*
 * notes.js — Quick Notes.
 *
 * This is the destination the operating system uses for four manifest features:
 * the "New note" shortcut, note_taking.new_note_url, the widget tap, and
 * file_handlers for .txt/.md. It is also reachable as a normal page.
 *
 * The rule that keeps this honest: arriving content is a draft in memory. It is
 * saved to the account only on an explicit press of "Save to workspace", and a
 * signed-out visitor can still capture and download a note without pretending
 * that anything was stored server-side.
 */
(() => {
  const $ = id => document.getElementById(id);
  const setStatus = text => { $('status').textContent = text; };
  const params = new URLSearchParams(location.search);
  let user = null, csrf = '', busy = false;

  async function api(path, options = {}) {
    const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(csrf && options.method && options.method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}), ...options.headers };
    const response = await fetch('/api' + path, { ...options, headers, credentials: 'same-origin', signal: AbortSignal.timeout(30000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.error || `Request failed (${response.status})`); error.status = response.status; throw error; }
    return data;
  }

  function setDraftState(text) { $('draftState').textContent = text; }
  function countChars() { $('charCount').textContent = `${$('noteText').value.length} / 4000`; }

  function announce(kind, text) {
    $('arrival').hidden = false;
    $('arrivalTitle').textContent = kind;
    $('arrivalBody').replaceChildren();
    const p = document.createElement('p');
    p.textContent = text;
    $('arrivalBody').appendChild(p);
  }

  // ------------------------------------------------------------- arrivals ----
  async function handleArrivals() {
    const surfaces = window.AJSurfaces;
    if (params.get('new') === '1') {
      setStatus('Blank note ready. Type, then choose Save to workspace or Download.');
      // Focus must happen on a user-ish gesture path; the timer works on
      // desktop launches where the page counts as one.
      setTimeout(() => $('noteText').focus(), 60);
    }
    if (!surfaces) return;

    const launch = await surfaces.consumeLaunchQueue();
    const files = launch.files || [];
    if (files.length) {
      const imported = files.map(file => {
        const header = file.truncated ? `\n\n[Truncated: ${file.note}]` : '';
        return `${file.text == null ? `[${file.name} — ${file.note || 'not read'}]` : file.text}${header}`;
      }).join('\n\n---\n\n').slice(0, 4000);
      $('noteText').value = imported;
      countChars();
      setDraftState(`Opened from a file the OS handed to the app (${files.map(f => f.name).join(', ')}).`);
      announce('File opened in this tab', `Read ${files.length === 1 ? 'one file' : files.length + ' files'} locally: ${files.map(f => f.name).join(', ')}. It is a draft until you save it. ${files.map(f => f.note).filter(Boolean).join(' ')}`.trim());
      setStatus('Imported into the editor. Nothing has been uploaded.');
    }

    // A protocol-handler launch can also carry the link as ?url=…; the
    // protocol page owns that surface, so only mention it here.
    const protocol = surfaces.readProtocolUrl();
    if (protocol) {
      announce('Link handed to the app', protocol.valid ? `An app opened this session with ${protocol.scheme}://${protocol.host || 'a link'}. Open the link page to review it.` : 'The app was opened with a link that could not be parsed.');
    }
  }

  // --------------------------------------------------------------- support ---
  function renderIntegration() {
    const surfaces = window.AJSurfaces;
    const list = $('integrationList');
    list.replaceChildren();
    const caps = surfaces ? surfaces.detect() : {};
    const rows = surfaces ? [
      ['Shortcuts', caps.shortcuts, 'New note, Start here, Workspace and Arena in the right-click / long-press menu.'],
      ['File handling', caps.fileHandlers, 'Open .txt or .md files from the OS file manager into this page.'],
      ['Note taking', caps.noteTaking, '“New note” from the OS stylus tools or context menu (ChromeOS).'],
      ['Widget', caps.widgets, 'The New note widget on the Windows 11 widgets board.'],
    ] : [['OS integration', false, 'The shared capability module did not load.']];
    for (const [name, ok, detail] of rows) {
      const li = document.createElement('li');
      const state = document.createElement('strong');
      state.textContent = ok === true ? 'Supported here' : ok === false ? 'Not available here' : 'OS decides';
      state.className = ok === true ? 'ok' : 'muted';
      const span = document.createElement('span');
      span.textContent = `${name}: ${detail}`;
      li.append(state, span);
      list.appendChild(li);
    }
    const importBtn = $('importBtn');
    if (surfaces && surfaces.supported(window.showOpenFilePicker)) importBtn.hidden = false;
  }

  // ------------------------------------------------------------- workspace ---
  // host-mode.js is a plain, deferred-exempt script in <head>, but this module
  // must not assume it has run: a false negative here would post to an API that
  // cannot exist on a static host.
  const onStaticHost = () => window.AJ_STATIC_HOST ?? /\.github\.io$/.test(location.hostname);

  async function signIn() {
    if (onStaticHost()) {
      setStatus('Static preview: notes can be written, copied and downloaded here. Saving to the workspace needs the secure application server.');
      $('connectionStatus').textContent = 'Static preview';
      $('recentIntro').textContent = 'Static preview: saved notes need the application server.';
      $('saveBtn').disabled = false;
      return;
    }
    try {
      const session = await api('/me');
      user = session.authenticated ? session.user : null;
      csrf = session.csrfToken || '';
    } catch { user = null; csrf = ''; }
    if (!user) {
      $('connectionStatus').textContent = 'Not signed in';
      $('recentIntro').textContent = 'Sign in to see the notes you saved.';
      setStatus('Sign in on the home page to save notes to your workspace. Copying and downloading work without an account.');
      return;
    }
    $('connectionStatus').textContent = 'Signed in as ' + user.username;
    setStatus('Signed in. Save stores this note against your account only.');
    await loadRecent();
  }

  async function loadRecent() {
    const list = $('recentNotes');
    list.replaceChildren();
    try {
      const data = await api('/assistant/state');
      const notes = (data.notes || []).slice(0, 8);
      $('recentIntro').textContent = notes.length ? 'Your last saved notes. Open one to reuse its text.' : 'No saved notes yet.';
      for (const note of notes) {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'linkish';
        button.textContent = note.content.length > 90 ? note.content.slice(0, 90) + '…' : note.content;
        button.onclick = () => { $('noteText').value = note.content; countChars(); setDraftState('Loaded a saved note into the editor. Saving again creates a new note.'); setStatus('Loaded a saved note. Editing it here does not change the saved copy.'); $('noteText').focus(); };
        li.appendChild(button);
        const del = document.createElement('button');
        del.type = 'button'; del.className = 'btn small danger'; del.textContent = 'Delete';
        del.setAttribute('aria-label', 'Delete this saved note');
        del.onclick = async () => {
          if (!window.confirm('Delete this saved note? This cannot be undone.')) return;
          del.disabled = true;
          try { await api(`/assistant/notes/${note.id}`, { method: 'DELETE' }); await loadRecent(); setStatus('Note deleted.'); }
          catch (error) { setStatus(error.message); del.disabled = false; }
        };
        li.appendChild(del);
        list.appendChild(li);
      }
    } catch (error) {
      $('recentIntro').textContent = 'Could not load saved notes: ' + error.message;
    }
  }

  async function save(text) {
    if (busy) return;
    if (onStaticHost()) {
      setStatus('Static preview: saving to the workspace needs the secure application server. Copy or download the note instead — it stays on this device.');
      return;
    }
    if (!user) {
      setStatus('Not saved: you are not signed in. Copy or download the note, or sign in on the home page and try again.');
      $('noteForm').reportValidity();
      return;
    }
    busy = true;
    const button = $('saveBtn');
    button.disabled = true;
    button.textContent = 'Saving…';
    try {
      await api('/assistant/confirm', { method: 'POST', body: JSON.stringify({ confirmed: true, action: { type: 'create_note', content: text } }) });
      window.AJSurfaces?.rememberLastNote(text);
      setStatus('Saved to your private workspace.');
      setDraftState('Saved. The editor keeps the text so you can keep working.');
      await loadRecent();
    } catch (error) {
      setStatus('Could not save: ' + error.message);
    } finally {
      busy = false;
      button.disabled = false;
      button.textContent = 'Save to workspace';
    }
  }

  function download(text) {
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `note-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.md`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function wire() {
    $('noteText').addEventListener('input', () => { countChars(); if (!busy) setDraftState('Draft stays in this tab until you save it.'); });
    $('noteForm').addEventListener('submit', event => { event.preventDefault(); const text = $('noteText').value.trim(); if (!text) { setStatus('Write something first.'); $('noteText').focus(); return; } save(text); });
    $('copyBtn').onclick = async () => {
      const text = $('noteText').value;
      if (!text.trim()) { setStatus('Nothing to copy yet.'); return; }
      try { await navigator.clipboard.writeText(text); setStatus('Copied to the clipboard.'); }
      catch { setStatus('The browser blocked clipboard access. Select the text and copy it manually.'); }
    };
    $('downloadBtn').onclick = () => {
      const text = $('noteText').value;
      if (!text.trim()) { setStatus('Nothing to download yet.'); return; }
      download(text);
      setStatus('Downloaded as a Markdown file. This stays on your device.');
    };
    $('clearBtn').onclick = () => {
      if ($('noteText').value.trim() && !window.confirm('Clear the editor? A saved note is not affected.')) return;
      $('noteText').value = '';
      countChars();
      setDraftState('Blank note. Nothing stored.');
      setStatus('Editor cleared.');
      $('noteText').focus();
    };
    $('importBtn').onclick = async () => {
      if (!window.showOpenFilePicker) return;
      try {
        const [handle] = await window.showOpenFilePicker({ types: [{ description: 'Text notes', accept: { 'text/plain': ['.txt', '.md', '.markdown'] } }], multiple: false });
        const entry = await window.AJSurfaces.readFileHandle(handle);
        $('noteText').value = `${entry.text == null ? '' : entry.text}`.slice(0, 4000);
        countChars();
        setDraftState(`Opened ${entry.name} locally.`);
        announce('File opened in this tab', `${entry.name} was read in this tab${entry.note ? '. ' + entry.note : '.'} It is a draft until you save it.`);
      } catch { /* the user closed the picker */ }
    };
    $('clearArrival').onclick = () => { $('arrival').hidden = true; };
    countChars();
    renderIntegration();
    signIn();
    handleArrivals();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire, { once: true });
  else wire();
})();
