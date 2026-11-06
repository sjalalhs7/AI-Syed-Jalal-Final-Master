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

test('retired duplicate library pages redirect to active destinations', () => {
  assert.ok(visualLibrary.includes("location.replace('visual-styles.html')"));
  assert.ok(visualLibrary.includes('noindex,follow'));
});

test('projects page is a real catalogue page', () => {
  assert.ok(projects.includes('<title>Projects — AI-Syed Jalal Control Center</title>'));
  assert.ok(projects.includes('Superpower OpenGPT OmniRoute'));
  assert.ok(projects.includes('UX/UI Pro Max'));
  assert.ok(projects.includes('Expert Critic — Web Developer'));
  assert.ok(projects.includes('Awesome LLM Apps'));
  assert.ok(projects.includes('AgentScope'));
  assert.ok(projects.includes('OpenEMR'));
  assert.ok(!projects.includes('location.replace'), 'projects.html must not be a redirect');
});

test('sitemap contains only active public pages', () => {
  const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, value]) => new URL(value));
  assert.ok(sitemapUrls.some(url => url.origin === 'https://ai-syed-jalal-live.pages.dev' && url.pathname === '/'));
  assert.ok(sitemap.includes('/roadmaps.html'));
  assert.ok(sitemap.includes('/visual-styles.html'));
  for (const path of ['visual-library.html', 'workspace.html', 'dashboard.html']) {
    assert.equal(sitemap.includes(path), false);
  }
  assert.ok(sitemap.includes('/projects.html'), 'projects.html is a public catalogue page and must be in the sitemap');
});
