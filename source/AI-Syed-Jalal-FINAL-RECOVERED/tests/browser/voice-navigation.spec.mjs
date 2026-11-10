import { test, expect } from '@playwright/test';

async function receivesPointer(locator) {
  return locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit === element || element.contains(hit);
  });
}

test('the homepage keeps the essentials visible and the other tools reachable in Explore', async ({ page }) => {
  await page.goto('/');
  const notice = page.locator('#aj-welcome-notice');
  if (await notice.isVisible()) await page.locator('#aj-welcome-notice-close').click();
  await expect(page.locator('.acts a[href="jarvis.html"]')).toBeVisible();
  await expect(page.locator('.acts a[href="ai-hub.html"]')).toBeVisible();
  await expect(page.locator('.acts a')).toHaveCount(2);
  const menu = page.locator('.nav-more');
  const summary = menu.locator('summary');
  await expect(menu.locator('a[href="notes.html"]')).toBeHidden();
  await summary.focus(); await page.keyboard.press('Enter');
  await expect(menu.locator('a[href="notes.html"]')).toBeVisible();
  await expect(menu.locator('a[href="agent.html"]')).toBeVisible();
  await expect(menu.locator('a[href="visual-styles.html"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).not.toHaveAttribute('open', '');
  await expect(summary).toBeFocused();
  for (const width of [320, 390, 760, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await expect(page.locator('.acts a[href="jarvis.html"]')).toBeVisible();
  }
});

test('the compact JARVIS navigation, welcome and voice actions remain usable on a phone', async ({ page }) => {
  await page.addInitScript(() => {
    class BlockedAudio {
      play() { return Promise.reject(new DOMException('Tap required', 'NotAllowedError')); }
      pause() {}
    }
    Object.defineProperty(window, 'Audio', { value: BlockedAudio, configurable: true });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/jarvis.html');
  await expect(page.locator('#aj-welcome-notice')).toBeVisible();
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected', { timeout: 20000 });
  await expect(page.locator('#voiceSettings')).not.toHaveAttribute('open', '');
  await expect(page.locator('#traceDetails')).not.toHaveAttribute('open', '');
  const welcome = await page.locator('#aj-welcome-notice').boundingBox();
  const action = await page.locator('#conversationBtn').boundingBox();
  expect(action.y + action.height).toBeLessThanOrEqual(844);
  expect(welcome.y + welcome.height).toBeLessThan(action.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#aj-welcome-notice-close').click();
  const menu = page.locator('#moreNavigation');
  const summary = menu.locator('summary');
  await summary.focus(); await page.keyboard.press('Enter');
  await expect(menu.locator('a[href="notes.html"]')).toBeVisible();
  await expect(menu.locator('a[href="workspace.html"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).not.toHaveAttribute('open', '');
  await expect(summary).toBeFocused();
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('#conversationBtn')).toBeVisible();
});

test('crowded assistant pages group secondary navigation without losing destinations', async ({ page }) => {
  test.setTimeout(120000);
  for (const name of ['jalalai', 'agent-lab', 'arena', 'critic', 'allinone', 'toolbench', 'pagebuilder', 'guide']) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/' + name + '.html');
    const notice = page.locator('#aj-welcome-notice');
    if (await notice.isVisible()) await page.locator('#aj-welcome-notice-close').click();
    const nav = page.locator('.topbar nav.aj-compact-nav');
    await expect(nav).toBeVisible();
    expect(await nav.locator(':scope > a').count(), name).toBe(2);
    await expect(nav.locator('.aj-compact-menu')).not.toHaveAttribute('open', '');
    const originalTargets = await nav.locator('a').evaluateAll(links => links.map(link => link.getAttribute('href')));
    expect(originalTargets.length, name).toBeGreaterThan(4);
    await nav.locator('summary').click();
    await expect(nav.locator('.aj-compact-links a').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(nav.locator('summary')).toBeFocused();
    for (const width of [320, 761, 900, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} ${width}`).toBe(true);
      await expect(nav.locator('summary')).toBeVisible();
      await nav.locator('summary').click();
      const menuBounds = await nav.locator('.aj-compact-links').boundingBox();
      expect(menuBounds.x, `${name} ${width}`).toBeGreaterThanOrEqual(0);
      expect(menuBounds.x + menuBounds.width, `${name} ${width}`).toBeLessThanOrEqual(width + 1);
      const firstLink = nav.locator('.aj-compact-links a').first();
      await expect(firstLink).toBeVisible();
      expect(await receivesPointer(firstLink), `${name} ${width}: menu link must not be clipped or obscured`).toBe(true);
      await nav.locator('summary').click();
    }
  }
});

test('home and JARVIS menus expose clickable links at phone, tablet and desktop sizes', async ({ page }) => {
  test.setTimeout(120000);
  for (const [path, selector] of [['/', '.nav-more'], ['/jarvis.html', '#moreNavigation']]) {
    for (const width of [320, 761, 1100, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      if (await page.locator('#aj-welcome-notice').isVisible()) await page.locator('#aj-welcome-notice-close').click();
      const menu = page.locator(selector);
      await menu.locator('summary').click();
      const link = menu.locator('a[href="notes.html"]');
      await expect(link).toBeVisible();
      expect(await receivesPointer(link), `${path} ${width}: menu link must not be clipped or obscured`).toBe(true);
      await link.click();
      await expect(page).toHaveURL(/\/notes\.html/);
    }
  }
});

test('original navigation still works on small screens when JavaScript is disabled', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false, viewport: { width: 320, height: 740 } });
  const page = await context.newPage();
  try {
    for (const name of ['jalalai', 'guide']) {
      await page.goto('/' + name + '.html');
      const nav = page.locator('.topbar nav[aria-label="Main navigation"]');
      await expect(nav.locator('a[href="workspace.html"]')).toBeVisible();
      await nav.locator('a[href="workspace.html"]').click();
      await expect(page).toHaveURL(/workspace\.html/);
    }
  } finally { await context.close(); }
});

test('the installed guide retains its compact navigation offline', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 20000 }).toBe(true);
  await context.setOffline(true);
  try {
    await page.goto('/guide.html');
    const menu = page.locator('.aj-compact-menu');
    await expect(menu).toBeVisible();
    await menu.locator('summary').click();
    await expect(menu.locator('a[href="notes.html"]')).toBeVisible();
  } finally { await context.setOffline(false); }
});
