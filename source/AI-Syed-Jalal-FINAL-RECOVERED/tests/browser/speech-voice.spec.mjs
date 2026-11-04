import { test, expect } from '@playwright/test';

// Headless Chromium exposes no system voices, so install a deterministic fake
// speech engine and record what each read-aloud button actually speaks with.
const VOICES = [
  { name: 'Aisha', lang: 'ur-PK' },
  { name: 'Daniel', lang: 'en-GB' },
  { name: 'Samantha', lang: 'en-US' },
];

async function fakeSpeech(page) {
  await page.addInitScript(voices => {
    const listeners = {};
    window.__spoken = [];
    const synth = {
      getVoices: () => voices.map(v => ({ ...v, default: false, localService: true, voiceURI: v.name })),
      addEventListener: (type, handler) => { (listeners[type] ||= []).push(handler); },
      removeEventListener: () => {},
      cancel: () => {},
      speak: utterance => {
        window.__spoken.push({ text: utterance.text, voice: utterance.voice?.name || null, lang: utterance.lang });
        utterance.onend?.();
      },
      speaking: false, paused: false, pending: false,
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    // A real SpeechSynthesisUtterance rejects plain objects on .voice (Web IDL
    // type check), so the utterance must be part of the test double too.
    class FakeUtterance {
      constructor(text = '') { this.text = text; this.lang = ''; this.voice = null; this.onend = null; this.onerror = null; }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true });
  }, VOICES);
}

async function signInToPreview(page) {
  await page.goto('/jalalai.html');
  // The preview bootstrap is idempotent per browser context, so a shared e2e
  // database can already have this session signed in: only click when needed.
  await expect(page.locator('#connectionStatus')).not.toContainText('Checking', { timeout: 20000 });
  if (await page.locator('#demoBtn').isVisible()) {
    await page.locator('#demoBtn').click().catch(() => {});
  }
  await expect(page.locator('#connectionStatus')).toContainText('Connected', { timeout: 20000 });
}

test('one voice choice is honoured by JalalAi, the Workspace dock and the Agent console', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await fakeSpeech(page);
  await signInToPreview(page);

  // Choose a non-default voice in JalalAi.
  await expect(page.locator('#voice')).toContainText('Aisha');
  await page.locator('#voice').selectOption('Aisha|ur-PK');

  await page.locator('#prompt').fill('calculate 6*7');
  await page.locator('#sendBtn').click();
  await expect(page.locator('#chatlog')).toContainText('42');
  await page.locator('#readBtn').click();
  await expect.poll(() => page.evaluate(() => window.__spoken.at(-1)?.voice)).toBe('Aisha');
  expect(await page.evaluate(() => window.__spoken.at(-1).lang)).toBe('ur-PK');

  // Workspace dock: same remembered voice, no second selection needed.
  await page.goto('/workspace.html');
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#ajVoiceChoice')).toHaveValue('Aisha|ur-PK');
  await page.locator('#ajDockInput').fill('calculate 20*3');
  await page.locator('#ajDockSend').click();
  await expect(page.locator('#ajDockReply')).toContainText('60');
  await page.locator('#ajDockRead').click();
  await expect.poll(() => page.evaluate(() => window.__spoken.at(-1)?.voice)).toBe('Aisha');

  // The Agent console gains a working read-aloud that shares the same voice.
  await page.goto('/workspace.html#ai-command');
  await expect(page.locator('#app')).toBeVisible();
  await page.locator('#aiPrompt').fill('calculate 9*9');
  await page.locator('#aiRunBtn').click();
  await expect(page.locator('#aiOutput')).toContainText('81');
  await page.locator('#aiReadBtn').click();
  await expect.poll(() => page.evaluate(() => window.__spoken.at(-1)?.voice)).toBe('Aisha');
  expect(errors).toEqual([]);
});

test('Agent Studio honours the shared voice and the choice survives a reload', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await fakeSpeech(page);
  await signInToPreview(page);

  await page.goto('/agent.html');
  await expect(page.locator('#status')).toContainText('Ready');
  await page.locator('#toolsBtn').click();
  await expect(page.locator('#agentVoice')).toBeVisible();
  await page.locator('#agentVoice').selectOption('Daniel|en-GB');

  await page.locator('#prompt').fill('calculate 12*12');
  await page.locator('#sendBtn').click();
  await expect(page.locator('#messages')).toContainText('144');
  await page.locator('#readBtn').click();
  await expect.poll(() => page.evaluate(() => window.__spoken.at(-1)?.voice)).toBe('Daniel');
  expect(await page.evaluate(() => window.__spoken.at(-1).lang)).toBe('en-GB');

  // The preference is shared, so JalalAi shows it after a full navigation.
  await page.goto('/jalalai.html');
  await expect(page.locator('#voice')).toHaveValue('Daniel|en-GB');
  await page.reload();
  await expect(page.locator('#voice')).toHaveValue('Daniel|en-GB');
  expect(errors).toEqual([]);
});
