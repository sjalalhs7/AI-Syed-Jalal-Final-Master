'use strict';
/*
 * Shared browser-speech voice preference.
 *
 * Every read-aloud surface (Workspace dock, Workspace main prompt, JalalAi and
 * Agent Studio) resolves its voice through this one module so the user picks a
 * voice once and it is honoured everywhere and remembered across visits.
 *
 * Privacy: this only configures the browser's own speech engine. It performs no
 * network requests and never reads or stores spoken text. The browser's speech
 * service may still process audio or read-aloud text under its own terms.
 */
(() => {
  if (window.AJSpeech) return;

  const KEY = 'aj-speech-voice-v1';
  // The first voice selector shipped with this key; keep the user's choice.
  const LEGACY_KEYS = ['jalalai-speech-voice-v1'];
  const SELECTOR = 'select[data-aj-voice]';
  const CHANGE_EVENT = 'aj-speech-voice-change';
  const supported = Boolean(window.speechSynthesis && typeof window.SpeechSynthesisUtterance === 'function');

  const storage = {
    get(key) { try { return window.localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { window.localStorage.setItem(key, value); } catch { /* private mode: keep in-memory only */ } },
  };

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
    const saved = storage.get(KEY);
    // An intentionally selected system default is an empty string, not a
    // missing preference. Do not resurrect the old voice on the next visit.
    return saved !== null ? saved : (memoryPreference || migrateLegacyPreference());
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
    const current = preferredId();
    const voices = list();
    select.replaceChildren(new Option('System default', ''));
    for (const voice of voices) select.add(new Option(`${voice.name} (${voice.lang})`, voiceId(voice)));
    const known = [...select.options].some(option => option.value === current);
    // Device voice lists can be incomplete or differ across devices. Preserve
    // the user's saved choice until they explicitly choose another one.
    if (!known && current) {
      const unavailable = new Option(`Saved voice unavailable: ${current}`, current);
      unavailable.disabled = true;
      select.add(unavailable);
    }
    select.value = current;
    select.title = !known && current
      ? 'Your saved voice is unavailable here; a matching language or the system default may be used until it returns.'
      : voices.length ? 'Used by every read-aloud button in this application.'
      : 'Your browser has not exposed named voices yet; the default voice is used.';
  }

  function syncSelects() {
    for (const select of document.querySelectorAll(SELECTOR)) {
      if (select.dataset.ajVoiceReady === 'unsupported') continue;
      const wanted = preferredId();
      if ([...select.options].some(option => option.value === wanted)) select.value = wanted;
      else fillSelect(select);
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
    window.speechSynthesis.addEventListener?.('voiceschanged', refresh);
    // Some engines populate getVoices() asynchronously without firing
    // voiceschanged, so poll briefly instead of leaving an empty list forever.
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (list().length || attempts >= 10) { window.clearInterval(timer); if (list().length) refresh(); }
    }, 250);
  }

  window.addEventListener('storage', event => { if (event.key === KEY) syncSelects(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
