import { test, expect } from '@playwright/test';

// These tests use the disposable PGlite app and speech doubles, not a real
// microphone, speaker, cloud provider or production database.
async function controlledSpeech(page) {
  await page.addInitScript(() => {
    window.__spoken = [];
    window.__recognitions = [];
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => [{ name: 'Test voice', lang: 'en-US', default: true, localService: true, voiceURI: 'test' }],
      addEventListener() {}, removeEventListener() {}, cancel() {},
      speak(utterance) {
        window.__spoken.push(utterance.text);
        utterance.onstart?.();
        setTimeout(() => utterance.onend?.(), 10);
      }
    } });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: class {
      constructor(text) { this.text = text; }
    } });
    class Recognition {
      start() { window.__recognitions.push(this); this.onstart?.(); }
      abort() { this.onend?.(); }
      emit(text) {
        const result = [{ transcript: text }]; result.isFinal = true;
        this.onresult?.({ results: [result] });
      }
    }
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: Recognition });
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: undefined });
  });
}

async function openPreview(page, path) {
  await page.goto(path);
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected', { timeout: 20000 });
}

async function seedSavedItems(page) {
  return page.evaluate(async () => {
    const me = await (await fetch('/api/me')).json();
    const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken };
    async function save(action) {
      const response = await fetch('/api/assistant/confirm', { method: 'POST', headers, body: JSON.stringify({ confirmed: true, action }) });
      if (!response.ok) throw new Error('Could not prepare disposable test data');
      return response.json();
    }
    await save({ type: 'create_task', title: 'Open task fixture' });
    const completed = await save({ type: 'create_task', title: 'Completed task fixture' });
    await save({ type: 'create_note', content: 'Private note fixture' });
    const update = await fetch('/api/assistant/tasks/' + completed.task.id, { method: 'PATCH', headers, body: JSON.stringify({ status: 'done' }) });
    if (!update.ok) throw new Error('Could not set disposable task status');
  });
}

function observeSavedReads(page) {
  const reads = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (request.method() === 'GET' && /^\/api\/assistant\/(?:state|tasks|notes)$/.test(url.pathname)) reads.push(url.pathname + url.search);
  });
  return reads;
}

async function send(page, message) {
  await page.locator('#prompt').fill(message);
  await page.locator('#sendBtn').click();
}

test('JARVIS handles dictated exclusions, precise status filters and combined reads', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await controlledSpeech(page);
  await openPreview(page, '/jarvis.html');
  await seedSavedItems(page);
  await page.locator('#mode').selectOption('local');
  const reads = observeSavedReads(page);

  // A dictated Roman Urdu exclusion is reviewed before submission and neither
  // fetches nor reads out previously saved items.
  await page.locator('#talkBtn').click();
  await expect(page.locator('#micIndicator')).toHaveText('Mic on');
  await page.evaluate(() => window.__recognitions.at(-1).emit('notes mat dikhao'));
  await expect(page.locator('#prompt')).toHaveValue('notes mat dikhao');
  await page.locator('#sendBtn').click();
  await expect(page.locator('.message.assistant').last()).toContainText('I did not read saved tasks');
  await expect.poll(() => page.evaluate(() => window.__spoken.at(-1))).toContain('I did not read');
  expect(await page.evaluate(() => window.__spoken.at(-1))).not.toContain('Private note fixture');
  expect(reads).toEqual([]);

  // A general question is not a request to open the account's saved notes.
  await send(page, 'What are notes?');
  await expect(page.locator('.message.assistant').last()).toContainText('cannot answer that open-ended question');
  expect(reads).toEqual([]);

  await send(page, 'show my open tasks');
  await expect(page.locator('.message.assistant').last()).toContainText('Open task fixture');
  await expect(page.locator('.message.assistant').last()).not.toContainText('Completed task fixture');
  await expect.poll(() => page.evaluate(() => window.__spoken.at(-1))).toContain('Open task fixture');
  expect(await page.evaluate(() => window.__spoken.at(-1))).not.toContain('Completed task fixture');
  expect(reads).toEqual(['/api/assistant/tasks?status=open']);

  reads.length = 0;
  await send(page, 'show my tasks and notes');
  await expect(page.locator('.message.assistant').last()).toContainText('Completed task fixture');
  await expect(page.locator('.message.assistant').last()).toContainText('Private note fixture');
  expect([...reads].sort()).toEqual(['/api/assistant/notes', '/api/assistant/tasks']);

  reads.length = 0;
  await page.locator('#mode').selectOption('research');
  // The previous combined reply already contains the note. Hold the new chat
  // request to prove it cannot be mistaken for this turn's reply.
  let announceChat, releaseChat;
  const chatStarted = new Promise(resolve => { announceChat = resolve; });
  const chatGate = new Promise(resolve => { releaseChat = resolve; });
  const chatPath = url => url.pathname === '/api/assistant/chat';
  await page.route(chatPath, async route => {
    if (route.request().postDataJSON()?.message === 'read my notes') {
      announceChat();
      await chatGate;
    }
    await route.continue();
  });
  try {
    const previousCount = await page.locator('.message.assistant').count();
    const newReply = page.locator('.message.assistant').nth(previousCount);
    await send(page, 'read my notes');
    await chatStarted;
    await expect(page.locator('.message.assistant').last()).toContainText('Private note fixture');
    expect(await newReply.count()).toBe(0);
    expect(reads).toEqual([]);
    releaseChat();
    await expect(newReply).toContainText('Private note fixture');
    expect(reads).toEqual(['/api/assistant/notes']);
  } finally {
    releaseChat();
    await page.unroute(chatPath);
  }

  reads.length = 0;
  await send(page, 'Show my tasks but not my notes');
  await expect(page.locator('.message.assistant').last()).toContainText('I did not read');
  await expect.poll(() => page.evaluate(() => window.__spoken.at(-1))).toContain('I did not read');
  expect(await page.evaluate(() => window.__spoken.at(-1))).not.toContain('Private note fixture');
  expect(reads).toEqual([]);

  // An instructional example in a compound agent request is not a command
  // to open the saved note that the example mentions.
  await page.locator('#mode').selectOption('agent');
  const agentMessage = page.locator('.message.assistant').nth(await page.locator('.message.assistant').count());
  const agentReply = page.waitForResponse(response => new URL(response.url()).pathname === '/api/assistant/chat' && response.request().method() === 'POST');
  await send(page, 'Calculate 6 * 7 and tell me how to find and show my notes');
  const agent = await (await agentReply).json();
  expect(agent.trace.tools).not.toContain('tasks');
  expect(agent.trace.tools).not.toContain('records');
  expect(JSON.stringify(agent)).not.toContain('Private note fixture');
  await expect(agentMessage).toBeVisible();
  await expect(agentMessage).not.toContainText('Private note fixture');
  expect(reads).toEqual([]);
  expect(errors).toEqual([]);
});

test('JalalAi hides already loaded sidebar lists and only reloads them on request', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await controlledSpeech(page);
  await openPreview(page, '/jalalai.html');
  await seedSavedItems(page);
  await page.reload();
  await expect(page.locator('#connectionStatus')).toContainText('Connected', { timeout: 20000 });
  await expect(page.locator('#tasks')).toContainText('Open task fixture');
  await expect(page.locator('#notes')).toContainText('Private note fixture');
  await page.locator('#voiceReply').check();
  const reads = observeSavedReads(page);

  await send(page, 'notes mat dikhao');
  await expect(page.locator('.message.assistant').last()).toContainText('I did not read');
  await expect(page.locator('.message.assistant').last()).toContainText('Both sidebar lists are now hidden');
  await expect(page.locator('#tasks')).toContainText('Hidden on this page');
  await expect(page.locator('#notes')).toContainText('Hidden on this page');
  await expect(page.locator('#exportBtn')).toBeDisabled();
  await expect(page.locator('#showSavedListsBtn')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__spoken.at(-1))).toContain('I did not read');
  expect(await page.evaluate(() => window.__spoken.at(-1))).not.toContain('Private note fixture');
  expect(reads).toEqual([]);

  await send(page, 'show my tasks');
  await expect(page.locator('.message.assistant').last()).toContainText('Open task fixture');
  await expect(page.locator('.message.assistant').last()).not.toContainText('Private note fixture');
  expect(reads).toEqual(['/api/assistant/tasks']);
  await expect(page.locator('#notes')).toContainText('Hidden on this page');

  reads.length = 0;
  await send(page, 'show my open tasks and notes');
  await expect(page.locator('.message.assistant').last()).toContainText('Open task fixture');
  await expect(page.locator('.message.assistant').last()).toContainText('Private note fixture');
  await expect(page.locator('.message.assistant').last()).not.toContainText('Completed task fixture');
  expect([...reads].sort()).toEqual(['/api/assistant/notes', '/api/assistant/tasks?status=open']);
  await expect(page.locator('#tasks')).toContainText('Hidden on this page');
  await expect(page.locator('#notes')).toContainText('Hidden on this page');

  // Even after an explicit save, a background refresh must not redisplay or
  // reload the hidden lists. The save still needs its separate confirmation.
  reads.length = 0;
  await send(page, 'save note: Another confirmed idea');
  await expect(page.getByRole('button', { name: 'Confirm & save' })).toBeVisible();
  expect(reads).toEqual([]);
  await page.getByRole('button', { name: 'Confirm & save' }).click();
  await expect(page.locator('#chatlog')).toContainText('Note saved to your private workspace');
  await expect.poll(() => reads.some(url => url.includes('/assistant/state?metadata=1'))).toBe(true);
  expect(reads.some(url => url.includes('/assistant/tasks') || url.includes('/assistant/notes'))).toBe(false);
  await expect(page.locator('#notes')).toContainText('Hidden on this page');
  await expect(page.locator('#exportBtn')).toBeDisabled();

  reads.length = 0;
  await page.locator('#showSavedListsBtn').click();
  await expect(page.locator('#tasks')).toContainText('Completed task fixture');
  await expect(page.locator('#notes')).toContainText('Another confirmed idea');
  await expect(page.locator('#exportBtn')).toBeEnabled();
  await expect(page.locator('#showSavedListsBtn')).toBeHidden();
  expect(reads).toEqual(['/api/assistant/state?includeOmniRoute=1']);
  expect(errors).toEqual([]);
});

test('late sidebar responses cannot undo hiding or replace a revealed list with metadata', async ({ page }) => {
  await openPreview(page, '/jalalai.html');
  await seedSavedItems(page);
  await page.reload();
  await expect(page.locator('#tasks')).toContainText('Open task fixture');

  let announceFull, releaseFull, finishFull;
  const fullStarted = new Promise(resolve => { announceFull = resolve; });
  const fullGate = new Promise(resolve => { releaseFull = resolve; });
  const fullFinished = new Promise(resolve => { finishFull = resolve; });
  const fullState = url => url.pathname === '/api/assistant/state' && !url.searchParams.has('metadata');
  await page.route(fullState, async route => {
    const response = await route.fetch(); announceFull();
    await fullGate; await route.fulfill({ response }); finishFull();
  });
  try {
    await page.getByRole('checkbox', { name: 'Complete Open task fixture' }).check();
    await fullStarted;
    await send(page, 'Do not show my notes');
    await expect(page.locator('#notes')).toContainText('Hidden on this page');
    releaseFull(); await fullFinished;
    await page.waitForTimeout(200);
    await expect(page.locator('#tasks')).toContainText('Hidden on this page');
    await expect(page.locator('#notes')).toContainText('Hidden on this page');
  } finally { releaseFull(); await page.unroute(fullState); }

  let announceMetadata, releaseMetadata, finishMetadata;
  const metadataStarted = new Promise(resolve => { announceMetadata = resolve; });
  const metadataGate = new Promise(resolve => { releaseMetadata = resolve; });
  const metadataFinished = new Promise(resolve => { finishMetadata = resolve; });
  const metadataState = url => url.pathname === '/api/assistant/state' && url.searchParams.get('metadata') === '1';
  await page.route(metadataState, async route => {
    const response = await route.fetch(); announceMetadata();
    await metadataGate; await route.fulfill({ response }); finishMetadata();
  });
  try {
    await send(page, 'save note: Race test note');
    await page.getByRole('button', { name: 'Confirm & save' }).click();
    await metadataStarted;
    await page.locator('#showSavedListsBtn').click();
    await expect(page.locator('#tasks')).toContainText('Open task fixture');
    await expect(page.locator('#notes')).toContainText('Race test note');
    releaseMetadata(); await metadataFinished;
    await page.waitForTimeout(200);
    await expect(page.locator('#tasks')).toContainText('Open task fixture');
    await expect(page.locator('#notes')).toContainText('Race test note');
    await expect(page.locator('#exportBtn')).toBeEnabled();
  } finally { releaseMetadata(); await page.unroute(metadataState); }
});

test('JalalAi discards a delayed saved-item response after sign-out', async ({ page }) => {
  await controlledSpeech(page);
  await openPreview(page, '/jalalai.html');
  await seedSavedItems(page);
  await page.reload();
  await expect(page.locator('#notes')).toContainText('Private note fixture');
  await page.locator('#mode').selectOption('local');
  await page.locator('#voiceReply').check();

  let announce, release, finish;
  const started = new Promise(resolve => { announce = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const finished = new Promise(resolve => { finish = resolve; });
  const notesRequest = url => url.pathname === '/api/assistant/notes';
  await page.route(notesRequest, async route => {
    const response = await route.fetch(); announce();
    await gate;
    try { await route.fulfill({ response }); } catch { /* an aborted request is expected */ }
    finish();
  });
  try {
    await send(page, 'show my notes');
    await started;
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#accountBtn').click();
    await expect(page.locator('#accountBtn')).toHaveText('Sign in');
    release(); await finished;
    await page.waitForTimeout(200);
    await expect(page.locator('#notes')).not.toContainText('Private note fixture');
    await expect(page.locator('#chatlog')).not.toContainText('Private note fixture');
    expect((await page.evaluate(() => window.__spoken)).join('\n')).not.toContain('Private note fixture');
  } finally { release(); await page.unroute(notesRequest); }
});

for (const surface of ['jarvis', 'jalalai']) {
  test(`${surface} reports malformed record responses instead of claiming an empty result`, async ({ page }) => {
    await controlledSpeech(page);
    await openPreview(page, `/${surface}.html`);
    await page.locator('#mode').selectOption('local');
    await page.route(url => url.pathname === '/api/records', route => route.fulfill({ json: {} }));
    await send(page, 'search records: Missing data');
    await expect(page.locator('#status')).toContainText('Workspace records could not be read');
    await expect(page.locator('#chatlog')).not.toContainText('No workspace records match');
  });
}

test('all-in-one runs an explicit note read and refuses a mixed exclusion', async ({ page }) => {
  await openPreview(page, '/jalalai.html');
  await seedSavedItems(page);
  await page.goto('/allinone.html');
  await expect(page.locator('#connectionStatus')).toContainText('Connected', { timeout: 20000 });
  await page.locator('#prompt').fill('list notes');
  await page.locator('#askBtn').click();
  await expect(page.locator('.answer').first()).toContainText('Private note fixture');
  await expect(page.locator('.trace').first()).toContainText('successful tool result');

  await page.locator('#picker input[value="agent"]').check();
  await page.locator('#prompt').fill('Show my tasks but not my notes');
  await page.locator('#askBtn').click();
  await expect(page.locator('.answer').first()).toContainText('I did not read');
  await expect(page.locator('.answer').first()).not.toContainText('Open task fixture');
  await expect(page.locator('.answer').first()).not.toContainText('Private note fixture');
});
