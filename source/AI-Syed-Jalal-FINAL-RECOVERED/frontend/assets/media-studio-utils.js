export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 20_000_000;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_VIDEO_DURATION = 600;
export const MAX_CLIP_DURATION = 120;
export const MAX_OUTPUT_BYTES = 100 * 1024 * 1024;

const bounded = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

export function imageGeometry(width, height, { left = 0, right = 0, top = 0, bottom = 0, rotation = 0, scale = 100 } = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_IMAGE_PIXELS) throw new Error('Unsupported image dimensions');
  const x = Math.floor(width * bounded(left, 0, 40, 0) / 100);
  const y = Math.floor(height * bounded(top, 0, 40, 0) / 100);
  const w = Math.max(1, width - x - Math.floor(width * bounded(right, 0, 40, 0) / 100));
  const h = Math.max(1, height - y - Math.floor(height * bounded(bottom, 0, 40, 0) / 100));
  const angle = ((Math.round(Number(rotation) / 90) * 90) % 360 + 360) % 360;
  const factor = bounded(scale, 25, 100, 100) / 100;
  const rotated = angle === 90 || angle === 270;
  return { x, y, width: w, height: h, angle, factor, outputWidth: Math.max(1, Math.round((rotated ? h : w) * factor)), outputHeight: Math.max(1, Math.round((rotated ? w : h) * factor)) };
}

export function clipRange(start, end, duration) {
  const a = Number(start), b = Number(end), total = Number(duration), actualEnd = Math.min(b, total), length = actualEnd - a;
  if ((typeof start === 'string' && !start.trim()) || (typeof end === 'string' && !end.trim()) || !Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(total) || total <= 0 || a < 0 || b > total + 0.01 || length < 0.2 - 0.000001) return { ok: false, error: 'Choose a valid start and end at least 0.2 seconds apart.' };
  if (length > MAX_CLIP_DURATION + 0.001) return { ok: false, error: 'Choose a clip of 2 minutes or less.' };
  return { ok: true, start: a, end: actualEnd, length };
}

export function supportsVideoCodecs(scope) {
  return typeof scope?.VideoDecoder === 'function' && typeof scope?.VideoEncoder === 'function';
}
