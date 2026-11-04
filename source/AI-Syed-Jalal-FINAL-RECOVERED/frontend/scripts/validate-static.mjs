import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const required = ['index.html', 'assets/v101-palette.css', 'assets/web-logo.svg', 'assets/app-logo.svg', 'assets/approved-sj-rainbow-crown.svg', 'manifest.webmanifest', 'sw.js', 'assets/ai-widget.js', 'guide.html', 'assets/guide.js', 'assets/guide.css', 'agent.html', 'assets/agent.js', 'assets/agent.css', 'assets/host-mode.js', 'assets/speech-preferences.js', 'agent-lab.html', 'assets/agent-lab.js', 'assets/agent-lab.css', 'config/agent-skill-index.json'];
const missing = required.filter((p) => !existsSync(join(root, p)));
assert.deepEqual(missing, [], `Missing required frontend files: ${missing.join(', ')}`);

const html = read('index.html');
const css = read('assets/v101-palette.css');
const logo = read('assets/approved-sj-rainbow-crown.svg');
const manifest = JSON.parse(read('manifest.webmanifest'));
const guide = read('guide.html');
const agent = read('agent.html');
const checks = [
  ['quick-start guide is linked from homepage', /href=["']guide\.html["']/.test(html)],
  ['quick-start guide explains local and cloud modes', /Local tools work now/.test(guide) && /server-side provider key/.test(guide)],
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
  ['Agent Studio linked from homepage', /href=["']agent\.html["']/.test(html)],
  ['Agent Lab self-check page is linked from the homepage', /href=["']agent-lab\.html["']/.test(html)],
  ['Agent Lab ships a runnable self-check with honest limits', read('agent-lab.html').includes('id="runBtn"') && read('assets/agent-lab.js').includes("'/agent/self-check'") && read('agent-lab.html').includes('What this page does and does not prove')],
  ['Agent Lab page is excluded from precache like the other private shells', !read('sw.js').includes("'./agent-lab.html'") && read('sw.js').includes("endsWith('/agent-lab.html')")],
  ['Agent Studio has Direct/Agent/Compare modes', /data-mode="chat"/.test(agent) && /data-mode="agent"/.test(agent) && /data-mode="compare"/.test(agent)],
  ['Agent Studio keeps private shell out of precache', !read('sw.js').includes("'./agent.html'") && read('sw.js').includes("url.pathname.endsWith('/agent.html')")],
  ['static-host login guard is shipped', read('assets/host-mode.js').includes('window.AJ_STATIC_HOST') && html.includes('assets/host-mode.js')],
  ['one shared speech voice preference reaches every read-aloud surface', ['workspace.html', 'jalalai.html', 'agent.html'].every(p => read(p).includes('assets/speech-preferences.js') && read(p).includes('data-aj-voice')) && read('assets/jalalai.js').includes('window.AJSpeech.apply') && read('assets/agent.js').includes('window.AJSpeech.apply')],
  ['no orphaned main-prompt wiring remains in the workspace', !read('workspace.html').includes('mainPrompt')],
  ['GitHub Pages workflow publishes the frontend', existsSync(join(root, '../../../.github/workflows/pages.yml')) && readFileSync(join(root, '../../../.github/workflows/pages.yml'), 'utf8').includes('source/AI-Syed-Jalal-FINAL-RECOVERED/frontend')],
];
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
const failed = checks.filter(([, ok]) => !ok);
if (failed.length) process.exitCode = 1;
else console.log(`\nAll ${checks.length} static checks passed.`);
