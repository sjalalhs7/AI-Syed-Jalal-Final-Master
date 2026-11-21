import { test, expect, request } from '@playwright/test';

const password = 'Synthetic-admin-lifecycle-123';

async function createAdmin(request) {
  const response = await request.post('/api/demo', { data: {} });
  expect(response.status()).toBe(200);
  const me = await (await request.get('/api/me')).json();
  expect(me.user.role).toBe('Admin');
  return { me, cookies: await request.storageState().then(state => state.cookies) };
}

async function createTarget(request, username) {
  const me = await (await request.get('/api/me')).json();
  const created = await request.post('/api/admin/users', {
    headers: { 'X-CSRF-Token': me.csrfToken },
    data: { username, password, role: 'Viewer' }
  });
  expect(created.status()).toBe(201);
  return (await created.json()).user;
}

async function setup(browser, username) {
  const owner = await request.newContext({ baseURL: 'http://127.0.0.1:3100' });
  const admin = await createAdmin(owner);
  const target = await createTarget(owner, username);
  const targetContext = await request.newContext({ baseURL: 'http://127.0.0.1:3100' });
  const login = await targetContext.post('/api/auth/login', { data: { username, password } });
  expect(login.status()).toBe(200);

  const browserContext = await browser.newContext({ baseURL: 'http://127.0.0.1:3100' });
  await browserContext.addCookies(admin.cookies);
  const adminPage = await browserContext.newPage();
  await adminPage.goto('/workspace.html#users');
  await expect(adminPage.locator('#app')).toBeVisible();
  await expect(adminPage.locator('#usersBody')).toContainText(username.toLowerCase());
  return { owner, targetContext, browserContext, adminPage, admin, target };
}

test('Admin account deactivation revokes existing sessions; reactivation never revives them', async ({ browser }) => {
  test.setTimeout(90000);
  const username = `Lifecycle${Date.now()}`;
  const state = await setup(browser, username);
  const { owner, targetContext, browserContext, adminPage, target } = state;
  try {
    const row = adminPage.locator(`#usersBody tr:has([data-user-id="${target.id}"])`);
    await expect(row).toContainText('Active');
    await row.locator('[data-user-action="toggle"]').click();
    await expect(row.locator('[data-user-action="toggle"]')).toHaveText('Activate');
    expect((await (await targetContext.get('/api/me')).json()).authenticated).toBe(false);
    expect((await targetContext.post('/api/auth/login', { data: { username, password } })).status()).toBe(401);
    expect((await owner.get('/api/me')).status()).toBe(200);

    await row.locator('[data-user-action="toggle"]').click();
    await expect(row.locator('[data-user-action="toggle"]')).toHaveText('Deactivate');
    expect((await (await targetContext.get('/api/me')).json()).authenticated).toBe(false);
    expect((await targetContext.post('/api/auth/login', { data: { username, password } })).status()).toBe(200);
  } finally {
    await Promise.all([owner.dispose(), targetContext.dispose(), browserContext.close()]);
  }
});

test('Admin status mutation is single-flight and a lost response prompts verification, never an automatic retry', async ({ browser }) => {
  test.setTimeout(90000);
  const username = `Uncertain${Date.now()}`;
  const { owner, targetContext, browserContext, adminPage, target } = await setup(browser, username);
  let patches = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  await adminPage.route(`**/api/admin/users/${target.id}`, async route => {
    if (route.request().method() !== 'PATCH') return route.continue();
    patches++;
    await gate;
    await route.abort('failed');
  });
  try {
    const row = adminPage.locator(`#usersBody tr:has([data-user-id="${target.id}"])`);
    const button = row.locator('[data-user-action="toggle"]');
    await button.click();
    await expect.poll(() => patches).toBe(1);
    await expect(button).toBeDisabled();
    await button.click({ force: true });
    expect(patches).toBe(1);
    release();
    await expect(adminPage.locator('#userStatusMessage')).toContainText('may still finish');
    await expect(row.locator('[data-user-action="toggle"]')).toHaveText('Deactivate');
    expect((await targetContext.get('/api/me')).status()).toBe(200);
    expect(patches).toBe(1);
  } finally {
    release();
    await Promise.all([owner.dispose(), targetContext.dispose(), browserContext.close()]);
  }
});
