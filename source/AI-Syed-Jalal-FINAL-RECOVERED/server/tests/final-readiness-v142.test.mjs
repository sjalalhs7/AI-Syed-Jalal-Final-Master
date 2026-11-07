import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { AGENT_TOOLS } from '../../frontend/functions/agent-runtime.mjs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * V142 — release readiness gate.
 *
 * "Final" is a claim like any other, so it gets a test. This suite fails if the
 * published site can strand a visitor: a content page nobody links to, a local
 * link that 404s, a private shell with no static-host explanation, or a page in
 * the inventory that does not exist.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const frontend = join(root, 'frontend');
const read = path => readFileSync(join(frontend, path), 'utf8');

// Search-console verification files are not pages a visitor navigates to.
const pages = readdirSync(frontend).filter(name => name.endsWith('.html') && !/^google[0-9a-f]+\.html$/.test(name));

function linksIn(html) {
  return [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
}

test('every local link on every page resolves to a file that exists', () => {
  const broken = [];
  for (const page of pages) {
    for (const href of linksIn(read(page))) {
      if (/^(https?:|mailto:|tel:|#|\?)/.test(href)) continue;
      const clean = href.split('#')[0].split('?')[0];
      if (!clean) continue;
      if (!existsSync(join(frontend, clean))) broken.push(`${page} → ${href}`);
    }
  }
  assert.deepEqual(broken, [], `dangling local links:\n${broken.join('\n')}`);
});

test('no content page is stranded — every one is reachable from another page', () => {
  const linked = new Set();
  for (const page of pages) for (const href of linksIn(read(page))) linked.add(href.split('#')[0].split('?')[0]);
  // Small redirect stubs are intentionally unlinked; 404 and the search-console
  // file are served by the platform, not by navigation.
  const allowed = new Set(['404.html', 'google53679754f9cff285.html', 'projects.html', 'visual-library.html']);
  const stranded = pages.filter(page => page !== 'index.html' && !allowed.has(page) && !linked.has(page) && statSync(join(frontend, page)).size > 800);
  assert.deepEqual(stranded, [], `content pages nobody can reach:\n${stranded.join('\n')}`);
});

test('every page that needs the backend explains the static host instead of hanging', () => {
  // These pages call the API on load. On GitHub Pages there is no API, so each
  // must detect window.AJ_STATIC_HOST and say something actionable.
  const apiPages = ['toolbench.html', 'pagebuilder.html', 'allinone.html', 'arena.html', 'critic.html', 'agent.html', 'agent-lab.html', 'jalalai.html', 'jarvis.html', 'workspace.html', 'dashboard.html'];
  const missing = [];
  for (const page of apiPages) {
    assert.ok(existsSync(join(frontend, page)), `${page} is missing`);
    const html = read(page);
    assert.match(html, /host-mode\.js/, `${page} does not load the static-host guard`);
    const scripts = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map(match => match[1]).filter(file => !file.startsWith('http') && existsSync(join(frontend, file)));
    const js = [html, ...scripts.map(file => read(file))].join('\n');
    if (!/AJ_STATIC_HOST/.test(js)) missing.push(page);
  }
  assert.deepEqual(missing, [], `pages that would hang or throw on GitHub Pages:\n${missing.join('\n')}`);
});

test('every page opens and closes cleanly and declares its language', () => {
  for (const page of pages) {
    const html = read(page);
    assert.match(html, /^\s*<!doctype html>/i, `${page} has no doctype`);
    assert.match(html, /<html[^>]+lang="[a-z-]+"/i, `${page} has no lang attribute`);
    assert.match(html, /<\/html>\s*$/i, `${page} does not close </html>`);
    assert.match(html, /<title>[^<]{3,}<\/title>/i, `${page} has no title`);
    assert.match(html, /name="viewport"/i, `${page} has no viewport`);
  }
});

test('the page inventory matches the files on disk', () => {
  const source = readFileSync(join(frontend, 'functions/agent-routes.mjs'), 'utf8');
  const listed = [...source.matchAll(/\{ file: '([a-z0-9.-]+\.html)'/g)].map(match => match[1]);
  assert.ok(listed.length >= 14, 'the inventory should list every shipped page');
  const absent = listed.filter(file => !existsSync(join(frontend, file)));
  assert.deepEqual(absent, [], `inventory lists files that do not exist:\n${absent.join('\n')}`);
});

test('the service worker never caches a private shell', () => {
  const sw = read('sw.js');
  const privatePages = ['jalalai.html', 'workspace.html', 'dashboard.html', 'agent.html', 'agent-lab.html', 'arena.html', 'jarvis.html', 'critic.html', 'refactor-plan.html', 'allinone.html', 'toolbench.html', 'pagebuilder.html'];
  for (const page of privatePages) {
    assert.ok(sw.includes(`endsWith('/${page}')`), `${page} is not excluded from the service worker`);
    assert.ok(!sw.includes(`'./${page}'`), `${page} must not be precached`);
  }
});

test('no shipped page claims a capability the code does not have', () => {
  // Language that would be an overclaim if a provider key is absent or an
  // integration was never connected.
  const banned = [
    [/\b(full|complete) clone of (arena\.ai|chatgpt|claude)\b/i, 'claims to be a clone of another product'],
    [/\bwe are (arena\.ai|chatgpt|openai)\b/i, 'claims another company identity'],
    [/\bfully (GDPR|HIPAA|SOC ?2) compliant\b/i, 'claims a compliance certification'],
    [/\b100% (secure|accurate|reliable)\b/i, 'claims perfection'],
    // Only a positive claim counts: "WhatsApp: Not integrated" is the honest form.
    [/\b(gmail|calendar|whatsapp)\b[^.]{0,40}(?<!not )(?<!n't )\b(is |are )?(connected|integrated)\b/i, 'claims a third-party integration']
  ];
  const violations = [];
  for (const page of pages) {
    const html = read(page);
    for (const [pattern, reason] of banned) {
      const match = pattern.exec(html);
      if (match) violations.push(`${page}: ${reason} → “${match[0]}”`);
    }
  }
  assert.deepEqual(violations, [], `overclaims found:\n${violations.join('\n')}`);
});

test('every advertised surface is linked from the guide, and the guide is linked everywhere', () => {
  const guide = read('guide.html');
  const surfaces = ['jalalai.html', 'agent.html', 'arena.html', 'allinone.html', 'toolbench.html', 'pagebuilder.html', 'critic.html', 'jarvis.html', 'agent-lab.html', 'workspace.html', 'dashboard.html', 'roadmaps.html', 'visual-styles.html', 'intelligence-evolution.html', 'refactor-plan.html'];
  const unlisted = surfaces.filter(page => !guide.includes(page));
  assert.deepEqual(unlisted, [], `the guide does not mention:\n${unlisted.join('\n')}`);
  // The guide must itself be reachable from the primary navigation pages.
  for (const page of ['index.html', 'jalalai.html', 'arena.html', 'allinone.html', 'toolbench.html', 'pagebuilder.html']) {
    assert.ok(read(page).includes('guide.html'), `${page} does not link the guide`);
  }
});

test('no page states a tool count that contradicts the published runtime', () => {
  // Toolbench shipped "Twelve deterministic tools" for a release after the count
  // became thirteen. A wrong number in the copy is a small lie, so the count must
  // either be derived at runtime or omitted.
  const words = { four: 4, seven: 7, eight: 8, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15 };
  const numberFor = token => {
    const key = token.toLowerCase();
    if (key in words) return words[key];
    const parsed = Number(key);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const pattern = /\b([a-z]+|\d+)\s+(?:deterministic\s+)?(?:agent\s+)?tools\b/gi;
  const stale = [];
  for (const page of pages) {
    for (const match of read(page).matchAll(pattern)) {
      const number = numberFor(match[1]);
      if (number !== null && number !== AGENT_TOOLS.length) {
        stale.push(`${page}: “${match[0]}” but the runtime publishes ${AGENT_TOOLS.length}`);
      }
    }
  }
  assert.deepEqual(stale, [], `stale tool counts:\n${stale.join('\n')}`);
});

test('the sitemap lists exactly the pages that are not marked noindex', () => {
  // Most application pages are deliberately noindex. The sitemap must therefore
  // contain the public pages and nothing else — listing an app page invites
  // Google to index something we asked it not to, and listing 3 of 15 pages
  // hides most of the product.
  const frontend = new URL('../../frontend/', import.meta.url);
  const files = readdirSync(frontend).filter(f => f.endsWith('.html')
    && f !== '404.html' && !f.startsWith('google'));
  const publicPages = files.filter(f => !readFileSync(new URL(f, frontend), 'utf8').includes('noindex'));

  const sitemap = readFileSync(new URL('sitemap.xml', frontend), 'utf8');
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  const listed = new Set(locs.map(l => { const path = new URL(l).pathname; return path === '/' ? 'index.html' : path.replace(/^\//, '') + '.html'; }));

  assert.deepEqual([...listed].sort(), [...publicPages].sort(),
    'sitemap and noindex tags disagree');

  // Structured data must be valid JSON or search engines ignore it silently.
  const index = readFileSync(new URL('index.html', frontend), 'utf8');
  const ld = /application\/ld\+json">([\s\S]*?)<\/script>/.exec(index);
  assert.ok(ld, 'landing page has no JSON-LD');
  assert.equal(JSON.parse(ld[1])['@type'], 'WebApplication');
});
