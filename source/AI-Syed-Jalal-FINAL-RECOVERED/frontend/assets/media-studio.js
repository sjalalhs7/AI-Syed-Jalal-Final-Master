import { MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, MAX_VIDEO_BYTES, MAX_VIDEO_DURATION, MAX_OUTPUT_BYTES, imageGeometry, clipRange, supportsVideoCodecs } from './media-studio-utils.js?v=163';

const $ = id => document.getElementById(id);
const photoCanvas = $('photoCanvas'), photoContext = photoCanvas.getContext('2d');
const photoSliders = ['brightness', 'contrast', 'saturation', 'cropLeft', 'cropRight', 'cropTop', 'cropBottom', 'photoScale'];
const photoDefaults = { brightness: 100, contrast: 100, saturation: 100, cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0, photoScale: 100 };
let photo = null, photoUrl = null, photoGeneration = 0, rotation = 0, flipped = false;
const hasCanvasFilters = Boolean(photoContext && 'filter' in photoContext);

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name; link.hidden = true;
  document.body.append(link); link.click(); link.remove();
  // Allow mobile browsers time to open the download before releasing memory.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
function resetPhotoSettings() {
  rotation = 0; flipped = false; $('photoFlip').setAttribute('aria-pressed', 'false');
  for (const id of photoSliders) { $(id).value = String(photoDefaults[id]); $(`${id}Value`).textContent = `${photoDefaults[id]}%`; }
}
function drawPhoto() {
  if (!photo || !photoContext) return;
  const shape = imageGeometry(photo.naturalWidth, photo.naturalHeight, { left: $('cropLeft').value, right: $('cropRight').value, top: $('cropTop').value, bottom: $('cropBottom').value, rotation, scale: $('photoScale').value });
  photoCanvas.width = shape.outputWidth; photoCanvas.height = shape.outputHeight;
  photoContext.save();
  if ($('photoFormat').value === 'image/jpeg') { photoContext.fillStyle = '#fff'; photoContext.fillRect(0, 0, shape.outputWidth, shape.outputHeight); }
  photoContext.translate(shape.outputWidth / 2, shape.outputHeight / 2);
  // Flip the displayed result horizontally, even after a rotation.
  photoContext.scale(flipped ? -1 : 1, 1);
  photoContext.scale(shape.factor, shape.factor);
  photoContext.rotate(shape.angle * Math.PI / 180);
  if (hasCanvasFilters) photoContext.filter = `brightness(${$('brightness').value}%) contrast(${$('contrast').value}%) saturate(${$('saturation').value}%)`;
  photoContext.drawImage(photo, shape.x, shape.y, shape.width, shape.height, -shape.width / 2, -shape.height / 2, shape.width, shape.height);
  photoContext.restore();
  $('photoStatus').textContent = `Ready · ${shape.outputWidth} × ${shape.outputHeight} pixels.${hasCanvasFilters ? '' : ' Colour adjustments are unavailable in this browser; crop and rotate still work.'}`;
}
function loadImage(image) {
  return new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('This browser could not open that image.')); });
}
$('photoFile').addEventListener('change', async event => {
  const file = event.target.files?.[0], generation = ++photoGeneration;
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = null; photo = null; $('photoFields').disabled = true; photoCanvas.hidden = true; $('photoEmpty').hidden = false;
  resetPhotoSettings();
  if (!file) { $('photoStatus').textContent = 'Choose a photo to begin.'; return; }
  if (file.size > MAX_IMAGE_BYTES) { $('photoStatus').textContent = 'This photo is over 30 MB. Please choose a smaller file.'; return; }
  const candidate = URL.createObjectURL(file), image = new Image(), loaded = loadImage(image);
  image.src = candidate; $('photoStatus').textContent = 'Opening photo on this device…';
  try {
    await loaded;
    if (generation !== photoGeneration) { URL.revokeObjectURL(candidate); return; }
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > MAX_IMAGE_PIXELS) throw new Error('Choose an image of no more than 20 megapixels.');
    if (!photoContext) throw new Error('This browser cannot open the photo editor.');
    photo = image; photoUrl = candidate;
    $('photoFields').disabled = false; photoCanvas.hidden = false; $('photoEmpty').hidden = true;
    for (const id of ['brightness', 'contrast', 'saturation']) $(id).disabled = !hasCanvasFilters;
    drawPhoto();
  } catch (error) {
    URL.revokeObjectURL(candidate);
    if (generation === photoGeneration) $('photoStatus').textContent = error.message || 'Could not open that image.';
  }
});
for (const id of photoSliders) $(id).addEventListener('input', () => { $(`${id}Value`).textContent = `${$(id).value}%`; drawPhoto(); });
$('photoRotate').addEventListener('click', () => { rotation = (rotation + 90) % 360; drawPhoto(); });
$('photoFlip').addEventListener('click', () => { flipped = !flipped; $('photoFlip').setAttribute('aria-pressed', String(flipped)); drawPhoto(); });
$('photoReset').addEventListener('click', () => { resetPhotoSettings(); drawPhoto(); });
$('photoFormat').addEventListener('change', drawPhoto);
$('photoDownload').addEventListener('click', () => {
  if (!photo || !photoCanvas.toBlob) { $('photoStatus').textContent = 'This browser cannot export the photo.'; return; }
  const type = $('photoFormat').value, button = $('photoDownload'), generation = photoGeneration;
  button.disabled = true; $('photoStatus').textContent = 'Preparing photo…';
  try {
    photoCanvas.toBlob(blob => {
      button.disabled = false;
      if (generation !== photoGeneration) return;
      if (!blob || blob.type !== type) { $('photoStatus').textContent = 'This browser could not export that image format.'; return; }
      downloadBlob(blob, type === 'image/png' ? 'sj-edited-photo.png' : 'sj-edited-photo.jpg');
      $('photoStatus').textContent = 'Photo download started. Your original file was not changed.';
    }, type, 0.92);
  } catch { button.disabled = false; $('photoStatus').textContent = 'This browser could not export that image.'; }
});

const video = document.querySelector('video#videoPreview');
if (!(video instanceof HTMLVideoElement)) throw new Error('Video preview is unavailable.');
// The selected JARVIS greeting should not overlap a video the user plays.
video.addEventListener('play', () => window.AJWelcome?.interruptForAssistant());
const videoSupported = supportsVideoCodecs(window);
const loadMediaLibrary = () => import('./vendor/mediabunny-1.65.2.min.mjs');
let videoUrl = null, videoGeneration = 0, videoDuration = 0, videoFile = null, activeExport = null;
$('videoCapability').textContent = videoSupported
  ? 'This browser can try local video export. Supported formats and audio depend on the device.'
  : 'This browser cannot export video locally. You can still preview a video; try a browser with WebCodecs support.';

async function findDuration(file) {
  if (Number.isFinite(video.duration) && video.duration > 0) return video.duration;
  // Some locally recorded WebM files have no duration in their header. Read
  // their local container metadata instead of seeking a video to infinity.
  let input;
  try {
    const library = await loadMediaLibrary();
    input = new library.Input({ source: new library.BlobSource(file), formats: library.ALL_FORMATS });
    const duration = await input.computeDuration();
    if (Number.isFinite(duration) && duration > 0) return duration;
  } finally { input?.dispose(); }
  throw new Error('This browser could not determine the video duration. Try another format.');
}
$('videoFile').addEventListener('change', event => {
  const file = event.target.files?.[0], generation = ++videoGeneration;
  video.pause(); video.removeAttribute('src'); video.load();
  if (videoUrl) URL.revokeObjectURL(videoUrl);
  videoUrl = null; videoFile = null; videoDuration = 0; $('videoFields').disabled = true; video.hidden = true; $('videoEmpty').hidden = false;
  if (!file) { $('videoStatus').textContent = 'Choose a video to begin.'; return; }
  if (file.size > MAX_VIDEO_BYTES) { $('videoStatus').textContent = 'This video is over 100 MB. Please choose a smaller file.'; return; }
  const candidate = URL.createObjectURL(file); videoUrl = candidate;
  $('videoStatus').textContent = 'Opening video on this device…';
  const fail = message => {
    if (generation !== videoGeneration) return;
    video.pause(); video.removeAttribute('src'); video.load(); URL.revokeObjectURL(candidate); videoUrl = null; videoFile = null;
    $('videoFields').disabled = true; video.hidden = true; $('videoEmpty').hidden = false; $('videoStatus').textContent = message;
  };
  video.onloadedmetadata = async () => {
    if (generation !== videoGeneration) return;
    try {
      const duration = await findDuration(file);
      if (generation !== videoGeneration) return;
      if (duration > MAX_VIDEO_DURATION) throw new Error('Choose a video no longer than 10 minutes.');
      if (duration < 0.2 || !video.videoWidth || !video.videoHeight) throw new Error('This video is too short or cannot be decoded.');
      videoDuration = duration; videoFile = file; $('videoStart').value = '0'; $('videoEnd').value = String(Math.floor(Math.min(duration, 120) * 10) / 10);
      $('videoStart').max = String(duration); $('videoEnd').max = String(duration);
      video.hidden = false; $('videoEmpty').hidden = true; $('videoFields').disabled = false;
      $('videoExport').disabled = !videoSupported;
      $('videoStatus').textContent = `Ready · ${duration.toFixed(1)} seconds. Choose a clip up to 2 minutes.`;
    } catch (error) { fail(error.message || 'Could not open that video.'); }
  };
  video.onerror = () => fail('This browser could not open that video. Try another format.');
  // Only a same-origin object URL is attached to an actual video element;
  // selected file contents must never be interpreted as an HTML document.
  const parsed = new URL(candidate);
  if (parsed.protocol !== 'blob:' || parsed.origin !== location.origin) { fail('The browser could not open this local video safely.'); return; }
  // Blob URLs are ASCII. Preserve IPv6 literal brackets when URI-encoding.
  video.src = encodeURI(parsed.href).replace(/%5B/gi, '[').replace(/%5D/gi, ']'); video.load();
});
$('setVideoStart').addEventListener('click', () => { $('videoStart').value = String(Math.floor(video.currentTime * 10) / 10); });
$('setVideoEnd').addEventListener('click', () => { $('videoEnd').value = String(Math.min(videoDuration, Math.floor(video.currentTime * 10) / 10)); });

function stopExport(reason) {
  const job = activeExport;
  if (!job) return;
  job.cancelled = true; job.reason = reason || 'Export cancelled. No file was downloaded.';
  if (job.conversion) job.conversion.cancel().catch(() => {});
}
$('videoCancel').addEventListener('click', () => stopExport('Export cancelled. No file was downloaded.'));

async function prepareConversion(library, input, range, includeAudio, job) {
  const hasAudio = Boolean(await input.getPrimaryAudioTrack());
  if (!await input.getPrimaryVideoTrack()) throw new Error('This file does not contain a readable video track.');
  // Prefer the original container; fall back to the other one if this browser
  // cannot encode all of the requested tracks. Never silently discard audio.
  const preferMp4 = /mp4|quicktime/i.test(videoFile.type) || /\.(mp4|m4v|mov)$/i.test(videoFile.name);
  const formats = preferMp4 ? ['mp4', 'webm'] : ['webm', 'mp4'];
  const factor = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
  const size = factor < 1 ? {
    width: Math.max(2, Math.round(video.videoWidth * factor / 2) * 2),
    height: Math.max(2, Math.round(video.videoHeight * factor / 2) * 2), fit: 'contain'
  } : {};
  for (const extension of formats) {
    if (job.cancelled) throw new Error(job.reason);
    const output = new library.Output({ format: extension === 'mp4' ? new library.Mp4OutputFormat({ fastStart: 'in-memory' }) : new library.WebMOutputFormat(), target: new library.BufferTarget() });
    const conversion = await library.Conversion.init({
      input, output, tracks: 'primary', trim: { start: range.start, end: range.end }, copy: false, tags: {}, showWarnings: false,
      video: { ...size, codec: extension === 'mp4' ? 'avc' : 'vp8', quality: new library.Quality({ bitrate: 2_500_000 }) },
      audio: includeAudio ? { codec: extension === 'mp4' ? 'aac' : 'opus', quality: new library.Quality({ bitrate: 128_000 }) } : { discard: true }
    });
    if (job.cancelled) { await conversion.cancel(); throw new Error(job.reason); }
    const hasVideoOutput = conversion.utilizedTracks.some(track => track.type === 'video');
    const hasAudioOutput = conversion.utilizedTracks.some(track => track.type === 'audio');
    if (conversion.isValid && hasVideoOutput && (!includeAudio || !hasAudio || hasAudioOutput)) return { conversion, output, extension, hasAudio };
    await conversion.cancel();
  }
  throw new Error(includeAudio && hasAudio
    ? 'This browser cannot export this video with its audio. Try another browser or uncheck Include audio for a silent clip.'
    : 'This browser cannot export this video format. Try another file or browser.');
}

async function verifyVideoOutput(library, blob, range, audioRequired, silent) {
  const output = new library.Input({ source: new library.BlobSource(blob), formats: library.ALL_FORMATS });
  try {
    const track = await output.getPrimaryVideoTrack(), audio = await output.getPrimaryAudioTrack();
    const duration = await output.computeDuration();
    if (!track || (audioRequired && !audio) || (silent && audio) || !Number.isFinite(duration) || duration < Math.min(0.1, range.length / 2) || duration > range.length + 0.25) {
      throw new Error('The browser produced an incomplete or incorrectly timed video. Try another format or browser.');
    }
    if (Math.max(await track.getDisplayWidth(), await track.getDisplayHeight()) > 1280) throw new Error('The exported video exceeded the supported size. Try another file or browser.');
    const first = await new library.VideoSampleSink(track).getSample((await track.getFirstTimestamp()) + 0.001);
    if (!first) throw new Error('The exported video could not be decoded. Try another format or browser.');
    first.close();
    if (audioRequired) {
      // Opus can advertise a negative pre-roll timestamp before any decoded
      // sample exists; sample just inside the audible timeline instead.
      const timestamp = Math.min(duration - 0.001, Math.max(0, await audio.getFirstTimestamp()) + 0.05);
      const sample = await new library.AudioSampleSink(audio).getSample(timestamp);
      if (!sample) throw new Error('The exported audio could not be decoded. Try another format or browser.');
      sample.close();
    }
  } finally { output.dispose(); }
}

$('videoExport').addEventListener('click', async () => {
  if (!videoFile || !videoDuration || !videoSupported || activeExport) return;
  window.AJWelcome?.interruptForAssistant();
  const range = clipRange($('videoStart').value, $('videoEnd').value, videoDuration);
  if (!range.ok) { $('videoStatus').textContent = range.error; return; }
  const job = { cancelled: false, reason: '', conversion: null }; activeExport = job;
  const includeAudio = $('videoAudio').checked;
  $('videoFields').disabled = true; $('videoFile').disabled = true; $('videoCancel').hidden = false; video.pause();
  let input;
  try {
    $('videoStatus').textContent = 'Preparing video locally…';
    const library = await loadMediaLibrary();
    if (job.cancelled) throw new Error(job.reason);
    input = new library.Input({ source: new library.BlobSource(videoFile), formats: library.ALL_FORMATS });
    const prepared = await prepareConversion(library, input, range, includeAudio, job);
    job.conversion = prepared.conversion;
    if (job.cancelled) { await job.conversion.cancel(); throw new Error(job.reason); }
    let lastPercent = -1;
    job.conversion.onProgress = progress => {
      const percent = Math.min(99, Math.max(0, Math.floor(progress * 100)));
      if (!job.cancelled && Number.isFinite(percent) && percent !== lastPercent) { lastPercent = percent; $('videoStatus').textContent = `Exporting locally… ${percent}%`; }
    };
    await job.conversion.execute();
    if (job.cancelled) throw new Error(job.reason);
    const bytes = prepared.output.target.buffer;
    if (!bytes?.byteLength) throw new Error('The browser produced an empty video. Try another format or browser.');
    if (bytes.byteLength > MAX_OUTPUT_BYTES) throw new Error('The output exceeded 100 MB. Try a shorter clip.');
    const type = prepared.extension === 'mp4' ? 'video/mp4' : 'video/webm';
    const blob = new Blob([bytes], { type }); $('videoStatus').textContent = 'Checking the exported video…';
    await verifyVideoOutput(library, blob, range, includeAudio && prepared.hasAudio, !includeAudio);
    if (job.cancelled) throw new Error(job.reason);
    downloadBlob(blob, `sj-trimmed-video.${prepared.extension}`);
    $('videoStatus').textContent = `Video download started. Your original file was not changed.${includeAudio && !prepared.hasAudio ? ' This source has no audio track.' : ''}`;
  } catch (error) {
    $('videoStatus').textContent = job.reason || error.message || 'The video could not be exported in this browser.';
  } finally {
    input?.dispose(); $('videoFields').disabled = false; $('videoExport').disabled = !videoSupported; $('videoFile').disabled = false; $('videoCancel').hidden = true;
    activeExport = null;
  }
});
window.addEventListener('pagehide', () => { stopExport('The page was closed.'); if (photoUrl) URL.revokeObjectURL(photoUrl); if (videoUrl) URL.revokeObjectURL(videoUrl); });
