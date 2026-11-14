import { test, expect } from '@playwright/test';

const validPassword = 'Browser-test-password-123';

// Use the disposable test server only. The owner fixture writes synthetic data
// before signup so the test verifies the intentionally shared Viewer access.
test('short-phone signup from Workspace, shared records, logout and sign-in work with an installed worker', async ({ page, browser }) => {
  test.setTimeout(120000);
  const owner = await browser.newContext({ baseURL: 'http://127.0.0.1:3100' });
  const id = `PHONE-${Date.now()}`, username = `PhoneUser${Date.now()}`;
  try {
    expect((await owner.request.post('/api/demo', { data: {} })).status()).toBe(200);
    const me = await (await owner.request.get('/api/me')).json();
    expect(me.user.role).toBe('Admin');
    expect((await owner.request.post('/api/records', { headers: { 'X-CSRF-Token': me.csrfToken }, data: { id, name: 'Shared phone signup record', notes: 'Existing shared note' } })).status()).toBe(201);
  } finally { await owner.close(); }

  await page.setViewportSize({ width: 320, height: 568 });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/workspace.html');
  await page.evaluate(() => window.workspaceReady);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 20000 }).toBe(true);
  await expect(page.locator('#loginForm')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create a free account on this website' })).toBeVisible();
  await page.getByRole('link', { name: 'Create a free account on this website' }).click();
  await expect(page).toHaveURL(/index\.html\?signup=1&next=workspace\.html/);
  await expect(page.getByRole('dialog', { name: 'Create a free account' })).toBeVisible();
  await expect(page.locator('#signupDetails')).toContainText('No email or payment');
  await expect(page.locator('#signupDetails')).toContainText('read existing shared workspace records');
  await expect(page.locator('#signupDetails')).toContainText('not private');
  await expect(page.locator('#signupDetails')).toContainText('no self-service password reset');
  await expect(page.locator('#signupDetails')).toContainText('cloud AI may cost the workspace owner');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('#u').getAttribute('autocomplete')).toBe('username');
  expect(await page.locator('#p').getAttribute('autocomplete')).toBe('new-password');
  await page.locator('#u').fill(username);
  await page.locator('#p').fill(validPassword);
  await page.locator('#confirm-p').fill('Different-password-456');
  await expect(page.locator('#go')).toBeEnabled();
  await page.locator('#go').click();
  await expect(page.locator('#err')).toContainText('Passwords do not match');
  await page.locator('#confirm-p').fill(validPassword);
  await page.locator('#go').click(); // Scrolls naturally; no force click or greeting dismissal.
  await expect(page).toHaveURL(/workspace\.html/);
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#settingsUser')).toContainText(`${username.toLowerCase()} · Viewer`);
  await page.goto('/workspace.html#data');
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#dataBody')).toContainText('Shared phone signup record');
  await expect(page.locator('#addBtn')).toBeHidden();
  await expect(page.locator('#backupBtn')).toBeHidden();
  await expect(page.locator('.side [data-nav="users"]')).toBeHidden();
  const read = await page.request.get('/api/records/' + id);
  expect(read.status()).toBe(200); expect((await read.json()).record.notes).toBe('Existing shared note');
  const session = await (await page.request.get('/api/me')).json();
  expect((await page.request.post('/api/records', { headers: { 'X-CSRF-Token': session.csrfToken }, data: { name: 'Not permitted' } })).status()).toBe(403);
  expect((await page.request.get('/api/admin/users')).status()).toBe(403);
  await page.locator('#logoutBtn').click();
  await expect(page.locator('#loginForm')).toBeVisible();
  await page.locator('#username').fill(username.toUpperCase());
  await page.locator('#password').fill('Wrong-password-123');
  await page.locator('#loginForm button[type="submit"]').click();
  await expect(page.locator('#loginMessage')).toContainText('Invalid credentials');
  await page.locator('#password').fill(validPassword);
  await page.locator('#loginForm button[type="submit"]').click();
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#settingsUser')).toContainText(`${username.toLowerCase()} · Viewer`);
  expect(errors).toEqual([]);
});

test.describe('connection and form safeguards', () => {
  // Mock-specific cases must not depend on service-worker interception timing.
  test.use({ serviceWorkers: 'block' });

  test('a database-less site disables signup without sending credentials to any origin', async ({ page }) => {
    const writes = [];
    page.on('request', req => { if (req.method() !== 'GET' && req.method() !== 'HEAD') writes.push(req.url()); });
    await page.route('**/api/health', route => route.fulfill({ status: 503, json: { code: 'DATABASE_NOT_CONFIGURED' } }));
    await page.goto('/index.html?signup=1&next=workspace.html');
    await expect(page.locator('#authConnection')).toContainText('cannot create an account');
    await expect(page.locator('#go')).toBeDisabled();
    await page.locator('#u').fill('unavailable-user');
    await page.locator('#p').fill(validPassword); await page.locator('#confirm-p').fill(validPassword);
    await page.locator('#f').evaluate(form => form.requestSubmit());
    expect(writes).toEqual([]);
    expect(page.url()).not.toContain(validPassword);
  });

  test('validates inputs, prevents duplicate submissions, and explains conflict and rate limits', async ({ page }) => {
    let release, posts = 0, responseStatus = 409;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/api/auth/register', async route => {
      posts++;
      if (posts === 1) await gate;
      await route.fulfill({ status: responseStatus, json: { error: responseStatus === 409 ? 'That username is already registered or unavailable' : 'Too many account creation attempts. Please wait a few minutes and try again.' } });
    });
    await page.goto('/index.html?signup=1');
    await expect(page.locator('#go')).toBeEnabled();
    await page.locator('#u').fill('bad name');
    await page.locator('#p').fill(validPassword); await page.locator('#confirm-p').fill(validPassword);
    await page.locator('#go').click(); await expect(page.locator('#err')).toContainText('3–40'); expect(posts).toBe(0);
    await page.locator('#u').fill('valid-name'); await page.locator('#p').fill('letters-only-password'); await page.locator('#confirm-p').fill('letters-only-password');
    await page.locator('#go').click(); await expect(page.locator('#err')).toContainText('letter and a number'); expect(posts).toBe(0);
    await page.locator('#p').fill(validPassword); await page.locator('#confirm-p').fill(validPassword);
    await page.locator('#go').click(); await expect.poll(() => posts).toBe(1);
    await expect(page.locator('#go')).toBeDisabled(); await expect(page.locator('#signup-note')).toBeDisabled();
    await page.locator('#f').evaluate(form => form.requestSubmit()); expect(posts).toBe(1);
    release(); await expect(page.locator('#err')).toContainText('Try signing in or choose another username');
    await expect(page.locator('#go')).toBeEnabled();
    responseStatus = 429; await page.locator('#go').click();
    await expect(page.locator('#err')).toContainText('wait a few minutes'); expect(posts).toBe(2);
  });

  test('a lost signup response is treated as an unknown outcome, not a failed or duplicate account', async ({ page }) => {
    await page.route('**/api/auth/register', route => route.abort('failed'));
    await page.goto('/index.html?signup=1'); await expect(page.locator('#go')).toBeEnabled();
    await page.locator('#u').fill('lost-response'); await page.locator('#p').fill(validPassword); await page.locator('#confirm-p').fill(validPassword);
    await page.locator('#go').click();
    await expect(page.locator('#err')).toContainText('could not confirm whether your account was created');
    await expect(page.locator('#err')).toContainText('Try signing in');
    await expect(page.locator('#go')).toBeEnabled();
    await expect(page).toHaveURL(/signup=1/);
  });

  test('a success response without a matching browser session does not navigate', async ({ page }) => {
    await page.route('**/api/auth/register', route => route.fulfill({ status: 201, json: { user: { id: 'unissued-session-id', username: 'fixture', role: 'Viewer' } } }));
    await page.goto('/index.html?signup=1'); await expect(page.locator('#go')).toBeEnabled();
    await page.locator('#u').fill('no-cookie'); await page.locator('#p').fill(validPassword); await page.locator('#confirm-p').fill(validPassword);
    await page.locator('#go').click();
    await expect(page.locator('#err')).toContainText('could not confirm whether your account was created');
    await expect(page).toHaveURL(/signup=1/);
  });

  test('timeout leaves signup outcome unknown and restores the form', async ({ page }) => {
    await page.addInitScript(() => {
      const originalTimeout = window.setTimeout.bind(window), originalFetch = window.fetch.bind(window);
      window.setTimeout = (fn, ms, ...args) => originalTimeout(fn, ms === 25000 ? 60 : ms, ...args);
      window.fetch = (url, options = {}) => {
        if (typeof url === 'string' && url.endsWith('/api/auth/register')) {
          return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
        }
        return originalFetch(url, options);
      };
    });
    await page.goto('/index.html?signup=1'); await expect(page.locator('#go')).toBeEnabled();
    await page.locator('#u').fill('timeout-user'); await page.locator('#p').fill(validPassword); await page.locator('#confirm-p').fill(validPassword);
    await page.locator('#go').click();
    await expect(page.locator('#err')).toContainText('could not confirm whether your account was created');
    await expect(page.locator('#go')).toBeEnabled(); await expect(page.locator('#signup-note')).toBeEnabled();
  });

  test('Workspace refuses an insecure remote API URL before sending a password', async ({ page }) => {
    const writes = [];
    await page.route('**/api/auth/login', route => { writes.push(route.request().url()); return route.abort(); });
    await page.goto('/workspace.html'); await page.evaluate(() => window.workspaceReady);
    await page.locator('#loginApiUrl').fill('http://untrusted.example');
    await page.locator('#username').fill('example'); await page.locator('#password').fill(validPassword);
    await page.locator('#loginForm button[type="submit"]').click();
    await expect(page.locator('#loginMessage')).toContainText('Use an HTTPS API URL');
    expect(writes).toEqual([]);
  });

  test('signup never follows an untrusted next URL', async ({ page }) => {
    const username = `safe${Date.now()}`;
    await page.goto('/index.html?signup=1&next=https%3A%2F%2Fexample.invalid%2Fsteal');
    await expect(page.locator('#go')).toBeEnabled();
    await page.locator('#u').fill(username); await page.locator('#p').fill(validPassword); await page.locator('#confirm-p').fill(validPassword);
    await page.locator('#go').click();
    await expect(page).toHaveURL(/dashboard\.html/);
    expect(new URL(page.url()).origin).toBe('http://127.0.0.1:3100');
    expect(page.url()).not.toContain(validPassword);
  });
});
