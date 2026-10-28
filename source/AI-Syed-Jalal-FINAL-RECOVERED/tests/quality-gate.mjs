import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const frontend = path.join(root, 'frontend');
const html = await fs.readFile(path.join(frontend, 'index.html'), 'utf8');
const css = await fs.readFile(path.join(frontend, 'assets/v101-palette.css'), 'utf8');
const logo = await fs.readFile(path.join(frontend, 'assets/approved-sj-rainbow-crown.svg'), 'utf8');
const guide = await fs.readFile(path.join(frontend, 'intelligence-evolution.html'), 'utf8');

assert.match(html, /<html lang="en">/i, 'homepage language is declared');
assert.match(html, /name="viewport"/i, 'homepage includes a responsive viewport');
assert.match(html, /rel="canonical"/i, 'homepage includes canonical metadata');
assert.match(html, /assets\/v101-palette\.css/, 'approved responsive stylesheet is loaded');
assert.match(html, /assets\/web-logo\.svg/, 'approved crowned SJ logo is loaded');
assert.match(html, /id="login"/i, 'existing login interface remains present');
assert.match(html, /AIWidget\.js/, 'AI widget module remains wired');
assert.match(html, /manifest\.webmanifest/, 'PWA manifest remains linked');

for (const utility of ['.auto-fit-grid', '.fluid-type', '.container-query', 'prefers-reduced-motion']) {
  assert.ok(css.includes(utility), `responsive utility exists: ${utility}`);
}
assert.match(logo, /<title\b/i, 'brand logo has an accessible title');

for (const topic of ['id="ai"', 'id="genai"', 'id="agi"', 'id="asi"', 'id="oi"']) {
  assert.ok(guide.includes(topic), `intelligence guide section exists: ${topic}`);
}
assert.match(guide, /HYPOTHETICAL/i, 'guide marks AGI/ASI as hypothetical');
assert.match(guide, /not five proven stages/i, 'guide avoids presenting the labels as proven sequential stages');

console.log('Project quality gate: PASS (19 assertions)');
