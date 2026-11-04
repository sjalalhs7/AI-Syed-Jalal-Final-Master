import { test, expect } from '@playwright/test';

test('Arena: blind battle of real local engines, vote, reveal, leaderboard and history', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/arena.html');
  await page.getByRole('button', { name: 'Try the local preview' }).click();
  await expect(page.locator('#engineGrid .engine')).toHaveCount(9);
  await expect(page.locator('#runBtn')).toBeDisabled();

  // Unconfigured cloud engines must be labelled, not hidden and not faked.
  await expect(page.locator('#engineGrid')).toContainText('Not configured');

  // Case 2 of the honesty rules: the general local tool refuses open-ended prompts.
  // Pick engines that really produce an answer so the vote is meaningful.
  await page.locator('#engineGrid input[value="local"]').uncheck();
  await page.locator('#engineGrid input[value="local-coding"]').check();
  await page.locator('#prompt').fill('Write a critical review of an analytics dashboard launch plan with risks');
  await expect(page.locator('#runBtn')).toBeEnabled({ timeout: 20000 });
  await page.locator('#runBtn').click();
  await expect(page.locator('#battlePanel')).toBeVisible({ timeout: 40000 });
  await expect(page.locator('#responses .card')).toHaveCount(2);

  // Blind mode: no engine identity until the vote.
  await expect(page.locator('#responses')).not.toContainText('SJ Planner');
  await expect(page.locator('#responses')).not.toContainText('SJ Critic');
  await expect(page.locator('#responses')).toContainText('Engine A');
  await expect(page.locator('#judgeLine')).toContainText(/Rubric judge|No verdict/);
  await expect(page.locator('#judgeDetail')).toContainText('not a human reviewer');
  await expect(page.locator('#status')).toContainText('Vote to decide it');

  // Vote once; the vote reveals the engines and records the human decision.
  await page.locator('#voteButtons').getByRole('button', { name: /Engine A/ }).click();
  await expect(page.locator('#status')).toContainText('Vote recorded', { timeout: 20000 });
  await expect(page.locator('#responses')).toContainText(/SJ Planner|SJ Critic/);
  await expect(page.locator('#voteButtons button').first()).toBeDisabled();
  await expect(page.locator('#statHuman')).toHaveText('1');

  // The leaderboard is built from the decided battle, and says what it is not.
  await expect(page.locator('#leaderBody tr')).toHaveCount(9);
  await expect(page.locator('#leaderNote')).toContainText('not a benchmark');
  await expect(page.locator('#history .history-item')).toHaveCount(1);
  await expect(page.locator('#statAgree')).toContainText('%');

  // Code mode extracts artifacts and previews them in a sandboxed frame.
  await page.locator('#newBattleBtn').click();
  await page.locator('#mode').selectOption('code');
  await page.locator('#prompt').fill('Write the implementation checklist for a responsive pricing card');
  await page.locator('#runBtn').click();
  await expect(page.locator('#battlePanel')).toBeVisible({ timeout: 40000 });
  await expect(page.locator('#responses .card')).toHaveCount(2);
  // Code mode must say what it produced; an empty artifact list is not claimed.
  const artifactCount = await page.locator('#artifactBox .artifact').count();
  if (artifactCount) await expect(page.locator('#artifactBox .artifact iframe, #artifactBox .artifact pre').first()).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('Arena: static host states its limits and cannot simulate a battle', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/arena.html?static=1');
  await expect(page.locator('#status')).toContainText('Static preview · backend not connected');
  await expect(page.locator('#runBtn')).toBeDisabled();
  await expect(page.locator('#buildHint')).toContainText('npm ci && npm run dev');
  await expect(page.locator('#engineGrid')).toBeVisible();
  expect(errors).toEqual([]);
});
