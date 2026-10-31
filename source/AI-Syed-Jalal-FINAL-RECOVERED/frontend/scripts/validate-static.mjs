import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const required = ['index.html', 'assets/v101-palette.css', 'assets/web-logo.svg', 'assets/app-logo.svg', 'assets/approved-sj-rainbow-crown.svg', 'manifest.webmanifest', 'sw.js', 'assets/ai-widget.js'];
const missing = required.filter((p) => !existsSync(join(root, p)));
assert.deepEqual(missing, [], `Missing required frontend files: ${missing.join(', ')}`);

const html = read('index.html');
const css = read('assets/v101-palette.css');
const logo = read('assets/approved-sj-rainbow-crown.svg');
const manifest = JSON.parse(read('manifest.webmanifest'));
const checks = [
  ['homepage closes', /<\/html>\s*$/i.test(html)],
  ['viewport configured', /name=["']viewport["']/i.test(html)],
  ['canonical URL present', /rel=["']canonical["']/i.test(html)],
  ['Open Graph metadata present', /property=["']og:title["']/i.test(html)],
  ['stylesheet loaded', /assets\/v101-palette\.css/.test(html)],
  ['PWA manifest linked', /manifest\.webmanifest/.test(html)],
  ['service worker registration present', /serviceWorker\.register/.test(html)],
  ['responsive grid utility present', /\.auto-fit-grid/.test(css)],
  ['fluid type utility present', /\.fluid-type/.test(css)],
  ['container query present', /@container/.test(css)],
  ['reduced motion support present', /prefers-reduced-motion/.test(css)],
  ['approved rainbow SJ logo has accessible title', /<title id="title">SJ — Syed Jalal<\/title>/.test(logo)],
  ['PWA manifest points to available icon', Array.isArray(manifest.icons) && manifest.icons.length > 0 && manifest.icons.every((i) => existsSync(join(root, i.src)))],
  ['login modal preserved', /id=["']login["']/.test(html)],
  ['AI widget preserved', /AIWidget\.js/.test(html)],
];
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
const failed = checks.filter(([, ok]) => !ok);
if (failed.length) process.exitCode = 1;
else console.log(`\nAll ${checks.length} static checks passed.`);
