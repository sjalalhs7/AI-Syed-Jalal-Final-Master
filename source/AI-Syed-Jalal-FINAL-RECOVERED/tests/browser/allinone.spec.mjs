import { test, expect } from '@playwright/test';

// The all-in-one panel is the easiest surface to make look impressive and be
// useless. These journeys assert the properties that make it genuinely usable:
// the routing is shown before the answer, every card names why it exists, a real
// tool result appears, and nothing is answered by a mystery model.
test('All-in-one: routes before answering, then every card explains itself', async ({ page }) => {
  test.setTimeout(120000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected', { timeout: 20000 });

  await page.goto('/allinone.html');
  await expect(page.locator('#connectionStatus')).toContainText('Connected', { timeout: 20000 });

  // Routing is visible before the request is sent — a guess the user can correct.
  await page.locator('#prompt').fill('calculate (1200 + 350) * 15% * 3 and critique the launch risk');
  await expect(page.locator('#routeBar')).toBeVisible({ timeout: 15000 });
  const preview = await page.locator('#routeList li').count();
  expect(preview).toBeGreaterThanOrEqual(2);

  await page.locator('#askBtn').click();
  await expect(page.locator('.answer').first()).toBeVisible({ timeout: 45000 });

  // Every card names the specialist and why it was chosen.
  const cards = page.locator('.answer');
  const count = await cards.count();
  expect(count).toBeGreaterThanOrEqual(2);
  for (let index = 0; index < count; index += 1) {
    const card = cards.nth(index);
    await expect(card.locator('h2')).not.toBeEmpty();
    await expect(card.locator('.why')).toContainText(/^Why this specialist: /);
    await expect(card.locator('.answer-body')).not.toBeEmpty();
  }

  // The tool specialist must have produced real arithmetic, not prose about it.
  await expect(page.locator('.answer-body').first()).toContainText('697.5');
  await expect(page.locator('.trace').first()).toContainText('tool call');

  // The panel states what it did and did not do.
  await expect(page.locator('.answer-summary')).toContainText('no external model called');
  await expect(page.locator('.panel-limits')).toContainText('no external model was called');

  // Copy is wired and does not lie about failing silently.
  await page.locator('.answer-actions button').first().click();
  await expect(page.locator('.answer-actions button').first()).toHaveText(/Copied|Copy failed/);

  expect(errors).toEqual([]);
});

test('All-in-one: picking specialists yourself bounds the answer exactly', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected', { timeout: 20000 });
  await page.goto('/allinone.html');
  await expect(page.locator('#connectionStatus')).toContainText('Connected', { timeout: 20000 });

  await expect(page.locator('#picker .pick')).toHaveCount(8);
  await page.locator('#picker input[value="writer"]').check();
  await page.locator('#picker input[value="planner"]').check();
  await expect(page.locator('#routeHint')).toContainText('writer, planner');

  await page.locator('#prompt').fill('write a short update about the release');
  await page.locator('#askBtn').click();
  await expect(page.locator('.answer')).toHaveCount(2, { timeout: 45000 });
  await expect(page.locator('.answer h2').first()).toHaveText(/Writer|Planner/);
  // No tool specialist may appear when it was not chosen.
  const titles = await page.locator('.answer h2').allTextContents();
  expect(titles.join(' ')).not.toContain('Tool Agent');
});

test('Arena publishes an honest feature map instead of claiming a full clone', async ({ page }) => {
  await page.goto('/arena.html');
  await expect(page.locator('#features .feature').first()).toBeVisible({ timeout: 20000 });
  const count = await page.locator('#features .feature').count();
  expect(count).toBeGreaterThanOrEqual(10);
  // The three states must all be representable on the page.
  await expect(page.locator('#featureSummary')).toContainText('shipped');
  await expect(page.locator('#featureSummary')).toContainText('deliberately absent');
  // Genuinely absent capabilities are labelled, not implied.
  await expect(page.locator('#features .feature.not-shipped').first()).toBeVisible();
  await expect(page.locator('#features')).toContainText('Image / video generation battles');
  // And the positioning says this is not a copy of another company's product.
  await expect(page.locator('#positioning')).toContainText('not a copy of another company');
});
