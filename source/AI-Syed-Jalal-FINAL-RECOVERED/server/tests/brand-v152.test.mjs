import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The V152 SJS wordmark was intentionally superseded by the owner's request
// to restore the earlier crowned SJ mark. Keep the brand gate, but enforce the
// current decision rather than blocking it.
const root = dirname(fileURLToPath(import.meta.url));
const frontend = join(root, '..', '..', 'frontend');
const read = file => readFileSync(join(frontend, file), 'utf8');
const manifest = JSON.parse(read('manifest.webmanifest'));
const pages = readdirSync(frontend).filter(name => name.endsWith('.html') && !/^google/.test(name));
const androidIcon = join(root, '..', '..', '..', '..', 'android/app/src/main/res/drawable-nodpi/ic_launcher.png');
const pngSize = file => { const bytes = readFileSync(file); return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }; };

test('the original crowned SJ SVG and favicon are the same accessible artwork', () => {
  const crown = read('assets/approved-sj-rainbow-crown.svg');
  assert.match(crown, /^<svg[^>]+viewBox="0 0 512 512"/);
  assert.match(crown, /<title[^>]*>SJ — Syed Jalal<\/title>/);
  assert.match(crown, /gold crown/i);
  assert.doesNotMatch(crown, /SJS/);
  assert.equal(read('assets/brand/favicon.svg'), crown);
});

test('every page uses the crowned SJ mark and a complete icon set', () => {
  const offenders = [];
  for (const page of pages) {
    const html = read(page);
    if (!html.includes('assets/approved-sj-rainbow-crown.svg')) offenders.push(`${page}: no SJ crown`);
    if (!html.includes('rel="apple-touch-icon"')) offenders.push(`${page}: no apple-touch-icon`);
    if (!html.includes('favicon.svg')) offenders.push(`${page}: no SVG favicon`);
    if (html.includes('assets/brand/sjs-logo.svg')) offenders.push(`${page}: old SJS mark still wired`);
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('PWA and Android icon pixels match their declared sizes and brand', () => {
  for (const [file, size] of [['icon-192.png',192],['icon-512.png',512],['icon-maskable-512.png',512],['apple-touch-icon-180.png',180],['favicon-32.png',32],['favicon-16.png',16]]) {
    const path = join(frontend, 'assets/app-icons', file);
    assert.ok(existsSync(path), `${file} is missing`);
    assert.deepEqual(pngSize(path), { width:size, height:size });
  }
  for (const icon of manifest.icons) {
    const path = join(frontend, icon.src.replace('./', ''));
    assert.ok(existsSync(path), `manifest icon missing: ${icon.src}`);
    if (icon.type === 'image/png') assert.equal(`${pngSize(path).width}x${pngSize(path).height}`, icon.sizes);
  }
  assert.ok(manifest.icons.some(i => i.src === 'assets/approved-sj-rainbow-crown.svg'));
  assert.ok(manifest.icons.some(i => i.src === 'assets/app-icons/icon-maskable-512.png' && i.purpose === 'maskable'));
  assert.deepEqual(readFileSync(androidIcon), readFileSync(join(frontend, 'assets/app-icons/icon-512.png')), 'Android and web use the same rendered crown');
  const renderer = readFileSync(join(root, '..', '..', 'scripts/render-sj-brand.mjs'), 'utf8');
  assert.match(renderer, /maskable \? 72 : 86/, 'maskable artwork stays inside the 80% safe zone');
});

test('social previews use the new 1200 by 630 SJ card', () => {
  const card = join(frontend, 'assets/brand/sj-social-1200x630.png');
  assert.deepEqual(pngSize(card), { width:1200, height:630 });
  assert.ok(read('index.html').includes('assets/brand/sj-social-1200x630.png'));
  assert.ok(!read('index.html').includes('sjs-og-1200x630.png'));
});

test('new brand, theme and greeting assets are precached with a fresh version', () => {
  const sw = read('sw.js');
  for (const file of ['./assets/approved-sj-rainbow-crown.svg','./assets/brand/favicon.svg','./assets/app-icons/icon-512.png','./assets/visual-system.css','./assets/visual-theme.js','./assets/jarvis-welcome.js']) assert.ok(sw.includes(file), `${file} is not precached`);
  assert.ok(sw.includes("const CACHE='aj-v165-agent-evidence'"));
  assert.ok(sw.includes("k.startsWith('aj-v')&&k!==CACHE"), 'activation must not delete other applications’ origin caches');
});
