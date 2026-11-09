import { test, expect } from '@playwright/test';

test('public sitemap and its extensionless URLs resolve with matching canonical tags', async ({ page, request }) => {
  const response = await request.get('/sitemap.xml');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('xml');
  const xml = await response.text();
  const locations = await page.evaluate(text => {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('Invalid sitemap XML');
    return [...doc.getElementsByTagNameNS('http://www.sitemaps.org/schemas/sitemap/0.9', 'loc')].map(n => n.textContent);
  }, xml);
  expect(locations).toHaveLength(7);
  for (const location of locations) {
    const target = new URL(location);
    const result = await page.goto(target.pathname);
    expect(result.status(), target.pathname).toBe(200);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', location);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', location);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /\S/);
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', /\S/);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://ai-syed-jalal-live.pages.dev/assets/brand/sj-social-1200x630.png');
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
    const robots = page.locator('meta[name="robots"]');
    if (await robots.count()) expect(await robots.getAttribute('content')).not.toContain('noindex');
  }
  const image = await request.get('/assets/brand/sj-social-1200x630.png');
  expect(image.status()).toBe(200); expect(image.headers()['content-type']).toContain('image/png');
});

test('robots and llms.txt are served as text without exposing private application pages', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200); expect(robots.headers()['content-type']).toContain('text/plain');
  expect(await robots.text()).toContain('Sitemap: https://ai-syed-jalal-live.pages.dev/sitemap.xml');
  const llms = await request.get('/llms.txt');
  expect(llms.status()).toBe(200); expect(llms.headers()['content-type']).toContain('text/plain');
  expect(await llms.text()).toContain('[Media Studio](https://ai-syed-jalal-live.pages.dev/media-studio)');
  for (const path of ['/workspace.html', '/dashboard.html', '/agent.html']) {
    const response = await request.get(path);
    expect(await response.text()).toMatch(/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i);
  }
});

test('the public IndexNow verification file is served as plain text', async ({ request }) => {
  // This is a public site-ownership proof for URL notifications, not a cloud,
  // database or account credential. Its presence does not prove submission.
  const key = '203b7f5d68c6330147a1951dd4a06b29';
  const response = await request.get('/' + key + '.txt');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/plain');
  expect((await response.text()).trim()).toBe(key);
});

test('the public JARVIS overview opens the noindex assistant', async ({ page }) => {
  await page.goto('/about-jarvis');
  await expect(page.getByRole('heading', { name: /Meet JARVIS/i })).toBeVisible();
  await page.getByRole('link', { name: /Open JARVIS/i }).first().click();
  await expect(page).toHaveURL(/\/jarvis\.html/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow');
});
