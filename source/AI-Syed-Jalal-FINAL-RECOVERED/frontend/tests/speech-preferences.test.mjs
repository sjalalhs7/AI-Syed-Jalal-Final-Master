import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');
const source = await read('assets/speech-preferences.js');
const KEY = 'aj-speech-voice-v1';

class FakeOption {
  constructor(text, value = '') { this.textContent = text; this.value = value; }
}

class FakeSelect {
  constructor() { this.dataset = {}; this.options = []; this.value = ''; this.disabled = false; this.attributes = {}; this.listeners = {}; this.title = ''; }
  replaceChildren(...options) {
    this.options = [...options];
    if (!this.options.some(option => option.value === this.value)) this.value = this.options[0]?.value ?? '';
  }
  add(option) { this.options.push(option); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  change(value) { this.value = value; for (const handler of this.listeners.change || []) handler({ target: this }); }
}

function harness({ supported = true, undefinedSynth = false, voices = [], stored = {}, selects = [] } = {}) {
  const store = new Map(Object.entries(stored));
  const state = { voices };
  const speechListeners = {}, windowListeners = {};
  const window = {
    localStorage: {
      getItem: key => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
    },
    speechSynthesis: {
      getVoices: () => state.voices,
      addEventListener: (type, handler) => { (speechListeners[type] ||= []).push(handler); },
    },
    SpeechSynthesisUtterance: function Utterance() {},
    navigator: { language: 'en-US' },
    addEventListener: (type, handler) => { (windowListeners[type] ||= []).push(handler); },
    dispatchEvent: () => true,
    setInterval: () => 1,
    clearInterval: () => {},
  };
  if (!supported) { delete window.speechSynthesis; delete window.SpeechSynthesisUtterance; }
  if (undefinedSynth) window.speechSynthesis = undefined;
  const document = { readyState: 'complete', querySelectorAll: () => selects, addEventListener: () => {} };
  const sandbox = {
    window, document, Option: FakeOption, console,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'speech-preferences.js' });
  return { api: window.AJSpeech, store, state, speechListeners, windowListeners };
}

const VOICES = [
  { name: 'Aisha', lang: 'ur-PK' },
  { name: 'Daniel', lang: 'en-GB' },
  { name: 'Samantha', lang: 'en-US' },
];

test('unsupported browsers get an explained, disabled control instead of a dead dropdown', () => {
  const select = new FakeSelect();
  const { api } = harness({ supported: false, selects: [select] });
  assert.equal(api.supported, false);
  assert.equal(select.disabled, true);
  assert.equal(select.attributes['aria-disabled'], 'true');
  assert.match(select.options[0].textContent, /not supported/i);
  assert.equal(api.list().length, 0);
});

test('an exposed but undefined speech synthesizer is treated as unsupported', () => {
  const select = new FakeSelect();
  const { api } = harness({ undefinedSynth: true, selects: [select] });
  assert.equal(api.supported, false);
  assert.equal(select.disabled, true);
});

test('named voices are listed and the remembered choice is restored', () => {
  const select = new FakeSelect();
  harness({ voices: VOICES, stored: { [KEY]: 'Daniel|en-GB' }, selects: [select] });
  assert.equal(select.options.length, VOICES.length + 1);
  assert.equal(select.options[0].value, '');
  assert.equal(select.value, 'Daniel|en-GB');
  assert.equal(select.disabled, false);
});

test('the original voice-selector preference is migrated, not discarded', () => {
  const select = new FakeSelect();
  const { store } = harness({ voices: VOICES, stored: { 'jalalai-speech-voice-v1': 'Aisha|ur-PK' }, selects: [select] });
  assert.equal(select.value, 'Aisha|ur-PK');
  assert.equal(store.get(KEY), 'Aisha|ur-PK');
});

test('an explicitly chosen voice is applied and speaks its own language', () => {
  const { api } = harness({ voices: VOICES, stored: { [KEY]: 'Aisha|ur-PK' } });
  const utterance = { lang: 'en-US' };
  api.apply(utterance, { lang: 'en-US' });
  assert.equal(utterance.voice.name, 'Aisha');
  assert.equal(utterance.lang, 'ur-PK');
});

test('without a chosen voice the requested language drives selection', () => {
  const { api } = harness({ voices: VOICES });
  const exact = { lang: '' };
  api.apply(exact, { lang: 'en-GB' });
  assert.equal(exact.voice.name, 'Daniel');

  const base = { lang: '' };
  api.apply(base, { lang: 'ur' });
  assert.equal(base.voice.name, 'Aisha');

  const unavailable = { lang: '' };
  api.apply(unavailable, { lang: 'fr-FR' });
  assert.equal(unavailable.voice, undefined);
  assert.equal(unavailable.lang, 'fr-FR');
});

test('changing the voice persists it and syncs every other selector', () => {
  const first = new FakeSelect(), second = new FakeSelect();
  const { store } = harness({ voices: VOICES, selects: [first, second] });
  first.change('Samantha|en-US');
  assert.equal(store.get(KEY), 'Samantha|en-US');
  assert.equal(second.value, 'Samantha|en-US');
});

test('an unavailable remembered voice is retained and can return later', () => {
  const select = new FakeSelect();
  const { store, api } = harness({ voices: VOICES, stored: { [KEY]: 'Removed|en-US' }, selects: [select] });
  assert.equal(select.value, 'Removed|en-US');
  assert.equal(store.get(KEY), 'Removed|en-US');
  assert.equal(api.preferredId(), 'Removed|en-US');
  assert.match(select.options.at(-1).textContent, /unavailable/i);
  assert.equal(api.resolve('ur-PK').name, 'Aisha');
  select.change('');
  assert.equal(store.get(KEY), '', 'only an explicit choice clears the preference');
});

test('voices that arrive asynchronously are picked up without a page reload', () => {
  const select = new FakeSelect();
  const { state, speechListeners } = harness({ voices: [], selects: [select] });
  assert.equal(select.options.length, 1);
  state.voices = VOICES;
  for (const handler of speechListeners.voiceschanged || []) handler();
  assert.equal(select.options.length, VOICES.length + 1);
});

test('a saved voice survives an initially empty browser voice list', () => {
  const select = new FakeSelect();
  const { api, store, state, speechListeners } = harness({ voices: [], stored: { [KEY]: 'Aisha|ur-PK' }, selects: [select] });
  assert.equal(store.get(KEY), 'Aisha|ur-PK');
  assert.equal(select.value, 'Aisha|ur-PK');
  assert.match(select.options.at(-1).textContent, /unavailable/i);
  state.voices = VOICES;
  for (const handler of speechListeners.voiceschanged || []) handler();
  assert.equal(select.value, 'Aisha|ur-PK');
  assert.equal(api.preferredId(), 'Aisha|ur-PK');
});

test('choosing system default does not resurrect the legacy voice after reload', () => {
  const select = new FakeSelect();
  const first = harness({ voices: VOICES, stored: { 'jalalai-speech-voice-v1': 'Daniel|en-GB' }, selects: [select] });
  select.change('');
  const second = harness({ voices: VOICES, stored: Object.fromEntries(first.store), selects: [new FakeSelect()] });
  assert.equal(second.api.preferredId(), '');
  assert.equal(second.api.resolve('en-US').name, 'Samantha');
});

test('every read-aloud surface resolves its voice through the shared module', async () => {
  const [workspace, jalalaiHtml, jalalaiJs, agentHtml, agentJs, sw] = await Promise.all([
    read('workspace.html'), read('jalalai.html'), read('assets/jalalai.js'),
    read('agent.html'), read('assets/agent.js'), read('sw.js'),
  ]);
  for (const [name, html] of [['workspace', workspace], ['jalalai', jalalaiHtml], ['agent', agentHtml]]) {
    assert.ok(html.includes('assets/speech-preferences.js'), `${name} must load the shared module`);
    assert.ok(html.includes('data-aj-voice'), `${name} must expose a shared voice selector`);
  }
  // Both Workspace read-aloud paths, not just the dock.
  assert.equal(workspace.match(/AJSpeech\.apply/g).length, 2);
  assert.ok(jalalaiJs.includes('window.AJSpeech.apply(speech'));
  assert.ok(agentJs.includes('window.AJSpeech.apply(speech'));
  // Agent Studio no longer forces English regardless of the user's language.
  assert.equal(agentJs.includes("speech.lang = 'en-US';"), false);
  // The duplicated inline selector is gone, so nothing competes for the preference.
  assert.equal(workspace.includes('jalalai-voice-selector'), false);
  assert.ok(sw.includes("'./assets/speech-preferences.js'"));
});
