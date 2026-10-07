import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeScrollMap } from '../src/stage/scrollmap.js';
import { SCROLL_KEYS, DUR } from '../src/film/world.js';

const keys = [[3, 0], [5, 2], [9, 3]];
const m = makeScrollMap(keys);

test('endpoints and total', () => {
  assert.equal(m.total, 3);
  assert.equal(m.toT(0), 3);
  assert.equal(m.toT(3), 9);
});

test('linear inside a leg', () => {
  assert.equal(m.toT(1), 4);
  assert.equal(m.toT(2.5), 7);
});

test('clamps outside', () => {
  assert.equal(m.toT(-5), 3);
  assert.equal(m.toT(99), 9);
  assert.equal(m.toV(0), 0);
  assert.equal(m.toV(50), 3);
});

test('toV inverts toT across the real film keys', () => {
  const real = makeScrollMap(SCROLL_KEYS);
  for (let t = SCROLL_KEYS[0][0]; t <= DUR; t += 0.37) {
    assert.ok(Math.abs(real.toT(real.toV(t)) - t) < 1e-9, `t=${t}`);
  }
});

test('monotonic', () => {
  const real = makeScrollMap(SCROLL_KEYS);
  let prev = -1;
  for (let v = 0; v <= real.total; v += 0.05) {
    const t = real.toT(v);
    assert.ok(t >= prev);
    prev = t;
  }
});
