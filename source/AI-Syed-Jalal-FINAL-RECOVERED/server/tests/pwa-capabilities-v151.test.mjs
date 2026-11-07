import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * V151 — OS integration gate.
 *
 * Ten manifest-level capabilities were added (shortcuts, file handlers, launch
 * handler, protocol handlers, share target, widgets, Edge side panel, window
 * controls overlay, tabbed display, note taking). Every one of them is a promise
 * made to an operating system, so each promise gets a test: the manifest must
 * parse, every URL it names must exist on disk, the private shells must stay out
 * of the service-worker cache, and the capability page must never claim support
 * that the current browser does not report.
 */

const root = dirname(fileURLToPath(import.meta.url));
const frontend = join(root, '..', '..', 'frontend');
const read = file => readFileSync(join(frontend, file), 'utf8');
const manifest = JSON.parse(read('manifest.webmanifest'));
const sw = read('sw.js');

const resolveInScope = url => join(frontend, url.replace(/^\.\//, '').split('?')[0].split('#')[0]);

// Width/height/type read from the real file bytes, so a wrong "sizes" string or
// a mislabelled MIME type fails the build instead of the install prompt.
function pngSize(file) {
  const bytes = readFileSync(file);
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG', `${file} is not a PNG`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), type: 'image/png' };
}

function jpegSize(file) {
  const bytes = readFileSync(file);
  assert.equal(bytes[0], 0xff, `${file} is not a JPEG`);
  assert.equal(bytes[1], 0xd8, `${file} is not a JPEG`);
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7), type: 'image/jpeg' };
    offset += 2 + bytes.readUInt16BE(offset + 2);
  }
  throw new Error(`${file} has no JPEG frame header`);
}

function assertSizeDeclared(entry) {
  const file = resolveInScope(entry.src);
  assert.ok(existsSync(file), `manifest points at a missing file: ${entry.src}`);
  const actual = entry.type === 'image/jpeg' ? jpegSize(file) : pngSize(file);
  assert.equal(entry.type, actual.type, `${entry.src} declares ${entry.type}`);
  // "any" is legitimate for SVG; raster art must state its real pixel size.
  if (entry.sizes !== 'any') assert.equal(entry.sizes, `${actual.width}x${actual.height}`, `${entry.src} declares ${entry.sizes}`);
  return actual;
}

test('the manifest parses and stays installable', () => {
  for (const key of ['id', 'name', 'short_name', 'start_url', 'scope', 'display', 'theme_color', 'background_color', 'icons']) {
    assert.ok(manifest[key], `manifest is missing ${key}`);
  }
  assert.equal(manifest.display, 'standalone');
  const sizes = manifest.icons.map(icon => icon.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'), 'install prompts require 192 and 512 raster icons');
  assert.ok(manifest.icons.some(icon => String(icon.purpose).includes('maskable')), 'Android needs a maskable icon');
  // Cross-check every declared icon against its real pixels.
  for (const icon of manifest.icons) {
    if (icon.type === 'image/svg+xml') { assert.ok(existsSync(resolveInScope(icon.src)), icon.src); continue; }
    assertSizeDeclared(icon);
  }
});

test('every screenshot the install prompt shows exists at the size it claims', () => {
  assert.ok(manifest.screenshots.length >= 2, 'rich install UI needs screenshots');
  assert.ok(manifest.screenshots.some(shot => shot.form_factor === 'wide'));
  assert.ok(manifest.screenshots.some(shot => shot.form_factor === 'narrow'), 'phones filter by form_factor: narrow');
  for (const shot of manifest.screenshots) {
    assertSizeDeclared(shot);
    assert.ok(shot.label && shot.label.length > 20, `${shot.src} needs a descriptive label`);
  }
});

test('shortcuts point at real pages and carry icons', () => {
  assert.ok(manifest.shortcuts.length >= 3);
  assert.ok(manifest.shortcuts.length <= 4, 'browsers show at most four shortcuts');
  const seen = new Set();
  for (const shortcut of manifest.shortcuts) {
    assert.ok(shortcut.name && shortcut.url, 'a shortcut needs a name and a url');
    assert.equal(existsSync(resolveInScope(shortcut.url)), true, `${shortcut.url} does not exist`);
    assert.ok(shortcut.url.startsWith('./'), 'shortcut urls must stay inside the manifest scope');
    assert.ok(!seen.has(shortcut.url), `${shortcut.url} is listed twice`);
    seen.add(shortcut.url);
    for (const icon of shortcut.icons || []) {
      assert.ok(existsSync(resolveInScope(icon.src)), icon.src);
      assertSizeDeclared(icon);
    }
  }
});

test('file handlers, launch handler, protocol handler, note taking and side panel are declared safely', () => {
  const [handler] = manifest.file_handlers;
  assert.ok(handler, 'file_handlers is missing');
  assert.ok(existsSync(resolveInScope(handler.action)), 'the file handler action must be a real page');
  const types = Object.keys(handler.accept);
  assert.ok(types.includes('text/plain'), 'plain text is the minimum useful file type here');
  for (const extensions of Object.values(handler.accept)) assert.ok(extensions.every(ext => ext.startsWith('.')));

  // navigate-existing reuses the window a desktop user already has.
  assert.equal(manifest.launch_handler.client_mode, 'navigate-existing');

  assert.ok(manifest.protocol_handlers.length >= 1);
  for (const protocol of manifest.protocol_handlers) {
    assert.match(protocol.protocol, /^web\+[a-z0-9.-]+$/, 'custom schemes must use the web+ prefix');
    assert.ok(protocol.url.includes('%s'), 'the handler URL must accept the escaped link');
    assert.ok(existsSync(resolveInScope(protocol.url)), protocol.url);
  }

  assert.ok(manifest.note_taking.new_note_url.startsWith('./'), 'new_note_url must be inside scope');
  assert.ok(existsSync(resolveInScope(manifest.note_taking.new_note_url)));

  assert.ok(manifest.edge_side_panel.preferred_width >= 320 && manifest.edge_side_panel.preferred_width <= 500);
});

test('the share target is a GET form the service worker will never cache', () => {
  const target = manifest.share_target;
  assert.equal(target.method, 'GET');
  assert.equal(target.enctype, 'application/x-www-form-urlencoded');
  assert.ok(existsSync(resolveInScope(target.action)), target.action);
  for (const field of ['title', 'text', 'url']) assert.ok(target.params[field], `share_target.params.${field} is required`);
  // A share carries someone's content; it must never be written to Cache Storage.
  assert.ok(sw.includes("url.pathname.endsWith('/share-target.html')"), 'share-target must be excluded from the service worker');
  assert.ok(!sw.includes("'./share-target.html'"), 'share-target must not be precached');
});

test('display_override asks for tabbed and window controls with a real fallback chain', () => {
  assert.equal(manifest.display_override[0], 'tabbed');
  assert.ok(manifest.display_override.includes('window-controls-overlay'));
  assert.ok(manifest.display_override.includes('minimal-ui'), 'the last entry must be a mode every engine supports');
  assert.ok(!manifest.display_override.includes('browser'), 'display already falls back to browser');
  assert.ok(manifest.tab_strip.home_tab.scope_patterns.some(pattern => String(pattern.pathname).includes('index.html')));
  assert.equal(existsSync(resolveInScope(manifest.tab_strip.new_tab_button.url)), true, 'the new-tab button must open a page that exists');
});

test('the widget definition resolves to real template, data and preview files', () => {
  const [widget] = manifest.widgets;
  assert.ok(widget, 'widgets is missing');
  for (const key of ['name', 'description', 'tag', 'template', 'ms_ac_template', 'screenshots']) assert.ok(widget[key], `widget.${key} is required`);
  const template = JSON.parse(readFileSync(resolveInScope(widget.ms_ac_template), 'utf8'));
  assert.equal(template.type, 'AdaptiveCard');
  // Every ${binding} in the template must exist in the data file, or the widget
  // renders literal "${title}" text on a user's desktop.
  const bindings = new Set([...JSON.stringify(template).matchAll(/\$\{([a-zA-Z0-9_]+)\}/g)].map(match => match[1]));
  const data = JSON.parse(readFileSync(resolveInScope(widget.data), 'utf8'));
  const missing = [...bindings].filter(key => !(key in data));
  assert.deepEqual(missing, [], `widget data is missing: ${missing.join(', ')}`);
  for (const shot of widget.screenshots) assertSizeDeclared(shot);
  for (const icon of widget.icons) assertSizeDeclared(icon);
  assert.ok('auth' in widget && widget.auth === false, 'this widget carries no account data, so auth must be false');
});

test('the service worker implements the widget lifecycle without caching private data', () => {
  for (const event of ['widgetinstall', 'widgetresume', 'widgetclick', 'widgetuninstall']) {
    assert.ok(sw.includes(`addEventListener('${event}'`), `service worker does not handle ${event}`);
  }
  assert.ok(!sw.includes("addEventListener('periodicsync'"), 'widgets must not register background sync');
  assert.ok(!sw.includes('periodicSync.register'), 'no new periodic job may be registered');
  assert.ok(sw.includes("periodicSync?.unregister('aj-widget-refresh')"), 'legacy refresh jobs are removed');
  assert.ok(sw.includes('self.widgets.updateByTag'), 'the widget must be rendered through the widget API');
  assert.ok(sw.includes('notes.html?new=1'), 'tapping the widget must open a new note');
  // The widget renders before sign-in, so it may not fetch account routes.
  const widgetSection = sw.slice(sw.indexOf('OS widgets'));
  assert.ok(!/fetch\([^)]*\/api\//.test(widgetSection), 'the widget must never fetch authenticated API routes');
});

test('one shared module owns capability detection, and it reports three states', () => {
  const surfaces = read('assets/pwa-surfaces.js');
  // null means "the platform exposes no way to ask"; true/false are measurements.
  assert.match(surfaces, /tabbed: null|noteTaking: null|widgets: null/);
  assert.match(read('capabilities.html'), /value === true \? true : value === false \? false : null/, 'the report must render the third state differently');
  for (const detector of ['windowControlsOverlay', 'registerProtocolHandler', 'launchQueue', 'showOpenFilePicker']) {
    assert.ok(surfaces.includes(detector), `detection does not look at ${detector}`);
  }
  // Pages must not re-implement detection.
  const page = read('capabilities.html');
  const notes = read('notes.html');
  for (const html of [page, notes]) assert.ok(html.includes('assets/pwa-surfaces.js'));
  assert.ok(!read('assets/notes.js').includes("'launchQueue' in window"), 'notes.js must use the shared detector');
});

test('the capability page states limits instead of overclaiming', () => {
  const page = read('capabilities.html');
  assert.ok(page.includes('Decided by the OS'), 'undetectable capabilities must say who decides');
  assert.ok(/does not expose the API/.test(page), 'unavailable capabilities must explain why');
  assert.ok(/ChromeOS/.test(page), 'tabbed display and note taking are ChromeOS features and must say so');
  assert.ok(/Windows 11/.test(page), 'widgets are Windows-only and must say so');
  assert.ok(/no page can query it/.test(page), 'the widget probe must admit it cannot be measured');
});

test('arriving content is never stored or sent before the person presses save', () => {
  const notes = read('assets/notes.js');
  const handlers = read('assets/pwa-handlers.js');
  const surfaces = read('assets/pwa-surfaces.js');
  // Nothing may write to storage while reading a launched file.
  const launchQueue = surfaces.slice(surfaces.indexOf('function consumeLaunchQueue'), surfaces.indexOf('// ---------------------------------------------------------- window chrome'));
  assert.ok(!/localStorage|sessionStorage|indexedDB/.test(launchQueue), 'a launched file must not be persisted on arrival');
  for (const script of [notes, handlers]) {
    assert.ok(script.includes('/assistant/confirm'), 'saving must go through the explicit confirmation route');
    assert.ok(script.includes("confirmed: true"), 'the confirmation payload must be explicit');
  }
  // The share hand-off to JalalAi fills the composer and never submits it.
  const jalalai = read('assets/jalalai.js');
  const handoff = jalalai.slice(jalalai.indexOf('function adoptHandoff'), jalalai.indexOf("$('chatForm').onsubmit"));
  assert.ok(handoff.includes("$('prompt').value"), 'the shared text must be placed in the composer');
  assert.ok(!/send\(\)/.test(handoff), 'the shared text must never be sent automatically');
});

test('inbound surfaces are excluded from the cache and reachable from the app', () => {
  assert.ok(sw.includes("url.pathname.endsWith('/notes.html')"), 'notes.html carries private drafts and must not be cached');
  assert.ok(!sw.includes("'./notes.html'"));
  assert.ok(sw.includes("'./capabilities.html'"), 'the capability page is public and may be precached');
  assert.ok(sw.includes("'./protocol.html'"));
  // Reachability: the guide lists every new surface, the homepage links notes.
  const guide = read('guide.html');
  for (const page of ['notes.html', 'share-target.html', 'capabilities.html']) assert.ok(guide.includes(page), `the guide does not list ${page}`);
  assert.ok(read('index.html').includes('notes.html'));
  assert.ok(read('jalalai.html').includes('notes.html'));
  // And the new pages link back, so no new surface is a dead end.
  for (const page of ['notes.html', 'share-target.html', 'protocol.html', 'capabilities.html']) {
    const html = read(page);
    assert.match(html, /href="guide.html"/, `${page} does not link the guide`);
    assert.match(html, /href="\/\."|href="\.\/"/, `${page} does not link home`);
  }
});

test('every new surface registers the shell worker with the identical snippet', () => {
  // Four pages inherited the same one-line registration. If one of them drifts,
  // that surface silently loses offline support, so they share one string.
  const snippet = /<script>if\('serviceWorker' in navigator&&location\.protocol\.startsWith\('http'\)\)navigator\.serviceWorker\.register\('sw\.js'\)\.catch\(\(\)=>\{\}\);<\/script>/;
  for (const page of ['notes.html', 'share-target.html', 'protocol.html', 'capabilities.html']) {
    assert.match(read(page), snippet, page + ' does not register the service worker the shared way');
  }
});

test('every precached asset exists, so the worker install cannot fail', () => {
  // cache.addAll() rejects as a unit if any URL 404s, which silently leaves the
  // app with no worker at all. A typo in this list is therefore a total outage
  // of offline support, not a cosmetic one.
  const inner = sw.match(/const ASSETS=\[([\s\S]*?)\];/)[1];
  const assets = [...inner.matchAll(/'([^']*)'/g)].map(match => match[1]);
  assert.ok(assets.length > 10, 'the precache list is suspiciously short');
  const missing = assets.filter(path => {
    // A cache-busting query changes the URL key, not the file on disk.
    const file = path.split(/[?#]/, 1)[0].replace(/^\.\//, '');
    return file && !existsSync(join(frontend, file));
  });
  assert.deepEqual(missing, [], `precached files that do not exist:\n${missing.join('\n')}`);
  // The public shells added in this release must be in the list; the private and
  // content-bearing ones must not be.
  for (const page of ['./capabilities.html', './protocol.html']) assert.ok(assets.includes(page), page + ' should be precached');
  for (const page of ['./notes.html', './share-target.html', './workspace.html']) assert.ok(!assets.includes(page), page + ' must never be precached');
});
