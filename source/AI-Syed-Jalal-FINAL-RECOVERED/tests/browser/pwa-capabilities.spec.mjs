import { test, expect } from '@playwright/test';

// The OS-integration surfaces are promises to an operating system. This spec
// checks the half a browser can prove: manifest URLs resolve, the pages render
// and explain themselves on a host with no backend, an inbound share or link is
// shown but never auto-saved, and the capability report says "not available"
// rather than pretending.

// `request` carries the configured baseURL; plain fetch() does not.
const readManifest = async request => (await request.get('/manifest.webmanifest')).json();

test('the manifest and every file it names are served', async ({ request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.shortcuts.length).toBeGreaterThanOrEqual(3);
  expect(manifest.file_handlers[0].accept['text/plain']).toContain('.txt');

  const urls = new Set();
  for (const shortcut of manifest.shortcuts) urls.add(shortcut.url);
  for (const icon of manifest.icons) urls.add(icon.src);
  for (const shot of manifest.screenshots) urls.add(shot.src);
  for (const widget of manifest.widgets) {
    urls.add(widget.ms_ac_template);
    urls.add(widget.data);
    for (const shot of widget.screenshots) urls.add(shot.src);
    for (const icon of widget.icons) urls.add(icon.src);
  }
  urls.add(manifest.file_handlers[0].action);
  urls.add(manifest.protocol_handlers[0].url.replace('%s', 'test'));
  urls.add(manifest.share_target.action);
  urls.add(manifest.note_taking.new_note_url);
  urls.add(manifest.tab_strip.new_tab_button.url);

  const broken = [];
  for (const url of urls) {
    const path = '/' + url.replace(/^\.\//, '').split('?')[0].split('#')[0];
    const response = await request.get(path);
    if (!response.ok()) broken.push(`${url} → ${response.status()}`);
  }
  expect(broken, 'manifest references that do not resolve').toEqual([]);
});

test('the widget template and data agree on every binding', async ({ request }) => {
  const manifest = await readManifest(request);
  const widget = manifest.widgets[0];
  const template = await (await request.get('/' + widget.ms_ac_template.replace('./', ''))).json();
  const data = await (await request.get('/' + widget.data.replace('./', ''))).json();
  const bindings = [...JSON.stringify(template).matchAll(/\$\{([a-zA-Z0-9_]+)\}/g)].map(match => match[1]);
  expect(bindings.length).toBeGreaterThan(0);
  for (const key of new Set(bindings)) expect(data, `widget data lacks ${key}`).toHaveProperty(key);
});

test('Quick Notes opens from the New note shortcut and keeps the draft local', async ({ page }) => {
  await page.goto('/notes.html?new=1&static=1');
  await expect(page.locator('#noteText')).toBeFocused();

  const draft = 'A thought captured from the OS shortcut';
  await page.fill('#noteText', draft);
  await expect(page.locator('#charCount')).toHaveText(`${draft.length} / 4000`);

  // Nothing is stored until Save: no API call may leave the page.
  const calls = [];
  page.on('request', request => { if (request.url().includes('/api/')) calls.push(request.url()); });

  const download = page.waitForEvent('download');
  await page.click('#downloadBtn');
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^note-.*\.md$/);
  expect(calls, 'downloading a note must not call the API').toEqual([]);

  // Saving on a host with no backend explains itself instead of pretending.
  await page.click('#saveBtn');
  await expect(page.locator('#status')).toContainText(/Static preview|secure application server/i);
  await expect(page.locator('#status')).not.toContainText(/Failed to fetch|undefined/);
});

test('a share target shows what arrived and never saves it on its own', async ({ page }) => {
  const calls = [];
  page.on('request', request => { if (request.url().includes('/api/')) calls.push(request.url()); });
  await page.goto('/share-target.html?static=1&title=Launch%20plan&text=Review%20the%20capability%20report&url=https%3A%2F%2Fexample.org%2Fbrief');

  await expect(page.locator('#shareText')).toHaveText('Review the capability report');
  await expect(page.locator('#shareUrl')).toHaveText('https://example.org/brief');
  await expect(page.locator('#captureText')).toHaveValue(/Launch plan[\s\S]*Review the capability report[\s\S]*https:\/\/example\.org\/brief/);

  // Arriving is not consent: no request may have been sent before a button.
  expect(calls, 'a share must not be uploaded until the person acts').toEqual([]);

  await page.click('#saveShareBtn');
  await expect(page.locator('#shareStatus')).toContainText(/Static preview|sign in|secure application server/i);
});

test('the share target with nothing attached explains itself instead of erroring', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/share-target.html?static=1');
  await expect(page.locator('#nothing')).toBeVisible();
  await expect(page.locator('#shareState')).toHaveText('Nothing shared');
  expect(errors).toEqual([]);
});

test('the protocol handler shows the received link without opening it', async ({ page }) => {
  const navigations = [];
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations.push(frame.url()); });
  await page.goto('/protocol.html?static=1&url=' + encodeURIComponent('web+ajalal://open?note=42'));

  await expect(page.locator('#rawUrl')).toHaveText('web+ajalal://open?note=42');
  await expect(page.locator('#facts')).toContainText('web+ajalal');
  await expect(page.locator('#facts')).toContainText('open');
  await expect(page.locator('#protocolState')).toHaveText('Link received');
  // The page must not have navigated anywhere else on its own.
  expect(navigations.filter(url => !url.includes('protocol.html'))).toEqual([]);
});

test('an unparseable protocol link is reported as unreadable, not as safe', async ({ page }) => {
  await page.goto('/protocol.html?static=1&url=' + encodeURIComponent('not a url'));
  await expect(page.locator('#warning')).toBeVisible();
  await expect(page.locator('#warningText')).toContainText('not a URL the browser can parse');
  // It must warn rather than reassure.
  await expect(page.locator('#warningText')).toContainText('Do not treat it as safe to open');
});

test('the capability report measures support and admits what it cannot measure', async ({ page }) => {
  await page.goto('/capabilities.html?static=1');
  const rows = page.locator('#capRows tr');
  await expect(rows).toHaveCount(10);

  // Names match the capability set this release added.
  const names = await page.locator('#capRows td:first-child').allTextContents();
  for (const expected of ['Shortcuts', 'File handlers', 'Launch handler', 'Protocol handlers', 'Share target', 'Widgets', 'Edge side panel', 'Window controls overlay', 'Tabbed display', 'Note taking']) {
    expect(names).toContain(expected);
  }

  // Every row is in a terminal state, and no row claims "Available" for a
  // capability no page can query.
  const badges = await page.locator('#capRows .badge').allTextContents();
  expect(badges.every(text => ['Available', 'Not available', 'Decided by the OS'].includes(text))).toBe(true);
  const widgetRow = page.locator('#capRows tr', { hasText: 'Widgets' });
  await expect(widgetRow.locator('.badge')).toHaveText('Decided by the OS');
  await expect(widgetRow).toContainText('no page can query it');

  // The report must be about this device, so it names the current display mode.
  await expect(page.locator('#modePill')).toContainText(/Installed|not installed/);
  await expect(page.locator('#displayChips')).toContainText('browser');
});

test('Quick Notes and the capability report are reachable from the guide and the homepage', async ({ page }) => {
  await page.goto('/guide.html?static=1');
  for (const link of ['notes.html', 'share-target.html', 'capabilities.html']) {
    await expect(page.locator(`a[href="${link}"]`).first()).toBeVisible();
  }
  await page.goto('/index.html?static=1');
  await expect(page.locator('a[href="notes.html"]').first()).toBeVisible();
});

test('a signed-in note is saved through the confirmation route and listed', async ({ page }) => {
  test.setTimeout(120000);
  // Sign in through the local preview the same way every other journey does.
  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected', { timeout: 20000 });

  const confirmations = [];
  page.on('request', request => {
    if (request.url().includes('/api/assistant/confirm')) confirmations.push(request.postData() || '');
  });

  await page.goto('/notes.html?new=1');
  await expect(page.locator('#connectionStatus')).toContainText(/Signed in as/, { timeout: 20000 });

  const note = 'Saved from Quick Notes e2e ' + Date.now();
  await page.fill('#noteText', note);
  await page.click('#saveBtn');
  await expect(page.locator('#status')).toHaveText('Saved to your private workspace.', { timeout: 20000 });

  // The save must be the explicit confirmation the app uses everywhere else.
  expect(confirmations.length).toBe(1);
  expect(confirmations[0]).toContain('"confirmed":true');
  expect(confirmations[0]).toContain('create_note');
  expect(confirmations[0]).toContain(note);

  // And the saved note is now listed from the database, not from the draft.
  await expect(page.locator('#recentNotes')).toContainText(note.slice(0, 60), { timeout: 20000 });
});
