import { test, expect } from '@playwright/test';

// All saves use disposable preview accounts; stalled and malformed responses
// are intercepted. Nothing reaches a live provider or production database.
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function openSurface(page, surface) {
  const assistant = surface === 'jarvis' || surface === 'jalalai';
  await page.goto(`/${assistant ? surface : 'jalalai'}.html`);
  await expect(page.locator('#connectionStatus')).not.toContainText('Checking');
  if (await page.locator('#demoBtn').isVisible()) await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  if (assistant) {
    await page.locator('#mode').selectOption('local');
    if (surface === 'jarvis') {
      await page.locator('#voiceSettings > summary').click();
      await page.locator('#handsFree').uncheck();
    }
    return;
  }
  await page.goto('/workspace.html#' + (surface === 'console' ? 'ai-command' : 'home'));
  await page.evaluate(() => window.workspaceReady);
  await expect(page.locator('#app')).toBeVisible();
  const welcomeClose = page.locator('#aj-welcome-notice-close');
  if (await welcomeClose.isVisible()) await welcomeClose.click();
  if (surface === 'dock') await page.locator('#ajDockToggle').click();
  else await expect(page.locator('#aiRunBtn')).toBeEnabled();
}

async function propose(page, surface, title) {
  if (surface === 'jarvis' || surface === 'jalalai') {
    await page.locator('#prompt').fill('add task: ' + title);
    await page.locator('#sendBtn').click();
    const panel = page.locator('#chatlog .confirmation').last();
    await expect(panel.getByRole('button', { name: 'Confirm & save' })).toBeVisible();
    return { panel, button: panel.getByRole('button', { name: 'Confirm & save' }) };
  }
  if (surface === 'console') {
    await page.locator('#aiPrompt').fill('add task: ' + title);
    await page.locator('#aiRunBtn').click();
    const panel = page.locator('#aiOutput');
    await expect(panel.getByRole('button', { name: 'Confirm & save' })).toBeVisible();
    return { panel, button: panel.getByRole('button', { name: 'Confirm & save' }) };
  }
  await page.locator('#ajDockInput').fill('add task: ' + title);
  await page.locator('#ajDockSend').click();
  const panel = page.locator('#ajDockReply');
  const button = panel.getByRole('button', { name: 'Confirm & save task' });
  await expect(button).toBeVisible();
  return { panel, button };
}

test.describe('intercepted save failures', () => {
  // Playwright cannot reliably route requests handled by a service worker.
  // These tests exercise mocked responses; separate real-save tests below
  // retain the worker to cover the deployed browser configuration.
  test.use({ serviceWorkers: 'block' });
  for (const surface of ['jarvis', 'jalalai', 'console', 'dock']) {
    for (const failure of ['timeout', 'malformed']) {
      test(`${surface} keeps a ${failure} save unconfirmed and cannot resend it with one tap`, async ({ page }) => {
        await openSurface(page, surface);
        const title = `Disposable ${surface} ${failure} task`;
        const { panel, button } = await propose(page, surface, title);
        let calls = 0, release;
        const held = new Promise(resolve => { release = resolve; });
        await page.route('**/api/assistant/confirm', async route => {
          calls++;
          if (failure === 'timeout') {
            await held;
            await route.fulfill({ json: { ok: true, task: { id: 'late', title }, output: 'Late fixture save' } }).catch(() => {});
          } else {
            // Valid JSON and HTTP 200 are not proof that the requested task was saved.
            await route.fulfill({ json: { ok: true, output: 'Forged save' } });
          }
        });
        try {
          await page.evaluate(() => {
            const original = window.setTimeout.bind(window);
            window.setTimeout = (fn, ms, ...args) => original(fn, ms === 20000 || ms === 65000 ? 150 : ms, ...args);
          });
          await button.click();
          // If interception is bypassed, a real disposable save can succeed and
          // hide what this test actually exercised. Verify the fixture was used.
          await expect.poll(() => calls, { timeout: 5000 }).toBe(1);
          const message = surface === 'dock' ? page.locator('#ajDockStatus') : panel;
          await expect(message).toContainText('Could not verify the save', { timeout: 3000 });
          await expect(message).toContainText('server may still finish');
          await expect(message).toContainText('check your tasks or notes');
          await expect(button).toHaveCount(0);
          expect(calls).toBe(1);
          release(); await page.waitForTimeout(300);
          await expect(panel).not.toContainText('Late fixture save');
          await expect(panel).not.toContainText('Forged save');
          expect(calls).toBe(1);
        } finally { release(); }
      });
    }
  }
});

for (const surface of ['console', 'dock']) {
  test(`${surface} confirms a real disposable task exactly once`, async ({ page }) => {
    await openSurface(page, surface);
    // A real, unmocked save also exercises the installed worker rather than
    // relying exclusively on the isolated mock tests above.
    if (surface === 'console') await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
    const title = `Confirmed ${surface} task`;
    const { panel, button } = await propose(page, surface, title);
    let calls = 0;
    page.on('request', request => {
      if (new URL(request.url()).pathname === '/api/assistant/confirm') calls++;
    });
    await button.click();
    await expect(panel).toContainText('Saved task: ' + title);
    await expect(button).toHaveCount(0);
    expect(calls).toBe(1);
    const tasks = await page.evaluate(async () => (await (await fetch('/api/assistant/tasks')).json()).tasks);
    expect(tasks.filter(task => task.title === title)).toHaveLength(1);
  });
}

test.describe('intercepted delayed saves', () => {
  test.use({ serviceWorkers: 'block' });
  for (const surface of ['jarvis', 'jalalai', 'console', 'dock']) {
    test(`${surface} ignores a delayed save response after the user leaves its original view`, async ({ page }) => {
      await openSurface(page, surface);
      const title = `Private delayed ${surface} task`;
      const { button } = await propose(page, surface, title);
      let release, finish, calls = 0;
      const held = new Promise(resolve => { release = resolve; });
      const finished = new Promise(resolve => { finish = resolve; });
      await page.route('**/api/assistant/confirm', async route => {
        calls++; await held;
        await route.fulfill({ json: { ok: true, task: { id: 'late', title }, output: 'Late fixture save' } }).catch(() => {});
        finish();
      });
      try {
        await button.click();
        await expect.poll(() => calls, { timeout: 5000 }).toBe(1);
        if (surface === 'jarvis') {
          await page.locator('#clearChat').click();
          await expect(page.locator('#status')).toContainText('Session cleared');
        } else if (surface === 'jalalai') {
          page.once('dialog', dialog => dialog.accept());
          await page.locator('#accountBtn').click();
          await expect(page.locator('#accountBtn')).toHaveText('Sign in');
        } else if (surface === 'console') {
          await expect(page.locator('#aiRunBtn')).toBeEnabled();
          await page.locator('#aiPrompt').fill('calculate 6*7');
          await page.locator('#aiRunBtn').click();
          await expect(page.locator('#aiOutput')).toContainText('42');
        } else {
          await page.locator('#ajDockInput').fill('calculate 6*7');
          await page.locator('#ajDockSend').click();
          await expect(page.locator('#ajDockReply')).toContainText('42');
        }
        release(); await finished; await page.waitForTimeout(300);
        if (surface === 'jarvis' || surface === 'jalalai') {
          await expect(page.locator('#chatlog')).not.toContainText('Late fixture save');
          await expect(page.locator('#status')).not.toContainText('Saved after your confirmation');
        } else {
          const panel = page.locator(surface === 'console' ? '#aiOutput' : '#ajDockReply');
          await expect(panel).toContainText('42');
          await expect(panel).not.toContainText('Late fixture save');
        }
      } finally { release(); }
    });
  }
});

for (const surface of ['console', 'dock']) {
  test(`${surface} confirms a disposable note exactly once`, async ({ page }) => {
    await openSurface(page, surface);
    const content = `Confirmed ${surface} note`;
    let output, button;
    if (surface === 'console') {
      await page.locator('#aiPrompt').fill('save note: ' + content);
      await page.locator('#aiRunBtn').click();
      output = page.locator('#aiOutput');
      button = output.getByRole('button', { name: 'Confirm & save' });
    } else {
      await page.locator('#ajDockInput').fill('save note: ' + content);
      await page.locator('#ajDockSend').click();
      output = page.locator('#ajDockReply');
      button = output.getByRole('button', { name: 'Confirm & save note' });
    }
    await expect(button).toBeVisible();
    let calls = 0;
    page.on('request', request => { if (new URL(request.url()).pathname === '/api/assistant/confirm') calls++; });
    await button.click();
    await expect(output).toContainText('Note saved to your private workspace');
    await expect(button).toHaveCount(0);
    expect(calls).toBe(1);
    const notes = await page.evaluate(async () => (await (await fetch('/api/assistant/notes')).json()).notes);
    expect(notes.filter(note => note.content === content)).toHaveLength(1);
  });
}
