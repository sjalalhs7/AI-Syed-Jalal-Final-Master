import { test, expect } from '@playwright/test';

const pageErrors = page => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  return errors;
};

test('hub filters categories, explains unavailable generation, and stages an editable skill for local execution', async ({ page }) => {
  const errors = pageErrors(page);
  await page.goto('/');
  await page.getByRole('link', { name: 'Explore AI Hub →' }).click();
  await expect(page).toHaveURL(/ai-hub\.html/);
  await expect(page.locator('#skillStatus')).toContainText('190 curated in total');
  await expect(page.locator('#skillFact')).toHaveText('190');
  await expect(page.locator('#domainFact')).toHaveText('35');
  await expect(page.locator('#experienceGrid article')).toHaveCount(11);
  await expect(page.locator('#providerStatus')).toContainText('Sign in');

  await page.getByRole('button', { name: 'Images', exact: true }).click();
  const image = page.locator('[data-experience="image"]');
  await expect(page.locator('#experienceGrid article')).toHaveCount(1);
  await expect(image).toContainText('Image generation not connected');
  await image.locator('summary').click();
  await expect(image).toContainText('An edited photo download');
  await expect(image.getByRole('link', { name: /Open photo editor/ })).toHaveAttribute('href', 'media-studio.html#photo');
  await expect(image.getByRole('button', { name: /Prepare an image brief/ })).toBeVisible();
  await page.getByRole('button', { name: 'Music', exact: true }).click();
  await expect(page.locator('#experienceGrid')).toContainText('Music generation not connected');
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.locator('#experienceSearch').fill('json');
  await expect(page.locator('#experienceGrid article')).toHaveCount(1);
  await expect(page.locator('#experienceGrid')).toContainText('Code & development');
  await page.locator('#experienceSearch').fill('not a category');
  await expect(page.locator('#experienceGrid')).toContainText('No categories match');

  await page.locator('#skillDomain').selectOption('Cybersecurity');
  await expect(page.locator('#skillStatus')).toContainText('matching skill prompts');
  await expect(page.locator('#skillGrid .hub-skill')).toHaveCount(6);
  await page.locator('#skillSearch').fill('threat');
  await expect(page.locator('#skillGrid .hub-skill')).toHaveCount(1);
  await expect(page.locator('#skillGrid')).toContainText('Threat Modeling');
  await page.locator('#skillGrid .hub-skill button').click();
  await expect(page.locator('#promptDialog')).toBeVisible();
  await expect(page.locator('#promptDraft')).toHaveValue(/Threat Modeling/);
  const prompt = 'plan: Test this specific hub draft';
  await page.locator('#promptDraft').fill(prompt);
  await page.locator('#openDraft').click();
  await expect(page).toHaveURL(/agent\.html\?draft=1/);
  await expect(page.locator('#gateSignIn')).toHaveAttribute('href', 'index.html?next=agent-draft');
  await page.getByRole('button', { name: 'Try the local preview' }).click();
  await expect(page.locator('#status')).toContainText('Ready · signed in', { timeout: 30000 });
  await expect(page.locator('#prompt')).toHaveValue(prompt);
  await expect(page.locator('#messages .message')).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('aj-hub-draft-v1'))).toBeNull();
  await page.locator('#sendBtn').click();
  await expect(page.locator('#messages')).toContainText('This is a structured planning template');
  expect(errors).toEqual([]);
});

test('all 190 curated prompts can be browsed, and the draft survives normal account sign-in', async ({ page }) => {
  const errors = pageErrors(page);
  await page.goto('/ai-hub.html');
  await expect(page.locator('#skillStatus')).toContainText('190 curated in total');
  while (await page.locator('#loadMore').isVisible()) await page.locator('#loadMore').click();
  await expect(page.locator('#skillGrid .hub-skill')).toHaveCount(190);
  await expect(page.locator('#skillStatus')).toContainText('Showing 190 of 190');
  await page.locator('#skillGrid .hub-skill').last().getByRole('button').click();
  const draft = await page.locator('#promptDraft').inputValue();
  await page.locator('#openDraft').click();
  await page.locator('#gateSignIn').click();
  await expect(page).toHaveURL(/index\.html\?next=agent-draft/);
  await expect(page.locator('#login')).toHaveClass(/show/);
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.locator('#u').fill(`hub${Date.now()}`);
  await page.locator('#p').fill('TestPassword123!');
  await page.locator('#confirm-p').fill('TestPassword123!');
  await page.locator('#go').click();
  await expect(page).toHaveURL(/agent\.html\?draft=1/);
  await expect(page.locator('#prompt')).toHaveValue(draft);
  await expect(page.locator('#messages .message')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('provider configuration uses actual response states and never equates a key with a live response', async ({ page }) => {
  const errors = pageErrors(page);
  await page.route('**/api/me', route => route.fulfill({ json: { authenticated: true, user: { username: 'test' } } }));
  let malformed = false;
  await page.route('**/api/ai/capabilities', route => route.fulfill({ json: { providers: malformed ? [{ id: 'gemini', configured: 'yes' }] : [
    { id: 'gemini', configured: true }, { id: 'openai', configured: false }, { id: 'anthropic', configured: false }, { id: 'deepseek', configured: false }, { id: 'omniroute', configured: false }
  ] } }));
  await page.goto('/ai-hub.html');
  await expect(page.locator('#providerStatus')).toContainText('does not prove a live');
  await expect(page.locator('#providerList')).toContainText('Key configured · not live-verified');
  await expect(page.locator('#providerList')).toContainText('Not configured');
  malformed = true;
  await page.locator('#providerRetry').click();
  await expect(page.locator('#providerStatus')).toContainText('Some provider statuses could not be read');
  await expect(page.locator('#providerList')).not.toContainText('Key configured');
  await expect(page.locator('#providerList')).not.toContainText('Not configured');
  await expect(page.locator('#providerList')).toContainText('Status unavailable');
  expect(errors).toEqual([]);
});

test('unavailable skill index and provider API have clear retryable failure states', async ({ page }) => {
  const errors = pageErrors(page);
  let failIndex = true;
  await page.route('**/config/agent-skill-index.json', route => failIndex ? route.fulfill({ status: 503, body: 'offline' }) : route.continue());
  await page.route('**/api/me', route => route.fulfill({ json: { authenticated: true } }));
  await page.route('**/api/ai/capabilities', route => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
  await page.goto('/ai-hub.html');
  await expect(page.locator('#skillStatus')).toContainText('could not be loaded');
  await expect(page.locator('#skillFact')).toHaveText('Unavailable');
  await expect(page.locator('#providerStatus')).toContainText('could not be checked');
  await expect(page.locator('#providerList')).not.toContainText('Not configured');
  failIndex = false;
  await page.locator('#retrySkills').click();
  await expect(page.locator('#skillStatus')).toContainText('190 curated in total');
  expect(errors).toEqual([]);
});

test('static preview and blocked draft storage never pretend a prompt transferred', async ({ page }) => {
  const errors = pageErrors(page);
  await page.goto('/ai-hub.html?static=1');
  await expect(page.locator('#providerStatus')).toContainText('Static preview');
  await page.getByRole('button', { name: 'Prepare Everyday assistant prompt' }).click();
  await expect(page.locator('#openDraft')).toBeHidden();
  await expect(page.locator('#secureStudio')).toBeVisible();
  await expect(page.locator('#draftStatus')).toContainText('copy the prompt');
  await page.locator('#closePrompt').click();
  await page.addInitScript(() => Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('Storage denied'); } }));
  await page.goto('/ai-hub.html');
  await page.getByRole('button', { name: 'Prepare Planning assistant prompt' }).click();
  await page.locator('#openDraft').click();
  await expect(page.locator('#draftStatus')).toContainText('browser blocked draft storage');
  await expect(page.locator('#promptDialog')).toBeVisible();
  await expect(page).toHaveURL(/ai-hub\.html/);
  expect(errors).toEqual([]);
});

test('hub stays responsive and its key text remains readable in all six themes', async ({ page }) => {
  const errors = pageErrors(page);
  for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 1024, height: 900 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/ai-hub.html');
    await expect(page.locator('#skillStatus')).toContainText('190 curated in total');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const theme of ['glass', 'water', 'clay', 'ice', 'fire', 'rainbow']) {
      const ratios = await page.evaluate(theme => {
        window.AJTheme.select(theme);
        const css = getComputedStyle(document.documentElement);
        const lum = value => {
          const rgb = value.trim().replace('#', '').match(/../g).map(x => parseInt(x, 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
          return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
        };
        const contrast = (a, b) => { const v = [lum(a), lum(b)].sort((x, y) => y - x); return (v[0] + .05) / (v[1] + .05); };
        return [contrast(css.getPropertyValue('--aj-ink'), css.getPropertyValue('--aj-solid')), contrast(css.getPropertyValue('--aj-accent'), '#ffffff')];
      }, theme);
      expect(ratios[0], `${theme} text`).toBeGreaterThanOrEqual(4.5);
      expect(ratios[1], `${theme} button`).toBeGreaterThanOrEqual(4.5);
    }
  }
  expect(errors).toEqual([]);
});

test('installed shell can browse the public hub offline without caching provider API responses', async ({ page, context }) => {
  const errors = pageErrors(page);
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 20000 }).toBe(true);
  expect(await page.evaluate(async () => (await caches.keys()).includes('aj-v171-voice-providers'))).toBe(true);
  await context.setOffline(true);
  try {
    await page.goto('/ai-hub');
    await expect(page.locator('#skillStatus')).toContainText('190 curated in total');
    await expect(page.locator('#providerStatus')).toContainText('could not be checked');
    const cachedApi = await page.evaluate(async () => (await caches.match('/api/ai/capabilities')) !== undefined);
    expect(cachedApi).toBe(false);
  } finally { await context.setOffline(false); }
  expect(errors).toEqual([]);
});
