import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');
const [hostMode, index, guide, guideJs, agentJs, jalalaiJs, preview, workspace, dashboard, sw, widget] = await Promise.all([
  read('assets/host-mode.js'), read('index.html'), read('guide.html'), read('assets/guide.js'),
  read('assets/agent.js'), read('assets/jalalai.js'), read('assets/preview-entry.js'),
  read('workspace.html'), read('dashboard.html'), read('sw.js'), read('components/AIWidget/AIWidget.js')
]);

test('static host detection is loaded before page scripts on primary surfaces', () => {
  for (const html of [index, guide, workspace, dashboard]) {
    assert.ok(html.includes('assets/host-mode.js'));
    assert.ok(html.indexOf('assets/host-mode.js') < html.indexOf('</head>'));
  }
  assert.ok(hostMode.includes("const STATIC_PACKAGE = false;"));
  assert.ok(hostMode.includes("location.hostname.endsWith('.github.io')"));
  assert.ok(hostMode.includes('window.AJ_STATIC_HOST'));
  assert.ok(hostMode.includes('ajStaticHostBanner'));
});

test('homepage login explains static hosting instead of posting to a missing API', () => {
  assert.ok(index.includes('if(window.AJ_STATIC_HOST)'));
  assert.ok(index.includes('static website copy cannot sign in'));
  assert.ok(index.includes('id="togglePassword"'));
  assert.ok(index.includes('Social sign-in is not enabled in this build'));
});

test('assistant, agent, guide, preview, workspace and widget guard static hosts', () => {
  assert.ok(agentJs.includes('if (window.AJ_STATIC_HOST)'));
  assert.ok(jalalaiJs.includes('if (window.AJ_STATIC_HOST)'));
  assert.ok(guideJs.includes('if (window.AJ_STATIC_HOST)'));
  assert.ok(preview.includes('if (window.AJ_STATIC_HOST) return;'));
  assert.ok(workspace.includes("apiUrl:window.AJ_STATIC_HOST?'':location.origin"));
  assert.ok(workspace.includes('Static website preview: sign-in needs'));
  assert.ok(dashboard.includes('Static website preview: this dashboard needs'));
  assert.ok(widget.includes('window.AJ_STATIC_HOST'));
});

test('service worker cache is bumped and includes host-mode helper', () => {
  assert.ok(sw.includes("const CACHE='aj-v162-provider-status'"));
  assert.ok(sw.includes("'./assets/host-mode.js'"));
  assert.ok(sw.includes("'./assets/speech-preferences.js'"));
  assert.ok(sw.includes("new URL('api/',self.location).pathname"));
  for (const asset of ['guide.css?v=160', 'visual-system.css?v=160', 'preview-entry.js?v=160']) {
    assert.ok(sw.includes(`'./assets/${asset}'`), `${asset} should be available offline`);
  }
  assert.ok(guide.includes('assets/guide.css?v=160'));
  assert.ok(index.includes('assets/visual-system.css?v=162'));
  assert.ok(sw.includes("'./assets/visual-system.css?v=162'"));
  assert.ok(guide.includes('assets/visual-system.css?v=160'));
  for (const html of [index, workspace]) assert.ok(html.includes('assets/preview-entry.js?v=160'));
});
