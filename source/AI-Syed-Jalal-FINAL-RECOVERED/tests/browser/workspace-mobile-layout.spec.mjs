import { test, expect } from '@playwright/test';

// The real database is never used: Playwright starts the disposable local
// PGlite preview and creates a fresh preview account for each test.
test.use({ isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

async function openWorkspace(page, { dismissWelcome = true } = {}) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem('aj-site-theme-v2', 'clay');
    localStorage.setItem('aj-speech-voice-v1', 'chosen-voice-sentinel');
    localStorage.setItem('workspace-mobile-sentinel', 'preserve');
  });
  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await page.goto('/workspace.html#home');
  await expect(page.locator('#app')).toBeVisible();
  await page.evaluate(() => window.workspaceReady);
  const welcome = page.locator('#aj-welcome-notice');
  if (dismissWelcome && await welcome.isVisible()) await page.locator('#aj-welcome-notice-close').click();
}

function assistantCard(page) {
  return page.locator('#view-home .card').filter({ has: page.getByRole('heading', { name: 'JalalAi · Local Assistant' }) });
}

test('local assistant actions fit and never overlap on phone, tablet and desktop-sized viewports', async ({ page }) => {
  await openWorkspace(page);
  const card = assistantCard(page);
  const links = card.locator('a.btn');
  await expect(links).toHaveCount(4);
  for (const width of [320, 375, 390, 768, 980, 1040, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await card.evaluate(el => {
      const card = el.getBoundingClientRect();
      return {
        card: { left:card.left, right:card.right, top:card.top, bottom:card.bottom },
        links: [...el.querySelectorAll('a.btn')].map(link => {
          const box = link.getBoundingClientRect();
          return { text:link.textContent.trim(), left:box.left, right:box.right, top:box.top, bottom:box.bottom, width:box.width, height:box.height };
        }),
        pageWidth:document.documentElement.scrollWidth,
        viewportWidth:window.innerWidth,
      };
    });
    expect(layout.pageWidth, `page overflow at ${width}px`).toBeLessThanOrEqual(layout.viewportWidth + 1);
    for (const item of layout.links) {
      expect(item.height, `${item.text} touch height at ${width}px`).toBeGreaterThanOrEqual(44);
      expect(item.left, `${item.text} clipped on left at ${width}px`).toBeGreaterThanOrEqual(layout.card.left - 1);
      expect(item.right, `${item.text} clipped on right at ${width}px`).toBeLessThanOrEqual(layout.card.right + 1);
      expect(item.bottom, `${item.text} clipped at bottom at ${width}px`).toBeLessThanOrEqual(layout.card.bottom + 1);
    }
    for (let a = 0; a < layout.links.length; a++) for (let b = a + 1; b < layout.links.length; b++) {
      const x = layout.links[a], y = layout.links[b];
      const overlaps = x.left < y.right - 1 && x.right > y.left + 1 && x.top < y.bottom - 1 && x.bottom > y.top + 1;
      expect(overlaps, `${x.text} overlaps ${y.text} at ${width}px`).toBe(false);
    }
  }
  await expect(page.locator('html')).toHaveAttribute('data-aj-theme', 'clay');
  expect(await page.evaluate(() => ({ voice:localStorage.getItem('aj-speech-voice-v1'), data:localStorage.getItem('workspace-mobile-sentinel') })))
    .toEqual({ voice:'chosen-voice-sentinel', data:'preserve' });
});

test('phone navigation stays readable in all six existing themes', async ({ page }) => {
  await openWorkspace(page);
  for (const theme of ['glass', 'water', 'clay', 'ice', 'fire', 'rainbow']) {
    await page.evaluate(name => window.AJTheme.select(name), theme);
    const contrast = await page.locator('#mobileNav [data-nav="home"]').evaluate(button => {
      const style = getComputedStyle(button);
      const luminance = value => {
        const components = value.match(/[\d.]+/g).slice(0, 3).map(Number).map(x => x / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
        return .2126 * components[0] + .7152 * components[1] + .0722 * components[2];
      };
      const values = [luminance(style.color), luminance(style.backgroundColor)].sort((a,b) => b-a);
      return (values[0] + .05) / (values[1] + .05);
    });
    expect(contrast, `${theme} selected navigation contrast`).toBeGreaterThanOrEqual(4.5);
  }
  expect(await page.evaluate(() => localStorage.getItem('aj-speech-voice-v1'))).toBe('chosen-voice-sentinel');
});

test('welcome, themes and chat stay usable together on phones and small tablets', async ({ page }) => {
  // Simulate the common phone behavior where autoplay needs an explicit tap.
  await page.addInitScript(() => {
    class BlockedAudio {
      play() { return Promise.reject(new DOMException('Tap required', 'NotAllowedError')); }
      pause() {}
    }
    Object.defineProperty(window, 'Audio', { configurable:true, value:BlockedAudio });
  });
  await openWorkspace(page, { dismissWelcome:false });
  const welcome = page.locator('#aj-welcome-notice');
  const toggle = page.locator('#ajDockToggle');
  const theme = page.locator('#aj-theme-trigger');
  await expect(welcome).toBeVisible();
  const overlaps = (a,b) => a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y;
  for (const width of [320,375,390,650,651,760,780]) {
    await page.setViewportSize({ width, height:width <= 390 ? 568 : 844 });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const [welcomeBox, toggleBox, themeBox] = await Promise.all([welcome.boundingBox(), toggle.boundingBox(), theme.boundingBox()]);
    expect(welcomeBox && toggleBox && themeBox, `all controls visible at ${width}px`).toBeTruthy();
    expect(overlaps(welcomeBox, toggleBox), `welcome covers chat at ${width}px`).toBe(false);
    expect(overlaps(welcomeBox, themeBox), `welcome covers themes at ${width}px`).toBe(false);
    expect(overlaps(themeBox, toggleBox), `themes cover chat at ${width}px`).toBe(false);
  }
  await page.setViewportSize({ width:320, height:568 });
  await page.locator('#aj-welcome-notice summary').click();
  await expect(welcome).toContainText('Assalamualaikum');
  await page.locator('#aj-welcome-notice summary').click();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  // Opening chat uses the existing assistant interrupt; it does not change the
  // selected recording or theme, and frees the small screen for the chat.
  await expect(welcome).toBeHidden();
  await expect(page.locator('#ajDockInput')).toBeVisible();
  await theme.click();
  await expect(page.locator('#aj-theme-menu')).toBeVisible();
  await page.locator('#aj-theme-menu [data-theme-choice="ice"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-aj-theme', 'ice');
  await page.keyboard.press('Escape');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => localStorage.getItem('aj-speech-voice-v1'))).toBe('chosen-voice-sentinel');
});

test('phone users can open the compact chat, use local tools, navigate and sign out', async ({ page }) => {
  await openWorkspace(page);
  const toggle = page.locator('#ajDockToggle');
  await expect(toggle).toHaveAttribute('aria-controls', 'ajDockBody');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#ajDockInput')).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#ajDockInput').fill('calculate 20*3');
  await page.locator('#ajDockSend').click();
  await expect(page.locator('#ajDockReply')).toContainText('60');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.locator('#mobileNav [data-nav="data"]').click();
  await expect(page.locator('#view-data')).toHaveClass(/active/);
  await page.locator('#mobileNav [data-nav="home"]').click();
  await expect(page.locator('#view-home')).toHaveClass(/active/);
  await expect(page.locator('#logoutBtn')).toBeVisible();
  await page.locator('#logoutBtn').click();
  await expect(page.locator('#login')).toBeVisible();
});

test('each local assistant action opens its intended page on a phone', async ({ page }) => {
  await openWorkspace(page);
  const actions = [
    ['Open JARVIS voice console', /\/jarvis(?:\.html)?$/],
    ['Open Agent Studio', /\/agent(?:\.html)?$/],
    ['JalalAi', /\/jalalai(?:\.html)?$/],
    ['Start here / Help', /\/guide(?:\.html)?$/],
  ];
  for (const [label, destination] of actions) {
    const link = assistantCard(page).getByRole('link', { name: label, exact: false });
    await link.click();
    await expect(page).toHaveURL(destination);
    await page.goBack();
    await expect(page.locator('#view-home')).toHaveClass(/active/);
    const welcome = page.locator('#aj-welcome-notice');
    if (await welcome.isVisible()) await page.locator('#aj-welcome-notice-close').click();
  }
});
