import { test, expect } from '@playwright/test';

// These are mobile-sized browser simulations with disposable preview data, not
// tests of a physical device, live provider, or the production database.
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function openWorkspace(page, view = 'ai-command') {
  await page.goto('/jalalai.html');
  await expect(page.locator('#connectionStatus')).not.toContainText('Checking');
  if (await page.locator('#demoBtn').isVisible()) await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await page.goto('/workspace.html#' + view);
  await page.evaluate(() => window.workspaceReady);
  await expect(page.locator('#app')).toBeVisible();
}

async function holdChats(page) {
  let release, count = 0;
  const held = new Promise(resolve => { release = resolve; });
  await page.route('**/api/assistant/chat', async route => {
    count++;
    await held;
    await route.fulfill({ json: { ok: true, mode: 'local', output: 'Late fixture answer' } }).catch(() => {});
  });
  return { release, calls: () => count };
}

async function speedUpDeadline(page) {
  await page.evaluate(() => {
    const original = window.setTimeout.bind(window);
    window.setTimeout = (fn, ms, ...args) => original(fn, ms === 65000 ? 150 : ms, ...args);
    Object.defineProperty(AbortSignal, 'any', { configurable: true, value: undefined });
    // An accelerated native-style timeout also catches an implementation that
    // uses only AbortSignal.timeout rather than a normal setTimeout.
    Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: ms => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), ms);
      return controller.signal;
    } });
  });
}

test('Workspace restores a session and runs local chat without AbortSignal.timeout', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: undefined });
    Object.defineProperty(AbortSignal, 'any', { configurable: true, value: undefined });
  });
  await openWorkspace(page);
  await expect(page.locator('#aiRunBtn')).toBeEnabled();
  await page.locator('#aiPrompt').fill('calculate 6*7');
  await page.locator('#aiRunBtn').click();
  await expect(page.locator('#aiOutput')).toContainText('42');
  expect(errors).toEqual([]);
});

test('Workspace AI console stops waiting for a stalled response and keeps the draft', async ({ page }) => {
  await openWorkspace(page);
  await expect(page.locator('#aiRunBtn')).toBeEnabled();
  const gate = await holdChats(page);
  try {
    await speedUpDeadline(page);
    await page.locator('#aiPrompt').fill('A stalled workspace prompt');
    await page.locator('#aiRunBtn').click();
    await expect(page.locator('#aiRunMessage')).toContainText('timed out', { timeout: 3000 });
    await expect(page.locator('#aiRunMessage')).toContainText('server may still finish');
    await expect(page.locator('#aiRunBtn')).toBeEnabled();
    await expect(page.locator('#aiPrompt')).toHaveValue('A stalled workspace prompt');
    expect(gate.calls()).toBe(1);
    gate.release(); await page.waitForTimeout(300);
    await expect(page.locator('#aiOutput')).not.toContainText('Late fixture answer');
  } finally { gate.release(); }
});

test('Workspace dock times out a stalled chat without claiming server cancellation', async ({ page }) => {
  await openWorkspace(page, 'home');
  await page.locator('#ajDockToggle').click();
  const gate = await holdChats(page);
  try {
    await speedUpDeadline(page);
    await page.locator('#ajDockInput').fill('A stalled dock prompt');
    await page.locator('#ajDockSend').click();
    await expect(page.locator('#ajDockReply')).toContainText('timed out', { timeout: 3000 });
    await expect(page.locator('#ajDockStatus')).toContainText('server may still finish');
    await expect(page.locator('#ajDockSend')).toBeEnabled();
    await expect(page.locator('#ajDockInput')).toHaveValue('A stalled dock prompt');
    expect(gate.calls()).toBe(1);
    gate.release(); await page.waitForTimeout(300);
    await expect(page.locator('#ajDockReply')).not.toContainText('Late fixture answer');
  } finally { gate.release(); }
});

test('Workspace Stop remains available during refresh, ignores a late response, and never duplicates a request', async ({ page }) => {
  await openWorkspace(page);
  await expect(page.locator('#aiRunBtn')).toBeEnabled();
  const gate = await holdChats(page);
  try {
    await page.locator('#aiPrompt').fill('Stop this workspace request');
    await page.locator('#aiRunBtn').click();
    await expect.poll(gate.calls).toBe(1);
    await expect(page.locator('#aiStopBtn')).toBeEnabled();
    await expect(page.locator('#aiTraceTag')).toHaveText('RUNNING');
    await page.locator('#aiRefreshBtn').click();
    await expect(page.locator('#aiRunBtn')).toBeDisabled();
    await page.locator('#aiStopBtn').click();
    await expect(page.locator('#aiRunMessage')).toContainText('Stopped waiting');
    await expect(page.locator('#aiRunMessage')).toContainText('server may still finish');
    await expect(page.locator('#aiTraceTag')).toHaveText('NO COMPLETION CONFIRMED');
    await expect(page.locator('#aiStopBtn')).toBeDisabled();
    await expect(page.locator('#aiPrompt')).toHaveValue('Stop this workspace request');
    expect(gate.calls()).toBe(1);
    gate.release(); await page.waitForTimeout(400);
    await expect(page.locator('#aiOutput')).not.toContainText('Late fixture answer');
    await expect(page.locator('#aiRunMessage')).toContainText('server may still finish');
  } finally { gate.release(); }
});

test('Workspace dock Stop preserves a newer draft and warns that the server may finish', async ({ page }) => {
  await openWorkspace(page, 'home');
  await page.locator('#ajDockToggle').click();
  const gate = await holdChats(page);
  try {
    await page.locator('#ajDockInput').fill('First dock message');
    await page.locator('#ajDockSend').click();
    await expect.poll(gate.calls).toBe(1);
    await page.locator('#ajDockInput').fill('New unsent draft');
    await page.locator('#ajDockStop').click();
    await expect(page.locator('#ajDockStatus')).toContainText('server may still finish');
    await expect(page.locator('#ajDockReply')).toContainText('Stopped waiting');
    await expect(page.locator('#ajDockInput')).toHaveValue('New unsent draft');
    await expect(page.locator('#ajDockSend')).toBeEnabled();
    gate.release(); await page.waitForTimeout(300);
    await expect(page.locator('#ajDockReply')).not.toContainText('Late fixture answer');
    expect(gate.calls()).toBe(1);
  } finally { gate.release(); }
});

test('Workspace AI console does not report a malformed 200 response as completed', async ({ page }) => {
  await openWorkspace(page);
  await expect(page.locator('#aiRunBtn')).toBeEnabled();
  await page.route('**/api/assistant/chat', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{invalid-json' }));
  await page.locator('#aiPrompt').fill('A prompt with an unreadable response');
  await page.locator('#aiRunBtn').click();
  await expect(page.locator('#aiRunMessage')).toContainText('response was unreadable');
  await expect(page.locator('#aiRunMessage')).toContainText('server may still finish');
  await expect(page.locator('#aiRunBtn')).toBeEnabled();
  await expect(page.locator('#aiPrompt')).toHaveValue('A prompt with an unreadable response');
  await expect(page.locator('#aiTraceTag')).not.toHaveText('COMPLETED');
});

test('Workspace console shows an HTTP status when an error response is JSON null', async ({ page }) => {
  await openWorkspace(page);
  await expect(page.locator('#aiRunBtn')).toBeEnabled();
  await page.route('**/api/assistant/chat', route => route.fulfill({ status: 502, contentType: 'application/json', body: 'null' }));
  await page.locator('#aiPrompt').fill('A request with an unreadable error');
  await page.locator('#aiRunBtn').click();
  await expect(page.locator('#aiRunMessage')).toHaveText('HTTP 502');
  await expect(page.locator('#aiTraceTag')).toHaveText('NO COMPLETION CONFIRMED');
  await expect(page.locator('#aiPrompt')).toHaveValue('A request with an unreadable error');
});

test('Workspace console replaces an old completion when a 200 reply is incomplete', async ({ page }) => {
  await openWorkspace(page);
  await expect(page.locator('#aiRunBtn')).toBeEnabled();
  await page.locator('#aiPrompt').fill('calculate 6*7');
  await page.locator('#aiRunBtn').click();
  await expect(page.locator('#aiOutput')).toContainText('42');
  await expect(page.locator('#aiTraceTag')).toHaveText('COMPLETED');
  await expect(page.locator('#aiRunBtn')).toBeEnabled();
  await page.route('**/api/assistant/chat', route => route.fulfill({ json: { ok: true } }));
  await page.locator('#aiPrompt').fill('The incomplete response');
  await page.locator('#aiRunBtn').click();
  await expect(page.locator('#aiRunMessage')).toContainText('response was incomplete', { timeout: 3000 });
  await expect(page.locator('#aiRunMessage')).toContainText('server may still finish');
  await expect(page.locator('#aiTraceTag')).toHaveText('NO COMPLETION CONFIRMED');
  await expect(page.locator('#aiPrompt')).toHaveValue('The incomplete response');
});

test('Workspace cloud console rejects an incomplete Gemini response without claiming success', async ({ page }) => {
  await page.route('**/api/ai/capabilities', async route => {
    const response = await route.fetch(), data = await response.json();
    const gemini = data.providers.find(provider => provider.id === 'gemini');
    gemini.configured = true;
    gemini.status = 'Fixture key configured; not live-tested';
    await route.fulfill({ response, json: data });
  });
  await openWorkspace(page);
  await page.locator('#aiEngine').selectOption('cloud');
  await expect(page.locator('#aiRunBtn')).toBeEnabled();
  await page.route('**/api/ai/run', route => route.fulfill({ json: { ok: true, status: 'completed', provider: 'gemini' } }));
  await page.locator('#aiPrompt').fill('A cloud request with an incomplete reply');
  await page.locator('#aiRunBtn').click();
  await expect(page.locator('#aiRunMessage')).toContainText('response was incomplete', { timeout: 3000 });
  await expect(page.locator('#aiTraceTag')).toHaveText('NO COMPLETION CONFIRMED');
  await expect(page.locator('#aiPrompt')).toHaveValue('A cloud request with an incomplete reply');
  await expect(page.locator('#aiOutput')).toBeEmpty();
});

test('Workspace dock rejects an HTTP 200 error instead of showing it as a successful reply', async ({ page }) => {
  await openWorkspace(page, 'home');
  await page.locator('#ajDockToggle').click();
  await page.route('**/api/assistant/chat', route => route.fulfill({ json: { ok: false, output: 'Forged success' } }));
  await page.locator('#ajDockInput').fill('An incomplete response');
  await page.locator('#ajDockSend').click();
  await expect(page.locator('#ajDockReply')).toContainText('response was incomplete', { timeout: 3000 });
  await expect(page.locator('#ajDockReply')).not.toContainText('Forged success');
  await expect(page.locator('#ajDockStatus')).toContainText('No completion confirmed');
  await expect(page.locator('#ajDockInput')).toHaveValue('An incomplete response');
});

test('Workspace dock keeps a provider error alongside the local fallback', async ({ page }) => {
  await openWorkspace(page, 'home');
  await page.locator('#ajDockToggle').click();
  await page.route('**/api/assistant/chat', route => route.fulfill({ json: {
    ok: true, mode: 'local-fallback', output: 'Fixture local guidance.',
    cloudError: 'The AI provider reported a rate limit or quota problem (HTTP 429).'
  } }));
  await page.locator('#ajDockInput').fill('Explain a project');
  await page.locator('#ajDockSend').click();
  await expect(page.locator('#ajDockReply')).toContainText('HTTP 429');
  await expect(page.locator('#ajDockReply')).toContainText('Local response');
  await expect(page.locator('#ajDockReply')).toContainText('Fixture local guidance');
});

test('Workspace AI deadline also covers a stalled response body', async ({ page }) => {
  await openWorkspace(page);
  await expect(page.locator('#aiRunBtn')).toBeEnabled();
  await page.evaluate(() => {
    const originalTimer = window.setTimeout.bind(window), originalFetch = window.fetch.bind(window);
    window.setTimeout = (fn, ms, ...args) => originalTimer(fn, ms === 65000 ? 150 : ms, ...args);
    window.fetch = (url, options = {}) => {
      if (!String(url).endsWith('/api/assistant/chat')) return originalFetch(url, options);
      const body = new ReadableStream({ start(controller) {
        const fail = () => controller.error(new DOMException('body aborted', 'AbortError'));
        if (options.signal.aborted) fail();
        else options.signal.addEventListener('abort', fail, { once: true });
      } });
      return Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } }));
    };
  });
  await page.locator('#aiPrompt').fill('The response body is stalled');
  await page.locator('#aiRunBtn').click();
  await expect(page.locator('#aiRunMessage')).toContainText('timed out', { timeout: 3000 });
  await expect(page.locator('#aiRunMessage')).toContainText('server may still finish');
  await expect(page.locator('#aiRunBtn')).toBeEnabled();
  await expect(page.locator('#aiTraceTag')).not.toHaveText('COMPLETED');
});

test('fallback record-save timeout is uncertain and never automatically retried', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: undefined });
  });
  await openWorkspace(page, 'data');
  let release, calls = 0;
  const held = new Promise(resolve => { release = resolve; });
  await page.route('**/api/records', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    calls++; await held;
    await route.fulfill({ status: 201, json: { record: { id: 'late', name: 'Fixture record' } } }).catch(() => {});
  });
  try {
    await page.evaluate(() => {
      const original = window.setTimeout.bind(window);
      window.setTimeout = (fn, ms, ...args) => original(fn, ms === 60000 ? 150 : ms, ...args);
    });
    await page.locator('#addBtn').click();
    await page.locator('#fName').fill('Fixture record');
    await page.locator('#recordForm button[type="submit"]').click();
    await expect(page.locator('#recordFormStatus')).toContainText('Save could not be confirmed', { timeout: 3000 });
    await expect(page.locator('#recordFormStatus')).toContainText('before retrying');
    await expect(page.locator('#recordForm button[type="submit"]')).toBeEnabled();
    expect(calls).toBe(1);
    release(); await page.waitForTimeout(300);
    await expect(page.locator('#recordFormStatus')).toContainText('Save could not be confirmed');
    expect(calls).toBe(1);
  } finally { release(); }
});
