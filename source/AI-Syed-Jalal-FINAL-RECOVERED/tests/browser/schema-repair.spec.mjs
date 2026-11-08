import { test, expect } from '@playwright/test';

// These browser tests use mocked readiness/repair responses. They verify the
// safety warnings, consent and UI behavior without changing production data.
test('admin repairs an incomplete schema from the Operations Center', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  // Sign in the way the existing suite does, then open the Operations view.
  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');

  // Simulate the table names reported by production; this is not a full schema copy.
  let state = 'broken';
  await page.route('**/api/ready', async route => {
    if (state === 'broken') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false, ready: false, schemaRepairEnabled: true, database: 'Neon PostgreSQL', schemaTables: 13, required: 24,
          missing: ['agent_skills', 'agent_self_checks', 'arena_battles', 'arena_responses',
            'arena_artifacts', 'arena_ratings', 'agent_runs', 'expert_reviews', 'app_settings', 'app_bootstrap', 'content_reports'],
          summary: '13 of 24 tables present. Arena battles, Agent Lab self-check and the Expert Critic need these tables.',
          howToFix: 'An Admin can POST /api/admin/schema/repair',
          signInAffected: false
        })
      });
      return;
    }
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        ok: true, ready: true, database: 'Neon PostgreSQL', schemaTables: 24, required: 24,
        missing: [], summary: '24 of 24 required table names present.',
        howToFix: 'Nothing to do.', signInAffected: false
      })
    });
  });

  let repairCalled = null, repairHeaders = {};
  await page.route('**/api/admin/schema/repair', async route => {
    repairCalled = JSON.parse(route.request().postData() || '{}');
    repairHeaders = route.request().headers();
    state = 'fixed';
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        ok: true, changed: true, before: 13, after: 24, required: 24, missing: [],
        applied: ['schema.sql', '009_v133_agent_skills.sql'], failed: []
      })
    });
  });

  await page.route('**/api/admin/diagnostics', route => route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ status:'schema-incomplete', checks:{ database:true, schema:false, aiRuntime:true }, schemaTables:13, required:24, pool:{ available:false }, ai:{ active:null } }) }));

  // Open the Operations view and read the honest state.
  await page.goto('/workspace.html#operations');
  await expect(page.locator('#app')).toBeVisible();
  await page.locator('.side [data-nav="operations"]').click();
  await expect(page.locator('#schemaRepairTag')).toHaveText('INCOMPLETE');
  await expect(page.locator('#schemaRepairText')).toContainText('13 of 24 tables present');
  await expect(page.locator('#schemaRepairText')).toContainText('arena_battles');
  await expect(page.locator('#schemaBackupWarning')).toContainText('restorable full database backup');
  await expect(page.locator('#schemaBackupWarning')).toContainText('isolated copy');
  await expect(page.locator('#schemaBackupWarning')).toContainText('authorization');
  await expect(page.locator('#schemaBackupWarning')).toContainText('active records only');
  await page.locator('#opsDiagnosticsBtn').click();
  await expect(page.locator('#opsDiagnostics')).toContainText('Required table names 13/24');
  await expect(page.locator('#opsDiagnostics')).toContainText('do not verify columns');

  // The button must not be offered to non-admins.
  const repairBtn = page.locator('#schemaRepairBtn');
  await expect(repairBtn).toBeVisible();
  // Focusing the button starts an asynchronous readiness refresh. Complete it
  // before opening the native confirmation so the mocked route is not being
  // fulfilled while Playwright is handling that dialog. The late-response race
  // itself is exercised separately below.
  await repairBtn.focus();
  await page.waitForLoadState('networkidle');
  await expect(repairBtn).toBeVisible();
  let confirmationMessage = '';
  page.once('dialog', dialog => { confirmationMessage = dialog.message(); return dialog.accept(); });
  await repairBtn.click();

  // It must send the explicit confirmation token, never a bare POST.
  await expect.poll(() => repairCalled).not.toBeNull();
  expect(repairCalled).toEqual({ confirm: 'apply-schema-repair' });
  expect(repairHeaders['x-csrf-token']).toMatch(/^[a-f0-9]{64}$/);
  expect(confirmationMessage).toContain('restorable full database backup');
  expect(confirmationMessage).toContain('isolated copy');
  expect(confirmationMessage).toContain('authorization');
  expect(confirmationMessage).toContain('partial changes');

  await expect(page.locator('#schemaRepairResult')).toContainText('24 of 24');
  await expect(page.locator('#schemaRepairTag')).toHaveText('TABLES PRESENT');
  await expect(repairBtn).toBeHidden();

  expect(errors).toEqual([]);
});

test('repair requires user confirmation and reports partial migration failures', async ({ page }) => {
  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await page.route('**/api/ready', route => route.fulfill({ status: 503, contentType: 'application/json',
    body: JSON.stringify({ ready: false, schemaRepairEnabled: true, schemaTables: 23, required: 24, missing: ['agent_runs'], summary: 'One table is missing.' }) }));
  let calls = 0;
  await page.route('**/api/admin/schema/repair', route => {
    calls++;
    return route.fulfill({ status: 207, contentType: 'application/json',
      body: JSON.stringify({ ok: false, before: 13, after: 24, required: 24, missing: [], failed: [{ part: 'schema.sql', error: 'index failed' }] }) });
  });
  await page.goto('/workspace.html#operations');
  await page.locator('.side [data-nav="operations"]').click();
  const button = page.locator('#schemaRepairBtn');
  await expect(button).toBeVisible();
  page.once('dialog', dialog => dialog.dismiss());
  await button.click();
  await expect(page.locator('#schemaRepairResult')).toContainText('Cancelled');
  expect(calls).toBe(0);
  page.once('dialog', dialog => dialog.accept());
  // Wait for the intercepted response before checking the UI. Otherwise the
  // assertion can start while the mocked request is still being delivered.
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/admin/schema/repair') && response.request().method() === 'POST');
  await button.click();
  const response = await responsePromise;
  expect(response.status()).toBe(207);
  await expect(page.locator('#schemaRepairResult')).toContainText('Repair incomplete');
  await expect(page.locator('#schemaRepairResult')).toContainText('index failed');
  await expect(page.locator('#schemaRepairTag')).toHaveText('REVIEW REQUIRED');
  await expect(page.locator('#schemaRepairResult')).toContainText('before retrying');
  await expect(button).toBeHidden();
  await page.locator('#opsRefreshBtn').click();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#schemaRepairTag')).toHaveText('REVIEW REQUIRED');
  await expect(button).toBeHidden();
  expect(calls).toBe(1);
});

test('unavailable readiness does not invite an Admin to repair an unknown problem', async ({ page }) => {
  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await page.route('**/api/ready', route => route.fulfill({ status: 503, contentType: 'application/json',
    body: JSON.stringify({ error: 'Database temporarily unavailable' }) }));
  await page.goto('/workspace.html#operations');
  await expect(page.locator('#schemaRepairTag')).toHaveText('UNKNOWN');
  await expect(page.locator('#schemaRepairText')).toContainText('Readiness details unavailable');
  await expect(page.locator('#schemaRepairBtn')).toBeHidden();
  await expect(page.locator('#opsDb')).toHaveText('UNKNOWN');
});

test('a stale readiness response cannot clear a partial repair warning', async ({ page }) => {
  test.setTimeout(120000);
  // This test deliberately holds a readiness response while the confirmation
  // and repair finish. Give only this simulated race a longer deadline so a
  // slow software-rendered browser cannot abort the held request prematurely.
  // Production still uses its 10-second deadline.
  await page.setViewportSize({ width: 900, height: 650 });
  await page.addInitScript(() => {
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    AbortSignal.timeout = ms => timeout(ms === 10000 ? 60000 : ms);
  });
  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  let holdNext = false, signalRequest, releaseResponse;
  const held = new Promise(resolve => { signalRequest = resolve; });
  const release = new Promise(resolve => { releaseResponse = resolve; });
  await page.route('**/api/ready', async route => {
    if (holdNext) {
      holdNext = false;
      signalRequest();
      await release;
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ready: true, schemaTables: 24, required: 24, missing: [] }) });
    }
    return route.fulfill({ status: 503, contentType: 'application/json',
      body: JSON.stringify({ ready: false, schemaRepairEnabled: true, schemaTables: 23, required: 24, missing: ['agent_runs'] }) });
  });
  await page.route('**/api/admin/schema/repair', route => route.fulfill({ status: 207, contentType: 'application/json',
    body: JSON.stringify({ ok: false, before: 23, after: 24, required: 24, missing: [], failed: [{ part: 'migration.sql', error: 'constraint failed' }] }) }));
  await page.goto('/workspace.html#operations');
  const button = page.locator('#schemaRepairBtn');
  await expect(button).toBeVisible();
  await page.waitForLoadState('networkidle');
  // Focus triggers a readiness check, which will return after the repair result.
  holdNext = true;
  await button.focus();
  await held;
  page.once('dialog', dialog => dialog.accept());
  const repair = page.waitForResponse(response => response.url().endsWith('/api/admin/schema/repair') && response.request().method() === 'POST');
  await button.click();
  await repair;
  await expect(page.locator('#schemaRepairTag')).toHaveText('REVIEW REQUIRED');
  const ready = page.waitForResponse(response => response.url().endsWith('/api/ready') && response.status() === 200);
  releaseResponse();
  await ready;
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#schemaRepairTag')).toHaveText('REVIEW REQUIRED');
  await expect(page.locator('#schemaRepairResult')).toContainText('constraint failed');
  await expect(button).toBeHidden();
});

test('a repair request that returns an error is treated as potentially partial', async ({ page }) => {
  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await page.route('**/api/ready', route => route.fulfill({ status: 503, contentType: 'application/json',
    body: JSON.stringify({ ready: false, schemaRepairEnabled: true, schemaTables: 23, required: 24, missing: ['agent_runs'] }) }));
  await page.route('**/api/admin/schema/repair', route => route.fulfill({ status: 500, contentType: 'application/json',
    body: JSON.stringify({ error: 'database connection lost' }) }));
  await page.goto('/workspace.html#operations');
  const button = page.locator('#schemaRepairBtn');
  await expect(button).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  const repair = page.waitForResponse(response => response.url().endsWith('/api/admin/schema/repair') && response.request().method() === 'POST');
  await button.click();
  await repair;
  await expect(page.locator('#schemaRepairTag')).toHaveText('REVIEW REQUIRED');
  await expect(page.locator('#schemaRepairResult')).toContainText('partial changes');
  await expect(page.locator('#schemaRepairResult')).toContainText('before retrying');
  await expect(button).toBeHidden();
});

test('a lost repair connection is an uncertain result, not permission to retry', async ({ page }) => {
  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await page.route('**/api/ready', route => route.fulfill({ status: 503, contentType: 'application/json',
    body: JSON.stringify({ ready: false, schemaRepairEnabled: true, schemaTables: 23, required: 24, missing: ['agent_runs'] }) }));
  let calls = 0;
  await page.route('**/api/admin/schema/repair', route => { calls++; return route.abort('failed'); });
  await page.goto('/workspace.html#operations');
  const button = page.locator('#schemaRepairBtn');
  await expect(button).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await button.click();
  await expect(page.locator('#schemaRepairTag')).toHaveText('REVIEW REQUIRED');
  await expect(page.locator('#schemaRepairResult')).toContainText('outcome could not be verified');
  await expect(page.locator('#schemaRepairResult')).toContainText('partial changes');
  await expect(button).toBeHidden();
  expect(calls).toBe(1);
});

test('a timed-out session check does not send a repair request', async ({ page }) => {
  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await page.route('**/api/ready', route => route.fulfill({ status: 503, contentType: 'application/json',
    body: JSON.stringify({ ready: false, schemaRepairEnabled: true, schemaTables: 23, required: 24, missing: ['agent_runs'] }) }));
  let repairs = 0;
  await page.route('**/api/admin/schema/repair', route => { repairs++; return route.abort('failed'); });
  await page.goto('/workspace.html#operations');
  const button = page.locator('#schemaRepairBtn');
  await expect(button).toBeVisible();
  await button.focus(); // Finish the button's readiness refresh first.
  await page.waitForLoadState('networkidle');
  // Shorten only the test's 10-second deadline; production keeps the real limit.
  await page.evaluate(() => {
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    AbortSignal.timeout = ms => timeout(ms === 10000 ? 300 : ms);
  });
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  await page.route('**/api/me', async route => {
    await blocked;
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }).catch(() => {});
  });
  try {
    page.once('dialog', dialog => dialog.accept());
    await button.click();
    await expect(page.locator('#schemaRepairResult')).toContainText('Repair was not started');
    await expect(button).toBeEnabled();
    expect(repairs).toBe(0);
  } finally { release(); }
});

test('an expired Admin session does not send a repair request', async ({ page }) => {
  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await page.route('**/api/ready', route => route.fulfill({ status: 503, json:{ ready:false, schemaRepairEnabled:true, schemaTables:23, required:24, missing:['agent_runs'] } }));
  await page.goto('/workspace.html#operations');
  const button = page.locator('#schemaRepairBtn');
  await expect(button).toBeVisible();
  await button.focus();
  await page.waitForLoadState('networkidle');
  await page.route('**/api/me', route => route.fulfill({ status:200, json:{ authenticated:false, user:null, csrfToken:null } }));
  let repairs = 0;
  await page.route('**/api/admin/schema/repair', route => { repairs++; return route.abort('failed'); });
  page.once('dialog', dialog => dialog.accept());
  await button.click();
  await expect(page.locator('#schemaRepairResult')).toContainText('Repair was not started');
  await expect(page.locator('#schemaRepairResult')).toContainText('administrator session');
  expect(repairs).toBe(0);
});

test('an already-repaired schema reports a no-op accurately', async ({ page }) => {
  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  let ready = false;
  await page.route('**/api/ready', route => route.fulfill(ready
    ? { status:200, json:{ ready:true, schemaTables:24, required:24, missing:[] } }
    : { status:503, json:{ ready:false, schemaRepairEnabled:true, schemaTables:23, required:24, missing:['agent_runs'] } }));
  await page.route('**/api/admin/schema/repair', route => {
    ready = true;
    return route.fulfill({ status:200, json:{ ok:true, changed:false, tables:24, required:24, message:'All required table names are present; no migrations were run.' } });
  });
  await page.goto('/workspace.html#operations');
  const button = page.locator('#schemaRepairBtn');
  await expect(button).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await button.click();
  await expect(page.locator('#schemaRepairResult')).toContainText('no migrations were run');
  await expect(page.locator('#schemaRepairResult')).toContainText('Verify affected features');
  await expect(page.locator('#schemaRepairTag')).toHaveText('TABLES PRESENT');
  await expect(button).toBeHidden();
});

test('a malformed successful repair response requires review', async ({ page }) => {
  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await page.route('**/api/ready', route => route.fulfill({ status:503, json:{ ready:false, schemaRepairEnabled:true, schemaTables:23, required:24, missing:['agent_runs'] } }));
  await page.route('**/api/admin/schema/repair', route => route.fulfill({ status:200, json:{ ok:true, after:24, required:24 } }));
  await page.goto('/workspace.html#operations');
  const button = page.locator('#schemaRepairBtn');
  await expect(button).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await button.click();
  await expect(page.locator('#schemaRepairTag')).toHaveText('REVIEW REQUIRED');
  await expect(page.locator('#schemaRepairResult')).toContainText('partial changes');
  await expect(button).toBeHidden();
});

test('a timed-out repair POST is an uncertain result and is not retried', async ({ page }) => {
  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await page.route('**/api/ready', route => route.fulfill({ status:503, json:{ ready:false, schemaRepairEnabled:true, schemaTables:23, required:24, missing:['agent_runs'] } }));
  await page.goto('/workspace.html#operations');
  const button = page.locator('#schemaRepairBtn');
  await expect(button).toBeVisible();
  await button.focus();
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => {
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    AbortSignal.timeout = ms => timeout(ms === 60000 ? 300 : ms);
  });
  let release, calls = 0;
  const blocked = new Promise(resolve => { release = resolve; });
  await page.route('**/api/admin/schema/repair', async route => {
    calls++;
    await blocked;
    await route.fulfill({ status:200, json:{ ok:true } }).catch(() => {});
  });
  try {
    page.once('dialog', dialog => dialog.accept());
    await button.click();
    await expect(page.locator('#schemaRepairTag')).toHaveText('REVIEW REQUIRED');
    await expect(page.locator('#schemaRepairResult')).toContainText('outcome could not be verified');
    await expect(button).toBeHidden();
    expect(calls).toBe(1);
  } finally { release(); }
});

test('a repair that ran without changing table names is not called a no-op', async ({ page }) => {
  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  let ready = false;
  await page.route('**/api/ready', route => route.fulfill(ready
    ? { status:200, json:{ ready:true, schemaTables:24, required:24, missing:[] } }
    : { status:503, json:{ ready:false, schemaRepairEnabled:true, schemaTables:23, required:24, missing:['agent_runs'] } }));
  await page.route('**/api/admin/schema/repair', route => {
    ready = true;
    return route.fulfill({ status:200, json:{ ok:true, changed:false, before:24, after:24, required:24, applied:['schema.sql'], failed:[], missing:[] } });
  });
  await page.goto('/workspace.html#operations');
  const button = page.locator('#schemaRepairBtn');
  await expect(button).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await button.click();
  await expect(page.locator('#schemaRepairResult')).toContainText('Repair completed');
  await expect(page.locator('#schemaRepairResult')).not.toContainText('No migrations were run');
  await expect(page.locator('#schemaRepairTag')).toHaveText('TABLES PRESENT');
});

test('a locked or unverifiable repair path is not offered in Operations', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 650 });
  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  let setting = false, calls = 0;
  await page.route('**/api/ready', route => route.fulfill({ status:503, json:{
    ready:false, schemaTables:23, required:24, missing:['agent_runs'],
    ...(setting === undefined ? {} : { schemaRepairEnabled:setting })
  } }));
  await page.route('**/api/admin/schema/repair', route => { calls++; return route.abort('failed'); });
  for (const value of [false, undefined, 'true']) {
    setting = value;
    await page.goto('/workspace.html#operations');
    await expect(page.locator('#schemaRepairTag')).toHaveText('INCOMPLETE');
    await expect(page.locator('#schemaRepairBtn')).toBeHidden();
    await expect(page.locator('#schemaRepairAccess')).toContainText(value === false ? 'locked by server configuration' : 'could not be verified');
  }
  expect(calls).toBe(0);
});

test('the server lock can stop a repair after readiness was checked', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 650 });
  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await page.route('**/api/ready', route => route.fulfill({ status:503, json:{
    ready:false, schemaRepairEnabled:true, schemaTables:23, required:24, missing:['agent_runs']
  } }));
  let calls = 0;
  await page.route('**/api/admin/schema/repair', route => {
    calls++;
    return route.fulfill({ status:423, json:{ code:'SCHEMA_REPAIR_LOCKED', started:false, error:'No migrations were run.' } });
  });
  await page.goto('/workspace.html#operations');
  const button = page.locator('#schemaRepairBtn');
  await expect(button).toBeVisible();
  await expect(page.locator('#schemaRepairAccess')).toContainText('does not verify');
  await button.focus();
  await page.waitForLoadState('networkidle');
  page.once('dialog', dialog => dialog.accept());
  await button.click();
  await expect(page.locator('#schemaRepairResult')).toContainText('No migrations were run');
  await expect(page.locator('#schemaRepairAccess')).toContainText('locked by server configuration');
  await expect(page.locator('#schemaRepairTag')).toHaveText('INCOMPLETE');
  await expect(button).toBeHidden();
  expect(calls).toBe(1);
});

test('an unverified lock response is treated as a potentially partial repair', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 650 });
  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await page.route('**/api/ready', route => route.fulfill({ status:503, json:{
    ready:false, schemaRepairEnabled:true, schemaTables:23, required:24, missing:['agent_runs']
  } }));
  await page.route('**/api/admin/schema/repair', route => route.fulfill({ status:423, json:{ code:'SCHEMA_REPAIR_LOCKED' } }));
  await page.goto('/workspace.html#operations');
  const button = page.locator('#schemaRepairBtn');
  await expect(button).toBeVisible();
  await button.focus();
  await page.waitForLoadState('networkidle');
  page.once('dialog', dialog => dialog.accept());
  await button.click();
  await expect(page.locator('#schemaRepairTag')).toHaveText('REVIEW REQUIRED');
  await expect(page.locator('#schemaRepairResult')).toContainText('partial changes');
  await expect(button).toBeHidden();
});
