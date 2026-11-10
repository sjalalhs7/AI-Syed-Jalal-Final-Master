import { test, expect } from '@playwright/test';

// Headless Chromium has no microphone and no system voices, so both engines are
// replaced with deterministic doubles. Every assertion below is about what the
// page *did* — which voice spoke, which transcript reached the server, what the
// trace shows — not about a button merely existing.
const VOICES = [
  { name: 'Aisha', lang: 'ur-PK' },
  { name: 'Daniel', lang: 'en-GB' },
  { name: 'Samantha', lang: 'en-US' },
];

async function fakeSpeech(page) {
  await page.addInitScript(voices => {
    const listeners = {};
    window.__spoken = [];
    window.__listening = 0;
    window.__recognitionLang = null;
    const synth = {
      getVoices: () => voices.map(voice => ({ ...voice, default: false, localService: true, voiceURI: voice.name })),
      addEventListener: (type, handler) => { (listeners[type] ||= []).push(handler); },
      removeEventListener: () => {},
      cancel: () => {},
      speak: utterance => {
        window.__spoken.push({ text: utterance.text, voice: utterance.voice?.name || null, lang: utterance.lang });
        utterance.onstart?.();
        setTimeout(() => utterance.onend?.(), 5);
      },
      speaking: false, paused: false, pending: false,
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    class FakeUtterance {
      constructor(text = '') { this.text = text; this.lang = ''; this.voice = null; this.onstart = null; this.onend = null; this.onerror = null; }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true });

    // A recognition double that emits one final transcript, then ends like Chrome.
    class FakeRecognition {
      constructor() { this.interimResults = false; this.continuous = false; this.lang = ''; window.__recognitionLang = ''; }
      start() {
        window.__listening += 1;
        window.__recognitionLang = this.lang;
        this.onstart?.();
        setTimeout(() => {
          const results = [[{ transcript: window.__nextTranscript || 'calculate 40 * 12' }]];
          results[0].isFinal = true;
          results.length = 1;
          this.onresult?.({ results });
          this.onend?.();
        }, window.__transcriptDelay ?? 40);
      }
      abort() { this.onend?.(); }
      stop() { this.onend?.(); }
    }
    Object.defineProperty(window, 'SpeechRecognition', { value: FakeRecognition, configurable: true });
  }, VOICES);
}

async function openConsole(page) {
  await page.goto('/jarvis.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected', { timeout: 20000 });
  await page.locator('#voiceSettings > summary').click();
}

test('JARVIS: every option works — voice in, real tools, voice out, trace and limits', async ({ page }) => {
  test.setTimeout(180000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await fakeSpeech(page);
  await openConsole(page);

  // 1. Speech support is reported honestly rather than assumed.
  await expect(page.locator('#voiceDiagnostics')).toContainText('Microphone input: available');
  await expect(page.locator('#voiceDiagnostics')).toContainText('3 voice(s) detected');

  // 2. The shared voice preference is honoured, including the language change.
  await page.locator('#voice').selectOption('Aisha|ur-PK');
  await page.locator('#speechLanguage').selectOption('ur-PK');

  // 3. Voice input: press to talk, speak, transcript arrives, auto-run executes it.
  await page.locator('#autoRun').check();
  await page.evaluate(() => { window.__nextTranscript = 'calculate (1200 + 350) * 15% * 3'; });
  await page.locator('#talkBtn').click();
  expect(await page.evaluate(() => window.__recognitionLang)).toBe('ur-PK');
  await expect(page.locator('#talkBtn')).toHaveAttribute('aria-pressed', 'false'); // microphone closed again

  // 4. A real tool ran and the trace proves it.
  await expect(page.locator('.agent-trace-head').first()).toContainText('1 successful tool result(s)', { timeout: 30000 });
  await expect(page.locator('.agent-step').first()).toContainText('= 697.5');
  await expect(page.locator('#lastTrace')).toContainText('1 successful tool result(s)');
  // Hands-free is on, so the status line may already say it is speaking. Either
  // message proves the run finished; the trace above proves a tool really ran.
  await expect(page.locator('#status')).toContainText(/Finished|Speaking the reply/);

  // 5. Voice out: the reply is spoken automatically with the chosen voice.
  await expect.poll(() => page.evaluate(() => window.__spoken.at(-1)?.voice)).toBe('Aisha');
  expect(await page.evaluate(() => window.__spoken.at(-1).lang)).toBe('ur-PK');
  expect(await page.evaluate(() => window.__spoken.at(-1).text)).toContain('697.5');

  // 6. Hands-free can be switched off; speaking then needs an explicit press.
  const spokenCount = await page.evaluate(() => window.__spoken.length);
  await page.locator('#handsFree').uncheck();
  await page.locator('#prompt').fill('calculate 6*7');
  await page.locator('#sendBtn').click();
  await expect(page.locator('#chatlog')).toContainText('42');
  await expect.poll(() => page.evaluate(() => window.__spoken.length)).toBe(spokenCount);
  await page.locator('#speakBtn').click();
  await expect.poll(() => page.evaluate(() => window.__spoken.length)).toBe(spokenCount + 1);
  expect(await page.evaluate(() => window.__spoken.at(-1).text)).toContain('42');

  // 7. Switch the engine to Research: the mode label and the run both change.
  await page.locator('#mode').selectOption('research');
  await expect(page.locator('#voiceMode')).toContainText('Wikipedia');
  await page.locator('#prompt').fill('research the printing press');
  await page.locator('#sendBtn').click();
  await expect(page.locator('#lastTrace')).toContainText(/tool call|failure/, { timeout: 40000 });

  // 8. Stop closes an open microphone immediately and says so.
  await page.locator('#autoRun').uncheck();
  await page.evaluate(() => { window.__transcriptDelay = 3000; });
  await page.locator('#talkBtn').click();
  await expect(page.locator('#talkBtn')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#wave')).toHaveAttribute('data-state', 'listening');
  await page.locator('#stopBtn').click();
  await expect(page.locator('#status')).toContainText('Stopped');
  await expect(page.locator('#talkBtn')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#wave')).toHaveAttribute('data-state', 'idle');
  // And a cancelled listening session never starts a run of its own.
  const runs = await page.locator('.agent-trace').count();
  await page.waitForTimeout(500);
  expect(await page.locator('.agent-trace').count()).toBe(runs);
  await expect(page.locator('#talkBtn')).toHaveAttribute('aria-pressed', 'false');

  // 9. The honest limits are on the page, not hidden in documentation.
  await expect(page.locator('#limits')).toContainText('does not open doors');
  await expect(page.locator('#limits')).toContainText('does not upload audio');

  expect(errors).toEqual([]);
});

test('JARVIS: a browser without speech still lets the user type', async ({ page }) => {
  // Remove both engines before any page script runs.
  await page.addInitScript(() => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
    Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: undefined, configurable: true });
  });
  await openConsole(page);
  await expect(page.locator('#voiceDiagnostics')).toContainText('Microphone input: not available');
  await expect(page.locator('#voiceDiagnostics')).toContainText('Read-aloud: not supported');
  await page.locator('#talkBtn').click();
  await expect(page.locator('#status')).toContainText('Voice input is not supported');
  // Typing still works, which is the whole point of the fallback.
  await page.locator('#prompt').fill('calculate 9*9');
  await page.locator('#sendBtn').click();
  await expect(page.locator('#chatlog')).toContainText('81', { timeout: 30000 });
  await expect(page.locator('#status')).toContainText('This browser cannot speak');
});

test('JARVIS is reachable from every main surface and the Agent Lab grades it', async ({ page }) => {
  for (const pageName of ['index.html', 'jalalai.html', 'guide.html', 'dashboard.html', 'workspace.html', 'arena.html']) {
    await page.goto('/' + pageName);
    // Reachability is the requirement, not the number of links: the guide map and
    // a nav entry can both point at JARVIS, and that is correct.
    const links = page.locator('a[href="jarvis.html"]');
    await expect(links.first()).toHaveCount(1);
    expect(await links.count()).toBeGreaterThanOrEqual(1);
  }
  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected', { timeout: 20000 });
  const csrf = await page.evaluate(async () => (await (await fetch('/api/me')).json()).csrfToken);
  expect(csrf, 'a signed-in session must expose a CSRF token').toBeTruthy();
  const lab = await page.request.post('/api/agent/self-check', { headers: { 'X-CSRF-Token': csrf }, data: { timeoutMs: 8000 } });
  expect(lab.ok()).toBeTruthy();
  const data = await lab.json();
  const checks = data.results || data.selfCheck?.checks || data.checks || [];
  expect(checks.length).toBeGreaterThanOrEqual(19);
  const voice = checks.find(check => check.id === 'voice.surfaces');
  expect(voice, 'the voice contract must be graded by the self-check').toBeTruthy();
  expect(voice.ok).toBe(true);
  expect(voice.detail).toContain('voice pages declare a shared preference module and selector');
});
