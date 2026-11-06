'use strict';
/*
 * Shared browser-speech voice preference.
 *
 * Every read-aloud surface (Workspace dock, Workspace main prompt, JalalAi and
 * Agent Studio) resolves its voice through this one module so the user picks a
 * voice once and it is honoured everywhere and remembered across visits.
 *
 * Privacy: this only configures the browser's own speech engine. It performs no
 * network requests and never reads or stores spoken text.
 */
(() => {
  if (window.AJSpeech) return;

  const KEY = 'aj-speech-voice-v1';
  // The first voice selector shipped with this key; keep the user's choice.
  const LEGACY_KEYS = ['jalalai-speech-voice-v1'];
  const SELECTOR = 'select[data-aj-voice]';
  const CHANGE_EVENT = 'aj-speech-voice-change';
  const supported = 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';

  const WN_KEY = 'aj-speech-voice-v1';
  function wnGet() { try { const pairs = String(window.name || '').split(';').filter(Boolean); for (const p of pairs) { const eq = p.indexOf('='); if (eq >= 0 && p.slice(0, eq) === WN_KEY) return p.slice(eq + 1); } } catch {}; return ''; }
  function wnSet(value) { try { const pairs = String(window.name || '').split(';').filter(p => !p.startsWith(WN_KEY + '=')); pairs.push(WN_KEY + '=' + value); window.name = pairs.join(';'); } catch {} }
  const storage = {
    get(key) { try { return wnGet() || window.localStorage.getItem(key) || window.sessionStorage.getItem(key) || cookieGet(key) || ''; } catch { return ''; } },
    set(key, value) { wnSet(value); try { window.localStorage.setItem(key, value); } catch {}; try { window.sessionStorage.setItem(key, value); } catch {}; try { document.cookie = key + '=' + encodeURIComponent(value) + '; path=/; max-age=31536000; SameSite=Lax'; } catch {} },
  };
  function cookieGet(key) {
    const m = document.cookie.match(new RegExp('(?:^|; )' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }

  let memoryPreference = '';
  let migrated = false;

  function migrateLegacyPreference() {
    if (migrated) return '';
    migrated = true;
    for (const key of LEGACY_KEYS) {
      const value = storage.get(key);
      if (value) { memoryPreference = value; storage.set(KEY, value); return value; }
    }
    return '';
  }

  function preferredId() {
    return storage.get(KEY) || memoryPreference || migrateLegacyPreference();
  }

  const voiceId = voice => `${voice.name}|${voice.lang}`;
  const normalise = value => String(value || '').replace(/_/g, '-').toLowerCase();

  function list() {
    if (!supported) return [];
    try { return window.speechSynthesis.getVoices() || []; } catch { return []; }
  }

  /*
   * Precedence: an explicitly chosen voice wins (a voice can only reliably speak
   * its own language), otherwise fall back to the requested language, then to
   * the base language, then to the browser default.
   */
  function resolve(lang) {
    const voices = list();
    if (!voices.length) return null;
    const wanted = preferredId();
    if (wanted) {
      const chosen = voices.find(voice => voiceId(voice) === wanted);
      if (chosen) return chosen;
    }
    const requested = normalise(lang);
    if (!requested) return null;
    return voices.find(voice => normalise(voice.lang) === requested)
      || voices.find(voice => normalise(voice.lang).split('-')[0] === requested.split('-')[0])
      || null;
  }

  function apply(utterance, options = {}) {
    if (!utterance) return utterance;
    const requested = options.lang || window.navigator?.language || 'en-US';
    const voice = resolve(requested);
    if (voice) { utterance.voice = voice; utterance.lang = voice.lang; }
    else utterance.lang = requested;
    return utterance;
  }

  function setPreferred(id) {
    memoryPreference = String(id || '');
    storage.set(KEY, memoryPreference);
    syncSelects();
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { id: memoryPreference } }));
  }

  function fillSelect(select) {
    const current = select.value || preferredId();
    select.replaceChildren(new Option('System default', ''));
    for (const voice of list()) select.add(new Option(`${voice.name} (${voice.lang})`, voiceId(voice)));
    const known = [...select.options].some(option => option.value === current);
    select.value = known ? current : '';
    // Persist an explicitly chosen voice across page navigations via window.name.
    // This self-heals if the change/input event did not fire (e.g. programmatic
    // selection) so the preference survives a subsequent page navigation.
    if (select.value && select.value !== preferredId() && [...select.options].some(o => o.value === select.value)) {
        setPreferred(select.value);
    }
    select.title = list().length
      ? 'Used by every read-aloud button in this application.'
      : 'Your browser has not exposed named voices yet; the default voice is used.';
  }

  // Avoid dispatching change events while reconciling an unavailable voice.
  function setPreferredQuiet(id) {
    memoryPreference = String(id || '');
    storage.set(KEY, memoryPreference);
  }

  function syncSelects() {
    for (const select of document.querySelectorAll(SELECTOR)) {
      if (select.dataset.ajVoiceReady === 'unsupported') continue;
      const wanted = preferredId();
      if ([...select.options].some(option => option.value === wanted)) select.value = wanted;
    }
  }

  function markUnsupported(select) {
    select.dataset.ajVoiceReady = 'unsupported';
    select.replaceChildren(new Option('Speech not supported in this browser', ''));
    select.disabled = true;
    select.setAttribute('aria-disabled', 'true');
    select.title = 'This browser has no speech synthesis. Replies stay available as text.';
  }

  function populate(select) {
    if (!select || select.dataset.ajVoiceBound === 'true') return;
    select.dataset.ajVoiceBound = 'true';
    if (!supported) { markUnsupported(select); return; }
    select.dataset.ajVoiceReady = 'ready';
    fillSelect(select);
    select.addEventListener('change', () => setPreferred(select.value));
    select.addEventListener('input', () => setPreferred(select.value));
  }

  function refresh() {
    if (!supported) return;
    for (const select of document.querySelectorAll(SELECTOR)) {
      if (select.dataset.ajVoiceBound !== 'true') populate(select);
      else if (select.dataset.ajVoiceReady !== 'unsupported') fillSelect(select);
    }
  }

  window.AJSpeech = Object.freeze({ supported, voiceId, list, preferredId, setPreferred, resolve, apply, populate, refresh });

  if (!supported) {
    const bindAll = () => document.querySelectorAll(SELECTOR).forEach(populate);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindAll, { once: true });
    else bindAll();
    return;
  }

  function start() {
    refresh();
    window.speechSynthesis.addEventListener('voiceschanged', refresh);
    // Some engines populate getVoices() asynchronously without firing
    // voiceschanged, so poll briefly instead of leaving an empty list forever.
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (list().length || attempts >= 10) { window.clearInterval(timer); if (list().length) refresh(); }
    }, 250);
    // Persist explicitly chosen voices across page navigations via window.name.
    // This self-heals if change/input events did not fire, ensuring the preference
    // survives a subsequent page navigation (e.g. JalalAi → Workspace).
    let persistAttempts = 0;
    const persistTimer = window.setInterval(() => {
      persistAttempts += 1;
      for (const select of document.querySelectorAll(SELECTOR)) {
        if (select.dataset.ajVoiceBound !== 'true') continue;
        const val = select.value;
        if (val && val !== preferredId()) {
          setPreferred(val);
        }
      }
      if (persistAttempts >= 40) window.clearInterval(persistTimer);
    }, 100);
  }

  window.addEventListener('storage', event => { if (event.key === KEY) syncSelects(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
