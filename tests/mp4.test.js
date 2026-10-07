import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMp4 } from '../src/film/mp4.js';

const buf = readFileSync(new URL('./fixtures/tiny.mp4', import.meta.url));
const m = parseMp4(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

test('track basics', () => {
  assert.match(m.codec, /^avc1\.[0-9a-f]{6}$/);
  assert.equal(m.width, 64);
  assert.equal(m.height, 36);
});

test('30 samples, keyframes every 15', () => {
  assert.equal(m.samples.length, 30);
  assert.deepEqual(m.samples.map((s, i) => (s.key ? i : -1)).filter((i) => i >= 0), [0, 15]);
});

test('samples lie inside the file', () => {
  for (const s of m.samples) assert.ok(s.offset + s.size <= buf.byteLength && s.size > 0);
});

test('description is avcC (version 1)', () => assert.equal(m.description[0], 1));

test('rejects a file without a video track', () => {
  assert.throws(() => parseMp4(new ArrayBuffer(16)), /mp4/i);
});
