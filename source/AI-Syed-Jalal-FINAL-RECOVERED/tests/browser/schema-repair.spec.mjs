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
          ok: false, ready: false, database: 'Neon PostgreSQL', schemaTables: 13, required: 24,
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
  await expect(page.locator('#schemaBackupWarning')).toContainText('active records only');
  await page.locator('#opsDiagnosticsBtn').click();
  await expect(page.locator('#opsDiagnostics')).toContainText('Required table names 13/24');
  await expect(page.locator('#opsDiagnostics')).toContainText('do not verify columns');

  // The button must not be offered to non-admins.
  const repairBtn = page.locator('#schemaRepairBtn');
  await expect(repairBtn).toBeVisible();
  let confirmationMessage = '';
  page.once('dialog', dialog => { confirmationMessage = dialog.message(); return dialog.accept(); });
  await repairBtn.click();

  // It must send the explicit confirmation token, never a bare POST.
  await expect.poll(() => repairCalled).not.toBeNull();
  expect(repairCalled).toEqual({ confirm: 'apply-schema-repair' });
  expect(repairHeaders['x-csrf-token']).toMatch(/^[a-f0-9]{64}$/);
  expect(confirmationMessage).toContain('restorable full database backup');
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
    body: JSON.stringify({ ready: false, schemaTables: 13, required: 24, missing: ['agent_runs'], summary: 'One table is missing.' }) }));
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
  expect(calls).toBe(1);
});
