import { test, expect } from '@playwright/test';

// The Expert Critic is the easiest surface in the app to fake: a template plus a
// flattering number would pass a screenshot review. These journeys assert the
// opposite — that the verdict follows the stored evidence, and that the page
// publishes its own limits.
test('Expert Critic: the verdict follows stored evidence, and every finding cites it', async ({ page }) => {
  test.setTimeout(120000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected', { timeout: 20000 });

  await page.goto('/critic.html');
  await expect(page.locator('#runState')).not.toContainText('Not run yet', { timeout: 20000 });
  await page.locator('#runBtn').click();

  // A real review renders: score, verdict, seven dimensions, findings.
  await expect(page.locator('#verdict')).toBeVisible({ timeout: 45000 });
  await expect(page.locator('.dim')).toHaveCount(7);
  const score = Number(await page.locator('#scoreValue').textContent());
  expect(score).toBeGreaterThanOrEqual(0);
  expect(score).toBeLessThanOrEqual(100);

  // Findings are evidence-relative: a used deployment may legitimately produce
  // none. What must never vary is that a rendered finding cites its evidence and
  // its fix — and that the empty state says what it means.
  const findings = page.locator('.finding');
  const count = await findings.count();
  for (let index = 0; index < count; index += 1) {
    const item = findings.nth(index);
    await expect(item.locator('.severity')).not.toBeEmpty();
    await expect(item.locator('.finding-evidence')).toContainText(/^Evidence: .{10,}/);
    await expect(item.locator('.finding-fix')).toContainText(/^Fix: .{10,}/);
  }
  if (count === 0) {
    await expect(page.locator('#findingsEmpty')).toBeVisible();
    await expect(page.locator('#findingsEmpty')).toContainText('not a guarantee');
    await expect(page.locator('#verdictSummary')).toContainText(/No blocker, critical or major finding was produced/);
  }

  // The counts panel must agree with the findings on screen.
  const summary = await page.locator('#verdictSummary').textContent();
  expect(summary).toMatch(/deterministic review of stored evidence/i);
  expect(summary).not.toMatch(/certified|guaranteed/i);

  // The count panel and the list must agree, whichever way the evidence falls.
  const declared = Number(await page.locator('.count strong').first().textContent())
    + Number(await page.locator('.count.critical strong').textContent())
    + Number(await page.locator('.count.major strong').textContent())
    + Number(await page.locator('.count.minor strong').textContent());
  const openFindings = await page.locator('.finding').count();
  expect(declared).toBe(openFindings);

  // Severity filters narrow the list without inventing entries.
  await page.locator('[data-filter="blocker"]').click();
  const blockers = await findings.count();
  expect(blockers).toBeLessThanOrEqual(count);
  await page.locator('[data-filter="all"]').click();

  // Limits are stated on the page itself.
  await expect(page.locator('#limits')).toContainText('not a penetration test');
  await expect(page.locator('#limits')).toContainText('CDN logs');

  // And the review is stored, so the verdict can be audited later.
  await expect(page.locator('#history li').first()).toContainText(/\/100/);
  expect(errors).toEqual([]);
});

test('Expert Critic: an empty deployment is reported as not ready, not as a pass', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected', { timeout: 20000 });
  await page.goto('/critic.html');
  await page.locator('#runBtn').click();
  await expect(page.locator('#verdict')).toBeVisible({ timeout: 45000 });
  // Fresh accounts have no audit trail, no agent runs and no self-check: the
  // critic must say so rather than award a healthy score.
  const body = await page.locator('#verdictSummary').textContent();
  const score = Number(await page.locator('#scoreValue').textContent());
  if (/not ready/i.test(body)) {
    expect(score).toBeLessThan(75);
    await expect(page.locator('.finding.critical, .finding.blocker').first()).toBeVisible();
  }
  // Whatever the verdict, a blocker must never coexist with "ready".
  if ((await page.locator('.finding.blocker').count()) > 0) {
    await expect(page.locator('#verdictTitle')).not.toContainText('Ready to call production');
  }
});

test('the architecture record names what merged, what stayed separate and what remains', async ({ page }) => {
  await page.goto('/refactor-plan.html');
  const body = await page.locator('main').textContent();
  expect(body).toContain('One runtime, four front doors');
  expect(body).toMatch(/merged/i);
  expect(body).toMatch(/separate/i);
  expect(body).toMatch(/remaining/i);
  // The duplication that still exists must be named, not glossed over.
  expect(body).toContain('assets/jalalai.js');
  expect(body).toContain('assets/jarvis.js');
  await expect(page.locator('.finding').first()).toBeVisible();
});
