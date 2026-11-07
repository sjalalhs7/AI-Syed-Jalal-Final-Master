import { test, expect } from '@playwright/test';

// The live deployment shipped with 13 of 21 database tables, which breaks Arena,
// Agent Lab and the Critic. This proves an Admin can fix that from the UI,
// against the real route, without touching SQL.
test('admin repairs an incomplete schema from the Operations Center', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  // Sign in the way the existing suite does, then open the Operations view.
  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');

  // Simulate the production state: /api/ready reports 8 tables missing.
  let state = 'broken';
  await page.route('**/api/ready', async route => {
    if (state === 'broken') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false, ready: false, database: 'Neon PostgreSQL', schemaTables: 13, required: 21,
          missing: ['agent_skills', 'agent_self_checks', 'arena_battles', 'arena_responses',
            'arena_artifacts', 'arena_ratings', 'agent_runs', 'expert_reviews'],
          summary: '13 of 21 tables present. Arena battles, Agent Lab self-check and the Expert Critic need these tables.',
          howToFix: 'An Admin can POST /api/admin/schema/repair',
          signInAffected: false
        })
      });
      return;
    }
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        ok: true, ready: true, database: 'Neon PostgreSQL', schemaTables: 21, required: 21,
        missing: [], summary: '21 of 21 tables present. Nothing is missing.',
        howToFix: 'Nothing to do.', signInAffected: false
      })
    });
  });

  let repairCalled = null;
  await page.route('**/api/admin/schema/repair', async route => {
    repairCalled = JSON.parse(route.request().postData() || '{}');
    state = 'fixed';
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        ok: true, changed: true, before: 13, after: 21, required: 21, missing: [],
        applied: ['schema.sql', '009_v133_agent_skills.sql'], failed: []
      })
    });
  });

  // Open the Operations view and read the honest state.
  await page.goto('/workspace.html#operations');
  await expect(page.locator('#app')).toBeVisible();
  await page.locator('.side [data-nav="operations"]').click();
  await expect(page.locator('#schemaRepairTag')).toHaveText('INCOMPLETE');
  await expect(page.locator('#schemaRepairText')).toContainText('13 of 21 tables present');
  await expect(page.locator('#schemaRepairText')).toContainText('arena_battles');

  // The button must not be offered to non-admins.
  const repairBtn = page.locator('#schemaRepairBtn');
  await expect(repairBtn).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await repairBtn.click();

  // It must send the explicit confirmation token, never a bare POST.
  await expect.poll(() => repairCalled).not.toBeNull();
  expect(repairCalled).toEqual({ confirm: 'apply-schema-repair' });

  await expect(page.locator('#schemaRepairResult')).toContainText('21 of 21');
  await expect(page.locator('#schemaRepairTag')).toHaveText('TABLES PRESENT');
  await expect(repairBtn).toBeHidden();

  expect(errors).toEqual([]);
});

test('repair requires user confirmation and reports partial migration failures', async ({ page }) => {
  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await page.route('**/api/ready', route => route.fulfill({ status: 503, contentType: 'application/json',
    body: JSON.stringify({ ready: false, schemaTables: 13, required: 23, missing: ['agent_runs'], summary: 'One table is missing.' }) }));
  let calls = 0;
  await page.route('**/api/admin/schema/repair', route => {
    calls++;
    return route.fulfill({ status: 207, contentType: 'application/json',
      body: JSON.stringify({ ok: false, before: 13, after: 23, required: 23, missing: [], failed: [{ part: 'schema.sql', error: 'index failed' }] }) });
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
  await button.click();
  await expect(page.locator('#schemaRepairResult')).toContainText('Repair incomplete');
  await expect(page.locator('#schemaRepairResult')).toContainText('index failed');
  await expect(page.locator('#schemaRepairTag')).toHaveText('REVIEW REQUIRED');
  expect(calls).toBe(1);
});
