import { test, expect } from '@playwright/test';

// "Fully final" includes the published static copy, where there is no API at all.
// Every new page must explain itself instead of showing a spinner or a raw error.
// Each page exposes a different honesty indicator. Test the one it actually
// ships instead of inventing a shared id that would force a cosmetic rewrite.
const PAGES = [
  ['toolbench.html', 'Toolbench', '#connectionStatus'],
  ['pagebuilder.html', 'Page Builder', '#connectionStatus'],
  ['allinone.html', 'All-in-one', '#connectionStatus'],
  ['arena.html', 'Arena', '#status'],
  ['critic.html', 'Critic', '#runState'],
  ['agent.html', 'Agent Studio', '#authGate'],
  ['agent-lab.html', 'Agent Lab', 'body'],
  ['jalalai.html', 'JalalAi', '#connectionStatus'],
  ['jarvis.html', 'JARVIS', '#status'],
  ['dashboard.html', 'Dashboard', 'body'],
  ['workspace.html', 'Workspace', 'body']
];

for (const [file, label, indicator] of PAGES) {
  test(`static host: ${file} explains itself and never hangs`, async ({ page }) => {
    test.setTimeout(60000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // ?static=1 trips the same switch the real GitHub Pages host does, but the
    // local dev server would still answer /api — so also make every API call fail
    // exactly as it does on Pages. Without this the test proves nothing.
    await page.route('**/api/**', route => route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Not found"}' }));
    await page.goto(`/${file}?static=1`);

    // The banner must appear on every private shell.
    await expect(page.locator('#ajStaticHostBanner')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#ajStaticHostBanner')).toContainText('Static website preview');

    // The page's own indicator must reach a terminal, truthful state — never stay
    // "Checking…" and never claim a backend it cannot reach.
    if (indicator === 'body') {
      const text = await page.locator('body').textContent();
      expect(text).not.toMatch(/Could not reach|Request failed|Failed to fetch/);
      return;
    }
    const status = page.locator(indicator);
    await expect(status).toBeVisible({ timeout: 20000 });
    await expect(status).not.toHaveText(/Checking/i, { timeout: 20000 });
    const indicatorText = (await status.textContent()).trim();
    expect(indicatorText).not.toMatch(/Failed to fetch|NetworkError|undefined|null|Request failed/);
    // The page must not present a raw transport error as its explanation.
    const pageText = await page.locator('body').textContent();
    expect(pageText).not.toMatch(/Could not reach the application server|Request failed \(404\)/);

    // And something on the page must tell the user what to do next.
    const body = await page.locator('body').textContent();
    expect(body).toMatch(/secure app|npm run dev|application server|Static/i);

    expect(errors, `${label} threw in the browser`).toEqual([]);
  });
}
