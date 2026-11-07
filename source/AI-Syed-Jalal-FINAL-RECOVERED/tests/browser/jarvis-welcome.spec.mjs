import { test, expect } from '@playwright/test';

const roman = 'Assalamualaikum kia haal hy apka Allah pak apko apni Aman main rakhay, ameen phir drood e pak prhiay.';
const durood = 'Allahumma salli ala Muhammadin wa ala aali Muhammad.';

async function mockWelcome(page, mode = 'normal') {
  await page.addInitScript(mode => {
    window.__audioPlays = [];
    window.__audioPauses = 0;
    window.__spoken = [];
    window.__gesture = false;
    window.__hidden = false;
    Object.defineProperty(document, 'hidden', { configurable:true, get:() => window.__hidden });
    document.addEventListener('click', event => { if (event.isTrusted) window.__gesture = true; }, true);
    class Recording {
      constructor(src) { this.src = src; window.__recording = this; }
      play() {
        window.__audioPlays.push(this.src);
        if (mode === 'blocked' && !window.__gesture) return Promise.reject(new DOMException('Tap required', 'NotAllowedError'));
        if (mode === 'broken') return Promise.reject(new DOMException('Unsupported media', 'NotSupportedError'));
        if (mode === 'pending' && !window.__gesture) return new Promise(resolve => { window.__resolveOldPlay = resolve; });
        this.onplaying?.();
        return Promise.resolve();
      }
      pause() { window.__audioPauses++; }
    }
    const synth = {
      getVoices:() => [{ name:'Daniel', lang:'en-GB' }], addEventListener:() => {}, removeEventListener:() => {}, cancel:() => {},
      speak:utterance => { window.__activeWelcomeUtterance = utterance; window.__spoken.push({ text:utterance.text, lang:utterance.lang, voice:utterance.voice?.name }); utterance.onstart?.(); }
    };
    class Utterance { constructor(text) { this.text = text; } }
    Object.defineProperty(window, 'Audio', { configurable:true, value:Recording });
    Object.defineProperty(window, 'speechSynthesis', { configurable:true, value:synth });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable:true, value:Utterance });
  }, mode);
}

test('the selected recorded Urdu greeting is attempted on opening, reload and direct entry', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await mockWelcome(page);
  await page.goto('/');
  await expect(page.locator('#aj-welcome-notice-status')).toContainText('speaking');
  expect(await page.evaluate(() => window.__audioPlays)).toEqual([expect.stringMatching(/\/assets\/jarvis-welcome-ur-pk\.mp3$/)]);
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  await page.reload();
  await expect(page.locator('#aj-welcome-notice-status')).toContainText('speaking');
  expect(await page.evaluate(() => window.__audioPlays)).toHaveLength(1);
  await page.goto('/notes.html');
  await expect(page.locator('#aj-welcome-notice-status')).toContainText('speaking');
  expect(await page.evaluate(() => window.__audioPlays)).toHaveLength(1);
  await expect(page.locator('#aj-welcome-notice summary')).toBeVisible();
  await page.locator('#aj-welcome-notice summary').click();
  await expect(page.locator('#aj-welcome-notice')).toContainText(roman);
  await expect(page.locator('#aj-welcome-notice')).toContainText(durood);
  expect(errors).toEqual([]);
});

test('internal navigation does not repeat a welcome already started; reload does', async ({ page }) => {
  await mockWelcome(page);
  await page.goto('/');
  await expect(page.locator('#aj-welcome-notice-status')).toContainText('speaking');
  await page.locator('nav[aria-label="Main navigation"] a[href="jarvis.html"]').click();
  await expect(page).toHaveURL(/jarvis\.html$/);
  expect(await page.evaluate(() => window.__audioPlays)).toHaveLength(0);
  await expect(page.locator('#aj-welcome-notice')).toBeHidden();
  await page.reload();
  await expect(page.locator('#aj-welcome-notice-status')).toContainText('speaking');
  expect(await page.evaluate(() => window.__audioPlays)).toHaveLength(1);
});

test('a blocked greeting remains available after moving to another page', async ({ page }) => {
  await mockWelcome(page, 'blocked');
  await page.goto('/');
  await expect(page.locator('#aj-welcome-notice-status')).toContainText('may require a tap');
  await page.locator('nav[aria-label="Main navigation"] a[href="jarvis.html"]').click();
  await expect(page).toHaveURL(/jarvis\.html$/);
  expect(await page.evaluate(() => window.__audioPlays)).toHaveLength(0);
  await expect(page.locator('#aj-welcome-notice-status')).toContainText('Tap Listen');
  await page.locator('#aj-welcome-notice-play').click();
  await expect(page.locator('#aj-welcome-notice-status')).toContainText('speaking');
  expect(await page.evaluate(() => window.__audioPlays)).toHaveLength(1);
});

test('returning to a hidden website attempts the welcome again without leaving audio in the background', async ({ page }) => {
  await mockWelcome(page);
  await page.goto('/jarvis.html');
  await expect(page.locator('#aj-welcome-notice-status')).toContainText('speaking');
  await page.evaluate(() => { window.__hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
  expect(await page.evaluate(() => window.__audioPauses)).toBe(1);
  await expect(page.locator('#aj-welcome-notice-status')).toContainText('paused');
  await page.evaluate(() => { window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('#aj-welcome-notice-status')).toContainText('speaking');
  expect(await page.evaluate(() => window.__audioPlays)).toHaveLength(2);
});

test('a broken recording falls back to browser speech without losing the wording', async ({ page }) => {
  await mockWelcome(page, 'broken');
  await page.goto('/');
  await expect(page.locator('#aj-welcome-notice-status')).toContainText('speaking');
  expect(await page.evaluate(() => window.__spoken)).toEqual([{ text:`${roman} ${durood}`, lang:'en-GB', voice:'Daniel' }]);
});

test('a late old play promise cannot replace a user-initiated retry', async ({ page }) => {
  await mockWelcome(page, 'pending');
  await page.goto('/');
  await expect(page.locator('#aj-welcome-notice-status')).toContainText('may require a tap', { timeout:6000 });
  expect(await page.evaluate(() => window.__audioPauses)).toBe(1);
  await page.locator('#aj-welcome-notice-play').click();
  await expect(page.locator('#aj-welcome-notice-status')).toContainText('speaking');
  await page.evaluate(() => window.__resolveOldPlay());
  await expect(page.locator('#aj-welcome-notice-status')).toContainText('speaking');
  expect(await page.evaluate(() => window.__audioPlays)).toHaveLength(2);
});

test('the real recording decodes and tap-to-play works after offline installation', async ({ page, context, request }) => {
  const audio = await request.get('/assets/jarvis-welcome-ur-pk.mp3');
  expect(audio.ok()).toBe(true);
  expect(audio.headers()['content-type']).toContain('audio/mpeg');
  await page.goto('/');
  const decoded = await page.evaluate(async () => {
    const response = await fetch('/assets/jarvis-welcome-ur-pk.mp3');
    const bytes = await response.arrayBuffer();
    const audioContext = new AudioContext();
    const buffer = await audioContext.decodeAudioData(bytes);
    const samples = buffer.getChannelData(0);
    let peak = 0;
    for (let index = 0; index < samples.length; index += 50) peak = Math.max(peak, Math.abs(samples[index]));
    const result = { duration:buffer.duration, peak };
    await audioContext.close();
    return result;
  });
  expect(decoded.duration).toBeGreaterThan(5);
  expect(decoded.duration).toBeLessThan(30);
  expect(decoded.peak).toBeGreaterThan(.01);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout:20000 }).toBe(true);
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.locator('#aj-welcome-notice')).toBeVisible();
    expect(await page.evaluate(async () => Boolean(await caches.match('./assets/jarvis-welcome-ur-pk.mp3')))).toBe(true);
    await page.locator('#aj-welcome-notice-play').click();
    await expect(page.locator('#aj-welcome-notice-status')).toContainText('speaking', { timeout:10000 });
    await page.locator('#aj-welcome-notice-stop').click();
    await expect(page.locator('#aj-welcome-notice-status')).toContainText('stopped');
  } finally { await context.setOffline(false); }
});

test('starting the JARVIS microphone stops the greeting first', async ({ page }) => {
  await mockWelcome(page);
  await page.addInitScript(() => {
    class Recognition { start() { window.__pausesAtMicStart = window.__audioPauses; this.onstart?.(); } abort() {} }
    Object.defineProperty(window, 'SpeechRecognition', { configurable:true, value:Recognition });
  });
  await page.goto('/jarvis.html');
  await expect(page.locator('#aj-welcome-notice-status')).toContainText('speaking');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected', { timeout:20000 });
  await page.locator('#talkBtn').click();
  expect(await page.evaluate(() => window.__pausesAtMicStart)).toBeGreaterThan(0);
  await expect(page.locator('#aj-welcome-notice')).toBeHidden();
  await expect(page.locator('#micIndicator')).toHaveText('Mic on');
  await page.locator('#stopBtn').click();
});

test('other existing assistant voice controls stop the welcome before listening or speaking', async ({ page }) => {
  await mockWelcome(page);
  await page.addInitScript(() => {
    class Recognition { start() { window.__pausesAtMicStart = window.__audioPauses; this.onstart?.(); } abort() {} }
    Object.defineProperty(window, 'SpeechRecognition', { configurable:true, value:Recognition });
  });
  await page.goto('/jalalai.html');
  await expect(page.locator('#aj-welcome-notice-status')).toContainText('speaking');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected', { timeout:20000 });
  await page.locator('#micBtn').click();
  expect(await page.evaluate(() => window.__pausesAtMicStart)).toBeGreaterThan(0);
  await expect(page.locator('#aj-welcome-notice')).toBeHidden();
  await page.goto('/guide.html');
  await expect(page.locator('#aj-welcome-notice-status')).toContainText('speaking');
  await page.locator('#voiceTestBtn').click();
  expect(await page.evaluate(() => window.__audioPauses)).toBeGreaterThan(0);
  await expect(page.locator('#aj-welcome-notice')).toBeHidden();
});

test('an external speech cancellation never starts the recording over another reply', async ({ page }) => {
  await mockWelcome(page);
  await page.addInitScript(() => localStorage.setItem('aj-speech-voice-v1', 'Daniel|en-GB'));
  await page.goto('/');
  await expect(page.locator('#aj-welcome-notice-status')).toContainText('speaking');
  await page.evaluate(() => {
    // Use a newly installed controllable voice to recreate the browser event.
    window.__activeWelcomeUtterance.onerror({ error:'interrupted' });
  });
  expect(await page.evaluate(() => window.__audioPlays)).toEqual([]);
  await expect(page.locator('#aj-welcome-notice')).toBeHidden();
});

test('opening an app link in a new tab counts as a new opening', async ({ page }) => {
  await mockWelcome(page);
  await page.goto('/');
  await expect(page.locator('#aj-welcome-notice-status')).toContainText('speaking');
  const opened = page.waitForEvent('popup');
  await page.evaluate(() => window.open('/notes.html', '_blank'));
  const popup = await opened;
  await popup.waitForLoadState('domcontentloaded');
  await expect(popup.locator('#aj-welcome-notice')).toBeVisible();
  await expect(popup.locator('#aj-welcome-notice-status')).toContainText(/Preparing|speaking|tap/);
  await popup.close();
});
