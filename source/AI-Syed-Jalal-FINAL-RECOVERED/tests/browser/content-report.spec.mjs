import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

test('a user reviews and submits a reply and an Admin can safely review it', async ({ page }) => {
  test.setTimeout(90000);
  const requests = [];
  page.on('request', request => { if (request.url().endsWith('/api/content-reports')) requests.push(request); });
  await page.goto('/jarvis.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await page.locator('#voiceSettings > summary').click();
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
  const context = `Safe review test ${randomUUID()}`;
  await dialog.locator('textarea[name=details]').fill(context);
  await dialog.locator('select[name=category]').selectOption('unsafe');
  await dialog.getByRole('button', { name: 'Submit report' }).click();
  await expect(dialog.locator('[role=status]')).toContainText('Report submitted');
  expect(requests.length).toBe(1);
  await dialog.getByRole('button', { name: 'Close' }).click();

  await page.goto('/workspace.html#operations');
  await page.locator('.side [data-nav="operations"]').click();
  const list = page.locator('#contentReportsList');
  await expect(list).toContainText(context);
  await expect(list).toContainText(malicious);
  await expect(list.locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => window.__reportXSS)).not.toBeTruthy();
  const card = list.locator('.card').filter({ hasText: context });
  await expect(card).toContainText('OPEN');
  // Hold the real refresh after review so the test exercises the loading gap.
  // The list element remains mounted while its report cards are replaced.
  let releaseRefresh, refreshStarted;
  const refreshGate = new Promise(resolve => { releaseRefresh = resolve; });
  const refreshObserved = new Promise(resolve => { refreshStarted = resolve; });
  await page.route('**/api/admin/content-reports', async route => {
    refreshStarted();
    await refreshGate;
    await route.continue().catch(() => {});
  });
  try {
    page.once('dialog', dialog => dialog.accept());
    const reviewed = page.waitForResponse(response => response.request().method() === 'POST' && /\/api\/admin\/content-reports\/[^/]+\/review$/.test(response.url()));
    await card.getByRole('button', { name: 'Mark reviewed' }).click();
    expect((await reviewed).status()).toBe(200);
    await refreshObserved;
    await expect(list).toHaveText('Loading reports…');
    releaseRefresh();

    // Poll through the stable list rather than a temporarily missing card.
    // Check the status of this unique report, not a different reviewed row.
    await expect.poll(() => list.evaluate((element, details) => {
      const report = Array.from(element.querySelectorAll(':scope > .card')).find(row => row.textContent.includes(details));
      return report?.querySelector('strong')?.textContent.split(' · ')[0] || '';
    }, context), { timeout: 30000 }).toBe('REVIEWED');
    await expect(card.locator('strong')).toContainText('REVIEWED');
    await expect(card.getByRole('button', { name: 'Mark reviewed' })).toHaveCount(0);
  } finally {
    releaseRefresh();
    await page.unroute('**/api/admin/content-reports');
  }
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

test('a stale reports refresh cannot undo a newer queue result', async ({ page }) => {
  await page.goto('/jalalai.html'); await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await page.goto('/workspace.html#operations');
  await expect(page.locator('#contentReportsList')).not.toContainText('Loading reports');
  await page.waitForLoadState('networkidle');
  let release, started, calls = 0;
  const held = new Promise(resolve => { started = resolve; });
  const wait = new Promise(resolve => { release = resolve; });
  const report = status => ({ id:'01234567-89ab-4cde-8fab-0123456789ab', status, category:'other', surface:'jarvis', username:'test', created_at:'2026-11-07T00:00:00Z', excerpt:'Example text', details:'Unique report for ordering' });
  await page.route('**/api/admin/content-reports', async route => {
    if (++calls === 1) { started(); await wait; return route.fulfill({ json:{ reports:[report('open')] } }).catch(() => {}); }
    return route.fulfill({ json:{ reports:[report('reviewed')] } });
  });
  try {
    await page.locator('#contentReportsRefreshBtn').click(); await held;
    await page.locator('#contentReportsRefreshBtn').click();
    await expect(page.locator('#contentReportsList')).toContainText('REVIEWED');
    release(); await page.waitForLoadState('networkidle');
    await expect(page.locator('#contentReportsList')).toContainText('REVIEWED');
    await expect(page.locator('#contentReportsList')).not.toContainText('OPEN');
    await page.unroute('**/api/admin/content-reports');
    await page.route('**/api/admin/content-reports', route => route.fulfill({ json:{ reports:'invalid' } }));
    await page.locator('#contentReportsRefreshBtn').click();
    await expect(page.locator('#contentReportsList')).toContainText('Reports unavailable');
    await expect(page.locator('#contentReportsList')).not.toContainText('No reports');
  } finally { release(); }
});
