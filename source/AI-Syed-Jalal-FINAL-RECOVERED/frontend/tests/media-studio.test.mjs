import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { imageGeometry, clipRange, supportsVideoCodecs, MAX_IMAGE_PIXELS } from '../assets/media-studio-utils.js';

test('photo geometry crops before rotation and scales the exported dimensions', () => {
  const shape = imageGeometry(400, 200, { left: 10, right: 20, top: 5, bottom: 15, rotation: 90, scale: 50 });
  assert.deepEqual(shape, { x: 40, y: 10, width: 280, height: 160, angle: 90, factor: .5, outputWidth: 80, outputHeight: 140 });
  assert.equal(imageGeometry(400, 200, { rotation: -90 }).angle, 270);
  assert.throws(() => imageGeometry(MAX_IMAGE_PIXELS + 1, 1), /dimensions/);
  assert.throws(() => imageGeometry(0, 100), /dimensions/);
});

test('video ranges reject empty, reversed, too long and out-of-bounds clips', () => {
  assert.deepEqual(clipRange('1', '3.5', 5), { ok: true, start: 1, end: 3.5, length: 2.5 });
  assert.equal(clipRange('1.3', '1.5', 4).ok, true); // exactly 0.2 seconds despite floating-point rounding
  assert.equal(clipRange('1.3', '1.5', 1.499).ok, false); // clamping cannot accept a shorter interval
  for (const values of [['', '2', 10], ['1', '', 10], [4, 3, 10], [0, 0.1, 10], [-1, 3, 10], [0, 121, 300], [0, 11, 10], [0, 1, Infinity]]) {
    assert.equal(clipRange(...values).ok, false, `rejected ${values}`);
  }
});

test('video export detects WebCodecs and fails closed when either part is missing', () => {
  assert.equal(supportsVideoCodecs({ VideoDecoder: class {}, VideoEncoder: class {} }), true);
  assert.equal(supportsVideoCodecs({ VideoDecoder: class {} }), false);
  assert.equal(supportsVideoCodecs({ VideoEncoder: class {} }), false);
  assert.equal(supportsVideoCodecs(undefined), false);
});

test('vendored browser library is the pinned, unmodified upstream release with its license', async () => {
  const vendored = await readFile(new URL('../assets/vendor/mediabunny-1.65.2.min.mjs', import.meta.url));
  const upstream = await readFile(new URL('../../node_modules/mediabunny/dist/bundles/mediabunny.min.mjs', import.meta.url));
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  assert.equal(hash(vendored), '08149edcc8cf980da65d94a0a54a8fc0fa85a65f89b66f55c906f33618363919');
  assert.equal(hash(vendored), hash(upstream));
  assert.match(await readFile(new URL('../assets/vendor/mediabunny-LICENSE.txt', import.meta.url), 'utf8'), /Mozilla Public License Version 2\.0/);
});
