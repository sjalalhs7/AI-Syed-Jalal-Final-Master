import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * V152 — brand gate.
 *
 * A logo is only professional if it survives every place it is used. These tests
 * hold the SJS identity to that: one mark, every page wired to it, an icon set
 * that exists at the sizes stated, and small-size and print variants that are
 * not just recoloured copies of the big one.
 */

const root = dirname(fileURLToPath(import.meta.url));
const frontend = join(root, '..', '..', 'frontend');
const read = file => readFileSync(join(frontend, file), 'utf8');
const manifest = JSON.parse(read('manifest.webmanifest'));
const pages = readdirSync(frontend).filter(name => name.endsWith('.html') && !/^google/.test(name));

function pngSize(file) {
  const bytes = readFileSync(file);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test('the SJS brand assets exist and are real vector art', () => {
  for (const file of ['brand/sjs-logo.svg', 'brand/sjs-mark.svg', 'brand/sjs-maskable.svg', 'brand/sjs-mono.svg', 'brand/sjs-compact.svg', 'brand/favicon.svg']) {
    const svg = read(`assets/${file}`);
    assert.match(svg, /^<svg[^>]+viewBox="0 0 512 512"/, `${file} must be a 512 viewBox SVG`);
    assert.match(svg, /<title/, `${file} needs an accessible title`);
    assert.match(svg, /SJS|<text/, `${file} must carry the SJS wordmark`);
  }
  // The monochrome cut is for print and must not depend on a gradient.
  const mono = read('assets/brand/sjs-mono.svg');
  assert.ok(!mono.includes('url(#gold)') && !mono.includes('url(#emerald)'), 'the mono cut must not use brand gradients');
});

test('every page uses the SJS mark and a complete icon set', () => {
  const offenders = [];
  for (const page of pages) {
    const html = read(page);
    if (!html.includes('assets/brand/sjs-logo.svg')) offenders.push(`${page}: no SJS logo`);
    if (!html.includes('rel="apple-touch-icon"')) offenders.push(`${page}: no apple-touch-icon`);
    if (!html.includes('favicon.svg')) offenders.push(`${page}: no svg favicon`);
    if (/approved-sj-rainbow-crown/.test(html)) offenders.push(`${page}: still points at the retired logo`);
  }
  assert.deepEqual(offenders, [], `pages not on the SJS brand:\n${offenders.join('\n')}`);
});

test('the icon set matches the pixels it claims', () => {
  const expected = [
    ['assets/app-icons/icon-192.png', 192],
    ['assets/app-icons/icon-512.png', 512],
    ['assets/app-icons/icon-maskable-512.png', 512],
    ['assets/app-icons/apple-touch-icon-180.png', 180],
    ['assets/app-icons/favicon-32.png', 32],
    ['assets/app-icons/favicon-16.png', 16],
  ];
  for (const [file, size] of expected) {
    const path = join(frontend, file);
    assert.ok(existsSync(path), `${file} is missing`);
    const actual = pngSize(path);
    assert.equal(actual.width, size, `${file} is ${actual.width}px wide`);
    assert.equal(actual.height, size, `${file} is ${actual.height}px tall`);
  }
  // The manifest must reference files that exist at the declared size.
  for (const icon of manifest.icons) {
    const path = join(frontend, icon.src.replace('./', ''));
    assert.ok(existsSync(path), `manifest icon missing: ${icon.src}`);
    if (icon.type === 'image/png') assert.equal(`${pngSize(path).width}x${pngSize(path).height}`, icon.sizes, `${icon.src} size mismatch`);
  }
});

test('a compact cut exists for sizes where the full mark turns to noise', () => {
  // The full mark has orbits and sparkles that vanish below ~48 px, so the
  // favicon and apple-touch icon must come from the simplified cut.
  const compact = read('assets/brand/sjs-compact.svg');
  assert.ok(!compact.includes('ellipse'), 'the compact cut must drop the orbital rings');
  assert.ok(!compact.includes('dasharray'), 'the compact cut must drop the dashed orbit');
  assert.ok(compact.includes('font-size="228"'), 'the compact cut must enlarge the letters for small sizes');
});

test('the social card is a real 1200x630 image', () => {
  const card = join(frontend, 'assets/brand/sjs-og-1200x630.png');
  assert.ok(existsSync(card), 'the social card is missing');
  const { width, height } = pngSize(card);
  assert.equal(`${width}x${height}`, '1200x630');
  const index = read('index.html');
  assert.ok(index.includes('assets/brand/sjs-og-1200x630.png'), 'the homepage must point OG tags at the SJS card');
  assert.ok(!index.includes('ai-syed-jalal-social-card.jpg'), 'the retired social card must not still be referenced');
});

test('the brand assets are precached so an installed app still shows its logo offline', () => {
  const sw = read('sw.js');
  for (const file of ['./assets/brand/sjs-logo.svg', './assets/brand/sjs-compact.svg', './assets/brand/favicon.svg', './assets/app-icons/icon-512.png']) {
    assert.ok(sw.includes(file), `${file} is not precached`);
  }
  assert.ok(sw.includes("const CACHE='aj-v153-shell'"), 'the cache must be bumped when the brand changes');
});
