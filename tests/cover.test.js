import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverFit, toScreen, pickFormat } from '../src/stage/cover.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test('square viewport crops the sides of a landscape film', () => {
  const f = coverFit(1000, 1000, 1600, 900, 1);
  near(f.k, 1000 / 900);
  near(f.ox, (1000 - 1600 * f.k) / 2);
  near(f.oy, 0);
});

test('film centre maps to viewport centre for any aspect', () => {
  for (const [vw, vh] of [[1920, 1080], [390, 844], [1024, 768], [3440, 1440]]) {
    const f = coverFit(vw, vh, 1600, 900, 1.04);
    const [x, y] = toScreen(f, 800, 450);
    near(x, vw / 2);
    near(y, vh / 2);
  }
});

test('overscan leaves a margin on every side', () => {
  const f = coverFit(1600, 900, 1600, 900, 1.04);
  assert.ok(f.ox < 0 && f.oy < 0);
});

test('portrait viewports get the portrait film', () => {
  assert.equal(pickFormat(390, 844), 'p');
  assert.equal(pickFormat(1920, 1080), 'l');
  assert.equal(pickFormat(1000, 1000), 'l');
  assert.equal(pickFormat(800, 1000), 'p');
});
