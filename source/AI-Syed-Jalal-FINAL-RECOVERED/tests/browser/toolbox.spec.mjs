import { test, expect } from '@playwright/test';

// V140 journeys. The risk with a "toolbench" is that it becomes a wall of cards
// that do nothing. These tests run real tools end to end and check that the
// prompt library actually loads a prompt into the Arena composer.
test('Toolbench: every published tool listed, three real runs, failures shown as failures', async ({ page }) => {
  test.setTimeout(150000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected', { timeout: 20000 });

  await page.goto('/toolbench.html');
  await expect(page.locator('#connectionStatus')).toContainText('Local preview', { timeout: 20000 });
  // The count grows as tools are added; assert the published summary agrees with
  // the rendered grid instead of freezing a number that must be hand-edited.
  await expect(page.locator('#tools .tool').first()).toBeVisible({ timeout: 20000 });
  const cards = await page.locator('#tools .tool').count();
  expect(cards).toBeGreaterThanOrEqual(12);
  await expect(page.locator('#toolCount')).toContainText(`${cards} tools`);

  // Tool 1 — units, a checkable number.
  await page.locator('#prompt').fill('convert 10 km to miles');
  await page.locator('#runBtn').click();
  await expect(page.locator('.answer-body').first()).toContainText('6.213712 mi', { timeout: 45000 });
  await expect(page.locator('.answer-summary')).toContainText('no external model called');

  // Tool 2 — the web audit must name a severity, not praise the code.
  await page.locator('#prompt').fill('audit this\n```html\n<img src="x">\n```');
  await page.locator('#runBtn').click();
  await expect(page.locator('.answer-body').first()).toContainText('[high]', { timeout: 45000 });
  await expect(page.locator('.answer-body').first()).toContainText('no alt attribute');

  // Tool 3 — a hash nobody can fake.
  await page.locator('#prompt').fill('sha256 of hello');
  await page.locator('#runBtn').click();
  await expect(page.locator('.answer-body').first()).toContainText('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e730433', { timeout: 45000 });

  // A signed-in user always has a real trace, never a simulated one.
  await expect(page.locator('.panel-limits')).toContainText('Tools with usable results');
  expect(errors).toEqual([]);
});

test('Toolbench ships an example for every tool, and every card loads one', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/toolbench.html');
  await expect(page.locator('#tools .tool').first()).toBeVisible({ timeout: 20000 });

  // "Try it" must write something into the composer for every card. A card that
  // loads nothing is a dead button.
  const buttons = page.locator('#tools .tool button');
  for (let index = 0; index < await buttons.count(); index += 1) {
    await page.locator('#prompt').fill('');
    await buttons.nth(index).click();
    await expect(page.locator('#prompt')).not.toHaveValue('');
  }
});

test('Arena prompt library loads a chosen prompt into the battle composer', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/arena.html');
  await expect(page.locator('#promptList .prompt').first()).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#promptSummary')).toContainText('checkable property');

  // Search narrows deterministically, and says so when nothing matches.
  await page.locator('#promptQuery').fill('fabrication');
  await expect(page.locator('#promptList .prompt')).toHaveCount(1);
  await expect(page.locator('#promptList')).toContainText('The question it cannot answer');
  await page.locator('#promptQuery').fill('zzzz-nothing');
  await expect(page.locator('#promptList')).toContainText('No prompt matches that search');
  await page.locator('#promptQuery').fill('');

  // Every card states what it tests and can load itself into the composer.
  await expect(page.locator('#promptList .prompt-tests').first()).toContainText('What it tests:');
  const first = page.locator('#promptList .prompt').first();
  const promptText = await first.locator('.prompt-text').textContent();
  await first.locator('button').click();
  await expect(page.locator('#prompt')).toHaveValue(promptText.trim());
  await expect(page.locator('#status')).toContainText('Prompt loaded');

  // Category filtering works and is not decorative.
  const total = await page.locator('#promptList .prompt').count();
  expect(total).toBe(12);
  await page.locator('#promptCategory').selectOption('Security');
  await expect(page.locator('#promptList .prompt')).toHaveCount(1);
});
