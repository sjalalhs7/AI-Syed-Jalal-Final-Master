import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (name) => readFile(new URL(name, root), 'utf8');
const [workspace, dashboard, projects, visualLibrary, sitemap] = await Promise.all([
  read('workspace.html'), read('dashboard.html'), read('projects.html'),
  read('visual-library.html'), read('sitemap.xml')
]);

test('private application pages are excluded from search indexing', () => {
  assert.ok(workspace.includes('name="robots" content="noindex,nofollow"'));
  assert.ok(dashboard.includes('name="robots" content="noindex,nofollow"'));
});

test('retired project and duplicate library pages redirect to active destinations', () => {
  assert.ok(projects.includes("location.replace('dashboard.html')"));
  assert.ok(visualLibrary.includes("location.replace('visual-styles.html')"));
  assert.ok(projects.includes('noindex,follow'));
  assert.ok(visualLibrary.includes('noindex,follow'));
});

test('sitemap contains only active public pages', () => {
  assert.ok(sitemap.includes('https://ai-syed-jalal-live.pages.dev/'));
  assert.ok(sitemap.includes('/roadmaps.html'));
  assert.ok(sitemap.includes('/visual-styles.html'));
  for (const path of ['projects.html', 'visual-library.html', 'workspace.html', 'dashboard.html']) {
    assert.equal(sitemap.includes(path), false);
  }
});
