import { test, expect } from '@playwright/test';

test('JalalAi offers the configured OmniRoute endpoint without automatically sending text', async ({ page }) => {
  const states = [], requests = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/assistant/state*', async route => {
    states.push(route.request().url());
    const response = await route.fetch(); const data = await response.json();
    // A future ID must not be selected when this HTML has no corresponding option.
    data.cloudProviders = { future: true, gemini: null, openai: null, anthropic: null, deepseek: null, omniroute: true };
    data.cloudConfigured = true;
    await route.fulfill({ response, json: data });
  });
  await page.route('**/api/assistant/chat', async route => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true, mode: 'cloud', provider: 'omniroute', output: 'A mocked endpoint answer' } });
  });
  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  expect(new URL(states[0]).searchParams.get('includeOmniRoute')).toBe('1');
  await expect(page.locator('#mode')).toHaveValue('local');
  await expect(page.locator('#provider')).toHaveValue('omniroute');
  await expect(page.locator('#cloudStatus')).toContainText('server key and endpoint configured');
  await expect(page.locator('#cloudStatus')).toContainText('may forward');
  await expect(page.locator('#cloudStatus')).toContainText('successful live request');
  expect(requests).toEqual([]);
  await page.locator('#mode').selectOption('cloud');
  await page.locator('#prompt').fill('Suggest a garden name');
  await page.locator('#sendBtn').click();
  await expect(page.locator('#chatlog')).toContainText('A mocked endpoint answer');
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ message: 'Suggest a garden name', mode: 'cloud', provider: 'omniroute' });
  expect(errors).toEqual([]);
});
