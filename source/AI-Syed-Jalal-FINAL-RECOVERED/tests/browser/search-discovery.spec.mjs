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
  expect(locations).toHaveLength(5);
  for (const location of locations) {
    const target = new URL(location);
    const result = await page.goto(target.pathname);
    expect(result.status(), target.pathname).toBe(200);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', location);
    const robots = page.locator('meta[name="robots"]');
    if (await robots.count()) expect(await robots.getAttribute('content')).not.toContain('noindex');
  }
});

test('the public JARVIS overview opens the noindex assistant', async ({ page }) => {
  await page.goto('/about-jarvis');
  await expect(page.getByRole('heading', { name: /Meet JARVIS/i })).toBeVisible();
  await page.getByRole('link', { name: /Open JARVIS/i }).first().click();
  await expect(page).toHaveURL(/\/jarvis\.html/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow');
});
