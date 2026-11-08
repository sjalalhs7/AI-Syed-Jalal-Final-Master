import { test, expect } from '@playwright/test';

test('assistant: account, local calculation, confirmed persistence, notes, voice fallback, sign-out', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/jalalai.html');
  await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();
  await page.getByRole('button', { name: 'Try the local preview' }).click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await page.locator('#prompt').fill('calculate (1200 + 350) * 15%'); await page.locator('#sendBtn').click();
  await expect(page.locator('#chatlog')).toContainText('232.5');
  await page.locator('#prompt').fill('add task: Browser verified task'); await page.locator('#sendBtn').click();
  await expect(page.locator('#tasks')).not.toContainText('Browser verified task');
  await page.getByRole('button', { name: 'Confirm & save' }).click();
  await expect(page.locator('#tasks')).toContainText('Browser verified task');
  await page.reload(); await expect(page.locator('#tasks')).toContainText('Browser verified task');
  await page.getByRole('checkbox', { name: 'Complete Browser verified task' }).check();
  await expect(page.locator('#taskCount')).toHaveText('0');
  await page.locator('#prompt').fill('save note: Private browser note'); await page.locator('#sendBtn').click();
  await page.getByRole('button', { name: 'Confirm & save' }).click(); await expect(page.locator('#notes')).toContainText('Private browser note');
  await page.evaluate(() => { window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined; });
  await page.locator('#micBtn').click(); await expect(page.locator('#status')).toContainText('not supported');
  await page.locator('#mode').selectOption('cloud'); await page.locator('#prompt').fill('Tell me a story'); await page.locator('#sendBtn').click();
  await expect(page.locator('#status')).toContainText('not configured');
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.locator('#loginBanner')).toBeVisible(); await expect(page.locator('#sendBtn')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('workspace: navigation, local AI, dock, records CRUD, admin, print and themes', async ({ page }) => {
  // This full workspace journey has many interactions; slow Chromium runners
  // can finish the assertions just after the default one-minute test budget.
  test.setTimeout(120000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/jalalai.html'); await page.locator('#demoBtn').click(); await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await page.goto('/workspace.html#ai-command'); await expect(page.locator('#app')).toBeVisible();
  await page.locator('#aiPrompt').fill('plan: Launch safely'); await page.locator('#aiRunBtn').click();
  await expect(page.locator('#aiOutput')).toContainText('Define the outcome');
  await page.locator('#ajDockInput').fill('calculate 20*3'); await page.locator('#ajDockSend').click(); await expect(page.locator('#ajDockReply')).toContainText('60');
  await page.locator('.side [data-nav="data"]').click(); await page.locator('#addBtn').click();
  await page.locator('#fName').fill('Browser test record'); await page.locator('#fRegion').fill('North'); await page.locator('#fSector').fill('QA');
  await page.locator('#recordForm button[type="submit"]').click(); await expect(page.locator('#dataBody')).toContainText('Browser test record');
  await page.locator('#search').fill('Browser test'); await expect(page.locator('#dataBody tr')).toHaveCount(1);
  await page.locator('[data-edit]').click(); await page.locator('#fNotes').fill('Updated by browser test'); await page.locator('#recordForm button[type="submit"]').click();
  page.once('dialog', dialog => dialog.accept()); await page.locator('[data-del]').click(); await expect(page.locator('#dataBody')).toContainText('No records found');
  await page.locator('.side [data-nav="approvals"]').click(); await page.locator('#approvalAction').fill('Browser approval'); await page.locator('#approvalDescription').fill('Review before release'); await page.locator('#approvalRequestForm button[type="submit"]').click();
  await expect(page.locator('#approvalList')).toContainText('Browser approval'); await page.locator('[data-approval-action="approved"]').click(); await expect(page.locator('#approvalList')).toContainText('No pending approvals');
  await page.locator('.side [data-nav="users"]').click(); await expect(page.locator('#usersBody')).toContainText('Admin');
  await page.locator('.side [data-nav="operations"]').click(); await page.locator('#opsDiagnosticsBtn').click(); await expect(page.locator('#opsDiagnostics')).toContainText('healthy');
  await page.locator('.side [data-nav="documents"]').click(); await page.locator('#pvName').fill('Print test'); await expect(page.locator('#pvPrevName')).toHaveText('Print test');
  await page.locator('.side [data-nav="settings"]').click(); await page.locator('#settingsTheme').click(); await expect(page.locator('#aj-theme-menu')).toBeVisible(); await page.locator('#aj-theme-menu [data-theme-choice="ice"]').click(); await expect(page.locator('html')).toHaveAttribute('data-aj-theme', 'ice');
  expect(errors).toEqual([]);
});

test('dashboard local tools, library, homepage login and mobile layout', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/jalalai.html'); await page.locator('#demoBtn').click(); await expect(page.locator('#connectionStatus')).toContainText('Connected'); await page.goto('/workspace.html'); await expect(page.locator('#app')).toBeVisible();
  await page.goto('/dashboard.html#run'); await expect(page.locator('#go')).toBeEnabled(); await page.locator('nav [data-v="run"]').click({ force: true }); await page.locator('#p').fill('calculate 8*9'); await page.locator('#go').click(); await expect(page.locator('#res')).toContainText('72');
  await page.locator('nav [data-v="lib"]').click(); await page.locator('#ls').fill('python'); await expect(page.locator('#lib')).not.toBeEmpty();
  await page.goto('/'); await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.locator('#u').fill('not-an-account'); await page.locator('#p').fill('Wrong-password-123'); await page.locator('#go').click(); await expect(page.locator('#err')).toContainText('Invalid credentials');
  await page.locator('#close').click(); await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/jalalai.html');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator('#connectionStatus')).toContainText('Connected'); await expect(page.locator('#accountBtn')).toBeVisible(); expect(errors).toEqual([]);
});

test('quick-start guide, one-click preview and assistant record search', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/guide.html');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator('#appState')).toContainText('required table names');
  await expect(page.locator('#cloudState')).toContainText('Not configured');
  await page.locator('#guidePreviewBtn').click();
  await expect(page).toHaveURL(/agent\.html/);
  await expect(page.locator('#status')).toContainText('Ready');
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/workspace.html#data'); await expect(page.locator('#app')).toBeVisible();
  await page.locator('.side [data-nav="data"]').click(); await page.locator('#addBtn').click(); await page.locator('#fName').fill('Guide search record'); await page.locator('#fRegion').fill('North'); await page.locator('#fSector').fill('QA'); await page.locator('#recordForm button[type="submit"]').click();
  await expect(page.locator('#dataBody')).toContainText('Guide search record');
  await page.goto('/jalalai.html'); await page.locator('#prompt').fill('search records: Guide search'); await page.locator('#sendBtn').click();
  await expect(page.locator('#chatlog')).toContainText('Guide search record');
  await expect(page.locator('#chatlog')).not.toContainText('Request could not complete');
  expect(errors).toEqual([]);
});
