import { test, expect } from '@playwright/test';

  // A deployment whose accounts are all Viewers cannot reach any admin route,
  // including schema repair. Availability must depend on "no Administrator
  // exists", not "no users" — a deployment with Viewers but no Admin was
  // permanently stranded under the old gate.
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

  await page.goto('/index.html');
  await page.getByRole('button', { name: 'Account sign in' }).click();

  // The panel must be offered on a fresh deployment, and explain WHY it exists.
  const panel = page.locator('#firstRun');
  await expect(panel).toBeVisible();
  await expect(page.locator('#firstRunText')).toContainText('No Administrator exists');
  await expect(page.locator('#firstRunText')).toContainText('Administrator');

  await page.locator('#u').fill('owner');
  await page.locator('#p').fill('StrongPass12345');
  await page.locator('#firstRunBtn').click();

  await expect.poll(() => payload).not.toBeNull();
  expect(payload).toEqual({ username: 'owner', password: 'StrongPass12345' });

  // The handler opens the dashboard once an Administrator exists; wait for that
  // navigation to settle before returning to the landing page.
  await page.waitForURL('**/dashboard.html');

  // Once an account exists the option must vanish, not sit there inviting a second admin.
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'Account sign in' }).click();
  await expect(page.locator('#firstRun')).toBeHidden();

  expect(errors).toEqual([]);
});
