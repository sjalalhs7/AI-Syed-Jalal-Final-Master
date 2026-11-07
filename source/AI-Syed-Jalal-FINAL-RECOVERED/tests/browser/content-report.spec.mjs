import { test, expect } from '@playwright/test';

test('a user reviews and submits a reply and an Admin can safely review it', async ({ page }) => {
  test.setTimeout(90000);
  const requests = [];
  page.on('request', request => { if (request.url().endsWith('/api/content-reports')) requests.push(request); });
  await page.goto('/jarvis.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await page.locator('#handsFree').uncheck();
  await page.locator('#prompt').fill('calculate 6*7');
  await page.locator('#sendBtn').click();
  const reply = page.locator('#chatlog .message.assistant').last();
  await expect(reply).toContainText('42');
  await reply.getByRole('button', { name: 'Report this AI reply' }).click();
  const dialog = page.getByRole('dialog', { name: 'Report AI content' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('textarea[name=excerpt]')).toHaveValue(/42/);
  await dialog.getByRole('button', { name: 'Close' }).click();
  expect(requests.length).toBe(0);

  await reply.getByRole('button', { name: 'Report this AI reply' }).click();
  const malicious = '<img src=x onerror="window.__reportXSS=true">';
  await dialog.locator('textarea[name=excerpt]').fill(malicious);
  await dialog.locator('textarea[name=details]').fill('Example report for a safe review test');
  await dialog.locator('select[name=category]').selectOption('unsafe');
  await dialog.getByRole('button', { name: 'Submit report' }).click();
  await expect(dialog.locator('[role=status]')).toContainText('Report submitted');
  expect(requests.length).toBe(1);
  await dialog.getByRole('button', { name: 'Close' }).click();

  await page.goto('/workspace.html#operations');
  await page.locator('.side [data-nav="operations"]').click();
  const list = page.locator('#contentReportsList');
  await expect(list).toContainText('Example report for a safe review test');
  await expect(list).toContainText(malicious);
  await expect(list.locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => window.__reportXSS)).not.toBeTruthy();
  const card = list.locator('.card').filter({ hasText: 'Example report for a safe review test' });
  await expect(card).toContainText('OPEN');
  page.once('dialog', dialog => dialog.accept());
  await card.getByRole('button', { name: 'Mark reviewed' }).click();
  await expect(card).toContainText('REVIEWED');
});

test('reporting is available in Agent Studio and Arena without sending automatically', async ({ page }) => {
  for (const url of ['/agent.html', '/arena.html', '/dashboard.html', '/workspace.html', '/toolbench.html', '/']) {
    await page.goto(url);
    await expect.poll(() => page.evaluate(() => typeof window.AJReport?.open)).toBe('function');
    const result = await page.evaluate(() => { window.AJReport.open('Example output'); return document.querySelector('.aj-report-dialog textarea[name=excerpt]').value; });
    expect(result).toBe('Example output');
    await page.locator('.aj-report-close').click();
  }
});

test('Agent Studio and Arena attach a report action to generated replies', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/agent.html');
  await page.getByRole('button', { name: 'Try the local preview' }).click();
  await expect(page.locator('#status')).toContainText('Ready');
  await page.locator('#prompt').fill('calculate 6*7');
  await page.locator('#sendBtn').click();
  const assistant = page.locator('#messages .message.assistant').last();
  await expect(assistant).toContainText('42');
  await assistant.getByRole('button', { name: 'Report this AI reply' }).click();
  await expect(page.locator('.aj-report-dialog textarea[name=excerpt]')).toHaveValue(/42/);
  await page.locator('.aj-report-close').click();

  await page.goto('/arena.html');
  await expect(page.locator('#engineGrid .engine')).toHaveCount(9);
  await page.locator('#engineGrid input[value="local"]').uncheck();
  await page.locator('#engineGrid input[value="local-coding"]').check();
  await page.locator('#prompt').fill('Review the risks of launching a website');
  await page.locator('#runBtn').click();
  const card = page.locator('#responses .card').first();
  await expect(card).toBeVisible();
  const content = await card.locator('.card-body').textContent();
  await card.getByRole('button', { name: 'Report this AI reply' }).click();
  await expect(page.locator('.aj-report-dialog textarea[name=excerpt]')).toHaveValue(content.slice(0, 5000));
});
