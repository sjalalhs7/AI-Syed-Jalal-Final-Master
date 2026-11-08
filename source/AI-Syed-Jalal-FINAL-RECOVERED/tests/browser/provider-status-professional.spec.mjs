import { test, expect } from '@playwright/test';

const cloudIds = ['gemini', 'openai', 'anthropic', 'deepseek'];

async function preview(page) {
  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
}

async function simulateUnreadableSettings(page, { configuredOpenAI = false } = {}) {
  await page.route('**/api/ai/capabilities', async route => {
    const response = await route.fetch();
    const data = await response.json();
    for (const item of data.providers) {
      if (!cloudIds.includes(item.id)) continue;
      item.configured = configuredOpenAI && item.id === 'openai' ? true : null;
      item.status = item.configured === true ? 'Key configured; live call not yet verified' : 'Stored settings could not be read; configuration is unknown';
    }
    data.mode = configuredOpenAI ? 'live-ready' : 'provider-status-unknown';
    await route.fulfill({ response, json: data });
  });
  await page.route('**/api/health', async route => {
    const response = await route.fetch(); const data = await response.json();
    data.assistant.cloudConfigured = configuredOpenAI ? true : null;
    await route.fulfill({ response, json: data });
  });
  await page.route('**/api/assistant/state*', async route => {
    const response = await route.fetch(); const data = await response.json();
    data.cloudProviders = Object.fromEntries(cloudIds.map(id => [id, configuredOpenAI && id === 'openai' ? true : null]));
    data.cloudConfigured = configuredOpenAI ? true : null;
    await route.fulfill({ response, json: data });
  });
  await page.route('**/api/platform/state', async route => {
    const response = await route.fetch(); const data = await response.json();
    for (const model of data.models) if (cloudIds.includes(model.id)) model.configured = configuredOpenAI && model.id === 'openai' ? true : null;
    await route.fulfill({ response, json: data });
  });
  await page.route('**/api/arena/catalogue', async route => {
    const response = await route.fetch(); const data = await response.json();
    for (const engine of data.engines) if (cloudIds.includes(engine.id)) engine.configured = configuredOpenAI && engine.id === 'openai' ? true : null;
    await route.fulfill({ response, json: data });
  });
  await page.route('**/api/arena/leaderboard', async route => {
    const response = await route.fetch(); const data = await response.json();
    for (const entry of data.entries) if (cloudIds.includes(entry.id)) entry.configured = configuredOpenAI && entry.id === 'openai' ? true : null;
    await route.fulfill({ response, json: data });
  });
}

test('unreadable provider settings stay unknown and cannot be selected across application surfaces', async ({ page }) => {
  test.setTimeout(180000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await preview(page);
  await simulateUnreadableSettings(page);

  await page.goto('/workspace.html#ai-command');
  await expect(page.locator('#aiRuntimeStatus')).toHaveText('PROVIDER STATUS UNKNOWN');
  await expect(page.locator('#aiConfiguredProviders')).toContainText('4 unknown');
  await expect(page.locator('#aiProviderHealth')).toContainText('configuration is unknown');
  await page.locator('#aiEngine').selectOption('cloud');
  await expect(page.locator('#aiRunBtn')).toBeDisabled();
  await expect(page.locator('#aiRunMessage')).toContainText('unknown');
  await page.locator('#aiEngine').selectOption('local');
  await expect(page.locator('#aiRunBtn')).toBeEnabled();

  await page.goto('/dashboard.html');
  await expect(page.locator('#prov')).toContainText('Status unknown');
  await page.locator('nav [data-v="run"]').click();
  await expect(page.locator('#prv option[value="gemini"]')).toHaveJSProperty('disabled', true);
  await page.locator('#dashboardEngine').selectOption('cloud');
  await expect(page.locator('#go')).toBeDisabled();

  await page.goto('/ai-hub.html');
  await expect(page.locator('#providerStatus')).toContainText('could not be read');
  await expect(page.locator('#providerList')).toContainText('Status unavailable');
  await page.goto('/guide.html');
  await expect(page.locator('#cloudState')).toHaveText('Unknown');

  await page.goto('/agent.html');
  await expect(page.locator('#providerStatus')).toContainText('unknown');
  await expect(page.locator('#modelA option[value="gemini"]')).toHaveJSProperty('disabled', true);
  await expect(page.locator('#providerList')).toContainText('unknown');
  await page.locator('#prompt').fill('calculate 6*7');
  await page.locator('#sendBtn').click();
  await expect(page.locator('#messages')).toContainText('42');

  await page.goto('/jarvis.html');
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await expect(page.locator('#cloudStatus')).toContainText('unknown');
  await page.locator('#mode').selectOption('cloud');
  await expect(page.locator('#provider option[value="gemini"]')).toHaveJSProperty('disabled', true);
  await page.locator('#prompt').fill('An open-ended question');
  await expect(page.locator('#sendBtn')).toBeDisabled();
  await page.locator('#mode').selectOption('local');
  await expect(page.locator('#sendBtn')).toBeEnabled();

  await page.goto('/jalalai.html');
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await expect(page.locator('#cloudStatus')).toContainText('unknown');
  await page.locator('#mode').selectOption('cloud');
  await expect(page.locator('#provider option[value="gemini"]')).toHaveJSProperty('disabled', true);
  await page.locator('#prompt').fill('An open-ended question');
  await expect(page.locator('#sendBtn')).toBeDisabled();
  await page.locator('#mode').selectOption('local');
  await expect(page.locator('#sendBtn')).toBeEnabled();

  await page.goto('/arena.html');
  await expect(page.locator('#engineGrid')).toContainText('Status unknown');
  await expect(page.locator('#engineGrid input[value="gemini"]')).toBeDisabled();
  await expect(page.locator('#leaderBody')).toContainText('status unknown');
  await expect(page.locator('#engineGrid input[value="local"]')).toBeEnabled();

  await page.goto('/agent-lab.html');
  await expect(page.locator('#runStatus')).toContainText('Ready');
  await page.locator('#engine').selectOption('cloud');
  await expect(page.locator('#provider option[value="gemini"]')).toHaveJSProperty('disabled', true);
  await expect(page.locator('#provider')).toBeDisabled();
  await expect(page.locator('#runBtn')).toBeDisabled();
  await page.locator('#engine').selectOption('local');
  await expect(page.locator('#runBtn')).toBeEnabled();
  expect(errors).toEqual([]);
});

test('malformed provider metadata fails closed instead of claiming that keys are absent', async ({ page }) => {
  test.setTimeout(90000);
  await preview(page);
  await page.route('**/api/ai/capabilities', route => route.fulfill({ json: { providers: [] } }));
  await page.goto('/workspace.html#ai-command');
  await expect(page.locator('#aiRuntimeStatus')).toHaveText('UNAVAILABLE');
  await expect(page.locator('#aiProviderHealth')).toContainText('Could not load');
  await expect(page.locator('#aiRunBtn')).toBeDisabled();
  await page.goto('/dashboard.html');
  await expect(page.locator('body')).toContainText('Provider configuration is unavailable');
  await expect(page.locator('#qgo')).toBeDisabled();
  await page.route('**/api/platform/state', route => route.fulfill({ json: { models: [] } }));
  await page.goto('/agent.html');
  await expect(page.locator('#gateMessage')).toContainText('Engine configuration is unavailable');
  await expect(page.locator('#authGate')).toBeVisible();
  await expect(page.locator('#conversationArea')).toBeHidden();
});

test('a known deployment key stays selectable while other provider states are unknown', async ({ page }) => {
  test.setTimeout(90000);
  await preview(page);
  await simulateUnreadableSettings(page, { configuredOpenAI: true });
  await page.goto('/workspace.html#ai-command');
  await expect(page.locator('#aiRuntimeStatus')).toContainText('PROVIDER KEY DETECTED');
  await expect(page.locator('#aiRuntimeStatus')).toContainText('SOME UNKNOWN');
  await expect(page.locator('#aiProviderSelect option[value="openai"]')).toHaveJSProperty('disabled', false);
  await expect(page.locator('#aiProviderSelect option[value="gemini"]')).toHaveJSProperty('disabled', true);
  await page.locator('#aiEngine').selectOption('cloud');
  await expect(page.locator('#aiRunBtn')).toBeEnabled();
  await page.goto('/jarvis.html');
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await expect(page.locator('#provider')).toHaveValue('openai');
  await expect(page.locator('#cloudStatus')).toContainText('key configured');
  await expect(page.locator('#provider option[value="gemini"]')).toHaveJSProperty('disabled', true);
});

test('the animated homepage glow never widens the page', async ({ page }) => {
  test.setTimeout(60000);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => localStorage.setItem('aj-site-theme-v2', 'glass'));
  await page.goto('/');
  for (const width of [320, 390, 768, 1280, 1440, 1600]) {
    await page.setViewportSize({ width, height: 900 });
    for (const time of [0, 1500, 3000, 4500, 6000]) {
      const metrics = await page.evaluate(async time => {
        const glow = document.querySelector('.orbit-glow');
        const animation = glow.getAnimations().find(item => item.animationName === 'orbitGlow');
        if (!animation) throw new Error('Expected the homepage glow animation');
        animation.pause(); animation.currentTime = time;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return { pageWidth: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth,
          frameOverflow: getComputedStyle(document.querySelector('.orbit-glow-frame')).overflow };
      }, time);
      expect(metrics.frameOverflow).toBe('hidden');
      expect(metrics.pageWidth, `width ${width}, animation ${time}ms`).toBeLessThanOrEqual(metrics.viewport + 1);
    }
  }
  await page.locator('.cp-top a').click({ trial: true });
});
