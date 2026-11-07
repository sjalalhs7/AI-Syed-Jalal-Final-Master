'use strict';
/*
 * pwa-surfaces.js — the browser-facing half of the app's OS integration.
 *
 * Everything the web app manifest *declares* (shortcuts, file handlers, launch
 * handler, protocol handlers, share target, widgets, side panel, window controls
 * overlay, tabbed display, note taking) is only a declaration. This module is
 * what the pages do with it once the operating system actually delivers a file,
 * a share, a link or a note, and it is what the capabilities page reports from.
 *
 * Honesty rules that shape the code below:
 *  - Every detector answers "what can THIS browser do right now", never "what
 *    the manifest asked for". The capability page must not imply support that
 *    the current device does not have.
 *  - Incoming content is held in memory for the length of the visit. Nothing is
 *    written to storage until the person presses Save, because a shared file or
 *    link is not consent to persist it.
 *  - No network requests. Reading a launched file is local by definition.
 */
(() => {
  if (window.AJSurfaces) return;

  const MAX_PREVIEW_BYTES = 512 * 1024;
  const TEXT_TYPES = /^(text\/|application\/(json|xml|x-yaml|yaml))/i;

  const supported = fn => typeof fn === 'function';

  function media(query) {
    try { return window.matchMedia(query).matches; } catch { return false; }
  }

  // ---------------------------------------------------------------- install --
  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', event => {
    // Keep the event so a visible, labelled button can trigger the real prompt.
    event.preventDefault();
    installPrompt = event;
    window.dispatchEvent(new CustomEvent('aj-install-available'));
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    window.dispatchEvent(new CustomEvent('aj-installed'));
  });

  async function promptInstall() {
    if (!installPrompt) return { outcome: 'unavailable' };
    const event = installPrompt;
    installPrompt = null;
    event.prompt();
    const choice = await event.userChoice.catch(() => ({ outcome: 'dismissed' }));
    return choice;
  }

  // ------------------------------------------------------------ detectors ----
  function displayMode() {
    const modes = ['tabbed', 'window-controls-overlay', 'standalone', 'minimal-ui', 'fullscreen', 'browser'];
    return modes.find(mode => media(`(display-mode: ${mode})`)) || 'browser';
  }

  // A detector returns true (proven available), false (proven unavailable) or
  // null (the platform exposes no way to ask — the OS decides). The third state
  // exists so the capability page never dresses a guess up as a measurement.
  function detect() {
    const nav = navigator;
    const titlebar = nav.windowControlsOverlay;
    let titlebarArea = null;
    if (titlebar && titlebar.visible && titlebar.getTitlebarAreaRect) {
      const rect = titlebar.getTitlebarAreaRect();
      titlebarArea = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }
    const chromium = /Chrome|Chromium|Edg|SamsungBrowser/.test(nav.userAgent);
    return {
      installed: displayMode() !== 'browser',
      displayMode: displayMode(),
      installPromptAvailable: Boolean(installPrompt),
      standalone: media('(display-mode: standalone)') || Boolean(nav.standalone),
      // launchQueue is the API that makes shortcuts and OS launches observable.
      shortcuts: 'launchQueue' in window,
      fileHandlers: supported(window.showOpenFilePicker) && 'launchQueue' in window,
      launchHandler: 'launchQueue' in window,
      protocolHandlers: supported(nav.registerProtocolHandler),
      // Receiving a share is decided by the OS share sheet; the page can only
      // prove it lives in an engine that implements the manifest member.
      shareTarget: supported(nav.canShare) ? Boolean(nav.canShare) : (chromium ? null : false),
      // Rendering happens in the widget host, outside this document.
      widgets: null,
      edgeSidePanel: Boolean(nav.userAgentData ? /Edg/i.test(nav.userAgent) : /Edg\//.test(nav.userAgent)),
      windowControlsOverlay: titlebar ? Boolean(titlebar.visible) : false,
      titlebarArea,
      tabbed: media('(display-mode: tabbed)'),
      noteTaking: null,
      serviceWorker: 'serviceWorker' in nav && Boolean(nav.serviceWorker.controller),
    };
  }

  // ------------------------------------------------------- incoming content --
  // One in-memory inbox per document. Pages read it once, then the entry can be
  // cleared; nothing here survives a reload, which is the intended privacy
  // property for a file or a share that arrived from another app.
  const inbox = { files: [], share: null, protocol: null, seen: false };

  async function readFileHandle(handle) {
    const file = await handle.getFile();
    const entry = { name: file.name || 'shared file', size: file.size, type: file.type || '', text: null, truncated: false, note: '' };
    if (!file.size) { entry.text = ''; return entry; }
    if (file.size > MAX_PREVIEW_BYTES) { entry.truncated = true; entry.note = 'File is larger than 512 KB; only the first part is shown.'; }
    if (entry.type && !TEXT_TYPES.test(entry.type) && !/\.(txt|md|markdown|json|csv|log|ya?ml)$/i.test(entry.name)) {
      entry.note = 'Not a text file, so its contents are not read here.';
      return entry;
    }
    const blob = file.size > MAX_PREVIEW_BYTES ? file.slice(0, MAX_PREVIEW_BYTES) : file;
    entry.text = await blob.text();
    return entry;
  }

  function describeShare(params) {
    const share = {
      title: (params.get('title') || '').slice(0, 300),
      text: (params.get('text') || '').slice(0, 4000),
      url: (params.get('url') || '').slice(0, 2000),
    };
    return share.title || share.text || share.url ? share : null;
  }

  function consumeLaunchQueue() {
    if (!('launchQueue' in window) || !supported(window.launchQueue.setConsumer)) return Promise.resolve(inbox);
    return new Promise(resolve => {
      let settled = false;
      const done = () => { if (!settled) { settled = true; resolve(inbox); } };
      // Some browsers never call the consumer when a normal navigation (not an
      // OS launch) opened the page; do not let the page wait on it forever.
      setTimeout(done, 1200);
      window.launchQueue.setConsumer(async launchParams => {
        inbox.seen = true;
        if (launchParams.targetURL) {
          try { inbox.protocol = new URL(launchParams.targetURL); } catch { /* ignore malformed */ }
        }
        for (const handle of launchParams.files || []) {
          try { inbox.files.push(await readFileHandle(handle)); }
          catch (error) { inbox.files.push({ name: 'shared file', size: 0, type: '', text: null, truncated: false, note: 'The file could not be read: ' + (error.message || 'unknown error') }); }
        }
        done();
      });
    });
  }

  // ---------------------------------------------------------- window chrome --
  function applyWindowControls() {
    const titlebar = navigator.windowControlsOverlay;
    const root = document.documentElement;
    const sync = () => {
      root.classList.toggle('aj-wco', Boolean(titlebar && titlebar.visible));
      document.dispatchEvent(new CustomEvent('aj-titlebar-change', { detail: detect() }));
    };
    if (titlebar && titlebar.addEventListener) titlebar.addEventListener('geometrychange', sync);
    sync();
  }

  // Tabbed mode: the home tab keeps its own scope, so the app's own navigation
  // must be real navigations rather than URL rewrites. Nothing to do for
  // multi-document navigation, but a page can react to the mode here.
  function applyDisplayMode() {
    document.documentElement.dataset.ajDisplayMode = displayMode();
  }

  // --------------------------------------------------------------- protocol --
  function readProtocolUrl() {
    const raw = new URLSearchParams(location.search).get('url');
    if (!raw) return null;
    let url;
    try { url = new URL(raw); } catch { return { raw, valid: false, href: '', scheme: '' }; }
    return { raw, valid: true, href: url.href, scheme: url.protocol.replace(':', ''), host: url.hostname };
  }

  async function rememberLastNote(note) {
    // Only used to make the New note shortcut show what was saved last. Text is
    // stored only after an explicit Save, never on arrival.
    try { localStorage.setItem('aj-notes-last-saved-v1', JSON.stringify({ at: new Date().toISOString(), preview: String(note).slice(0, 120) })); } catch { /* private mode */ }
  }

  const api = {
    supported,
    detect,
    promptInstall,
    consumeLaunchQueue,
    readFileHandle,
    describeShare,
    readProtocolUrl,
    rememberLastNote,
    inbox: () => inbox,
    installAvailable: () => Boolean(installPrompt),
    // Format inferred from a URL, used by the protocol handler to say what kind
    // of link arrived without fetching it.
    describeProtocol: readProtocolUrl,
  };

  window.AJSurfaces = api;
  window.addEventListener('DOMContentLoaded', () => { applyDisplayMode(); applyWindowControls(); }, { once: true });
})();
