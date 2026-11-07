import { test, expect } from '@playwright/test';

// Only mocked status responses are used; these tests never repair a database.
async function mockStatus(page, { readyStatus = 200, ready, sessionStatus = 200, session = { authenticated:false, user:null }, healthStatus = 200 } = {}) {
  await page.route('**/api/health', route => route.fulfill({ status:healthStatus, json:{ ok:healthStatus === 200, localPreview:false, assistant:{ cloudConfigured:false } } }));
  await page.route('**/api/ready', route => route.fulfill({ status:readyStatus, json:ready }));
  await page.route('**/api/me', route => route.fulfill({ status:sessionStatus, json:session }));
}
const incomplete = { ok:false, ready:false, schemaTables:13, required:24, missing:[
  'agent_skills', 'agent_self_checks', 'arena_battles', 'arena_responses', 'arena_artifacts',
  'arena_ratings', 'agent_runs', 'expert_reviews', 'app_settings', 'app_bootstrap', 'content_reports'
], signInAffected:false };
const complete = { ok:true, ready:true, schemaTables:24, required:24, missing:[], signInAffected:false };

test('incomplete required table names do not falsely claim sign-in is blocked or instruct unsafe migration', async ({ page }) => {
  await mockStatus(page, { readyStatus:503, ready:incomplete });
  await page.goto('/guide.html');
  await expect(page.locator('#guideStatus')).toContainText('setup incomplete');
  await expect(page.locator('#appState')).toContainText('13/24');
  await expect(page.locator('#startMessage')).toContainText('restorable full database backup');
  await expect(page.locator('#startMessage')).toContainText('isolated');
  await expect(page.locator('#startMessage')).not.toContainText('sign-in cannot');
  await expect(page.locator('#startMessage')).not.toContainText('npm run db:migrate');
  await expect(page.locator('#sessionState')).toContainText('Not signed in');
});

test('the guide reports a possible sign-in impact when required sign-in tables are missing', async ({ page }) => {
  await mockStatus(page, { readyStatus:503, ready:{ ...incomplete, signInAffected:true } });
  await page.goto('/guide.html');
  await expect(page.locator('#appState')).toContainText('13/24');
  await expect(page.locator('#sessionState')).toContainText('Sign-in may be affected');
});

test('a generic readiness failure is unknown, not proof that tables or sign-in are missing', async ({ page }) => {
  await mockStatus(page, { readyStatus:503, ready:{ error:'Database unavailable' } });
  await page.goto('/guide.html');
  await expect(page.locator('#guideStatus')).toContainText('readiness unknown');
  await expect(page.locator('#appState')).toContainText('Readiness unavailable');
  await expect(page.locator('#startMessage')).not.toContainText('missing tables');
  await expect(page.locator('#sessionState')).toContainText('Not signed in');
});

test('a failed session check does not disguise healthy table-name readiness as a server outage', async ({ page }) => {
  await mockStatus(page, { ready:complete, sessionStatus:500, session:{ error:'session lookup failed' } });
  await page.goto('/guide.html');
  await expect(page.locator('#guideStatus')).toHaveText('Application online');
  await expect(page.locator('#appState')).toContainText('24/24');
  await expect(page.locator('#appState')).toContainText('features unverified');
  await expect(page.locator('#sessionState')).toContainText('Session status unavailable');
  await expect(page.locator('#startMessage')).not.toContainText('Start it with npm run dev');
});

test('unavailable health is shown as unknown rather than a migration diagnosis', async ({ page }) => {
  await mockStatus(page, { readyStatus:503, ready:incomplete, healthStatus:500 });
  await page.goto('/guide.html');
  await expect(page.locator('#guideStatus')).toContainText('health unavailable');
  await expect(page.locator('#appState')).toContainText('Server status unavailable');
  await expect(page.locator('#startMessage')).not.toContainText('npm run db:migrate');
});

test('installed guide uses the new safety script offline without claiming a live database check', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout:20000 }).toBe(true);
  for (const asset of ['/assets/guide.js?v=159', '/assets/guide.css?v=160', '/assets/visual-system.css?v=160', '/assets/preview-entry.js?v=160']) {
    expect(await page.evaluate(async url => Boolean(await caches.match(url)), asset), `${asset} is precached`).toBe(true);
  }
  // Cloudflare redirects .html to this extensionless URL. It must work on the
  // first offline visit, not only after an online navigation cached it.
  await context.setOffline(true);
  try {
    await page.goto('/guide');
    await expect(page.locator('#guideStatus')).toContainText('health unavailable');
    await expect(page.locator('#appState')).toContainText('Server status unavailable');
    await expect(page.locator('#startMessage')).not.toContainText('npm run db:migrate');
    await page.goto('/guide.html');
    await expect(page.locator('#guideStatus')).toContainText('health unavailable');
  } finally { await context.setOffline(false); }
});

test('guide command cards stay readable in every theme on desktop and mobile', async ({ page }) => {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/guide.html');
    for (const theme of ['glass', 'water', 'clay', 'ice', 'fire', 'rainbow']) {
      await page.evaluate(name => window.AJTheme.select(name), theme);
      const sample = await page.locator('.guide-commands a').first().evaluate(link => {
        const channels = css => css.match(/[\d.]+/g).slice(0, 3).map(Number);
        const luminance = css => {
          const rgb = channels(css).map(n => { const x = n / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
          return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
        };
        const background = getComputedStyle(link).backgroundColor;
        const contrast = selector => {
          const text = getComputedStyle(link.querySelector(selector)).color;
          const a = luminance(text), b = luminance(background);
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        };
        return { code: contrast('code'), description: contrast('span'), noteSize: parseFloat(getComputedStyle(document.querySelector('#sandboxNote')).fontSize),
          transition: getComputedStyle(link).transitionDuration,
          pageWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth };
      });
      expect(sample.code, `${theme} title contrast at ${viewport.width}px`).toBeGreaterThanOrEqual(4.5);
      expect(sample.description, `${theme} description contrast at ${viewport.width}px`).toBeGreaterThanOrEqual(4.5);
      expect(sample.noteSize, 'sandbox warning text size').toBeGreaterThanOrEqual(12);
      expect(sample.transition, 'reduced-motion preference').toBe('0s');
      expect(sample.pageWidth).toBeLessThanOrEqual(sample.viewportWidth + 1);
    }
  }
});
