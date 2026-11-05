import { test, expect } from '@playwright/test';

// The risk with a page builder is a pretty preview that is not the file you get.
// These journeys compare the two byte for byte, and check the audit shown is the
// audit of those same bytes.
test('Page Builder: brief in, real HTML out, download matches the preview', async ({ page }) => {
  test.setTimeout(150000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected', { timeout: 20000 });

  await page.goto('/pagebuilder.html');
  await expect(page.locator('#connectionStatus')).toContainText('Local preview', { timeout: 20000 });

  await page.locator('#brief').fill('build a landing page for a dental clinic with pricing and faq, button says Book now');
  await page.locator('#buildBtn').click();

  await expect(page.locator('#resultPanel')).toBeVisible({ timeout: 45000 });
  await expect(page.locator('#resultMeta')).toContainText('pricing');
  // The parse is shown before the artifact, so the user can see what was understood.
  await expect(page.locator('#parsed')).toContainText('a dental clinic');
  await expect(page.locator('#parsed')).toContainText('Book now');

  // The generated page really renders in the frame.
  const frame = page.frameLocator('#preview');
  await expect(frame.locator('h1')).toContainText('dental clinic', { timeout: 20000 });
  await expect(frame.locator('.cta')).toHaveText('Book now');

  // Source tab shows the exact same document.
  await page.locator('#tabCode').click();
  const source = await page.locator('#code').textContent();
  expect(source.startsWith('<!doctype html>')).toBe(true);
  expect(source).toContain('Book now');

  // Download really produces a file with identical contents.
  const download = page.waitForEvent('download');
  await page.locator('#downloadBtn').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.html$/);
  const stream = await file.createReadStream();
  let body = '';
  for await (const chunk of stream) body += chunk.toString();
  expect(body).toBe(source);

  // The audit is reported, and its one expected finding is named.
  await expect(page.locator('#auditList')).toContainText('Self-audit');
  await expect(page.locator('#auditList')).toContainText('[low]');

  expect(errors).toEqual([]);
});

test('Page Builder: user text cannot inject markup, and limits are stated', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected', { timeout: 20000 });
  await page.goto('/pagebuilder.html');
  await expect(page.locator('#connectionStatus')).toContainText('Local preview', { timeout: 20000 });

  await page.locator('#brief').fill('make a page titled <img src=x onerror=alert(1)>');
  await page.locator('#buildBtn').click();
  await expect(page.locator('#resultPanel')).toBeVisible({ timeout: 45000 });

  const source = await page.locator('#code').textContent();
  expect(source).not.toContain('onerror=alert(1)>');
  expect(source).toContain('&lt;img');

  // The page must admit what it is not.
  await expect(page.locator('.limits')).toContainText('not a general code generator');
  await expect(page.locator('.limits')).toContainText('contact section is a placeholder');
});

test('Toolbench lists the page builder as a thirteenth tool', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected', { timeout: 20000 });
  await page.goto('/toolbench.html');
  await expect(page.locator('#tools .tool')).toHaveCount(13, { timeout: 20000 });
  await expect(page.locator('#tools')).toContainText('Web page builder');
  await expect(page.locator('#toolCount')).toContainText('13 tools');

  // And it actually builds from Toolbench, through the same runtime.
  await page.locator('#prompt').fill('build me a landing page for a bookshop with contact');
  await page.locator('#runBtn').click();
  await expect(page.locator('.answer-body').first()).toContainText('Built a single-file page', { timeout: 45000 });
});
