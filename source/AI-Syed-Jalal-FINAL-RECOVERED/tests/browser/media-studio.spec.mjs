import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const pageErrors = page => { const errors = []; page.on('pageerror', error => errors.push(error.message)); return errors; };

async function samplePhoto(page) {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 50;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#c80000'; ctx.fillRect(0, 0, 50, 50); ctx.fillStyle = '#0000c8'; ctx.fillRect(50, 0, 50, 50);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  return { name: 'sample.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') };
}

async function sampleVideo() {
  return { name: 'sample.webm', mimeType: 'video/webm', buffer: await readFile(new URL('../fixtures/media-sample.webm', import.meta.url)) };
}

test('photo editor really edits and downloads an image without sending files or requiring sign-in', async ({ page }) => {
  const errors = pageErrors(page), mutations = [];
  page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) mutations.push(request.url()); });
  await page.goto('/ai-hub.html');
  await page.getByRole('button', { name: 'Images', exact: true }).click();
  await page.locator('[data-experience="image"]').getByRole('link', { name: /Open photo editor/ }).click();
  await expect(page).toHaveURL(/media-studio\.html#photo/);
  await expect(page.locator('#photoDownload')).toBeDisabled();
  await page.locator('#photoFile').setInputFiles(await samplePhoto(page));
  await expect(page.locator('#photoStatus')).toContainText('100 × 50 pixels');
  await page.locator('#photoRotate').click();
  await expect(page.locator('#photoStatus')).toContainText('50 × 100 pixels');
  await page.locator('#photoFlip').click(); await expect(page.locator('#photoFlip')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#photoControls summary').click(); await page.locator('#cropLeft').fill('20');
  await expect(page.locator('#photoStatus')).toContainText('50 × 80 pixels');
  await page.locator('#brightness').fill('120'); await expect(page.locator('#brightnessValue')).toHaveText('120%');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#photoDownload').click()]);
  expect(download.suggestedFilename()).toBe('sj-edited-photo.png');
  const bytes = await readFile(await download.path());
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(bytes.readUInt32BE(16)).toBe(50); expect(bytes.readUInt32BE(20)).toBe(80);
  const pixels = await page.evaluate(async base64 => {
    const blob = new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: 'image/png' }), url = URL.createObjectURL(blob);
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    const top = [...context.getImageData(10, 10, 1, 1).data], bottom = [...context.getImageData(10, 70, 1, 1).data];
    URL.revokeObjectURL(url); return { top, bottom };
  }, bytes.toString('base64'));
  // The left-to-right red/blue source becomes top-to-bottom after clockwise
  // rotation; horizontal flipping must not accidentally invert it vertically.
  expect(pixels.top[0]).toBeGreaterThan(150); expect(pixels.top[2]).toBeLessThan(80);
  expect(pixels.bottom[2]).toBeGreaterThan(150); expect(pixels.bottom[0]).toBeLessThan(80);
  await expect(page.locator('#photoStatus')).toContainText('original file was not changed');
  await page.locator('#photoFormat').selectOption('image/jpeg');
  const [jpeg] = await Promise.all([page.waitForEvent('download'), page.locator('#photoDownload').click()]);
  expect(jpeg.suggestedFilename()).toBe('sj-edited-photo.jpg');
  expect((await readFile(await jpeg.path())).subarray(0, 3).toString('hex')).toBe('ffd8ff');
  await page.locator('#photoReset').click(); await expect(page.locator('#photoStatus')).toContainText('100 × 50 pixels');
  expect(mutations).toEqual([]); expect(errors).toEqual([]);
});

test('changing the chosen photo prevents a pending export of the old one', async ({ page }) => {
  const downloads = [], errors = pageErrors(page); page.on('download', download => downloads.push(download));
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
      original.call(this, blob => { window.finishOldPhoto = () => callback(blob); }, ...args);
    };
  });
  await page.goto('/media-studio.html#photo'); const file = await samplePhoto(page);
  await page.locator('#photoFile').setInputFiles(file); await expect(page.locator('#photoStatus')).toContainText('Ready');
  await page.locator('#photoDownload').click(); await expect.poll(() => page.evaluate(() => typeof window.finishOldPhoto)).toBe('function');
  await page.locator('#photoFile').setInputFiles({ ...file, name: 'new-photo.png' });
  await expect(page.locator('#photoStatus')).toContainText('Ready'); await page.evaluate(() => window.finishOldPhoto());
  await expect(page.locator('#photoDownload')).toBeEnabled(); await expect(page.locator('#photoStatus')).toContainText('Ready');
  expect(downloads).toEqual([]); expect(errors).toEqual([]);
});

test('video trimmer exports a playable shorter video with audio using only the browser', async ({ page }) => {
  test.setTimeout(90000);
  const errors = pageErrors(page), mutations = [];
  page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) mutations.push(request.url()); });
  await page.goto('/media-studio.html#video');
  const file = await sampleVideo();
  await page.locator('#videoFile').setInputFiles(file);
  await expect(page.locator('#videoStatus')).toContainText('Ready', { timeout: 20000 });
  await expect(page.locator('#videoCapability')).toContainText('can try local video export');
  await page.locator('#videoStart').fill('0.5'); await page.locator('#videoEnd').fill('1.6');
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.locator('#videoExport').click()]);
  expect(download.suggestedFilename()).toMatch(/^sj-trimmed-video\.(webm|mp4)$/);
  const bytes = await readFile(await download.path()); expect(bytes.length).toBeGreaterThan(1000);
  const output = await page.evaluate(async ({ base64, type }) => {
    const raw = atob(base64), array = Uint8Array.from(raw, c => c.charCodeAt(0));
    const blob = new Blob([array], { type });
    const bunny = await import('/assets/vendor/mediabunny-1.65.2.min.mjs');
    const input = new bunny.Input({ source: new bunny.BlobSource(blob), formats: bunny.ALL_FORMATS });
    const audio = Boolean(await input.getPrimaryAudioTrack()); input.dispose();
    const element = document.createElement('video'); element.src = URL.createObjectURL(blob);
    await new Promise((resolve, reject) => { element.onloadedmetadata = resolve; element.onerror = reject; });
    if (element.duration === Infinity) { element.currentTime = 1e101; await new Promise((resolve, reject) => { element.onseeked = resolve; element.onerror = reject; }); element.currentTime = 0; await new Promise(resolve => { element.onseeked = resolve; }); }
    const audioContext = new AudioContext(), source = audioContext.createMediaElementSource(element), analyser = audioContext.createAnalyser();
    source.connect(analyser); analyser.connect(audioContext.destination); await audioContext.resume();
    element.loop = true; await element.play();
    const samples = new Float32Array(analyser.fftSize); let peak = 0;
    for (let i = 0; i < 10; i++) { await new Promise(resolve => setTimeout(resolve, 50)); analyser.getFloatTimeDomainData(samples); peak = Math.max(peak, ...samples.map(Math.abs)); }
    const result = { duration: element.duration, width: element.videoWidth, height: element.videoHeight, audio, peak };
    element.pause(); await audioContext.close(); URL.revokeObjectURL(element.src); return result;
  }, { base64: bytes.toString('base64'), type: download.suggestedFilename().endsWith('.mp4') ? 'video/mp4' : 'video/webm' });
  expect(output.width).toBe(160); expect(output.height).toBe(90);
  expect(output.duration).toBeGreaterThan(.95); expect(output.duration).toBeLessThan(1.3);
  expect(output.audio).toBe(true); expect(output.peak).toBeGreaterThan(0.01);
  await expect(page.locator('#videoStatus')).toContainText('original file was not changed');
  expect(mutations).toEqual([]); expect(errors).toEqual([]);
});

test('silent export uses the selected video interval and contains no audio track', async ({ page }) => {
  test.setTimeout(90000);
  const errors = pageErrors(page), mutations = [];
  page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) mutations.push(request.url()); });
  await page.setViewportSize({ width: 390, height: 900 }); await page.goto('/media-studio.html#video');
  await page.locator('#videoFile').setInputFiles(await sampleVideo());
  await expect(page.locator('#videoStatus')).toContainText('Ready');
  await page.locator('#videoStart').fill('1.5'); await page.locator('#videoEnd').fill('2.6');
  await page.locator('#videoAudio').uncheck();
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.locator('#videoExport').click()]);
  const bytes = await readFile(await download.path()); expect(bytes.length).toBeGreaterThan(1000);
  const output = await page.evaluate(async ({ base64, type }) => {
    const raw = atob(base64), blob = new Blob([Uint8Array.from(raw, c => c.charCodeAt(0))], { type });
    const bunny = await import('/assets/vendor/mediabunny-1.65.2.min.mjs');
    const input = new bunny.Input({ source: new bunny.BlobSource(blob), formats: bunny.ALL_FORMATS });
    const hasVideo = Boolean(await input.getPrimaryVideoTrack()), hasAudio = Boolean(await input.getPrimaryAudioTrack()); input.dispose();
    const video = document.createElement('video'), canvas = document.createElement('canvas');
    video.src = URL.createObjectURL(blob); await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = reject; });
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const sample = async time => {
      video.currentTime = time; await new Promise((resolve, reject) => { video.onseeked = resolve; video.onerror = reject; });
      const context = canvas.getContext('2d'); context.drawImage(video, 0, 0); return [...context.getImageData(10, 10, 1, 1).data];
    };
    const first = await sample(.1), last = await sample(.9), duration = video.duration;
    URL.revokeObjectURL(video.src);

    // Also decode the actual output via WebCodecs, independently of the video
    // element's seek/draw path. If a color assertion fails in CI, recording both
    // observations helps distinguish a bad export from a playback/render issue.
    const decodedInput = new bunny.Input({ source: new bunny.BlobSource(blob), formats: bunny.ALL_FORMATS });
    let decodedFirst, decodedLast;
    try {
      const track = await decodedInput.getPrimaryVideoTrack();
      if (track) {
        const sink = new bunny.VideoSampleSink(track), decodedCanvas = document.createElement('canvas');
        decodedCanvas.width = video.videoWidth; decodedCanvas.height = video.videoHeight;
        const context = decodedCanvas.getContext('2d');
        const decode = async time => {
          const frame = await sink.getSample(time);
          if (!frame) return null;
          try {
            context.clearRect(0, 0, decodedCanvas.width, decodedCanvas.height);
            frame.draw(context, 0, 0);
            return { pixel: [...context.getImageData(10, 10, 1, 1).data], timestamp: frame.timestamp };
          } finally { frame.close(); }
        };
        decodedFirst = await decode(.1); decodedLast = await decode(.9);
      }
    } finally { decodedInput.dispose(); }
    return { duration, hasVideo, hasAudio, first, last, decodedFirst, decodedLast };
  }, { base64: bytes.toString('base64'), type: download.suggestedFilename().endsWith('.mp4') ? 'video/mp4' : 'video/webm' });
  expect(output.hasVideo).toBe(true); expect(output.hasAudio).toBe(false);
  expect(output.duration).toBeGreaterThan(.95); expect(output.duration).toBeLessThan(1.3);
  // The source changes from red to blue at two seconds. Both the rendered and
  // independently decoded pixels must show the requested 1.5–2.6s interval.
  const evidence = `Export frame evidence: ${JSON.stringify(output)}`;
  expect(output.decodedFirst, evidence).toBeTruthy(); expect(output.decodedLast, evidence).toBeTruthy();
  expect(output.first[0], evidence).toBeGreaterThan(150); expect(output.first[2], evidence).toBeLessThan(80);
  expect(output.last[2], evidence).toBeGreaterThan(150); expect(output.last[0], evidence).toBeLessThan(80);
  expect(output.decodedFirst.pixel[0], evidence).toBeGreaterThan(150); expect(output.decodedFirst.pixel[2], evidence).toBeLessThan(80);
  expect(output.decodedLast.pixel[2], evidence).toBeGreaterThan(150); expect(output.decodedLast.pixel[0], evidence).toBeLessThan(80);
  expect(mutations).toEqual([]); expect(errors).toEqual([]);
});

for (const withAudio of [true, false]) {
  test(`MP4 input exports a playable ${withAudio ? 'clip with audio, including codec fallback' : 'silent MP4 clip'}`, async ({ page }) => {
    test.setTimeout(90000);
    const errors = pageErrors(page), mutations = [];
    page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) mutations.push(request.url()); });
    await page.goto('/media-studio.html#video');
    await page.locator('#videoFile').setInputFiles({ name: 'phone-video.mp4', mimeType: 'video/mp4', buffer: await readFile(new URL('../fixtures/media-sample.mp4', import.meta.url)) });
    await expect(page.locator('#videoStatus')).toContainText('Ready');
    await page.locator('#videoStart').fill('0.5'); await page.locator('#videoEnd').fill('1.6'); await page.locator('#videoAudio').setChecked(withAudio);
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.locator('#videoExport').click()]);
    const bytes = await readFile(await download.path()), extension = download.suggestedFilename().split('.').pop();
    const output = await page.evaluate(async ({ base64, type }) => {
      const blob = new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type });
      const bunny = await import('/assets/vendor/mediabunny-1.65.2.min.mjs');
      const input = new bunny.Input({ source: new bunny.BlobSource(blob), formats: bunny.ALL_FORMATS });
      const hasVideo = Boolean(await input.getPrimaryVideoTrack()), hasAudio = Boolean(await input.getPrimaryAudioTrack()); input.dispose();
      const element = document.createElement('video'); element.src = URL.createObjectURL(blob);
      await new Promise((resolve, reject) => { element.onloadedmetadata = resolve; element.onerror = reject; });
      element.currentTime = .5; await new Promise((resolve, reject) => { element.onseeked = resolve; element.onerror = reject; });
      const canvas = document.createElement('canvas'); canvas.width = element.videoWidth; canvas.height = element.videoHeight;
      const context = canvas.getContext('2d'); context.drawImage(element, 0, 0);
      const pixel = [...context.getImageData(10, 10, 1, 1).data], duration = element.duration;
      const aacSupported = await bunny.canEncodeAudio('aac'); URL.revokeObjectURL(element.src);
      return { hasVideo, hasAudio, duration, pixel, aacSupported };
    }, { base64: bytes.toString('base64'), type: extension === 'mp4' ? 'video/mp4' : 'video/webm' });
    expect(output.hasVideo).toBe(true); expect(output.hasAudio).toBe(withAudio);
    expect(output.duration).toBeGreaterThan(.9); expect(output.duration).toBeLessThan(1.35); expect(output.pixel[0]).toBeGreaterThan(150);
    if (!withAudio) expect(extension).toBe('mp4');
    if (withAudio && !output.aacSupported) expect(extension).toBe('webm');
    expect(mutations).toEqual([]); expect(errors).toEqual([]);
  });
}

test('large silent video is resized to the advertised maximum without inventing an audio track', async ({ page }) => {
  test.setTimeout(90000);
  const errors = pageErrors(page);
  await page.goto('/media-studio.html#video');
  await page.locator('#videoFile').setInputFiles({ name: 'large.webm', mimeType: 'video/webm', buffer: await readFile(new URL('../fixtures/media-hd-silent.webm', import.meta.url)) });
  await expect(page.locator('#videoStatus')).toContainText('Ready');
  await page.locator('#videoStart').fill('0.2'); await page.locator('#videoEnd').fill('1.2');
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.locator('#videoExport').click()]);
  await expect(page.locator('#videoStatus')).toContainText('source has no audio track');
  const bytes = await readFile(await download.path());
  const output = await page.evaluate(async ({ base64, type }) => {
    const blob = new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type });
    const bunny = await import('/assets/vendor/mediabunny-1.65.2.min.mjs');
    const input = new bunny.Input({ source: new bunny.BlobSource(blob), formats: bunny.ALL_FORMATS });
    const hasAudio = Boolean(await input.getPrimaryAudioTrack()); input.dispose();
    const video = document.createElement('video'); video.src = URL.createObjectURL(blob);
    await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = reject; });
    const result = { width: video.videoWidth, height: video.videoHeight, duration: video.duration, hasAudio }; URL.revokeObjectURL(video.src); return result;
  }, { base64: bytes.toString('base64'), type: download.suggestedFilename().endsWith('.mp4') ? 'video/mp4' : 'video/webm' });
  expect(output).toMatchObject({ width: 1280, height: 720, hasAudio: false });
  expect(output.duration).toBeGreaterThan(.8); expect(output.duration).toBeLessThan(1.25); expect(errors).toEqual([]);
});

test('when audio encoding is unavailable the editor refuses to silently remove it', async ({ page }) => {
  const errors = pageErrors(page), downloads = [];
  await page.addInitScript(() => { Object.defineProperty(window, 'AudioEncoder', { value: undefined, configurable: true }); });
  page.on('download', download => downloads.push(download));
  await page.goto('/media-studio.html#video'); await page.locator('#videoFile').setInputFiles(await sampleVideo());
  await expect(page.locator('#videoStatus')).toContainText('Ready');
  await page.locator('#videoStart').fill('0.5'); await page.locator('#videoEnd').fill('1.6'); await page.locator('#videoExport').click();
  await expect(page.locator('#videoStatus')).toContainText('cannot export this video with its audio');
  await expect(page.locator('#videoExport')).toBeEnabled(); expect(downloads).toEqual([]);
  await page.locator('#videoAudio').uncheck();
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.locator('#videoExport').click()]);
  const bytes = await readFile(await download.path());
  const output = await page.evaluate(async ({ base64, type }) => {
    const blob = new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type });
    const bunny = await import('/assets/vendor/mediabunny-1.65.2.min.mjs');
    const input = new bunny.Input({ source: new bunny.BlobSource(blob), formats: bunny.ALL_FORMATS });
    const hasVideo = Boolean(await input.getPrimaryVideoTrack()), hasAudio = Boolean(await input.getPrimaryAudioTrack()); input.dispose();
    const video = document.createElement('video'); video.src = URL.createObjectURL(blob);
    await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = reject; });
    video.currentTime = .5; await new Promise((resolve, reject) => { video.onseeked = resolve; video.onerror = reject; });
    const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const context = canvas.getContext('2d'); context.drawImage(video, 0, 0);
    const pixel = [...context.getImageData(10, 10, 1, 1).data], duration = video.duration;
    URL.revokeObjectURL(video.src); return { hasVideo, hasAudio, duration, pixel };
  }, { base64: bytes.toString('base64'), type: download.suggestedFilename().endsWith('.mp4') ? 'video/mp4' : 'video/webm' });
  expect(output.hasVideo).toBe(true); expect(output.hasAudio).toBe(false);
  expect(output.duration).toBeGreaterThan(.95); expect(output.duration).toBeLessThan(1.3); expect(output.pixel[0]).toBeGreaterThan(150);
  expect(errors).toEqual([]);
});

test.describe('conversion cancellation', () => {
  // Let Playwright intercept the library module instead of a precaching worker.
  test.use({ serviceWorkers: 'block' });
  test('releases resources and never downloads a partial file', async ({ page }) => {
  const downloads = [], errors = pageErrors(page);
  page.on('download', download => downloads.push(download));
  await page.route('**/assets/vendor/mediabunny-1.65.2.min.mjs', route => route.fulfill({ contentType: 'text/javascript', body: `
    export const ALL_FORMATS = [];
    export class BlobSource { constructor(file) { this.file = file; } }
    export class Input { async getPrimaryAudioTrack() { return {}; } async getPrimaryVideoTrack() { return {}; } dispose() { window.testInputDisposed = true; } }
    export class BufferTarget { constructor() { this.buffer = null; } }
    export class Output { constructor(options) { this.target = options.target; } }
    export class WebMOutputFormat {} export class Mp4OutputFormat {} export class Quality {}
    export class Conversion { static async init() { return {
      isValid: true, utilizedTracks: [{type:'video'}, {type:'audio'}],
      execute() { window.testConversionRunning = true; return new Promise((resolve, reject) => { this.reject = reject; }); },
      async cancel() { window.testConversionCancelled = true; this.reject?.(new Error('cancelled')); }
    }; } }
  ` }));
  await page.goto('/media-studio.html#video'); await page.locator('#videoFile').setInputFiles(await sampleVideo());
  await expect(page.locator('#videoStatus')).toContainText('Ready'); await page.locator('#videoExport').click();
  await expect.poll(() => page.evaluate(() => window.testConversionRunning)).toBe(true);
  await expect(page.locator('#videoFile')).toBeDisabled(); await page.locator('#videoCancel').click();
  await expect(page.locator('#videoStatus')).toContainText('Export cancelled');
  await expect(page.locator('#videoExport')).toBeEnabled(); await expect(page.locator('#videoFile')).toBeEnabled();
  expect(await page.evaluate(() => [window.testConversionCancelled, window.testInputDisposed])).toEqual([true, true]);
  expect(downloads).toEqual([]); expect(errors).toEqual([]);
  });

  test('rejects an incorrectly timed output instead of downloading it', async ({ page }) => {
    const downloads = [], errors = pageErrors(page); page.on('download', download => downloads.push(download));
    await page.route('**/assets/vendor/mediabunny-1.65.2.min.mjs', route => route.fulfill({ contentType: 'text/javascript', body: `
      export const ALL_FORMATS = [];
      export class BlobSource { constructor(file) { this.file = file; } }
      export class Input {
        constructor(options) { this.file = options.source.file; }
        async getPrimaryAudioTrack() { return {}; } async getPrimaryVideoTrack() { return {}; }
        async computeDuration() { return 4; } dispose() {}
      }
      export class BufferTarget {} export class Output { constructor(options) { this.target = options.target; } }
      export class WebMOutputFormat {} export class Mp4OutputFormat {} export class Quality {}
      export class Conversion { static async init(options) { return {
        isValid: true, utilizedTracks: [{type:'video'}, {type:'audio'}],
        async execute() { options.output.target.buffer = new Uint8Array([1,2,3,4]).buffer; }, async cancel() {}
      }; } }
    ` }));
    await page.goto('/media-studio.html#video'); await page.locator('#videoFile').setInputFiles(await sampleVideo());
    await expect(page.locator('#videoStatus')).toContainText('Ready');
    await page.locator('#videoStart').fill('0.5'); await page.locator('#videoEnd').fill('1.6'); await page.locator('#videoExport').click();
    await expect(page.locator('#videoStatus')).toContainText('incomplete or incorrectly timed video');
    await expect(page.locator('#videoExport')).toBeEnabled(); expect(downloads).toEqual([]); expect(errors).toEqual([]);
  });
});

test('a non-video file cannot execute as HTML in the video preview', async ({ page }) => {
  const errors = pageErrors(page);
  await page.goto('/media-studio.html#video');
  await page.locator('#videoFile').setInputFiles({ name: 'not-video.mp4', mimeType: 'text/html', buffer: Buffer.from('<script>window.invalidVideoExecuted = true</script>') });
  await expect(page.locator('#videoStatus')).toContainText('could not open that video');
  await expect(page.locator('#videoExport')).toBeDisabled();
  expect(await page.evaluate(() => window.invalidVideoExecuted)).toBeUndefined(); expect(errors).toEqual([]);
});

test('media tools reject unsupported video export and stay within mobile width', async ({ page }) => {
  const errors = pageErrors(page);
  await page.addInitScript(() => { Object.defineProperty(window, 'VideoEncoder', { value: undefined, configurable: true }); });
  for (const width of [320, 390, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 }); await page.goto('/media-studio.html');
    await expect(page.locator('#videoCapability')).toContainText('cannot export video locally');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('photo and video exports work offline without caching the chosen files', async ({ page, context }) => {
  const errors = pageErrors(page);
  await page.goto('/'); await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 20000 }).toBe(true);
  const file = await samplePhoto(page);
  await context.setOffline(true);
  try {
    await page.goto('/media-studio');
    await page.locator('#photoFile').setInputFiles(file);
    await expect(page.locator('#photoStatus')).toContainText('100 × 50 pixels');
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#photoDownload').click()]);
    expect((await readFile(await download.path())).length).toBeGreaterThan(50);
    await page.locator('#videoFile').setInputFiles(await sampleVideo()); await expect(page.locator('#videoStatus')).toContainText('Ready');
    await page.locator('#videoStart').fill('0.5'); await page.locator('#videoEnd').fill('1.6');
    const [videoDownload] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.locator('#videoExport').click()]);
    expect((await readFile(await videoDownload.path())).length).toBeGreaterThan(1000);
    const cached = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async key => (await (await caches.open(key)).keys()).map(request => request.url)))).flat());
    expect(cached.some(url => url.includes('/assets/vendor/mediabunny-1.65.2.min.mjs'))).toBe(true);
    expect(cached.some(url => url.startsWith('blob:') || url.includes('sample.png') || url.includes('sample.webm'))).toBe(false);
  } finally { await context.setOffline(false); }
  expect(errors).toEqual([]);
});
