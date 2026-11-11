import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const frontend = join(source, 'frontend');
const read = file => readFileSync(join(frontend, file), 'utf8');

test('all entry pages load the opening welcome once and retain shared speech preferences', () => {
  const pages = readdirSync(frontend).filter(name => name.endsWith('.html') && name !== '404.html' && !/^google/.test(name));
  assert.ok(pages.length >= 20);
  for (const page of pages) {
    const html = read(page);
    assert.equal((html.match(/<script\s+[^>]*src="assets\/jarvis-welcome\.js\?v=157"/g) || []).length, 1, `${page}: greeting module`);
    assert.equal((html.match(/<script\s+[^>]*src="assets\/speech-preferences\.js\?v=164"/g) || []).length, 1, `${page}: shared voice preferences`);
    assert.ok(html.includes('assets/jarvis-welcome.css?v=156'), `${page}: welcome styles`);
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
  assert.doesNotMatch(js, /speechSynthesis|SpeechSynthesisUtterance|AJSpeech/, 'browser preferences must not replace the selected welcome voice');
  assert.match(js, /jarvis-welcome-ur-pk\.mp3\?v=157/, 'the selected recording must be cache-busted');
  assert.match(read('assets/jarvis.js'), /AJWelcome\?\.interruptForAssistant\(\)/);
});

test('the recorded voice and versioned assets are available offline', () => {
  const audio = readFileSync(join(frontend, 'assets/jarvis-welcome-ur-pk.mp3'));
  assert.ok(audio.length > 10000 && audio.length < 1000000);
  assert.ok(audio.subarray(0, 3).toString('ascii') === 'ID3' || (audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0), 'must be MP3 data');
  assert.equal(createHash('sha256').update(audio).digest('hex'), 'da3d9fea1b3762ad162454439886cd66f8bff67109f8fdaaa1a74a8c3d29b8d3', 'keep the actual recording selected by the owner');
  const sw = read('sw.js');
  for (const asset of ['jarvis-welcome-ur-pk.mp3?v=157', 'jarvis-welcome.js?v=157', 'jarvis-welcome.css?v=156']) assert.ok(sw.includes(asset), `${asset}: not precached`);
  assert.ok(sw.includes("const CACHE='aj-v172-voice-providers'"));
  assert.ok(sw.includes("'./assets/guide.js?v=159'"));
  assert.ok(read('guide.html').includes('assets/guide.js?v=159'));
  assert.ok(sw.includes("k.startsWith('aj-v')&&k!==CACHE"));
  assert.match(readFileSync(join(source, 'server/dev.mjs'), 'utf8'), /'\.mp3': 'audio\/mpeg'/);
});
