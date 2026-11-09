import { test, expect } from '@playwright/test';

// These browser journeys use controllable speech doubles because CI has no
// physical microphone or speakers. Requests, UI, database and confirmations
// are real unless a test explicitly stubs a cloud response.
async function controlledSpeech(page) {
  await page.addInitScript(() => {
    window.__recognitions = [];
    window.__spoken = [];
    window.__aborts = 0;
    window.__speechMode = 'normal';
    window.__deferStart = false;
    const synth = {
      getVoices: () => [{ name: 'Test voice', lang: 'en-US', default: true, localService: true, voiceURI: 'test' }, { name: 'Urdu voice', lang: 'ur-PK', localService: true, voiceURI: 'urdu' }],
      addEventListener() {}, removeEventListener() {}, cancel() {},
      speak(u) {
        window.__spoken.push({ text: u.text, lang: u.lang, micActive: window.__recognitions.some(r => r.active) });
        if (window.__speechMode === 'error') { setTimeout(() => u.onerror?.({ error: 'synthesis-failed' }), 0); return; }
        if (window.__speechMode === 'never') return;
        u.onstart?.();
        if (window.__speechMode !== 'hold') setTimeout(() => u.onend?.(), 20);
        else window.__heldUtterance = u;
      }
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: class { constructor(text) { this.text = text; } }, configurable: true });
    class Recognition {
      constructor() { this.active = false; }
      start() {
        window.__recognitions.push(this);
        window.__lateResult = this.onresult;
        if (!window.__deferStart) { this.active = true; this.onstart?.(); }
      }
      emit(text, final = true) {
        const result = [{ transcript: text }]; result.isFinal = final;
        this.onresult?.({ results: [result] });
      }
      abort() { this.active = false; window.__aborts++; this.onend?.(); }
    }
    Object.defineProperty(window, 'SpeechRecognition', { value: Recognition, configurable: true });
    Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true });
  });
}

async function openConsole(page) {
  await page.goto('/jarvis.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected', { timeout: 20000 });
}
async function emit(page, text, final = true) {
  await page.evaluate(({ text, final }) => window.__recognitions.at(-1).emit(text, final), { text, final });
}

test('one-shot voice preserves typed text, lets the user review, and speaks a real calculator result', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await controlledSpeech(page); await openConsole(page);
  let chats = 0; page.on('request', request => { if (request.url().includes('/api/assistant/chat')) chats++; });
  await page.locator('#prompt').fill('calculate');
  await page.locator('#talkBtn').click();
  await expect(page.locator('#micIndicator')).toHaveText('Mic on');
  await expect(page.locator('#prompt')).toHaveAttribute('readonly', '');
  await emit(page, 'six times', false);
  await expect(page.locator('#prompt')).toHaveValue('calculate six times');
  await expect(page.locator('#sendBtn')).toBeDisabled();
  await emit(page, 'six times seven');
  await expect(page.locator('#micIndicator')).toHaveText('Mic off');
  await expect(page.locator('#prompt')).toHaveValue('calculate six times seven');
  expect(chats).toBe(0);
  await page.locator('#sendBtn').click();
  await expect(page.locator('#lastTrace')).toContainText('= 42');
  await expect.poll(() => page.evaluate(() => window.__spoken.at(-1)?.text)).toContain('42');
  expect(await page.evaluate(() => window.__spoken.at(-1).micActive)).toBe(false);
  await expect(page.locator('#status')).toContainText('Finished');
  expect(errors).toEqual([]);
});

test('opt-in conversation alternates microphone and speech, and stops for an explicit save', async ({ page }) => {
  await controlledSpeech(page); await openConsole(page);
  await page.locator('#conversationMode').check();
  expect(await page.evaluate(() => window.__recognitions.length)).toBe(0); // checkbox alone never opens the mic
  await page.locator('#talkBtn').click();
  await emit(page, 'calculate six times seven');
  await expect(page.locator('#lastTrace')).toContainText('= 42');
  await expect.poll(() => page.evaluate(() => window.__recognitions.length)).toBe(2);
  await expect(page.locator('#micIndicator')).toHaveText('Mic on');
  expect(await page.evaluate(() => window.__spoken.every(item => !item.micActive))).toBe(true);
  await emit(page, 'add task: Verify the voice flow');
  await expect(page.getByRole('button', { name: 'Confirm & save' })).toBeVisible();
  await expect(page.locator('#micIndicator')).toHaveText('Mic off');
  const before = await page.evaluate(async () => (await (await fetch('/api/assistant/tasks')).json()).tasks);
  expect(before).toHaveLength(0);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__recognitions.length)).toBe(2);
  await page.getByRole('button', { name: 'Confirm & save' }).click();
  await expect(page.locator('#chatlog')).toContainText('Saved task: Verify the voice flow');
  const after = await page.evaluate(async () => (await (await fetch('/api/assistant/tasks')).json()).tasks);
  expect(after.map(task => task.title)).toContain('Verify the voice flow');
  await page.locator('#handsFree').uncheck();
  await page.locator('#mode').selectOption('local');
  await page.locator('#prompt').fill('show my tasks'); await page.locator('#sendBtn').click();
  await expect(page.locator('.message.assistant').last()).toContainText('Verify the voice flow');
  await page.locator('#prompt').fill('save note: A private voice idea'); await page.locator('#sendBtn').click();
  await page.getByRole('button', { name: 'Confirm & save' }).click();
  await expect(page.locator('#status')).toContainText('Saved after your confirmation');
  const reads = [];
  page.on('request', request => { if (request.method() === 'GET' && request.url().includes('/api/assistant/')) reads.push(request.url()); });
  await page.locator('#prompt').fill('show my notes'); await page.locator('#sendBtn').click();
  await expect(page.locator('.message.assistant').last()).toContainText('A private voice idea');
  expect(reads.some(url => url.includes('/assistant/notes'))).toBe(true);
  expect(reads.some(url => url.includes('/assistant/state'))).toBe(false);
});

test('stop works while permission is pending and ignores a late final transcript', async ({ page }) => {
  await controlledSpeech(page); await openConsole(page);
  let chats = 0; page.on('request', request => { if (request.url().includes('/api/assistant/chat')) chats++; });
  await page.locator('#autoRun').check();
  await page.evaluate(() => { window.__deferStart = true; });
  await page.locator('#talkBtn').click();
  await expect(page.locator('#micIndicator')).toHaveText('Mic starting');
  await expect(page.locator('#stopBtn')).toBeEnabled();
  await page.locator('#stopBtn').click();
  await page.evaluate(() => {
    const result = [{ transcript: 'add task: should never run' }]; result.isFinal = true;
    window.__lateResult?.({ results: [result] });
  });
  await expect(page.locator('#micIndicator')).toHaveText('Mic off');
  await expect(page.locator('#status')).toContainText('Stopped');
  expect(chats).toBe(0);
  expect(await page.evaluate(() => window.__aborts)).toBeGreaterThan(0);
});

test('stop discards a late server response without claiming the server was cancelled', async ({ page }) => {
  await controlledSpeech(page); await openConsole(page);
  await page.route('**/api/assistant/chat', async route => {
    await new Promise(resolve => setTimeout(resolve, 900));
    await route.fulfill({ json: { ok: true, mode: 'local', output: 'A late answer' } }).catch(() => {});
  });
  await page.locator('#prompt').fill('a request that is still running'); await page.locator('#sendBtn').click();
  await expect(page.locator('#status')).toContainText('Working');
  await page.locator('#stopBtn').click();
  await expect(page.locator('#status')).toContainText('server may still finish');
  await expect(page.locator('#prompt')).toHaveValue('a request that is still running');
  await page.waitForTimeout(1200);
  await expect(page.locator('#chatlog')).not.toContainText('A late answer');
  expect(await page.evaluate(() => window.__spoken.length)).toBe(0);
});

test('a hidden tab and a speech failure stop the opt-in conversation', async ({ page }) => {
  await controlledSpeech(page); await openConsole(page);
  await page.locator('#conversationMode').check(); await page.locator('#talkBtn').click();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#micIndicator')).toHaveText('Mic off');
  await expect(page.locator('#status')).toContainText('tab was hidden');
  await page.evaluate(() => { delete document.hidden; window.__speechMode = 'error'; });
  await page.locator('#talkBtn').click(); await emit(page, 'calculate six times seven');
  await expect(page.locator('#lastTrace')).toContainText('42');
  await expect(page.locator('#status')).toContainText('could not speak');
  await expect(page.locator('#status')).toContainText('Conversation stopped');
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__recognitions.length)).toBe(2);
  await expect(page.locator('#micIndicator')).toHaveText('Mic off');
});

test('cloud provider selection and opt-in context are scoped to the selected provider', async ({ page }) => {
  await controlledSpeech(page);
  const payloads = [];
  await page.route('**/api/assistant/state*', async route => {
    const response = await route.fetch(); const data = await response.json();
    data.cloudConfigured = true;
    data.cloudProviders = { gemini: false, openai: true, anthropic: false, deepseek: false };
    await route.fulfill({ response, json: data });
  });
  await page.route('**/api/assistant/chat', async route => {
    const payload = route.request().postDataJSON(); payloads.push(payload);
    await route.fulfill({ json: { ok: true, mode: 'cloud', provider: payload.provider, output: `Answer ${payloads.length}` } });
  });
  await openConsole(page);
  await page.locator('#handsFree').uncheck();
  await page.locator('#mode').selectOption('cloud');
  await expect(page.locator('#provider')).toHaveValue('openai');
  await expect(page.locator('#cloudStatus')).toContainText('key configured');
  await page.locator('#rememberContext').check();
  for (const [index, prompt] of ['My project is a cafe', 'Suggest a name'].entries()) {
    await page.locator('#prompt').fill(prompt); await page.locator('#sendBtn').click();
    await expect(page.locator('.message.assistant').last()).toContainText(`Answer ${index + 1}`);
  }
  expect(payloads[0].provider).toBe('openai');
  expect(payloads[0].history).toEqual([]);
  expect(payloads[1].history).toEqual([{ role: 'user', content: 'My project is a cafe' }, { role: 'assistant', content: 'Answer 1' }]);
  await page.locator('#provider').selectOption('gemini');
  await expect(page.locator('#cloudStatus')).toContainText('No server key');
  await page.locator('#prompt').fill('A new request'); await page.locator('#sendBtn').click();
  await expect.poll(() => payloads.length).toBe(3);
  expect(payloads[2].history).toEqual([]);
  await page.locator('#rememberContext').uncheck();
  await page.locator('#prompt').fill('Without context'); await page.locator('#sendBtn').click();
  await expect.poll(() => payloads.length).toBe(4);
  expect(payloads[3].history).toBeUndefined();
  await expect(page.locator('.message.assistant').last()).toContainText('Answer 4');
  await page.locator('#rememberContext').check();
  await page.locator('#prompt').fill('Remember this'); await page.locator('#sendBtn').click();
  await expect(page.locator('.message.assistant').last()).toContainText('Answer 5');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.locator('#prompt').fill('After leaving'); await page.locator('#sendBtn').click();
  await expect.poll(() => payloads.length).toBe(6);
  expect(payloads[5].history).toEqual([]);
});

test('fixed app navigation, branded mobile navigation, and sign-in return work', async ({ page }) => {
  await controlledSpeech(page);
  await page.setViewportSize({ width: 390, height: 844 });
  // A first-run panel makes the sign-in dialog taller than a phone viewport.
  await page.route('**/api/bootstrap/status', route => route.fulfill({ json: { available: true, users: 0, admins: 0, completed: false } }));
  await page.goto('/index.html');
  await expect(page.locator('.acts a[href="jarvis.html"]')).toBeVisible();
  await page.goto('/index.html?next=jarvis.html');
  await expect(page.locator('#login')).toHaveClass(/show/);
  await page.locator('#previewAccessBtn').click();
  await expect(page).toHaveURL(/jarvis\.html$/);
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await expect(page.locator('.brand img')).toHaveAttribute('src', 'assets/approved-sj-rainbow-crown.svg');
  await expect(page.locator('.topbar nav a[href="guide.html"]')).toBeVisible();
  const action = await page.locator('#talkBtn').boundingBox();
  expect(action.y + action.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('#prompt').fill('open https://example.invalid'); await page.locator('#sendBtn').click();
  await expect(page.locator('#chatlog')).toContainText('no model output was invented');
  await expect(page).toHaveURL(/jarvis\.html$/);
  await page.locator('#prompt').fill('open notes'); await page.locator('#sendBtn').click();
  await expect(page).toHaveURL(/notes\.html$/);
});

test('untrusted sign-in return URLs never become navigation targets', async ({ page }) => {
  for (const target of ['javascript:alert(1)', '//example.invalid/steal', 'https://example.invalid']) {
    await page.goto('/index.html?next=' + encodeURIComponent(target));
    await expect(page.locator('#login')).not.toHaveClass(/show/);
    await page.getByRole('button', { name: 'Account sign in' }).click();
    await page.locator('#previewAccessBtn').click();
    await expect(page).toHaveURL(/dashboard\.html$/);
  }
});

test('the device voice test keeps a real browser error visible', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => [], cancel() {},
      speak(utterance) { utterance.onerror?.({ error: 'audio-busy' }); }
    } });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: class {
      constructor(text) { this.text = text; }
    } });
  });
  await page.goto('/guide.html');
  await page.locator('#voiceTestBtn').click();
  await expect(page.locator('#voiceTestResult')).toContainText('audio-busy');
  // The timeout must not overwrite a more precise, already-reported error.
  await page.waitForTimeout(2200);
  await expect(page.locator('#voiceTestResult')).toContainText('audio-busy');
});

test('the prominent conversation control sends and speaks multiple Urdu cloud turns only after a click', async ({ page }) => {
  await controlledSpeech(page);
  const payloads = [];
  await page.route('**/api/assistant/state*', async route => {
    const response = await route.fetch(); const data = await response.json();
    data.cloudConfigured = true;
    data.cloudProviders = { gemini: true, openai: false, anthropic: false, deepseek: false };
    await route.fulfill({ response, json: data });
  });
  await page.route('**/api/assistant/chat', async route => {
    payloads.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true, mode: 'cloud', provider: 'gemini', output: payloads.length === 1 ? 'وعلیکم السلام، میں آپ کی کیسے مدد کر سکتا ہوں؟' : 'جی، میں سن رہا ہوں۔' } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await openConsole(page);
  const button = page.locator('#conversationBtn');
  const box = await button.boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => window.__recognitions.length)).toBe(0);
  await expect(page.locator('#engineHelp')).toContainText('limited tools');
  await page.locator('#mode').selectOption('cloud');
  await page.locator('#speechLanguage').selectOption('ur-PK');
  await page.locator('#voice').selectOption('Urdu voice|ur-PK');
  await page.locator('#rememberContext').check();
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__recognitions.at(-1).lang)).toBe('ur-PK');
  await emit(page, 'آپ کیسے ہیں؟');
  await expect.poll(() => payloads.length).toBe(1);
  expect(payloads[0]).toMatchObject({ mode: 'cloud', provider: 'gemini', language: 'ur-PK', message: 'آپ کیسے ہیں؟', history: [] });
  await expect.poll(() => page.evaluate(() => window.__spoken.at(-1)?.text)).toContain('وعلیکم السلام');
  expect(await page.evaluate(() => window.__spoken.at(-1))).toMatchObject({ lang: 'ur-PK', micActive: false });
  await expect.poll(() => page.evaluate(() => window.__recognitions.length)).toBe(2);
  await emit(page, 'اب کیا کریں؟');
  await expect.poll(() => payloads.length).toBe(2);
  expect(payloads[1].history).toEqual([{ role: 'user', content: 'آپ کیسے ہیں؟' }, { role: 'assistant', content: 'وعلیکم السلام، میں آپ کی کیسے مدد کر سکتا ہوں؟' }]);
  await expect.poll(() => page.evaluate(() => window.__recognitions.length)).toBe(3);
  await button.click();
  await expect(page.locator('#micIndicator')).toHaveText('Mic off');
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => window.__recognitions.some(r => r.active))).toBe(false);
});

test('custom language codes are validated and a mismatched saved voice is not replaced', async ({ page }) => {
  await controlledSpeech(page); await openConsole(page);
  await page.locator('#voice').selectOption('Test voice|en-US');
  await page.locator('#speechLanguage').selectOption('ur-PK');
  await expect(page.locator('#voiceLanguageHint')).toContainText('Recognition requests ur-PK');
  await expect(page.locator('#voiceLanguageHint')).toContainText('saved voice speaks en-US');
  await page.locator('#speechLanguage').selectOption('custom');
  await page.locator('#customLanguage').fill('bad tag!');
  await page.locator('#conversationBtn').click();
  await expect(page.locator('#status')).toContainText('valid speech language');
  await expect(page.locator('#customLanguage')).toHaveAttribute('aria-invalid', 'true');
  expect(await page.evaluate(() => window.__recognitions.length)).toBe(0);
  await page.locator('#customLanguage').fill('fr-CA');
  await expect(page.locator('#customLanguage')).toHaveAttribute('aria-invalid', 'false');
  await page.locator('#conversationBtn').click();
  expect(await page.evaluate(() => window.__recognitions.at(-1).lang)).toBe('fr-CA');
  await emit(page, 'calculate six times seven');
  await expect.poll(() => page.evaluate(() => window.__spoken.at(-1)?.text)).toContain('42');
  expect(await page.evaluate(() => window.__spoken.at(-1).lang)).toBe('en-US');
  expect(await page.evaluate(() => localStorage.getItem('aj-speech-voice-v1'))).toBe('Test voice|en-US');
  await page.locator('#stopBtn').click();
});
