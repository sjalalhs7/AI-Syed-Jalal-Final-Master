import { test, expect } from '@playwright/test';

  // This mocked setup is offered only when the server reports that no
  // Administrator exists and the owner has enabled a configured seed. Runtime
  // authorization and race behavior are covered by the server tests.
  test('first-run panel creates the Administrator and then disappears', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    let admins = 0;
    const users = 2;
    await page.route('**/api/bootstrap/status', async route => {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          available: admins === 0,
          users, admins,
          completed: admins > 0,
          reason: admins === 0 ? 'No Administrator exists on this deployment.' : 'An Administrator already exists.'
        })
      });
    });

    let payload = null;
    await page.route('**/api/bootstrap/admin', async route => {
      payload = JSON.parse(route.request().postData() || '{}');
      admins = 1;
      await route.fulfill({
        status: 201, contentType: 'application/json',
        body: JSON.stringify({ ok: true, user: { username: payload.username, role: 'Admin' } })
      });
    });

  await page.goto('/index.html?next=jarvis.html');
  await expect(page.locator('#login')).toHaveClass(/show/);

  // The panel must be offered on a fresh deployment, and explain WHY it exists.
  const panel = page.locator('#firstRun');
  await expect(panel).toBeVisible();
  await expect(page.locator('#firstRunText')).toContainText('No Administrator account exists');
  await expect(page.locator('#firstRunText')).toContainText('configured seed username and password');

  await page.locator('#u').fill('owner');
  await page.locator('#p').fill('StrongPass12345');
  await page.locator('#firstRunBtn').click();

  await expect.poll(() => payload).not.toBeNull();
  expect(payload).toEqual({ username: 'owner', password: 'StrongPass12345' });

  // A deep-linked first administrator returns to the fixed JARVIS page.
  await page.waitForURL('**/jarvis.html');

  // Once an account exists the option must vanish, not sit there inviting a second admin.
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'Account sign in' }).click();
  await expect(page.locator('#firstRun')).toBeHidden();

  expect(errors).toEqual([]);
});

test('short phone: the first-admin form remains usable while the welcome is playing', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript(() => {
    window.__welcomePause = 0;
    window.Audio = class { play() { this.onplaying?.(); return Promise.resolve(); } pause() { window.__welcomePause++; } };
  });
  await page.route('**/api/bootstrap/status', route => route.fulfill({ json: { available: true, admins: 0, users: 0, completed: false } }));
  let payload;
  await page.route('**/api/bootstrap/admin', route => {
    payload = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { ok: true } });
  });
  await page.goto('/index.html?next=jarvis.html');
  await expect(page.locator('#firstRun')).toBeVisible();
  await expect(page.locator('#aj-welcome-notice-status')).toContainText('speaking');
  await page.locator('#u').fill('phoneowner');
  await page.locator('#p').fill('PhonePassword123');
  await page.locator('#firstRunBtn').click(); // No force click or dismissing the greeting.
  await expect.poll(() => payload).toEqual({ username: 'phoneowner', password: 'PhonePassword123' });
  await page.waitForURL('**/jarvis.html');
});

test('short phone: the greeting can be stopped from inside the login dialog', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript(() => {
    window.__welcomePause = 0;
    window.Audio = class { play() { this.onplaying?.(); return Promise.resolve(); } pause() { window.__welcomePause++; } };
  });
  await page.goto('/index.html?next=jarvis.html');
  await expect(page.locator('#aj-welcome-notice-status')).toContainText('speaking');
  await page.locator('#loginStopWelcome').click();
  expect(await page.evaluate(() => window.__welcomePause)).toBeGreaterThan(0);
  await expect(page.locator('#aj-welcome-notice')).toBeHidden();
  await expect(page.locator('#login')).toHaveClass(/show/);
});
