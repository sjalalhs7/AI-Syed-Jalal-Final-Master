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

test('JalalAi reports database, HTTP and network startup failures without misleading sign-in guidance', async ({ page }) => {
  let failure = 'missing';
  await page.route('**/api/me', route => {
    if (failure === 'network') return route.abort('failed');
    if (failure === 'state') return route.fulfill({ json: { authenticated: true, csrfToken: 'fixture-token', user: { username: 'test', role: 'Viewer' } } });
    return route.fulfill(failure === 'missing'
      ? { status: 503, json: { code: 'DATABASE_NOT_CONFIGURED', error: 'Neon DATABASE_URL is not configured' } }
      : { status: 500, json: { code: 'INTERNAL_ERROR', error: 'Session lookup failed' } });
  });
  await page.route('**/api/assistant/state*', route => route.fulfill({ status: 503, json: { error: 'Assistant metadata unavailable' } }));
  await page.goto('/jalalai.html');
  await expect(page.locator('#connectionStatus')).toHaveText('Database not configured');
  await expect(page.locator('#loginMessage')).toContainText('database is not configured');
  await expect(page.locator('#loginMessage')).toContainText('no password was checked');
  await expect(page.locator('#loginMessage')).not.toContainText('server could not be reached');
  await expect(page.locator('#status')).toContainText('DATABASE_URL is not configured');
  await expect(page.locator('#demoBtn')).toBeHidden();
  await expect(page.locator('#quickStart')).toBeHidden();
  await expect(page.locator('#sendBtn')).toBeDisabled();
  await expect(page.locator('#micBtn')).toBeDisabled();

  failure = 'server'; await page.reload();
  await expect(page.locator('#connectionStatus')).toHaveText('Assistant unavailable');
  await expect(page.locator('#loginMessage')).toContainText('application responded');
  await expect(page.locator('#status')).toHaveText('Session lookup failed');
  failure = 'state'; await page.reload();
  await expect(page.locator('#connectionStatus')).toHaveText('Assistant unavailable');
  await expect(page.locator('#loginMessage')).toContainText('assistant could not start');
  await expect(page.locator('#status')).toHaveText('Assistant metadata unavailable');
  await expect(page.locator('#sendBtn')).toBeDisabled();
  failure = 'network'; await page.reload();
  await expect(page.locator('#connectionStatus')).toHaveText('Connection unavailable');
  await expect(page.locator('#loginMessage')).toContainText('server could not be reached');
  await expect(page.locator('#micBtn')).toBeDisabled();
});
