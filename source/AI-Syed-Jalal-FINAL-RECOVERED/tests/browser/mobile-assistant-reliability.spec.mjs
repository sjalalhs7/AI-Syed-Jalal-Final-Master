import { test, expect } from '@playwright/test';

// Mobile-sized Chromium is not a physical Android device. API calls use the
// disposable PGlite preview or explicit fixtures; no provider is contacted.
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function openAssistant(page, surface) {
  await page.goto(`/${surface}.html`);
  await expect(page.locator('#connectionStatus')).not.toContainText('Checking', { timeout: 20000 });
  if (await page.locator('#demoBtn').isVisible()) await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected', { timeout: 20000 });
}

for (const surface of ['jarvis', 'jalalai']) {
  test(`${surface} can connect and run local tools without AbortSignal.timeout`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: undefined });
      Object.defineProperty(AbortSignal, 'any', { configurable: true, value: undefined });
    });
    await openAssistant(page, surface);
    await page.locator('#mode').selectOption('local');
    if (surface === 'jarvis') {
      await page.locator('#voiceSettings > summary').click();
      await page.locator('#handsFree').uncheck();
    }
    await page.locator('#prompt').fill('calculate 6*7');
    await page.locator('#sendBtn').click();
    await expect(page.locator('#chatlog')).toContainText('42');
    expect(errors).toEqual([]);
  });
}

test('JARVIS times out a stalled request even when AbortSignal.any is unavailable', async ({ page }) => {
  await openAssistant(page, 'jarvis');
  await page.locator('#mode').selectOption('local');
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let requests = 0;
  await page.route('**/api/assistant/chat', async route => {
    requests++;
    await held;
    await route.fulfill({ json: { ok: true, mode: 'local', output: 'Late fixture response' } }).catch(() => {});
  });
  try {
    // Accelerate only this page's 65-second timer; the held fixture stays held.
    await page.evaluate(() => {
      const original = window.setTimeout.bind(window);
      window.setTimeout = (fn, ms, ...args) => original(fn, ms === 65000 ? 150 : ms, ...args);
      Object.defineProperty(AbortSignal, 'any', { configurable: true, value: undefined });
      Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: ms => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), ms);
        return controller.signal;
      } });
    });
    await page.locator('#prompt').fill('A request that never responds');
    await page.locator('#sendBtn').click();
    await expect(page.locator('#status')).toContainText('timed out', { timeout: 3000 });
    await expect(page.locator('#status')).toContainText('server may still finish');
    await expect(page.locator('#prompt')).toHaveValue('A request that never responds');
    await expect(page.locator('#sendBtn')).toBeEnabled();
    await expect(page.locator('#stopBtn')).toBeDisabled();
    expect(requests).toBe(1);
    release();
    await page.waitForTimeout(300);
    await expect(page.locator('#chatlog')).not.toContainText('Late fixture response');
  } finally { release(); }
});

test('JalalAi distinguishes a timeout from pressing Stop and retains the draft', async ({ page }) => {
  await openAssistant(page, 'jalalai');
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route('**/api/assistant/chat', async route => {
    await held;
    await route.fulfill({ json: { ok: true, mode: 'local', output: 'Late fixture response' } }).catch(() => {});
  });
  try {
    await page.evaluate(() => {
      const original = window.setTimeout.bind(window);
      window.setTimeout = (fn, ms, ...args) => original(fn, ms === 60000 ? 150 : ms, ...args);
    });
    await page.locator('#prompt').fill('A request that times out');
    await page.locator('#sendBtn').click();
    await expect(page.locator('#status')).toContainText('timed out', { timeout: 3000 });
    await expect(page.locator('#status')).toContainText('server may still finish');
    await expect(page.locator('#prompt')).toHaveValue('A request that times out');
    await expect(page.locator('#sendBtn')).toBeEnabled();
    release();
    await page.waitForTimeout(300);
    await expect(page.locator('#chatlog')).not.toContainText('Late fixture response');
  } finally { release(); }
});

test('JalalAi keeps the provider failure in the conversation and labels the local fallback', async ({ page }) => {
  await page.route('**/api/assistant/state*', async route => {
    const response = await route.fetch(); const data = await response.json();
    data.cloudConfigured = true;
    data.cloudProviders = { gemini: true, openai: false, anthropic: false, deepseek: false, omniroute: false };
    await route.fulfill({ response, json: data });
  });
  await page.route('**/api/assistant/chat', route => route.fulfill({ json: {
    ok: true, mode: 'local-fallback', output: 'Local guidance, not a Gemini reply.',
    cloudError: 'The AI provider reported a rate limit or quota problem (HTTP 429).'
  } }));
  await openAssistant(page, 'jalalai');
  await page.locator('#mode').selectOption('cloud');
  await page.locator('#prompt').fill('Explain this project');
  await page.locator('#sendBtn').click();
  const reply = page.locator('.message.assistant').last();
  await expect(reply).toContainText('HTTP 429');
  await expect(reply).toContainText('local fallback');
  await expect(reply).toContainText('Local guidance');
});

test('JARVIS keeps a Gemini failure visible instead of presenting its fallback as cloud output', async ({ page }) => {
  await page.route('**/api/assistant/state*', async route => {
    const response = await route.fetch(), data = await response.json();
    data.cloudConfigured = true;
    data.cloudProviders = { gemini: true, openai: false, anthropic: false, deepseek: false, omniroute: false };
    await route.fulfill({ response, json: data });
  });
  await page.route('**/api/assistant/chat', route => route.fulfill({ json: {
    ok: true, mode: 'local-fallback', output: 'Local guidance, not a Gemini reply.',
    cloudError: 'The AI provider reported a rate limit or quota problem (HTTP 429).'
  } }));
  await openAssistant(page, 'jarvis');
  await page.locator('#voiceSettings > summary').click();
  await page.locator('#handsFree').uncheck();
  await page.locator('#mode').selectOption('cloud');
  await page.locator('#prompt').fill('Explain this project');
  await page.locator('#sendBtn').click();
  const reply = page.locator('.message.assistant').last();
  await expect(reply).toContainText('HTTP 429');
  await expect(reply).toContainText('local fallback');
  await expect(reply).toContainText('Local guidance');
});

for (const surface of ['jarvis', 'jalalai']) {
  test(`${surface} Stop works without new AbortSignal methods and does not overwrite a new draft`, async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: undefined });
      Object.defineProperty(AbortSignal, 'any', { configurable: true, value: undefined });
    });
    await openAssistant(page, surface);
    await page.locator('#mode').selectOption('local');
    let release, announce, calls = 0;
    const held = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { announce = resolve; });
    await page.route('**/api/assistant/chat', async route => {
      calls++; announce(); await held;
      await route.fulfill({ json: { ok: true, mode: 'local', output: 'Late stopped response' } }).catch(() => {});
    });
    try {
      await page.locator('#prompt').fill('First message');
      await page.locator('#sendBtn').click();
      await started;
      await page.locator('#prompt').fill('A new unsent draft');
      await page.locator('#stopBtn').click();
      await expect(page.locator('#status')).toContainText('Stopped waiting');
      await expect(page.locator('#status')).toContainText('server may still finish');
      await expect(page.locator('#status')).not.toContainText('timed out');
      await expect(page.locator('#prompt')).toHaveValue('A new unsent draft');
      await expect(page.locator('#sendBtn')).toBeEnabled();
      expect(calls).toBe(1);
      release(); await page.waitForTimeout(300);
      await expect(page.locator('#chatlog')).not.toContainText('Late stopped response');
    } finally { release(); }
  });

  test(`${surface} times out while reading response bodies, without claiming success`, async ({ page }) => {
    await openAssistant(page, surface);
    await page.locator('#mode').selectOption('local');
    await page.evaluate(() => {
      const originalTimer = window.setTimeout.bind(window), originalFetch = window.fetch.bind(window);
      window.setTimeout = (fn, ms, ...args) => originalTimer(fn, ms === 60000 || ms === 65000 ? 150 : ms, ...args);
      window.fetch = (url, options = {}) => {
        if (String(url) !== '/api/assistant/chat') return originalFetch(url, options);
        const stream = new ReadableStream({ start(controller) {
          const fail = () => controller.error(new DOMException('body aborted', 'AbortError'));
          if (options.signal.aborted) fail();
          else options.signal.addEventListener('abort', fail, { once: true });
        } });
        return Promise.resolve(new Response(stream, { status: 200, headers: { 'Content-Type': 'application/json' } }));
      };
    });
    await page.locator('#prompt').fill('The response body is stalled');
    await page.locator('#sendBtn').click();
    await expect(page.locator('#status')).toContainText('timed out', { timeout: 3000 });
    await expect(page.locator('#status')).toContainText('server may still finish');
    await expect(page.locator('#prompt')).toHaveValue('The response body is stalled');
    await expect(page.locator('#sendBtn')).toBeEnabled();
    await expect(page.locator('#chatlog')).not.toContainText('No reply was returned');
  });

  test(`${surface} reports malformed successful responses instead of claiming a reply`, async ({ page }) => {
    await openAssistant(page, surface);
    await page.locator('#mode').selectOption('local');
    await page.route('**/api/assistant/chat', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{invalid-json' }));
    await page.locator('#prompt').fill('A prompt with an unreadable response');
    await page.locator('#sendBtn').click();
    await expect(page.locator('#status')).toContainText('response was unreadable');
    await expect(page.locator('#status')).toContainText('server may still finish');
    await expect(page.locator('#prompt')).toHaveValue('A prompt with an unreadable response');
    await expect(page.locator('#sendBtn')).toBeEnabled();
  });

  test(`${surface} reports the HTTP status when an error response is JSON null`, async ({ page }) => {
    await openAssistant(page, surface);
    await page.locator('#mode').selectOption('local');
    await page.route('**/api/assistant/chat', route => route.fulfill({ status: 502, contentType: 'application/json', body: 'null' }));
    await page.locator('#prompt').fill('A request with an unreadable error');
    await page.locator('#sendBtn').click();
    await expect(page.locator('#status')).toContainText('Request failed (502)');
    await expect(page.locator('#prompt')).toHaveValue('A request with an unreadable error');
    await expect(page.locator('#sendBtn')).toBeEnabled();
  });

  test(`${surface} rejects incomplete or negative 200 replies without losing the draft`, async ({ page }) => {
    await openAssistant(page, surface);
    await page.locator('#mode').selectOption('local');
    let fixture;
    await page.route('**/api/assistant/chat', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) }));
    for (const invalid of [null, { ok: true }, { ok: true, output: '  ' }, { ok: false, output: 'Forged success' }]) {
      fixture = invalid;
      await page.locator('#prompt').fill('A prompt with an incomplete response');
      await page.locator('#sendBtn').click();
      await expect(page.locator('#status')).toContainText('response was incomplete', { timeout: 3000 });
      await expect(page.locator('#status')).toContainText('server may still finish');
      await expect(page.locator('#prompt')).toHaveValue('A prompt with an incomplete response');
      await expect(page.locator('#sendBtn')).toBeEnabled();
    }
    await expect(page.locator('#chatlog')).not.toContainText('Forged success');
  });
}
