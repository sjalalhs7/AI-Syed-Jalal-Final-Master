import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { onRequest as verification } from '../../frontend/functions/google53679754f9cff285.html.js';

const root = new URL('../../frontend/', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8');
const base = 'https://ai-syed-jalal-live.pages.dev';
const sitemap = read('sitemap.xml');
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);

test('sitemap contains only unique public final URLs with matching canonicals', () => {
  assert.equal(urls.length, new Set(urls).size);
  assert.equal(urls.length, 5);
  for (const address of urls) {
    const url = new URL(address);
    assert.equal(url.origin, base);
    assert.equal(url.search, ''); assert.equal(url.hash, '');
    assert.ok(!url.pathname.endsWith('.html'), 'Cloudflare redirects .html URLs: ' + address);
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1) + '.html';
    const html = read(file);
    assert.doesNotMatch(html, /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i);
    const canonical = /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i.exec(html);
    assert.equal(canonical?.[1], address, file + ' must declare the URL listed in the sitemap');
  }
  const privatePages = ['jarvis.html', 'jalalai.html', 'agent.html', 'workspace.html', 'dashboard.html', 'guide.html'];
  for (const file of privatePages) {
    assert.match(read(file), /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i, file);
    assert.ok(!urls.some(url => url.endsWith('/' + file.replace(/\.html$/, ''))), file);
  }
  assert.match(read('index.html'), /href="about-jarvis\.html"/);
  assert.match(read('about-jarvis.html'), /href="jarvis\.html"/);
});

test('robots permits Google to discover sitemap and read private noindex directives', () => {
  const robots = read('robots.txt');
  assert.match(robots, /User-agent:\s*\*/i);
  assert.match(robots, /Allow:\s*\//i);
  assert.match(robots, new RegExp(`Sitemap:\\s*${base.replaceAll('.', '\\.')}\\/sitemap\\.xml`));
  assert.doesNotMatch(robots, /^Disallow:\s*\//im);
  assert.match(read('404.html'), /name="robots" content="noindex,follow"/);
});

test('existing Search Console file is served at its exact URL without redirect', async () => {
  const file = 'google53679754f9cff285.html';
  const response = verification({ request: new Request(`${base}/${file}`) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('location'), null);
  assert.equal(await response.text(), read(file));
  const head = verification({ request: new Request(`${base}/${file}`, { method: 'HEAD' }) });
  assert.equal(head.status, 200); assert.equal(await head.text(), '');
  const post = verification({ request: new Request(`${base}/${file}`, { method: 'POST' }) });
  assert.equal(post.status, 405);
});

test('updates feed points at the current public origin, not the retired employee-register site', () => {
  const feed = read('updates.xml');
  assert.match(feed, /<rss version="2\.0">/);
  assert.match(feed, /https:\/\/ai-syed-jalal-live\.pages\.dev\/about-jarvis/);
  assert.doesNotMatch(feed, /employee-register/);
});
