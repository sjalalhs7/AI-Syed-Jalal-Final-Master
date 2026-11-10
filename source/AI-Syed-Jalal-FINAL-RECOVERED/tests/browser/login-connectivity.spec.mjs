import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const homepage = await readFile(new URL('../../frontend/index.html', import.meta.url), 'utf8');

test('unconfigured Cloudflare preview explains the password was not checked and links to the live site without submitting it', async ({ page }) => {
  const writes = [];
  await page.route('https://preview.ai-syed-jalal-live.pages.dev/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() !== 'GET') { writes.push(url.pathname); return route.fulfill({ status: 500, body: 'unexpected request' }); }
    if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: homepage });
    if (url.pathname === '/api/health' || url.pathname === '/api/bootstrap/status') return route.fulfill({ status: 503, json: { code: 'DATABASE_NOT_CONFIGURED' } });
    return route.fulfill({ status: 200, contentType: url.pathname.endsWith('.css') ? 'text/css' : 'application/javascript', body: '' });
  });
  await page.goto('https://preview.ai-syed-jalal-live.pages.dev/');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#authConnection')).toContainText('cannot check your password');
  await expect(page.locator('#go')).toBeDisabled();
  await expect(page.locator('#authLiveLink')).toBeVisible();
  await expect(page.locator('#authLiveLink')).toHaveAttribute('href', 'https://ai-syed-jalal-live.pages.dev/');
  await page.locator('#u').fill('example'); await page.locator('#p').fill('Dummy-password-123');
  await page.locator('#p').press('Enter');
  await page.locator('#f').evaluate(form => form.requestSubmit());
  expect(writes).toEqual([]);
  expect(await page.locator('#authLiveLink').getAttribute('href')).not.toContain('Dummy');
});

test('unconfigured production or other hosts never direct credentials to a different origin', async ({ page }) => {
  await page.route('**/api/health', route => route.fulfill({ status: 503, json: { code: 'DATABASE_NOT_CONFIGURED' } }));
  await page.goto('/'); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#authConnection')).toContainText('cannot check your password');
  await expect(page.locator('#authLiveLink')).toBeHidden(); await expect(page.locator('#go')).toBeDisabled();
});

test('connection retry restores sign-in and first-run state without sending credentials', async ({ page }) => {
  let connected = false; const writes = [];
  page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url()); });
  await page.route('**/api/health', route => route.fulfill(connected
    ? { json: { databaseConnected: true } }
    : { status: 503, json: { code: 'DATABASE_NOT_CONFIGURED' } }));
  await page.route('**/api/bootstrap/status', async route => {
    await new Promise(resolve => setTimeout(resolve, 500));
    await route.fulfill({ json: { available: true } });
  });
  await page.goto('/');
  const firstBootstrap = page.waitForResponse('**/api/bootstrap/status');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#authConnection')).toContainText('cannot check your password');
  await firstBootstrap; await expect(page.locator('#firstRun')).toBeHidden();
  connected = true; await page.getByRole('button', { name: 'Check again' }).click();
  await expect(page.locator('#go')).toBeEnabled(); await expect(page.locator('#authConnection')).toBeHidden();
  await expect(page.locator('#firstRun')).toBeVisible(); expect(writes).toEqual([]);
});

test('a database configuration error after preflight also gives a truthful message, not a wrong-password claim', async ({ page }) => {
  await page.route('**/api/health', route => route.fulfill({ json: { databaseConnected: true } }));
  await page.route('**/api/auth/login', route => route.fulfill({ status: 503, json: { code: 'DATABASE_NOT_CONFIGURED' } }));
  await page.goto('/'); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.locator('#u').fill('example'); await page.locator('#p').fill('Dummy-password-123'); await page.locator('#go').click();
  await expect(page.locator('#authConnection')).toContainText('cannot check your password');
  await expect(page.locator('#go')).toBeDisabled();
  await expect(page.locator('#err')).not.toContainText('Invalid credentials');
});

test('registration and password sign-in still work on the isolated local database', async ({ page }) => {
  const username = `localtest${Date.now()}`, password = 'Local-test-password-123';
  await page.goto('/'); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.locator('#u').fill(username); await page.locator('#p').fill(password); await page.locator('#confirm-p').fill(password); await page.locator('#go').click();
  await expect(page).toHaveURL(/dashboard\.html/); await expect(page.locator('#uname')).toHaveText(username);
  await Promise.all([page.waitForURL(/\/$/), page.locator('#out').click()]);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.locator('#u').fill(username); await page.locator('#p').fill(password); await page.locator('#go').click();
  await expect(page).toHaveURL(/dashboard\.html/);
});
