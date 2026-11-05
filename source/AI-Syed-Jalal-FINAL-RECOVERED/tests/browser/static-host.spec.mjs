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
  ['critic.html', 'Critic', '#runState']
];

for (const [file, label, indicator] of PAGES) {
  test(`static host: ${file} explains itself and never hangs`, async ({ page }) => {
    test.setTimeout(60000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // ?static=1 is the same switch the real GitHub Pages host trips.
    await page.goto(`/${file}?static=1`);

    // The banner must appear on every private shell.
    await expect(page.locator('#ajStaticHostBanner')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#ajStaticHostBanner')).toContainText('Static website preview');

    // The page's own indicator must reach a terminal, truthful state — never stay
    // "Checking…" and never claim a backend it cannot reach.
    const status = page.locator(indicator);
    await expect(status).toBeVisible({ timeout: 20000 });
    await expect(status).not.toHaveText(/Checking/i, { timeout: 20000 });
    const indicatorText = (await status.textContent()).trim();
    expect(indicatorText).not.toMatch(/Failed to fetch|NetworkError|undefined|null/);

    // And something on the page must tell the user what to do next.
    const body = await page.locator('body').textContent();
    expect(body).toMatch(/secure app|npm run dev|application server|Static/i);

    expect(errors, `${label} threw in the browser`).toEqual([]);
  });
}
