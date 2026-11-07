import { test, expect } from '@playwright/test';

const choices = ['glass', 'water', 'clay', 'ice', 'fire', 'rainbow'];
const phrase = 'Assalamualaikum kia haal hy apka Allah pak apko apni Aman main rakhay, ameen phir drood e pak prhiay.';
const durood = 'Allahumma salli ala Muhammadin wa ala aali Muhammad.';

async function installFakeSpeech(page, mode = 'normal') {
  await page.addInitScript(mode => {
    window.__spoken = [];
    window.__micCalls = 0;
    try { Object.defineProperty(navigator, 'mediaDevices', { configurable:true, value:{ getUserMedia:() => { window.__micCalls++; throw new Error('Unexpected microphone request'); } } }); } catch {}
    class Utterance { constructor(text) { this.text = text; this.lang = ''; this.voice = null; } }
    const voices = [{ name:'Aisha', lang:'ur-PK', voiceURI:'Aisha' }, { name:'Daniel', lang:'en-GB', voiceURI:'Daniel' }];
    const speech = {
      getVoices:() => voices,
      addEventListener:() => {}, removeEventListener:() => {},
      cancel:() => { window.__cancelled = (window.__cancelled || 0) + 1; },
      speak: utterance => {
        window.__spoken.push({ text:utterance.text, lang:utterance.lang, voice:utterance.voice?.name || null });
        window.__utterance = utterance;
        if (mode === 'blocked' && window.__spoken.length === 1) utterance.onerror?.({ error:'not-allowed' });
        else if (mode !== 'pending' || window.__spoken.length > 1) utterance.onstart?.();
      }
    };
    Object.defineProperty(window, 'speechSynthesis', { configurable:true, value:speech });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable:true, value:Utterance });
  }, mode);
}

test('JARVIS attempts the exact opening greeting and a short Durood with the shared voice', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await installFakeSpeech(page);
  await page.addInitScript(() => localStorage.setItem('aj-speech-voice-v1', 'Aisha|ur-PK'));
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => window.__spoken.length)).toBe(1);
  const spoken = await page.evaluate(() => window.__spoken[0]);
  expect(spoken.text).toBe(`${phrase} ${durood}`);
  expect(spoken.voice).toBe('Aisha');
  expect(spoken.lang).toBe('ur-PK');
  await expect(page.locator('.aj-welcome')).toContainText(phrase);
  await expect(page.locator('.aj-welcome')).toContainText(durood);
  await expect(page.locator('#aj-welcome-stop')).toBeVisible();
  await expect(page.locator('#aj-welcome-status')).toContainText('speaking');
  await page.locator('#aj-welcome-stop').click();
  await expect(page.locator('#aj-welcome-status')).toContainText('stopped');
  await page.locator('#aj-welcome-play').click();
  expect(await page.evaluate(() => window.__spoken.length)).toBe(2);
  await page.evaluate(() => window.__utterance.onend());
  await expect(page.locator('#aj-welcome-status')).toContainText('finished');
  expect(await page.evaluate(() => window.__micCalls)).toBe(0);
  expect(errors).toEqual([]);
});

test('blocked or pending autoplay offers an honest tap-to-listen retry', async ({ page }) => {
  await installFakeSpeech(page, 'blocked');
  await page.goto('/');
  await expect(page.locator('#aj-welcome-status')).toContainText('could not start');
  await page.locator('#aj-welcome-play').click();
  await expect(page.locator('#aj-welcome-status')).toContainText('speaking');
  expect(await page.evaluate(() => window.__spoken.length)).toBe(2);
});

test('silent autoplay does not claim success; unavailable speech keeps the text accessible', async ({ page, context }) => {
  await installFakeSpeech(page, 'pending');
  await page.goto('/');
  await expect(page.locator('#aj-welcome-status')).toContainText('may require a tap', { timeout:5000 });
  await page.locator('#aj-welcome-play').click();
  await expect(page.locator('#aj-welcome-status')).toContainText('speaking');
  const noSpeech = await context.newPage();
  await noSpeech.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', { configurable:true, value:undefined });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable:true, value:undefined });
  });
  await noSpeech.goto('/');
  await expect(noSpeech.locator('#aj-welcome-status')).toContainText('not available');
  await expect(noSpeech.locator('#aj-welcome-play')).toBeDisabled();
  await expect(noSpeech.locator('.aj-welcome')).toContainText(durood);
});

test('all six light choices persist across existing pages without changing other stored data', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.emulateMedia({ reducedMotion:'reduce' });
  await page.addInitScript(() => {
    localStorage.setItem('aj-site-theme-v1', 'clay');
    localStorage.setItem('aj-visual-theme', 'water');
    localStorage.setItem('sj-agent-theme', 'dark');
    localStorage.setItem('aj-v31-theme', 'dark');
    localStorage.setItem('data-preservation-sentinel', '{"record":"must stay"}');
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-aj-theme', 'clay');
  const backgrounds = new Set();
  for (const theme of choices) {
    const button = page.locator(`#homepage-theme-controls [data-theme-choice="${theme}"]`);
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-aj-theme', theme);
    backgrounds.add(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--aj-canvas').trim()));
    // Decorative motion is disabled for people who request reduced motion.
    expect(await page.locator('.command-preview').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  }
  expect(backgrounds.size).toBe(6);
  await page.goto('/jarvis.html');
  await expect(page.locator('html')).toHaveAttribute('data-aj-theme', 'rainbow');
  await page.locator('#aj-theme-trigger').click();
  await expect(page.locator('#aj-theme-menu')).toBeVisible();
  await page.locator('#aj-theme-menu [data-theme-choice="ice"]').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#aj-theme-menu')).toBeHidden();
  await expect(page.locator('#aj-theme-trigger')).toBeFocused();
  await page.goto('/agent.html');
  await expect(page.locator('html')).toHaveAttribute('data-aj-theme', 'ice');
  await page.locator('#themeBtn').click();
  await expect(page.locator('#aj-theme-menu')).toBeVisible();
  await page.locator('#aj-theme-menu [data-theme-choice="water"]').click();
  await page.goto('/workspace.html');
  await expect(page.locator('html')).toHaveAttribute('data-aj-theme', 'water');
  const storage = await page.evaluate(() => ({ old:localStorage.getItem('aj-site-theme-v1'), old2:localStorage.getItem('aj-visual-theme'), data:localStorage.getItem('data-preservation-sentinel') }));
  expect(storage).toEqual({ old:'clay', old2:'water', data:'{"record":"must stay"}' });
  expect(errors).toEqual([]);
});

test('phone layout, palette and greeting remain usable without horizontal overflow', async ({ page }) => {
  await installFakeSpeech(page, 'blocked');
  await page.setViewportSize({ width:390, height:844 });
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#aj-welcome-play').click();
  await expect(page.locator('#aj-welcome-status')).toContainText('speaking');
  await page.locator('#aj-theme-trigger').click();
  await page.locator('#aj-theme-menu [data-theme-choice="fire"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-aj-theme', 'fire');
  await page.goto('/jarvis.html');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-aj-theme', 'fire');
});

test('dashboard sends signed-out visitors to sign-in instead of a raw null-role error', async ({ page }) => {
  await page.goto('/dashboard.html');
  await expect(page).toHaveURL(/index\.html\?next=dashboard\.html/);
  await expect(page.locator('#login')).toHaveClass(/show/);
  await expect(page.locator('body')).not.toContainText("Cannot read properties of null");
});

test('installed shell retains the selected theme and crowned logo offline', async ({ page, context }) => {
  await installFakeSpeech(page, 'blocked');
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout:20000 }).toBe(true);
  await page.locator('#homepage-theme-controls [data-theme-choice="clay"]').click();
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-aj-theme', 'clay');
    await expect(page.locator('#homepage-theme-controls [data-theme-choice="clay"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.nav .brand img')).toHaveAttribute('src', 'assets/approved-sj-rainbow-crown.svg');
    expect(await page.locator('.nav .brand img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(page.locator('.aj-welcome')).toContainText(durood);
    await expect(page.locator('#aj-welcome-status')).toContainText('could not start');
    expect(await page.evaluate(async () => (await caches.keys()).includes('aj-v155-light-shell'))).toBe(true);
  } finally { await context.setOffline(false); }
});

test('light theme text and primary actions keep readable contrast', async ({ page }) => {
  await page.goto('/');
  for (const theme of choices) {
    const ratios = await page.evaluate(theme => {
      window.AJTheme.select(theme);
      const css = getComputedStyle(document.documentElement);
      const luminance = value => {
        const hex = value.trim().replace('#','');
        const rgb = hex.match(/../g).map(part => parseInt(part,16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
        return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
      };
      const contrast = (a,b) => { const values = [luminance(a),luminance(b)].sort((x,y) => y-x); return (values[0]+.05)/(values[1]+.05); };
      return { ink:contrast(css.getPropertyValue('--aj-ink'),css.getPropertyValue('--aj-solid')), action:contrast(css.getPropertyValue('--aj-accent'),'#ffffff') };
    }, theme);
    expect(ratios.ink, `${theme} text contrast`).toBeGreaterThanOrEqual(4.5);
    expect(ratios.action, `${theme} action contrast`).toBeGreaterThanOrEqual(4.5);
  }
});

test('maskable SJ artwork stays inside Android’s 80 percent safe circle', async ({ page, request }) => {
  const png = await (await request.get('/assets/app-icons/icon-maskable-512.png')).body();
  await page.setViewportSize({ width:512, height:512 });
  await page.setContent('<style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}body{display:grid;place-items:center;background:#102439}.tile{width:100%;height:100%;display:grid;place-items:center;background:radial-gradient(circle at 50% 25%,#263850,#102439 72%);border-radius:0}</style><div class="tile"></div>');
  const plainTile = await page.screenshot({ omitBackground:true });
  const outside = await page.evaluate(async ({ actual, expected }) => {
    const pixels = src => new Promise(resolve => {
      const image = new Image();
      image.onload = () => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512; const context = canvas.getContext('2d'); context.drawImage(image,0,0); resolve(context.getImageData(0,0,512,512).data); };
      image.src = `data:image/png;base64,${src}`;
    });
    const [a,b] = await Promise.all([pixels(actual), pixels(expected)]);
    let changed = 0;
    for (let y=0; y<512; y++) for (let x=0; x<512; x++) {
      if (Math.hypot(x-255.5,y-255.5) <= 204.8) continue;
      const i=(y*512+x)*4;
      if ([0,1,2,3].some(channel => Math.abs(a[i+channel]-b[i+channel]) > 5)) changed++;
    }
    return changed;
  }, { actual:png.toString('base64'), expected:plainTile.toString('base64') });
  expect(outside).toBe(0);
});
