import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function preview(page, hash) {
  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await page.goto('/workspace.html#' + hash);
  await expect(page.locator('#app')).toBeVisible();
}

test('general documents preview, download and print without sending or executing their content', async ({ page }) => {
  await preview(page, 'documents');
  await expect(page.locator('#view-documents')).not.toContainText(/police verification/i);
  const posts = [];
  page.on('request', request => { if (request.url().includes('/api/') && request.method() !== 'GET') posts.push(request.url()); });
  const title = 'Meeting <img src=x onerror=alert(1)>';
  const body = 'السلام علیکم\nFirst line\n\n<script>alert(2)</script> & more';
  await page.locator('#docTitle').fill(title);
  await page.locator('#docMeta').fill('7 November 2026');
  await page.locator('#docBody').fill(body);
  await expect(page.locator('#docPrevTitle')).toHaveText(title);
  await expect(page.locator('#docPrevBody')).toHaveText(body);
  expect(await page.locator('#paper img, #paper script').count()).toBe(0);

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#downloadDocBtn').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('document.txt');
  expect(await readFile(await download.path(), 'utf8')).toBe(`${title}\n\n7 November 2026\n\n${body}\n`);

  await page.evaluate(() => {
    window.__printHTML = ''; window.__prints = 0;
    window.open = () => ({ document: { write: html => { window.__printHTML = html; }, close() {} }, focus() {}, print() { window.__prints++; } });
  });
  await page.locator('#printBtn').click();
  await expect(page.locator('#docStatus')).toContainText('Print preview opened');
  const printable = await page.evaluate(() => {
    const doc = new DOMParser().parseFromString(window.__printHTML, 'text/html');
    return { title: doc.querySelector('h1')?.textContent, body: doc.querySelector('.content')?.textContent, unsafe: doc.querySelectorAll('img,script').length, html: window.__printHTML };
  });
  expect(printable.title).toBe(title);
  expect(printable.body).toBe(body);
  expect(printable.unsafe).toBe(0);
  expect(printable.html).not.toContain('overflow:hidden');
  await expect.poll(() => page.evaluate(() => window.__prints)).toBe(1);
  expect(posts).toEqual([]);
  await page.evaluate(() => { window.open = () => null; });
  await page.locator('#printBtn').click();
  await expect(page.locator('#docStatus')).toContainText('Allow pop-ups');
});

test('Audit & Health reads independent current service and schema checks without provider calls', async ({ page }) => {
  const methods = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path === '/api/health' || path === '/api/ready' || path === '/api/ai/run') methods.push([path, request.method()]);
  });
  await preview(page, 'audit');
  await expect(page.locator('#healthApi')).toHaveText('ONLINE');
  await expect(page.locator('#healthDatabase')).toHaveText('CONNECTED');
  await expect(page.locator('#healthReadiness')).toHaveText('24/24 PRESENT');
  await expect(page.locator('#healthProvider')).toHaveText('NO KEY CONFIGURED');
  await expect(page.locator('#healthSchemaDetails')).toContainText('do not verify');
  expect(methods.filter(([path]) => path === '/api/ai/run')).toHaveLength(0);
  expect(methods.every(([, method]) => method === 'GET')).toBe(true);

  await page.route('**/api/health', route => route.abort('failed'));
  await page.route('**/api/ready', route => route.fulfill({ status: 503, json: { ready: false, schemaTables: 2, required: 3, missing: ['agent_runs'] } }));
  await page.locator('#healthRefreshBtn').click();
  await expect(page.locator('#healthApi')).toHaveText('UNKNOWN');
  await expect(page.locator('#healthDatabase')).toHaveText('UNKNOWN');
  await expect(page.locator('#healthProvider')).toHaveText('UNKNOWN');
  await expect(page.locator('#healthReadiness')).toHaveText('2/3 INCOMPLETE');
  await expect(page.locator('#healthSchemaDetails')).toContainText('agent_runs');

  await page.unroute('**/api/health'); await page.unroute('**/api/ready');
  await page.route('**/api/health', route => route.fulfill({ json: { ok: true, databaseConnected: true, assistant: { cloudConfigured: true } } }));
  await page.route('**/api/ready', route => route.fulfill({ status: 503, json: { error: 'not available' } }));
  await page.locator('#healthRefreshBtn').click();
  await expect(page.locator('#healthApi')).toHaveText('ONLINE');
  await expect(page.locator('#healthProvider')).toHaveText('KEY PRESENT · NOT TESTED');
  await expect(page.locator('#healthReadiness')).toHaveText('UNKNOWN');
  await expect(page.locator('#healthSchemaDetails')).not.toContainText('agent_runs');
});

test('an older health response cannot overwrite a newer check', async ({ page }) => {
  await preview(page, 'audit');
  await expect(page.locator('#healthReadiness')).toHaveText('24/24 PRESENT');
  let release, started, calls = 0;
  const held = new Promise(resolve => { started = resolve; });
  const wait = new Promise(resolve => { release = resolve; });
  await page.route('**/api/ready', async route => {
    if (++calls === 1) {
      started(); await wait;
      return route.fulfill({ status: 503, json: { ready: false, schemaTables: 1, required: 2, missing: ['agent_runs'] } }).catch(() => {});
    }
    return route.fulfill({ json: { ready: true, schemaTables: 2, required: 2, missing: [] } });
  });
  try {
    await page.locator('#healthRefreshBtn').click(); await held;
    await page.locator('#healthRefreshBtn').click();
    await expect(page.locator('#healthReadiness')).toHaveText('2/2 PRESENT');
    release(); await page.waitForLoadState('networkidle');
    await expect(page.locator('#healthReadiness')).toHaveText('2/2 PRESENT');
  } finally { release(); }
});
