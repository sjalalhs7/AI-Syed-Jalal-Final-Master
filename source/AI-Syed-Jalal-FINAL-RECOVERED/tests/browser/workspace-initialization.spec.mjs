import { test, expect } from '@playwright/test';

test('workspace restores its session and loads Operations once', async ({ page }) => {
  // A disposable preview account; no production connection or credentials.
  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');

  let sessionChecks = 0, snapshots = 0, readinessChecks = 0;
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET' && path === '/api/me') sessionChecks++;
    if (request.method() === 'GET' && path === '/api/admin/system-snapshot') snapshots++;
    if (request.method() === 'GET' && path === '/api/ready') readinessChecks++;
  });
  await page.goto('/workspace.html#operations');
  await page.evaluate(() => window.workspaceReady);
  await expect(page.locator('#opsApi')).toHaveText('ONLINE');
  await expect(page.locator('#opsSnapshot')).toContainText('Active records');
  await page.waitForLoadState('networkidle');
  expect(sessionChecks).toBe(1);
  expect(snapshots).toBe(1);
  // The card and telemetry share one readiness check per render.
  expect(readinessChecks).toBe(1);
  await expect(page.locator('#opsDb')).toHaveText('PRESENT');
  await page.locator('#opsRefreshBtn').click();
  await expect.poll(() => snapshots).toBe(2);
  await page.waitForLoadState('networkidle');
  expect(readinessChecks).toBe(2);
});

test('preview button reports workspace initialization failure and remains usable', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { configurable: true, get() { throw new Error('Test storage blocked'); } });
  });
  await page.goto('/workspace.html');
  const button = page.locator('#previewAccessBtn');
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.locator('#loginForm [role="alert"]')).toContainText('Test storage blocked');
  await expect(button).toBeEnabled();
  await expect(button).toHaveText('Try the local preview');
  expect(pageErrors).toEqual([]);
});

test('preview reports a timed-out startup session instead of remaining disabled', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    AbortSignal.timeout = ms => timeout(ms === 10000 ? 300 : ms);
  });
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  await page.route('**/api/me', async route => {
    await blocked;
    await route.fulfill({ status:200, json:{ authenticated:false, user:null } }).catch(() => {});
  });
  try {
    await page.goto('/workspace.html');
    const button = page.locator('#previewAccessBtn');
    await expect(button).toBeVisible();
    await button.click();
    await expect(page.locator('#loginForm [role="alert"]')).toContainText('timed out');
    await expect(page.locator('#loginForm [role="alert"]')).toContainText('reload');
    await expect(button).toBeEnabled();
    expect(pageErrors).toEqual([]);
  } finally { release(); }
});

test('Operations does not keep stale green status when telemetry or readiness fails', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await page.goto('/workspace.html#operations');
  await expect(page.locator('#opsApi')).toHaveText('ONLINE');
  await expect(page.locator('#opsDb')).toHaveText('PRESENT');
  await expect(page.locator('#opsSnapshot')).toContainText('Active records');
  await page.waitForLoadState('networkidle');
  // This case tests how specific mocked responses are classified, not the
  // production deadlines. A loaded CI run recorded a valid mocked response but
  // showed UNKNOWN about 12 seconds later; the exact cause is not established.
  // Give only these mocked endpoints more time, and test the actual timeout
  // path separately below. Production code is unchanged.
  await page.evaluate(() => {
    const nativeFetch = window.fetch.bind(window), timeout = AbortSignal.timeout.bind(AbortSignal);
    const mocked = ['/api/ready', '/api/health', '/api/stats', '/api/admin/system-snapshot', '/api/admin/metrics'];
    window.fetch = (url, options = {}) => nativeFetch(url,
      mocked.some(path => String(url).endsWith(path)) ? { ...options, signal: timeout(60000) } : options);
  });
  await page.route('**/api/ready', route => route.fulfill({ status:503, json:{ ready:false, schemaTables:23, required:24, missing:['agent_runs'] } }));
  await page.route('**/api/stats', route => route.fulfill({ status:500, json:{ error:'telemetry unavailable' } }));
  // Give the independent endpoints known successful responses. Their real
  // integration is exercised above; this checks behavior during a partial outage.
  let healthyChecks = 0;
  await page.route('**/api/health', route => { healthyChecks++; return route.fulfill({ json:{ ok:true } }); });
  await page.route('**/api/admin/system-snapshot', route => route.fulfill({ json:{ records:{ active:42, deleted:5 }, documents:2, sessions:{ active:3 }, audit24h:{ total:4 }, ai:{ active:1 }, regions:[], sectors:[] } }));
  await page.route('**/api/admin/metrics', route => route.fulfill({ json:{ requests:{ requests:9, errors:1, rateLimited:0 }, db:{ activeSessions:3 } } }));
  await page.locator('#opsRefreshBtn').click();
  await expect(page.locator('#schemaRepairTag')).toHaveText('INCOMPLETE', { timeout:45000 });
  await expect(page.locator('#opsDb')).toHaveText('INCOMPLETE', { timeout:45000 });
  await expect(page.locator('#opsApi')).toHaveText('ONLINE', { timeout:45000 });
  expect(healthyChecks).toBeGreaterThan(0);
  await expect(page.locator('#opsRecords')).toHaveText('—');
  await expect(page.locator('#opsSnapshot')).toContainText('Active records: 42', { timeout:45000 });
  await expect(page.locator('#opsTelemetry')).toContainText('AI runs (24h): 9', { timeout:45000 });
  await expect(page.locator('#opsMessage')).toContainText('record statistics', { timeout:45000 });
  await page.unroute('**/api/ready');
  await page.route('**/api/ready', route => route.fulfill({ status:503, json:{ error:'database unavailable' } }));
  await page.unroute('**/api/health');
  let failedHealthChecks = 0;
  await page.route('**/api/health', route => { failedHealthChecks++; return route.abort('failed'); });
  await page.locator('#opsRefreshBtn').click();
  await expect(page.locator('#schemaRepairTag')).toHaveText('UNKNOWN', { timeout:45000 });
  await expect(page.locator('#opsDb')).toHaveText('UNKNOWN', { timeout:45000 });
  await expect(page.locator('#opsApi')).toHaveText('UNKNOWN', { timeout:45000 });
  expect(failedHealthChecks).toBeGreaterThan(0);
});

test('a timed-out readiness check stays unknown and never offers schema repair', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await page.goto('/workspace.html#operations');
  await expect(page.locator('#schemaRepairTag')).toHaveText('TABLES PRESENT');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => {
    const nativeFetch = window.fetch.bind(window), timeout = AbortSignal.timeout.bind(AbortSignal);
    // Shorten only the readiness deadline to exercise the actual timeout path.
    window.fetch = (url, options = {}) => nativeFetch(url,
      String(url).endsWith('/api/ready') ? { ...options, signal: timeout(2000) } : options);
  });
  let release, started, finished;
  const blocked = new Promise(resolve => { release = resolve; });
  const requested = new Promise(resolve => { started = resolve; });
  const handled = new Promise(resolve => { finished = resolve; });
  await page.route('**/api/ready', async route => {
    started();
    await blocked;
    try {
      await route.fulfill({ status:503, json:{ ready:false, schemaTables:23, required:24, missing:['agent_runs'], schemaRepairEnabled:true } }).catch(() => {});
    } finally { finished(); }
  });
  try {
    await page.locator('#opsRefreshBtn').click();
    await requested;
    await expect(page.locator('#schemaRepairTag')).toHaveText('UNKNOWN', { timeout:30000 });
    await expect(page.locator('#schemaRepairText')).toContainText('Could not read the schema state');
    await expect(page.locator('#opsDb')).toHaveText('UNKNOWN');
    await expect(page.locator('#schemaRepairBtn')).toBeHidden();
    release();
    await handled;
    await expect(page.locator('#schemaRepairTag')).toHaveText('UNKNOWN');
    await expect(page.locator('#schemaRepairBtn')).toBeHidden();
  } finally { release(); }
});

test('a slower Operations refresh cannot replace newer telemetry', async ({ page }) => {
  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await page.goto('/workspace.html#operations');
  await expect(page.locator('#opsSnapshot')).toContainText('Active records');
  await page.waitForLoadState('networkidle');
  let release, started, calls = 0;
  const held = new Promise(resolve => { started = resolve; });
  const wait = new Promise(resolve => { release = resolve; });
  await page.route('**/api/stats', async route => {
    calls++;
    if (calls === 1) { started(); await wait; return route.fulfill({ status:200, json:{ total:999 } }); }
    return route.fulfill({ status:200, json:{ total:2 } });
  });
  try {
    await page.locator('#opsRefreshBtn').click();
    await held;
    await page.locator('#opsRefreshBtn').click();
    await expect(page.locator('#opsRecords')).toHaveText('2');
    release();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#opsRecords')).toHaveText('2');
  } finally { release(); }
});

test('an Operations telemetry timeout is shown as unavailable rather than stale', async ({ page }) => {
  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await page.goto('/workspace.html#operations');
  await expect(page.locator('#opsSnapshot')).toContainText('Active records');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => {
    const nativeFetch = window.fetch.bind(window);
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    // Shorten only the statistics deadline, not the other five endpoints.
    window.fetch = (url, options = {}) => nativeFetch(url,
      String(url).endsWith('/api/stats') ? { ...options, signal: timeout(300) } : options);
  });
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  await page.route('**/api/stats', async route => {
    await blocked;
    await route.fulfill({ status:200, json:{ total:3 } }).catch(() => {});
  });
  try {
    await page.locator('#opsRefreshBtn').click();
    await expect(page.locator('#opsMessage')).toContainText('record statistics');
    await expect(page.locator('#opsSnapshot')).toContainText('Active records');
    await expect(page.locator('#opsRecords')).toHaveText('—');
    await expect(page.locator('#opsDb')).toHaveText('PRESENT');
    await expect(page.locator('#opsApi')).toHaveText('ONLINE');
  } finally { release(); }
});

test('Operations renders independent results before a slow statistics request completes', async ({ page }) => {
  await page.goto('/jalalai.html'); await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await page.goto('/workspace.html#operations');
  await expect(page.locator('#opsSnapshot')).toContainText('Active records');
  await page.waitForLoadState('networkidle');
  let release, started;
  const held = new Promise(resolve => { started = resolve; });
  const wait = new Promise(resolve => { release = resolve; });
  await page.route('**/api/stats', async route => { started(); await wait; return route.fulfill({ json: { total: 7 } }).catch(() => {}); });
  try {
    await page.locator('#opsRefreshBtn').click(); await held;
    await expect(page.locator('#opsSnapshot')).toContainText('Active records');
    await expect(page.locator('#opsTelemetry')).toContainText('AI runs (24h)');
    await expect(page.locator('#opsRecords')).toHaveText('—');
    release();
    await expect(page.locator('#opsRecords')).toHaveText('7');
  } finally { release(); }
});

test('Operations clears malformed user and snapshot data while preserving independent statistics', async ({ page }) => {
  await page.goto('/jalalai.html'); await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await page.goto('/workspace.html#operations');
  await expect(page.locator('#opsSnapshot')).toContainText('Active records');
  await page.waitForLoadState('networkidle');
  await page.route('**/api/admin/users', route => route.fulfill({ json: { users: [{ active: 'true' }] } }));
  await page.route('**/api/admin/system-snapshot', route => route.fulfill({ json: { records: { active: '<script>bad</script>', deleted: 0 } } }));
  await page.locator('#opsRefreshBtn').click();
  await expect(page.locator('#opsUsers')).toHaveText('—');
  await expect(page.locator('#opsSnapshot')).toHaveText('Current data unavailable.');
  await expect(page.locator('#opsDistribution')).toHaveText('Current data unavailable.');
  await expect(page.locator('#opsRecords')).toHaveText(/\d+/);
  await expect(page.locator('#opsMessage')).toContainText('system snapshot');
  expect(await page.locator('#opsSnapshot script').count()).toBe(0);
});
