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
  assert.equal(urls.length, 7);
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
    const meta = (attribute, name) => new RegExp(`<meta\\s+${attribute}=(["'])${name}\\1\\s+content=(["'])(.*?)\\2`, 'i').exec(html)?.[3];
    assert.ok(meta('name', 'description'), file + ' needs a search description');
    assert.equal(meta('property', 'og:url'), address, file + ' social URL must be canonical');
    for (const property of ['og:type', 'og:site_name', 'og:title', 'og:description']) assert.ok(meta('property', property), `${file} missing ${property}`);
    assert.equal(meta('property', 'og:image'), `${base}/assets/brand/sj-social-1200x630.png`);
    assert.equal(meta('name', 'twitter:card'), 'summary_large_image');
    for (const name of ['twitter:title', 'twitter:description', 'twitter:image']) assert.ok(meta('name', name), `${file} missing ${name}`);
    assert.equal(meta('name', 'twitter:image'), `${base}/assets/brand/sj-social-1200x630.png`);
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

test('llms.txt contains accurate, parser-friendly links to the public pages', () => {
  const text = read('llms.txt');
  assert.match(text, /^# Alsyed Jalal AI\n\n>/);
  assert.match(text, /not separate autonomous AI agents/);
  assert.match(text, /does not generate images or videos with AI/);
  const links = [...text.matchAll(/^- \[[^\]]+\]\((https:\/\/[^)]+)\)/gm)].map(match => match[1]);
  for (const address of urls) assert.ok(links.includes(address), `missing public link ${address}`);
  assert.ok(links.includes(`${base}/sitemap.xml`)); assert.ok(links.includes(`${base}/robots.txt`));
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
