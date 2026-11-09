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

  // Typing alone must not send a routing preview. The explicit preview sends
  // the text to the app so the user can inspect its route before asking.
  const previews = [];
  page.on('request', request => { if (request.url().includes('/api/assistant/all/route')) previews.push(request); });
  await expect(page.locator('#routeHint')).toContainText('only when you tap Preview');
  await page.locator('#prompt').fill('calculate (1200 + 350) * 15% * 3 and critique the launch risk');
  await page.waitForTimeout(500);
  expect(previews).toHaveLength(0);
  await page.locator('#previewRouteBtn').click();
  await expect(page.locator('#routeBar')).toBeVisible({ timeout: 15000 });
  expect(previews).toHaveLength(1);
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
  await expect(page.locator('.trace').first()).toContainText('successful tool result');

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

test('All-in-one labels proposals and does not infer provider keys or server cancellation', async ({ page }) => {
  await page.route('**/api/me', route => route.fulfill({ json: { authenticated: true, csrfToken: 'test-token', user: { username: 'tester' } } }));
  await page.route('**/api/assistant/all/specialists', route => route.fulfill({ json: { specialists: [{ id: 'agent', label: 'Tool Agent', note: 'Tools' }] } }));
  await page.route('**/api/assistant/all/route', route => route.fulfill({ json: { routed: [] } }));
  let confirmations = 0;
  await page.route('**/api/assistant/confirm', route => { confirmations++; return route.fulfill({ json: { ok: true } }); });
  await page.route('**/api/assistant/all/answer', async route => {
    const { prompt } = route.request().postDataJSON();
    if (prompt === 'slow request') {
      await new Promise(resolve => setTimeout(resolve, 250));
      return route.fulfill({ json: {} }).catch(() => {});
    }
    const action = prompt === 'proposal' ? { type: 'create_task', title: 'Draft' } : null;
    const trace = prompt === 'failed tool' ? { toolCalls: 0, failures: 1, tools: [] } : null;
    return route.fulfill({ json: {
      routed: [{ id: 'agent', reason: 'Chosen' }], durationMs: 1,
      counts: { specialists: 1, ok: 1, failed: 0 }, limits: [],
      answers: [{ id: 'agent', label: 'Tool Agent', reason: 'Chosen', ok: true, ms: 1,
        output: 'Example', needsProvider: !action, action, trace }]
    } });
  });
  await page.goto('/allinone.html');
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await page.locator('#prompt').fill('open question');
  await page.locator('#askBtn').click();
  await expect(page.locator('.answer .needs')).toContainText('provider configuration was not checked');
  await expect(page.locator('.answer .needs')).not.toContainText('no provider key is configured');

  await page.locator('#prompt').fill('failed tool');
  await page.locator('#askBtn').click();
  await expect(page.locator('.answer .needs')).toContainText('tool step failed');
  await expect(page.locator('.answer .needs')).not.toContainText('needs a cloud model');

  await page.locator('#prompt').fill('proposal');
  await page.locator('#askBtn').click();
  await expect(page.locator('.answer .needs')).toContainText('unsaved proposal');
  await expect(page.locator('.answer .needs')).toContainText('cannot confirm it');
  expect(confirmations).toBe(0);

  await page.locator('#prompt').fill('slow request');
  await page.locator('#askBtn').click();
  await page.locator('#stopBtn').click();
  await expect(page.locator('#status')).toContainText('Stopped waiting');
  await expect(page.locator('#status')).toContainText('server may still finish');
});

test('a routing preview is explicit and discarded if the text changes', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.route('**/api/me', route => route.fulfill({ json: { authenticated: true, csrfToken: 'test-token', user: { username: 'tester' } } }));
  await page.route('**/api/assistant/all/specialists', route => route.fulfill({ json: { specialists: [] } }));
  let previews = 0;
  await page.route('**/api/assistant/all/route', async route => {
    previews++;
    await new Promise(resolve => setTimeout(resolve, 250));
    await route.fulfill({ json: { routed: [{ id: 'planner', reason: 'Old text' }] } });
  });
  await page.goto('/allinone.html');
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#prompt').fill('the original text');
  await page.waitForTimeout(400);
  expect(previews).toBe(0);
  await page.locator('#previewRouteBtn').click();
  await page.locator('#prompt').fill('the changed text');
  await expect(page.locator('#status')).toContainText('changed');
  await page.waitForTimeout(350);
  expect(previews).toBe(1);
  await expect(page.locator('#routeBar')).toBeHidden();
  await expect(page.locator('#status')).not.toContainText('Requesting a routing preview');
});
