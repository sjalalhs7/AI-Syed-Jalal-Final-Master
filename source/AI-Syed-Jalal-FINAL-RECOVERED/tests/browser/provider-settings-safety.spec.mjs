import { test, expect } from '@playwright/test';

async function previewAdmin(page) {
  await page.setViewportSize({ width: 900, height: 650 });
  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
}

test('provider-key controls preserve other local preview keys and identify their source', async ({ page }) => {
  test.setTimeout(90000);
  await previewAdmin(page);
  await page.goto('/workspace.html#operations');
  await expect(page.locator('#providerKeysCard')).toBeVisible();
  try {
    await page.locator('#providerPick').selectOption('openai');
    await page.locator('#providerKey').fill('local-browser-openai-key-12345678');
    await page.locator('#providerSaveBtn').click();
    await expect(page.locator('#providerResult')).toContainText('Saved.');
    await expect(page.locator('#providerList')).toContainText('admin-console');
    await page.locator('#providerPick').selectOption('gemini');
    await page.locator('#providerKey').fill('local-browser-gemini-key-12345678');
    await page.locator('#providerSaveBtn').click();
    const rows = page.locator('#providerList > div');
    await expect(rows.filter({ hasText: 'openai' })).toContainText('KEY SET');
    await expect(rows.filter({ hasText: 'gemini' })).toContainText('KEY SET');
    await page.locator('#providerRemoveBtn').click();
    await expect(rows.filter({ hasText: 'gemini' })).toContainText('NO KEY');
    await expect(rows.filter({ hasText: 'openai' })).toContainText('KEY SET');
  } finally {
    // The browser test server owns an isolated PGlite database. Do not let
    // dummy keys affect later browser tests if an assertion fails midway.
    const cleanup = await page.evaluate(async () => {
      const me = await fetch('/api/me', { credentials: 'include' }).then(r => r.json());
      const statuses = [];
      for (const provider of ['openai', 'gemini']) {
        const response = await fetch('/api/admin/providers', { method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken },
          body: JSON.stringify({ provider, remove: true }) });
        statuses.push(response.status);
      }
      return statuses;
    });
    expect(cleanup).toEqual([200, 200]);
  }
});

test('a lost provider-key response is shown as unconfirmed, not as a definite failure', async ({ page }) => {
  await previewAdmin(page);
  let requests = 0;
  await page.route('**/api/admin/providers', route => {
    if (route.request().method() === 'POST') { requests++; return route.abort('failed'); }
    return route.fulfill({ json: { providers: [] } });
  });
  await page.goto('/workspace.html#operations');
  await expect(page.locator('#providerKeysCard')).toBeVisible();
  await page.locator('#providerKey').fill('local-test-only-key-12345678');
  await page.locator('#providerSaveBtn').click();
  await expect(page.locator('#providerResult')).toContainText('Could not confirm whether the change was saved');
  await expect(page.locator('#providerResult')).toContainText('before retrying');
  expect(requests).toBe(1);
});

test('an unconfirmed server write tells the admin to investigate before retrying', async ({ page }) => {
  await previewAdmin(page);
  await page.route('**/api/admin/providers', route => route.request().method() === 'POST'
    ? route.fulfill({ status:503, json:{ code:'PROVIDER_SETTINGS_WRITE_UNCONFIRMED', error:'The provider-key change could not be confirmed. Refresh the provider status and ask an administrator to investigate before retrying.' } })
    : route.fulfill({ json:{ providers:[] } }));
  await page.goto('/workspace.html#operations');
  await expect(page.locator('#providerKeysCard')).toBeVisible();
  await page.locator('#providerKey').fill('local-test-only-key-12345678');
  await page.locator('#providerSaveBtn').click();
  await expect(page.locator('#providerResult')).toContainText('could not be confirmed');
  await expect(page.locator('#providerResult')).toContainText('before retrying');
});

test('an unreadable settings store is shown as unknown, not as missing keys', async ({ page }) => {
  await previewAdmin(page);
  await page.route('**/api/admin/providers', route => route.fulfill({ json: { providers: [
    { provider:'gemini', configured:false, source:'unknown', hint:'', status:'Stored settings could not be read; configuration is unknown' },
    { provider:'openai', configured:true, source:'environment', hint:'••••1234', status:'Key configured; live call not yet verified' }
  ] } }));
  await page.goto('/workspace.html#operations');
  const rows = page.locator('#providerList > div');
  await expect(rows.filter({ hasText:'gemini' })).toContainText('UNKNOWN');
  await expect(rows.filter({ hasText:'gemini' })).toContainText('configuration is unknown');
  await expect(rows.filter({ hasText:'gemini' })).not.toContainText('NO KEY');
  await expect(rows.filter({ hasText:'openai' })).toContainText('KEY SET');
});

test('an expired Admin session sends no provider-key change', async ({ page }) => {
  await previewAdmin(page);
  let writes = 0;
  await page.route('**/api/admin/providers', route => {
    if (route.request().method() === 'POST') { writes++; return route.abort('failed'); }
    return route.fulfill({ json: { providers: [] } });
  });
  await page.goto('/workspace.html#operations');
  await expect(page.locator('#providerKeysCard')).toBeVisible();
  await page.route('**/api/me', route => route.fulfill({ json:{ authenticated:false, user:null, csrfToken:null } }));
  await page.locator('#providerKey').fill('local-test-only-key-12345678');
  await page.locator('#providerSaveBtn').click();
  await expect(page.locator('#providerResult')).toContainText('no provider-key request was sent');
  await expect(page.locator('#providerSaveBtn')).toBeEnabled();
  expect(writes).toBe(0);
});

test('provider controls prevent duplicate and misdirected changes while a request is pending', async ({ page }) => {
  test.setTimeout(90000);
  // Keep the intentionally held mocked POST from tripping the real deadline on
  // a slow test runner; production still uses its normal 15-second timeout.
  await page.addInitScript(() => {
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    AbortSignal.timeout = ms => timeout(ms === 15000 ? 60000 : ms);
  });
  await previewAdmin(page);
  let release, signalReceived, calls = 0, sent;
  const received = new Promise(resolve => { signalReceived = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  await page.route('**/api/admin/providers', async route => {
    if (route.request().method() === 'POST') {
      calls++; sent = route.request().postDataJSON(); signalReceived();
      await held;
      return route.fulfill({ json:{ ok:true, providers:[] } });
    }
    return route.fulfill({ json:{ providers:[] } });
  });
  await page.goto('/workspace.html#operations');
  await expect(page.locator('#providerKeysCard')).toBeVisible();
  await page.locator('#providerPick').selectOption('openai');
  await page.locator('#providerKey').fill('local-test-only-key-12345678');
  try {
    await page.locator('#providerSaveBtn').click();
    await received;
    for (const id of ['providerSaveBtn', 'providerRemoveBtn', 'providerRefreshBtn', 'providerPick', 'providerKey']) {
      await expect(page.locator('#'+id)).toBeDisabled();
    }
    expect(sent).toEqual({ provider:'openai', key:'local-test-only-key-12345678' });
    expect(calls).toBe(1);
  } finally { release(); }
  await expect(page.locator('#providerResult')).toContainText('Saved.');
  await expect(page.locator('#providerSaveBtn')).toBeEnabled();
});

test('a slower provider-status response cannot replace a newer one', async ({ page }) => {
  test.setTimeout(90000);
  // Hold the old mocked GET beyond slow browser scheduling without altering
  // the production timeout.
  await page.addInitScript(() => {
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    AbortSignal.timeout = ms => timeout(ms === 10000 ? 60000 : ms);
  });
  await previewAdmin(page);
  let count = 0, release, signalFirst, signalDone, fulfilled = false;
  const first = new Promise(resolve => { signalFirst = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  const firstDone = new Promise(resolve => { signalDone = resolve; });
  await page.route('**/api/admin/providers', async route => {
    if (++count === 1) {
      signalFirst();
      await held;
      try {
        await route.fulfill({ json:{ providers:[{ provider:'openai', configured:false, source:'none', hint:'', status:'No key configured' }] } });
        fulfilled = true;
      } finally { signalDone(); }
    } else {
      await route.fulfill({ json:{ providers:[{ provider:'openai', configured:true, source:'environment', hint:'••••1234', status:'Key configured; live call not yet verified' }] } });
    }
  });
  await page.goto('/workspace.html#operations');
  try {
    await first;
    await page.locator('#providerRefreshBtn').click();
    await expect(page.locator('#providerList')).toContainText('KEY SET');
  } finally { release(); }
  await firstDone;
  expect(fulfilled).toBe(true);
  await expect(page.locator('#providerList')).toContainText('KEY SET');
  await expect(page.locator('#providerList')).not.toContainText('NO KEY');
});

test('malformed success and unexpected server errors do not claim a key change failed or succeeded', async ({ page }) => {
  await previewAdmin(page);
  let response = 'malformed', posts = 0;
  await page.route('**/api/admin/providers', route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json:{ providers:[] } });
    posts++;
    return response === 'malformed'
      ? route.fulfill({ status:200, json:{ ok:'yes' } })
      : route.fulfill({ status:500, json:{ error:'Internal server error' } });
  });
  await page.goto('/workspace.html#operations');
  await expect(page.locator('#providerKeysCard')).toBeVisible();
  await page.locator('#providerKey').fill('local-test-only-key-12345678');
  await page.locator('#providerSaveBtn').click();
  await expect(page.locator('#providerResult')).toContainText('could not be confirmed');
  await expect(page.locator('#providerResult')).not.toContainText('Saved.');
  response = 'error';
  await page.locator('#providerSaveBtn').click();
  await expect(page.locator('#providerResult')).toContainText('Internal server error');
  await expect(page.locator('#providerResult')).toContainText('could not be confirmed');
  expect(posts).toBe(2);
});
