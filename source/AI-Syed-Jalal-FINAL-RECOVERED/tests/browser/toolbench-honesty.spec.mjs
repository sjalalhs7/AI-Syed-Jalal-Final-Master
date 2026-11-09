import { test, expect } from '@playwright/test';

async function signedInToolbench(page) {
  await page.route('**/api/health', route => route.fulfill({ json: { ok: true, localPreview: false } }));
  await page.route('**/api/me', route => route.fulfill({ json: { authenticated: true, csrfToken: 'test-token', user: { username: 'tester', role: 'Admin' } } }));
  await page.route('**/api/agent/capabilities', route => route.fulfill({ json: { tools: [] } }));
  await page.goto('/toolbench.html');
  await expect(page.locator('#status')).toContainText('Signed in as tester');
}

function runResult({ id = null, action = null, needsProvider = false, tool = 'none', failed = false, noTool = tool === 'none' } = {}) {
  const successful = !noTool && !failed;
  return {
    id, action, needsProvider, plan: [{ id: 'one' }],
    steps: [{ title: 'Example step', tool, ok: !failed, ms: 1, observation: 'Example result', noTool }],
    trace: { attempted: tool === 'none' ? 0 : 1, toolCalls: successful ? 1 : 0, tools: successful ? [tool] : [], failures: failed ? 1 : 0, totalMs: 1 }
  };
}

test('Toolbench reports uncertain history, proposals and configured-provider uncertainty honestly', async ({ page }) => {
  let confirmations = 0;
  await page.route('**/api/assistant/confirm', route => { confirmations++; return route.fulfill({ json: { ok: true } }); });
  await page.route('**/api/assistant/chat', async route => {
    const { message } = route.request().postDataJSON();
    if (message === 'lost response') return route.fulfill({ status: 500, json: { error: 'Request interrupted' } });
    const result = message === 'saved run' ? runResult({ id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', tool: 'calculator' })
      : message === 'proposal' ? runResult({ action: { type: 'create_task', title: 'Test task' } })
        : message === 'empty research' ? runResult({ tool: 'research', noTool: true, needsProvider: true })
          : message === 'failed step' ? runResult({ tool: 'tasks', failed: true, needsProvider: true })
            : runResult({ needsProvider: true });
    await route.fulfill({ json: result });
  });
  await signedInToolbench(page);
  await expect(page.locator('.limits')).toContainText('may save the prompt and trace');
  await expect(page.locator('.limits')).toContainText('Toolbench can prepare a proposal but cannot confirm it');

  const prompt = page.locator('#prompt');
  const run = async text => { await prompt.fill(text); await page.locator('#runBtn').click(); };
  await run('open ended');
  await expect(page.locator('#status')).toContainText('without a tool call');
  await expect(page.locator('#result')).toContainText('Run history could not be confirmed');
  await expect(page.locator('#result')).toContainText('No cloud model was called');
  await expect(page.locator('#result')).not.toContainText('no provider key is configured');
  await expect(page.locator('#result')).not.toContainText('Every result above came from a tool');

  await run('saved run');
  await expect(page.locator('#result')).toContainText('history entry was saved');
  await expect(page.locator('#status')).toContainText('Review the steps');
  await page.locator('#clearBtn').click();
  await expect(page.locator('#status')).toContainText('does not erase run history');

  await run('proposal');
  await expect(page.locator('#result')).toContainText('This is an unsaved proposal');
  await expect(page.locator('#result')).toContainText('No task or note was saved');
  expect(confirmations).toBe(0);

  await run('empty research');
  await expect(page.locator('#result')).toContainText('1 attempted');
  await expect(page.locator('#result')).toContainText('0 successful tool result');
  await expect(page.locator('#result')).toContainText('tool was attempted but did not return a usable result');
  await expect(page.locator('#result')).not.toContainText('local profile answered instead');
  await expect(page.locator('#status')).toContainText('Review the steps');

  await run('failed step');
  await expect(page.locator('#status')).toContainText('1 failed step');
  await expect(page.locator('#result')).toContainText('A tool step failed');
  await expect(page.locator('#result')).not.toContainText('needs a cloud model');

  await run('lost response');
  await expect(page.locator('#status')).toContainText('could not be confirmed');
  await expect(page.locator('#status')).toContainText('Check history before retrying');
});

test('Toolbench stops waiting on a stalled run without claiming server cancellation', async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.setTimeout;
    window.setTimeout = (fn, ms, ...args) => original(fn, ms === 60000 ? 40 : ms, ...args);
  });
  await page.route('**/api/assistant/chat', async route => {
    await new Promise(resolve => setTimeout(resolve, 250));
    await route.fulfill({ json: runResult() }).catch(() => {});
  });
  await signedInToolbench(page);
  await page.locator('#prompt').fill('slow request');
  await page.locator('#runBtn').click();
  await expect(page.locator('#status')).toContainText('Stopped waiting');
  await expect(page.locator('#status')).toContainText('server may still finish');
  await expect(page.locator('#runBtn')).toBeEnabled();
});
