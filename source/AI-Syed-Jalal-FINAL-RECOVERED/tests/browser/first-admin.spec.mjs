import { test, expect } from '@playwright/test';

// A deployment whose accounts are all Viewers cannot reach any admin route,
// including schema repair. This proves the first-run panel exists, explains
// itself, and only appears while the deployment truly has no accounts.
test('first-run panel creates the Administrator and then disappears', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  let users = 0;
  await page.route('**/api/bootstrap/status', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        available: users === 0,
        users,
        completed: users > 0,
        reason: users === 0 ? 'No accounts exist yet.' : 'This deployment already has accounts.'
      })
    });
  });

  let payload = null;
  await page.route('**/api/bootstrap/admin', async route => {
    payload = JSON.parse(route.request().postData() || '{}');
    users = 1;
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
  await expect(page.locator('#firstRunText')).toContainText('No accounts exist');
  await expect(page.locator('#firstRunText')).toContainText('Administrator');

  await page.locator('#u').fill('owner');
  await page.locator('#p').fill('StrongPass12345');
  await page.locator('#firstRunBtn').click();

  await expect.poll(() => payload).not.toBeNull();
  expect(payload).toEqual({ username: 'owner', password: 'StrongPass12345' });

  // Once an account exists the option must vanish, not sit there inviting a second admin.
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'Account sign in' }).click();
  await expect(page.locator('#firstRun')).toBeHidden();

  expect(errors).toEqual([]);
});
