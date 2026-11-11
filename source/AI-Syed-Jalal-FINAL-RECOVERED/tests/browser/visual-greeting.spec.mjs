import { test, expect } from '@playwright/test';

const choices = ['glass', 'water', 'clay', 'ice', 'fire', 'rainbow'];
const phrase = 'Assalamualaikum kia haal hy apka Allah pak apko apni Aman main rakhay, ameen phir drood e pak prhiay.';
const durood = 'Allahumma salli ala Muhammadin wa ala aali Muhammad.';

async function installFakeSpeech(page, mode = 'normal') {
  await page.addInitScript(mode => {
    window.__spoken = [];
    window.__audioPlays = [];
    window.__micCalls = 0;
    window.__hasGesture = false;
    document.addEventListener('click', event => { if (event.isTrusted) window.__hasGesture = true; }, true);
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
        if (mode === 'blocked' && !window.__hasGesture) utterance.onerror?.({ error:'not-allowed' });
        else if (mode !== 'pending' || window.__hasGesture) utterance.onstart?.();
      }
    };
    class AudioDouble {
      constructor(src) { this.src = src; window.__lastAudio = this; }
      play() {
        window.__audioPlays.push(this.src);
        if (mode === 'blocked' && !window.__hasGesture) return Promise.reject(new DOMException('User gesture required', 'NotAllowedError'));
        if (mode === 'pending' && !window.__hasGesture) return new Promise(() => {});
        this.onplaying?.();
        return Promise.resolve();
      }
      pause() { window.__audioPauses = (window.__audioPauses || 0) + 1; }
    }
    Object.defineProperty(window, 'Audio', { configurable:true, value:AudioDouble });
    Object.defineProperty(window, 'speechSynthesis', { configurable:true, value:speech });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable:true, value:Utterance });
  }, mode);
}

test('the selected greeting recording wins over a saved female browser voice', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await installFakeSpeech(page);
  await page.addInitScript(() => localStorage.setItem('aj-speech-voice-v1', 'Aisha|ur-PK'));
  await page.goto('/');
  await expect(page.locator('#aj-welcome-status')).toContainText('speaking');
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(await page.evaluate(() => window.__audioPlays)).toEqual([expect.stringMatching(/jarvis-welcome-ur-pk\.mp3\?v=157$/)]);
  expect(await page.evaluate(() => localStorage.getItem('aj-speech-voice-v1'))).toBe('Aisha|ur-PK');
  await expect(page.locator('.aj-welcome')).toContainText(phrase);
  await expect(page.locator('.aj-welcome')).toContainText(durood);
  await expect(page.locator('#aj-welcome-stop')).toBeVisible();
  await page.locator('#aj-welcome-stop').click();
  await expect(page.locator('#aj-welcome-status')).toContainText('stopped');
  expect(await page.evaluate(() => window.__audioPauses)).toBe(1);
  await page.locator('#aj-welcome-play').click();
  expect(await page.evaluate(() => window.__audioPlays.length)).toBe(2);
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  await page.evaluate(() => window.__lastAudio.onended());
  await expect(page.locator('#aj-welcome-status')).toContainText('finished');
  expect(await page.evaluate(() => window.__micCalls)).toBe(0);
  expect(errors).toEqual([]);
});

test('blocked autoplay shows a visible tap-to-listen retry', async ({ page }) => {
  await installFakeSpeech(page, 'blocked');
  await page.goto('/');
  await expect(page.locator('#aj-welcome-notice')).toBeVisible();
  await expect(page.locator('#aj-welcome-status')).toContainText('may require a tap');
  await page.locator('#aj-welcome-notice-play').click();
  await expect(page.locator('#aj-welcome-status')).toContainText('speaking');
  expect(await page.evaluate(() => window.__audioPlays.length)).toBe(2);
  expect(await page.evaluate(() => window.__micCalls)).toBe(0);
});

test('silent autoplay does not claim success; unavailable audio keeps the text accessible', async ({ page, context }) => {
  await installFakeSpeech(page, 'pending');
  await page.goto('/');
  await expect(page.locator('#aj-welcome-status')).toContainText('may require a tap', { timeout:6000 });
  await page.locator('#aj-welcome-play').click();
  await expect(page.locator('#aj-welcome-status')).toContainText('speaking');
  const noSpeech = await context.newPage();
  await noSpeech.addInitScript(() => {
    Object.defineProperty(window, 'Audio', { configurable:true, value:undefined });
    Object.defineProperty(window, 'speechSynthesis', { configurable:true, value:undefined });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable:true, value:undefined });
  });
  await noSpeech.goto('/');
  await expect(noSpeech.locator('#aj-welcome-status')).toContainText('not available');
  await expect(noSpeech.locator('#aj-welcome-play')).toBeDisabled();
  await expect(noSpeech.locator('.aj-welcome')).toContainText(durood);
  await noSpeech.close();
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
    await expect(page.locator('#aj-welcome-status')).toContainText('may require a tap');
    expect(await page.evaluate(async () => (await caches.keys()).includes('aj-v172-voice-providers'))).toBe(true);
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

test('updating the service worker replaces the old greeting cache but keeps unrelated caches', async ({ page }) => {
  await installFakeSpeech(page);
  // Model a previous installation with both the old greeting and other app data.
  // The v157 URLs must not use stale v156 content or a saved browser voice.
  await page.goto('/assets/visual-theme.js');
  await page.evaluate(async () => {
    localStorage.setItem('aj-speech-voice-v1', 'Aisha|ur-PK');
    const other = await caches.open('other-app-test-cache');
    await other.put('/other-app-data', new Response('preserve this'));
    const old = await caches.open('aj-v156-jarvis-welcome');
    await old.put('/assets/jarvis-welcome.js?v=156', new Response('window.__staleWelcomeRan = true;'));
    const previous = await caches.open('aj-v157-selected-voice');
    await previous.put('/assets/guide.js', new Response('window.__staleGuideRan = true;'));
    const priorApp = await caches.open('aj-v165-agent-evidence');
    await priorApp.put('/assets/jarvis.js?v=165', new Response('window.__staleJarvisRan = true;'));
    const priorVoice = await caches.open('aj-v169-voice-conversation');
    await priorVoice.put('/assets/jarvis.js?v=169', new Response('window.__staleJarvisRan = true;'));
    const priorProviders = await caches.open('aj-v170-voice-providers');
    await priorProviders.put('/assets/jalalai.js?v=170', new Response('window.__staleJalalAiRan = true;'));
    const priorArena = await caches.open('aj-v171-voice-providers');
    await priorArena.put('/assets/arena.js?v=171', new Response('window.__staleArenaRan = true;'));
  });
  await page.goto('/');
  await expect(page.locator('#aj-welcome-status')).toContainText('speaking');
  expect(await page.evaluate(() => window.__staleWelcomeRan)).toBeUndefined();
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(await page.evaluate(() => window.__audioPlays)).toEqual([expect.stringMatching(/jarvis-welcome-ur-pk\.mp3\?v=157$/)]);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout:20000 }).toBe(true);
  const names = await page.evaluate(() => caches.keys());
  expect(names).toContain('other-app-test-cache');
  expect(names).not.toContain('aj-v156-jarvis-welcome');
  expect(names).not.toContain('aj-v157-selected-voice');
  expect(names).not.toContain('aj-v165-agent-evidence');
  expect(names).not.toContain('aj-v169-voice-conversation');
  expect(names).not.toContain('aj-v170-voice-providers');
  expect(names).not.toContain('aj-v171-voice-providers');
  expect(names).toContain('aj-v172-voice-providers');
  expect(await page.evaluate(async () => Boolean(await caches.match('/assets/jarvis.js?v=170')))).toBe(true);
  expect(await page.evaluate(async () => Boolean(await caches.match('/assets/jalalai.js?v=171')))).toBe(true);
  expect(await page.evaluate(async () => Boolean(await caches.match('/assets/arena.js?v=172')))).toBe(true);
  expect(await page.evaluate(async () => (await (await caches.open('other-app-test-cache')).match('/other-app-data')).text())).toBe('preserve this');
  expect(await page.evaluate(() => localStorage.getItem('aj-speech-voice-v1'))).toBe('Aisha|ur-PK');
});

test('greeting and theme controls remain readable without horizontal overflow', async ({ page }) => {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.locator('.aj-welcome .aj-durood')).toContainText(durood);
    const metrics = await page.evaluate(() => ({
      greeting: parseFloat(getComputedStyle(document.querySelector('.aj-welcome-copy > p')).fontSize),
      durood: parseFloat(getComputedStyle(document.querySelector('.aj-durood')).fontSize),
      status: parseFloat(getComputedStyle(document.querySelector('#aj-welcome-status')).fontSize),
      buttonHeight: document.querySelector('#aj-welcome-play').getBoundingClientRect().height,
      descriptions: [...document.querySelectorAll('#homepage-theme-controls .aj-choice-copy small')].map(el => parseFloat(getComputedStyle(el).fontSize)),
      choicesFit: [...document.querySelectorAll('#homepage-theme-controls .aj-theme-choice')].every(el => el.scrollWidth <= el.clientWidth + 1),
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth
    }));
    expect(metrics.greeting).toBeGreaterThanOrEqual(12);
    expect(metrics.durood).toBeGreaterThanOrEqual(12);
    expect(metrics.status).toBeGreaterThanOrEqual(12);
    expect(metrics.buttonHeight).toBeGreaterThanOrEqual(40);
    expect(metrics.descriptions).toHaveLength(6);
    expect(metrics.descriptions.every(size => size >= 11)).toBe(true);
    expect(metrics.choicesFit).toBe(true);
    expect(metrics.pageWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  }
});

test('homepage content keeps a readable gutter and the dashboard link is unobscured', async ({ page }) => {
  // Three full navigations and service-worker installs can be slow on small CI runners.
  test.setTimeout(120000);
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    for (const selector of ['#agents', '#platform', '#security']) {
      const box = await page.locator(selector).boundingBox();
      expect(box.x, `${selector} left gutter at ${viewport.width}px`).toBeGreaterThanOrEqual(12);
      expect(viewport.width - (box.x + box.width), `${selector} right gutter at ${viewport.width}px`).toBeGreaterThanOrEqual(12);
    }
    const link = page.locator('.cp-top a');
    const badge = page.locator('.aj-scene-badge.top');
    const [a, b] = await Promise.all([link.boundingBox(), badge.boundingBox()]);
    const overlaps = a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    expect(overlaps, `decorative badge overlaps the dashboard link at ${viewport.width}px`).toBe(false);
    await link.click({ trial: true });
  }
});

test('homepage header controls fit and remain legible at responsive breakpoints', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/');
  for (const width of [320, 390, 760, 761, 1100, 1200, 1201, 1280, 1320, 1321]) {
    await page.setViewportSize({ width, height:900 });
    // Measure the new responsive layout, not the previous viewport's pending paint.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const metrics = await page.evaluate(() => {
      const button = document.querySelector('#start');
      const range = document.createRange();
      range.selectNodeContents(button);
      const bounds = [...document.querySelectorAll('.nav > .btn')].map(el => {
        const r = el.getBoundingClientRect();
        return { left:r.left, right:r.right };
      });
      const tagline = document.querySelector('.nav .brand small');
      return { lines:range.getClientRects().length, bounds,
        pageWidth:document.documentElement.scrollWidth, viewportWidth:document.documentElement.clientWidth,
        taglineVisible:getComputedStyle(tagline).display !== 'none', taglineSize:parseFloat(getComputedStyle(tagline).fontSize) };
    });
    expect(metrics.lines, `Sign in should not wrap at ${width}px`).toBe(1);
    expect(metrics.bounds.every(({left,right}) => left >= 0 && right <= width)).toBe(true);
    expect(metrics.pageWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
    if (metrics.taglineVisible) expect(metrics.taglineSize).toBeGreaterThanOrEqual(11);
  }
  await expect(page.locator('.cp-heading h2')).toHaveText('Command Center');
});
