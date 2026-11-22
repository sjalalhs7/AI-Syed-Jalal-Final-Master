import { test, expect } from '@playwright/test';

const currentPassword = 'Browser-current-password-123';
const newPassword = 'Browser-new-password-456';

async function fillPasswords(page, current = currentPassword, next = newPassword, confirm = next) {
  await page.getByLabel('Current password', { exact: true }).fill(current);
  await page.getByLabel('New password', { exact: true }).fill(next);
  await page.getByLabel('Confirm new password').fill(confirm);
}
async function previewSettings(page) {
  expect((await page.request.post('/api/demo', { data: {} })).status()).toBe(200);
  await page.goto('/workspace.html#settings');
  await page.evaluate(() => window.workspaceReady);
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#view-settings')).toHaveClass(/active/);
}

// Uses only the disposable local server and invented accounts. The browser's
// actual service worker is enabled in this end-to-end mobile case.
test('Viewer changes password on a short phone, retains this session and revokes other sessions', async ({ page, browser }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 320, height: 568 });
  const username = `password-phone-${Date.now()}`;
  const second = await browser.newContext({ baseURL: 'http://127.0.0.1:3100' });
  const dialogs = []; page.on('dialog', dialog => { dialogs.push(dialog.message()); dialog.dismiss(); });
  try {
    const registered = await page.request.post('/api/auth/register', { data: { username, password: currentPassword } });
    expect(registered.status()).toBe(201);
    expect((await second.request.post('/api/auth/login', { data: { username, password: currentPassword } })).status()).toBe(200);
    // A deployed worker must bypass stale private shells and API responses,
    // even if an older installation left those URLs in the current cache.
    await page.goto('/index.html');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 20000 }).toBe(true);
    await page.evaluate(async () => {
      const cache = await caches.open('aj-v179-chat-workspace');
      await cache.put('/workspace.html', new Response('stale private workspace', { headers: { 'content-type': 'text/html' } }));
      await cache.put('/api/auth/sessions', Response.json({ sessions: [] }));
    });
    await page.goto('/workspace.html#settings'); await page.evaluate(() => window.workspaceReady);
    await expect(page.locator('#settingsUser')).toContainText(`${username} · Viewer`);
    await expect(page.locator('#topRole')).toHaveText('Viewer');
    await expect(page.locator('#topOperator')).toHaveText(username);
    await expect(page.locator('.side [data-nav="users"]')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const [name, auto] of [['Current password', 'current-password'], ['New password', 'new-password'], ['Confirm new password', 'new-password']]) {
      const field = page.getByLabel(name, { exact: true });
      await expect(field).toHaveAttribute('type', 'password');
      await expect(field).toHaveAttribute('autocomplete', auto);
    }
    await page.locator('#refreshSessionsBtn').click();
    await expect(page.locator('#securitySessions')).toContainText('This session · Active');
    await expect(page.locator('#securitySessions')).toContainText('Other session · Active');
    await page.locator('#revokeSessionsBtn').click();
    await expect(page.locator('#securityMessage')).toContainText('This session was not revoked');
    await expect(page.locator('#securitySessions')).toContainText('Other session · Revoked');
    expect((await (await page.request.get('/api/me')).json()).authenticated).toBe(true);
    expect((await (await second.request.get('/api/me')).json()).authenticated).toBe(false);
    expect((await second.request.post('/api/auth/login', { data: { username, password: currentPassword } })).status()).toBe(200);
    await fillPasswords(page);
    await page.locator('#changePasswordBtn').click();
    await expect(page.locator('#passwordMessage')).toContainText('Password changed and other sessions were revoked');
    await expect(page.locator('#passwordMessage')).toContainText('This session was not revoked');
    await expect(page.locator('#securityCurrentPassword')).toHaveValue('');
    await expect(page.locator('#securityNewPassword')).toHaveValue('');
    await expect(page.locator('#securityConfirmPassword')).toHaveValue('');
    await page.waitForTimeout(800); // Catch the previous delayed reload/sign-out behavior.
    await expect(page.locator('#app')).toBeVisible();
    expect((await (await page.request.get('/api/me')).json()).authenticated).toBe(true);
    expect((await (await second.request.get('/api/me')).json()).authenticated).toBe(false);
    expect((await second.request.post('/api/auth/login', { data: { username, password: currentPassword } })).status()).toBe(401);
    expect((await second.request.post('/api/auth/login', { data: { username, password: newPassword } })).status()).toBe(200);
    expect(dialogs).toEqual([]);
  } finally { await second.close(); }
});

test.describe('security controls under faults', () => {
  // These fixtures must intercept requests, independently of worker timing.
  test.use({ serviceWorkers: 'block' });

  test('validates masked fields and prevents duplicate submissions', async ({ page }) => {
    await previewSettings(page);
    let posts = 0, release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/api/auth/change-password', async route => {
      posts++;
      await gate;
      await route.fulfill({ status: 200, json: { ok: true, otherSessionsRevoked: true } });
    });
    try {
      await fillPasswords(page, currentPassword, 'weak', 'weak');
      await page.locator('#changePasswordBtn').click();
      await expect(page.locator('#passwordMessage')).toContainText('12–1,024');
      await fillPasswords(page, currentPassword, newPassword, 'Different-password-789');
      await page.locator('#changePasswordBtn').click();
      await expect(page.locator('#passwordMessage')).toContainText('do not match');
      await fillPasswords(page, currentPassword, currentPassword, currentPassword);
      await page.locator('#changePasswordBtn').click();
      await expect(page.locator('#passwordMessage')).toContainText('different from your current password');
      expect(posts).toBe(0);
      await fillPasswords(page);
      await page.locator('#changePasswordBtn').click();
      await expect.poll(() => posts).toBe(1);
      await expect(page.locator('#changePasswordBtn')).toBeDisabled();
      await expect(page.locator('#revokeSessionsBtn')).toBeDisabled();
      await page.locator('#passwordForm').evaluate(form => form.requestSubmit());
      expect(posts).toBe(1);
      release();
      await expect(page.locator('#passwordMessage')).toContainText('Password changed');
      await expect(page.locator('#changePasswordBtn')).toBeEnabled();
    } finally { release(); }
  });

  test('a definite validation rejection is not reported as an uncertain success', async ({ page }) => {
    await previewSettings(page);
    let result = { status: 401, json: { code: 'PASSWORD_CURRENT_INVALID', error: 'Current password is incorrect' } };
    await page.route('**/api/auth/change-password', route => route.fulfill(result));
    await fillPasswords(page);
    await page.locator('#changePasswordBtn').click();
    await expect(page.locator('#passwordMessage')).toContainText('current password was not accepted');
    await expect(page.locator('#passwordMessage')).toContainText('No change was made by this request');
    await expect(page.locator('#passwordReviewBtn')).toBeHidden();
    await expect(page.locator('#changePasswordBtn')).toBeEnabled();
    await expect(page.locator('#securityNewPassword')).toHaveValue(newPassword);
    result = { status: 429, json: { code: 'PASSWORD_CHANGE_RATE_LIMIT' } };
    await page.locator('#changePasswordBtn').click();
    await expect(page.locator('#passwordMessage')).toContainText('Wait five minutes');
    await expect(page.locator('#passwordMessage')).toContainText('No change was made by this request');
    await expect(page.locator('#passwordReviewBtn')).toBeHidden();
    result = { status: 409, json: { code: 'PASSWORD_CHANGE_STALE' } };
    await page.locator('#changePasswordBtn').click();
    await expect(page.locator('#passwordMessage')).toContainText('session, account or password changed');
    await expect(page.locator('#passwordMessage')).toContainText('No change was made by this request');
    await expect(page.locator('#passwordReviewBtn')).toBeHidden();
  });

  for (const response of [
    { name: 'server error', status: 500, json: { error: 'Internal server error' } },
    { name: 'incomplete success response', status: 200, json: { ok: true } }
  ]) {
    test(`${response.name} requires an explicit outcome check before another change`, async ({ page }) => {
      await previewSettings(page);
      let posts = 0;
      await page.route('**/api/auth/change-password', route => { posts++; return route.fulfill({ status: response.status, json: response.json }); });
      await fillPasswords(page);
      await page.locator('#changePasswordBtn').click();
      await expect(page.locator('#passwordMessage')).toContainText('Could not confirm whether your password changed');
      await expect(page.locator('#passwordMessage')).toContainText('server may still finish');
      await expect(page.locator('#passwordMessage')).toContainText('separate private window');
      await expect(page.locator('#passwordMessage')).toContainText('seed Admin credential');
      await expect(page.locator('#changePasswordBtn')).toBeDisabled();
      await expect(page.locator('#passwordReviewBtn')).toBeVisible();
      await page.locator('#passwordForm').evaluate(form => form.requestSubmit());
      expect(posts).toBe(1);
      await expect(page.locator('#securityNewPassword')).toHaveValue(newPassword);
      await page.locator('#passwordReviewBtn').click();
      await expect(page.locator('#changePasswordBtn')).toBeEnabled();
      await expect(page.locator('#passwordMessage')).toContainText('earlier request that is still running');
      expect(posts).toBe(1);
    });
  }

  test('timeout stops waiting but does not claim the server cancelled the change', async ({ page }) => {
    await page.addInitScript(() => {
      const originalTimeout = AbortSignal.timeout.bind(AbortSignal), originalFetch = window.fetch.bind(window);
      AbortSignal.timeout = ms => originalTimeout(ms === 25000 ? 100 : ms);
      window.__passwordPosts = 0;
      window.fetch = (url, options = {}) => {
        if (typeof url === 'string' && url.endsWith('/api/auth/change-password')) {
          window.__passwordPosts++;
          return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
        }
        return originalFetch(url, options);
      };
    });
    await previewSettings(page);
    await fillPasswords(page);
    await page.locator('#changePasswordBtn').click();
    await expect(page.locator('#passwordMessage')).toContainText('Could not confirm whether your password changed');
    await expect(page.locator('#passwordMessage')).toContainText('server may still finish');
    await expect(page.locator('#changePasswordBtn')).toBeDisabled();
    expect(await page.evaluate(() => window.__passwordPosts)).toBe(1);
  });

  test('unknown revocation results and malformed session lists remain unconfirmed', async ({ page }) => {
    await previewSettings(page);
    await page.route('**/api/auth/sessions', route => {
      if (route.request().method() === 'DELETE') return route.fulfill({ status: 500, json: { error: 'unavailable' } });
      return route.fulfill({ status: 200, json: { sessions: [{ id: 'bad', current: true }] } });
    });
    await page.locator('#refreshSessionsBtn').click();
    await expect(page.locator('#securitySessions')).toContainText('Session list unavailable');
    await page.locator('#revokeSessionsBtn').click();
    await expect(page.locator('#securityMessage')).toContainText('Could not confirm whether other sessions were revoked');
    await expect(page.locator('#securityMessage')).toContainText('server may still finish');
  });

  test('a verified custom endpoint survives a tab reload, while first-party signup returns to this website', async ({ page }) => {
    test.setTimeout(120000);
    const remote = 'https://fixture.invalid', origin = 'http://127.0.0.1:3100';
    const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type,x-csrf-token', 'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS' };
    let logins = 0, remoteMe = 0;
    await page.context().route(`${remote}/**`, route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (path === '/api/auth/login') {
        logins++;
        return route.fulfill({ status: 200, headers, json: { user: { id: 'mock-remote-user', username: 'remote-user', role: 'Viewer' } } });
      }
      if (path === '/api/me') {
        remoteMe++;
        return route.fulfill({ status: 200, headers, json: { authenticated: true, user: { id: 'mock-remote-user', username: 'remote-user', role: 'Viewer' }, csrfToken: 'mock-csrf' } });
      }
      return route.fulfill({ status: 401, headers, json: { error: 'Synthetic fixture' } });
    });
    await page.goto('/workspace.html#settings'); await page.evaluate(() => window.workspaceReady);
    await page.locator('#loginApiUrl').fill(remote);
    await page.locator('#username').fill('remote-user'); await page.locator('#password').fill(currentPassword);
    await page.locator('#loginForm button[type="submit"]').click();
    await expect(page.locator('#settingsUser')).toHaveText('remote-user · Viewer');
    expect(logins).toBe(1);
    expect(await page.evaluate(() => sessionStorage.getItem('aj-workspace-verified-api'))).toBe(remote);
    expect(await page.evaluate(() => localStorage.getItem('aj-v31-api'))).toBe(remote);
    await page.reload(); await page.evaluate(() => window.workspaceReady);
    await expect(page.locator('#settingsUser')).toHaveText('remote-user · Viewer');
    expect(remoteMe).toBeGreaterThanOrEqual(2);

    // A separately opened tab must not inherit the shared legacy override as
    // its active Workspace target. No real remote service is contacted.
    const otherTab = await page.context().newPage();
    try {
      await otherTab.goto('/workspace.html'); await otherTab.evaluate(() => window.workspaceReady);
      await expect(otherTab.locator('#loginForm')).toBeVisible();
      await expect(otherTab.locator('#loginApiUrl')).toHaveValue(origin);
    } finally { await otherTab.close(); }

    const username = `home-after-remote-${Date.now()}`;
    await page.goto('/index.html?signup=1&next=workspace.html');
    await expect(page.locator('#go')).toBeEnabled();
    await page.locator('#u').fill(username); await page.locator('#p').fill(currentPassword); await page.locator('#confirm-p').fill(currentPassword);
    await page.locator('#go').click();
    await expect(page).toHaveURL(/workspace\.html/); await page.evaluate(() => window.workspaceReady);
    await expect(page.locator('#settingsUser')).toHaveText(`${username} · Viewer`);
    expect(await page.evaluate(() => sessionStorage.getItem('aj-workspace-verified-api'))).toBe(origin);
    expect(await page.evaluate(() => localStorage.getItem('aj-v31-api'))).toBe(origin);
  });

  test('connection changes cannot retarget a signed-in password request', async ({ page }) => {
    await previewSettings(page);
    await page.locator('.side [data-nav="connection"]').click();
    const originalShared = await page.evaluate(() => localStorage.getItem('aj-v31-api'));
    await page.locator('#apiUrl').fill('http://untrusted.example');
    await page.locator('#saveConnection').click();
    await expect(page.locator('#connectionMessage')).toContainText('Use an HTTPS API URL');
    expect(await page.evaluate(() => localStorage.getItem('aj-next-api'))).toBe(null);
    await page.locator('#apiUrl').fill('https://user:password@untrusted.example');
    await page.locator('#saveConnection').click();
    await expect(page.locator('#connectionMessage')).toContainText('without credentials');
    await page.locator('#apiUrl').fill('https://untrusted.example');
    await page.locator('#saveConnection').click();
    await expect(page.locator('#connectionMessage')).toContainText('current session keeps its existing endpoint');
    expect(await page.evaluate(() => localStorage.getItem('aj-v31-api'))).toBe(originalShared);
    expect(await page.evaluate(() => localStorage.getItem('aj-next-api'))).toBe('https://untrusted.example');
    const urls = [];
    await page.route('**/api/auth/change-password', route => {
      urls.push(route.request().url());
      return route.fulfill({ status: 401, json: { code: 'PASSWORD_CURRENT_INVALID' } });
    });
    await page.locator('.side [data-nav="settings"]').click();
    await fillPasswords(page);
    await page.locator('#changePasswordBtn').click();
    await expect(page.locator('#passwordMessage')).toContainText('current password was not accepted');
    expect(urls).toEqual(['http://127.0.0.1:3100/api/auth/change-password']);
    await page.locator('#settingsLogout').click();
    await expect(page.locator('#loginForm')).toBeVisible();
    await expect(page.locator('#loginApiUrl')).toHaveValue('https://untrusted.example');
  });
});
