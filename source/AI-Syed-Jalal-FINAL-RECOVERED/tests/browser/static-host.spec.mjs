import { test, expect } from '@playwright/test';

// The local test server is a real backend, but ?static=1 exercises the same
// guard used on GitHub Pages without needing an external github.io origin.
test('static host mode: homepage login is honest and does not call the auth API', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const authCalls = [];
  page.on('request', request => { if (request.url().includes('/api/auth/')) authCalls.push(request.url()); });
  await page.goto('/?static=1');
  await expect(page.locator('#ajStaticHostBanner')).toContainText('Static website preview');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.locator('#u').fill('static-user');
  await page.locator('#p').fill('Static-password-123');
  await page.locator('#go').click();
  await expect(page.locator('#err')).toContainText('static GitHub Pages copy cannot sign in');
  expect(authCalls).toEqual([]);
  await page.locator('#togglePassword').click();
  await expect(page.locator('#p')).toHaveAttribute('type', 'text');
  await page.locator('#togglePassword').click();
  await expect(page.locator('#p')).toHaveAttribute('type', 'password');
  expect(errors).toEqual([]);
});

test('static host mode: guide, agent, JalalAi and workspace show setup guidance', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/guide.html?static=1');
  await expect(page.locator('#appState')).toContainText('Backend not connected');
  await expect(page.locator('#guidePreviewBtn')).toBeHidden();
  await page.goto('/agent.html?static=1');
  await expect(page.locator('#gateMessage')).toContainText('Static website preview');
  await expect(page.locator('#demoBtn')).toBeHidden();
  await page.goto('/jalalai.html?static=1');
  await expect(page.locator('#connectionStatus')).toContainText('Static preview');
  await expect(page.locator('#sendBtn')).toBeDisabled();
  await page.goto('/workspace.html?static=1');
  await expect(page.locator('.login-note p')).toContainText('static GitHub Pages copy cannot sign in');
  await page.locator('#username').fill('static-user');
  await page.locator('#password').fill('Static-password-123');
  await page.locator('#loginForm button[type="submit"]').click();
  await expect(page.locator('#login')).toBeVisible();
  expect(errors).toEqual([]);
});
