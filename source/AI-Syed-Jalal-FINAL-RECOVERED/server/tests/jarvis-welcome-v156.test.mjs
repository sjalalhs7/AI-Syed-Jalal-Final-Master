import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const frontend = join(source, 'frontend');
const read = file => readFileSync(join(frontend, file), 'utf8');

test('all entry pages load the opening welcome once with shared voice preferences', () => {
  const pages = readdirSync(frontend).filter(name => name.endsWith('.html') && name !== '404.html' && !/^google/.test(name));
  assert.ok(pages.length >= 20);
  for (const page of pages) {
    const html = read(page);
    assert.equal((html.match(/<script\s+[^>]*src="assets\/jarvis-welcome\.js\?v=156"/g) || []).length, 1, `${page}: greeting module`);
    assert.equal((html.match(/<script\s+[^>]*src="assets\/speech-preferences\.js"/g) || []).length, 1, `${page}: shared voice preferences`);
    assert.ok(html.includes('assets/jarvis-welcome.css?v=156'), `${page}: welcome styles`);
    assert.ok(html.indexOf('src="assets/speech-preferences.js"') < html.indexOf('src="assets/jarvis-welcome.js?v=156"'), `${page}: voice preference must load first`);
  }
  // A redirect should not start and immediately cut off the greeting.
  assert.ok(!read('404.html').includes('assets/jarvis-welcome.js'));
});

test('the requested transcript and Durood remain in the welcome without microphone access', () => {
  const js = read('assets/jarvis-welcome.js');
  const home = read('index.html');
  const phrase = 'Assalamualaikum kia haal hy apka Allah pak apko apni Aman main rakhay, ameen phir drood e pak prhiay.';
  const durood = 'Allahumma salli ala Muhammadin wa ala aali Muhammad.';
  for (const text of [phrase, durood]) { assert.ok(js.includes(text)); assert.ok(home.includes(text)); }
  assert.doesNotMatch(js, /getUserMedia|SpeechRecognition|fetch\s*\(/);
  assert.match(read('assets/jarvis.js'), /AJWelcome\?\.interruptForAssistant\(\)/);
});

test('the recorded voice and versioned assets are available offline', () => {
  const audio = readFileSync(join(frontend, 'assets/jarvis-welcome-ur-pk.mp3'));
  assert.ok(audio.length > 10000 && audio.length < 1000000);
  assert.ok(audio.subarray(0, 3).toString('ascii') === 'ID3' || (audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0), 'must be MP3 data');
  const sw = read('sw.js');
  for (const asset of ['jarvis-welcome-ur-pk.mp3', 'jarvis-welcome.js?v=156', 'jarvis-welcome.css?v=156']) assert.ok(sw.includes(asset), `${asset}: not precached`);
  assert.ok(sw.includes("const CACHE='aj-v156-jarvis-welcome'"));
  assert.ok(sw.includes("k.startsWith('aj-v')&&k!==CACHE"));
  assert.match(readFileSync(join(source, 'server/dev.mjs'), 'utf8'), /'\.mp3': 'audio\/mpeg'/);
});
