import { test, expect } from '@playwright/test';

test('Agent Lab: preview sign-in, graded self-check, evidence export, history and skill search', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/agent-lab.html');
  await expect(page.getByRole('button', { name: 'Try the local preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Try the local preview' }).click();
  await expect(page.locator('#runStatus')).toContainText('Ready · signed in');
  await expect(page.locator('#skills .skill').first()).toBeVisible();

  await page.locator('#runBtn').click();
  await expect(page.locator('#verdict')).toHaveText('Passing', { timeout: 30000 });
  await expect(page.locator('#scoreValue')).toHaveText('100');
  await expect(page.locator(".result")).toHaveCount(19);
  await expect(page.locator('#runSummary')).toContainText('19/19');
  await expect(page.locator('#groups .group-chip.good')).toHaveCount(7);
  await expect(page.locator('#runStatus')).toContainText('not a production certificate');
  await expect(page.locator('#trend .trend-bar')).toHaveCount(1);
  expect(await page.locator('#runHint')).toContainText('19 weighted checks');

  // Evidence exports: JSON for machines, CSV for a spreadsheet/audit trail.
  const jsonDownload = page.waitForEvent('download');
  await page.locator('#downloadBtn').click();
  const jsonFile = await jsonDownload;
  expect(jsonFile.suggestedFilename()).toBe('sj-agent-lab-evidence.json');
  await expect(page.locator('#runStatus')).toContainText('Evidence JSON downloaded');
  const csvDownload = page.waitForEvent('download');
  await page.locator('#csvBtn').click();
  expect((await csvDownload).suggestedFilename()).toBe('sj-agent-lab-evidence.csv');
  await expect(page.locator('#runStatus')).toContainText('Evidence CSV downloaded');

  // A second run must append evidence instead of replacing history.
  await page.locator('#runBtn').click();
  await expect(page.locator('#trend .trend-bar')).toHaveCount(2);

  // Unconfigured cloud engine is refused with an honest reason, not simulated.
  await page.locator('#engine').selectOption('cloud');
  await expect(page.locator('#provider')).toBeEnabled();
  await page.locator('#runBtn').click();
  await expect(page.locator('#runStatus')).toContainText('No request was made to the provider');
  await expect(page.locator('#engine')).toHaveValue('local');

  await page.locator('#skillQuery').fill('security review');
  await expect(page.locator('#skills .skill').first()).toContainText(/Security/i);
  await expect(page.locator('#skillsStatus')).toContainText('for “security review”');
  await page.locator('#skillQuery').fill('');
  await page.locator('#skillDomain').selectOption('Cybersecurity');
  await expect(page.locator('#skillsStatus')).toContainText('Cybersecurity');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator('#runBtn')).toBeEnabled();

  // A skill card is actionable: it stages a real prompt and opens Agent Studio with it.
  await page.locator('#skills .skill').first().getByRole('button', { name: 'Use in Studio' }).click();
  await page.waitForURL(/agent\.html\?draft=1/);
  await expect(page.locator('#prompt')).toHaveValue(/Apply the ".+" skill/);
  expect(errors).toEqual([]);
});

test('Agent Lab: static host is honest and cannot run checks', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/agent-lab.html?static=1');
  await expect(page.locator('#runStatus')).toContainText('Static preview · backend not connected');
  await expect(page.locator('#runBtn')).toBeDisabled();
  await expect(page.locator('#runHint')).toContainText('npm ci && npm run dev');
  await expect(page.locator('#skillQuery')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Agent Lab discloses test writes and uncertain results after a lost response', async ({ page }) => {
  await page.goto('/agent-lab.html');
  await expect(page.locator('#selfCheckEffects')).toContainText('create, read and delete a test audit entry');
  await expect(page.locator('#selfCheckEffects')).toContainText('may leave a test entry');
  await expect(page.locator('.honesty')).toContainText('columns and data are not checked');
  await page.getByRole('button', { name: 'Try the local preview' }).click();
  await expect(page.locator('#runStatus')).toContainText('Ready · signed in');
  await page.route('**/api/agent/self-check', route => route.fulfill({ status: 500, json: { error: 'Request interrupted' } }));
  await page.locator('#runBtn').click();
  await expect(page.locator('#runStatus')).toContainText('response could not be confirmed');
  await expect(page.locator('#runStatus')).toContainText('may still have run or been stored');
});
