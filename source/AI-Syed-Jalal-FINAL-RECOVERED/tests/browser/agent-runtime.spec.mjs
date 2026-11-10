import { test, expect } from '@playwright/test';

test('JalalAi agent mode runs real tools and shows the trace, including failures', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/jalalai.html');
  await page.getByRole('button', { name: /Try the local preview/ }).click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected', { timeout: 20000 });

  // The agent must publish its finite tool list rather than implying unlimited powers.
  await page.locator('#mode').selectOption('agent');
  await expect(page.locator('#agentTools')).toContainText('Calculator');
  await expect(page.locator('#agentTools')).toContainText('Wikipedia research');
  await expect(page.locator('#modeLabel')).toContainText('bounded tool calls');

  // Two tools in one run: deterministic arithmetic plus the saved tasks reader.
  await page.locator('#prompt').fill('calculate (1200 + 350) * 15% * 3 and show my tasks');
  await page.locator('#sendBtn').click();
  await expect(page.locator('.agent-trace-head').first()).toContainText('2 successful tool result(s)', { timeout: 30000 });
  await expect(page.locator('.agent-trace-head').first()).toContainText('0 failure(s)');
  await expect(page.locator('.agent-step')).toHaveCount(2);
  await expect(page.locator('.agent-step').first()).toContainText('= 697.5');
  await expect(page.locator('.agent-step').nth(1)).toContainText('No tasks saved yet.');
  await expect(page.locator('.agent-trace .hint')).toContainText('explicit confirmation');
  await expect(page.locator('#status')).toContainText('2 successful tool result(s)');

  // A tool that cannot reach the network must say it failed, not invent an answer.
  await page.locator('#prompt').fill('research the history of the printing press');
  await page.locator('#sendBtn').click();
  await expect(page.locator('.agent-trace')).toHaveCount(2, { timeout: 40000 });
  const lastTrace = page.locator('.agent-trace').last();
  await expect(lastTrace.locator('.agent-step')).toHaveCount(1);
  // Either the live Wikipedia call worked (links shown) or it is reported as a failure.
  await expect(lastTrace).toContainText(/wikipedia\.org|FAILED|fetch failed/i);
  if (await lastTrace.locator('.agent-step.failed').count()) {
    await expect(page.locator('#status')).toContainText('failed step');
    await expect(lastTrace).toContainText('failure(s)');
  } else {
    await expect(lastTrace).toContainText('0 failure(s)');
  }

  expect(errors).toEqual([]);
});

test('JalalAi stops waiting without claiming the server was cancelled', async ({ page }) => {
  await page.goto('/jalalai.html');
  await page.getByRole('button', { name: /Try the local preview/ }).click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await page.route('**/api/assistant/chat', async route => {
    await new Promise(resolve => setTimeout(resolve, 350));
    await route.fulfill({ json: { mode: 'local', output: 'Late response' } }).catch(() => {});
  });
  await page.locator('#prompt').fill('a slow request');
  await page.locator('#sendBtn').click();
  await page.locator('#stopBtn').click();
  await expect(page.locator('#status')).toContainText('server may still finish');
  await page.waitForTimeout(500);
  await expect(page.locator('#chatlog')).not.toContainText('Late response');
});
