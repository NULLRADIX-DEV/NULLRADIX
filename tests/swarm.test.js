import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSwarm, stepSwarm } from '../src/scenes/swarm-sim.js';

const home = (pts) => ({ hx: Float32Array.from(pts.map((p) => p[0])), hy: Float32Array.from(pts.map((p) => p[1])) });
const run = (s, h, steps, pointer) => {
  for (let i = 0; i < steps; i++) stepSwarm(s, h.hx, h.hy, 1 / 60, pointer);
};

test('a particle far from the pointer stays home', () => {
  const s = createSwarm(1), h = home([[100, 100]]);
  run(s, h, 60, { x: 600, y: 600, radius: 100, on: true });
  assert.ok(Math.hypot(s.ox[0], s.oy[0]) < 1e-6);
});

test('the pointer pushes a nearby particle away from itself', () => {
  const s = createSwarm(1), h = home([[100, 100]]);
  run(s, h, 20, { x: 80, y: 100, radius: 100, on: true });
  assert.ok(s.ox[0] > 4, `ox=${s.ox[0]}`); // pushed to the right, away from x=80
  assert.ok(Math.abs(s.oy[0]) < 1);
});

test('when the pointer leaves, the particle springs back', () => {
  const s = createSwarm(1), h = home([[100, 100]]);
  run(s, h, 20, { x: 80, y: 100, radius: 100, on: true });
  run(s, h, 180, { x: 0, y: 0, radius: 100, on: false });
  assert.ok(Math.hypot(s.ox[0], s.oy[0]) < 0.5, `still ${s.ox[0]}`);
});

test('a particle exactly under the pointer still gets out of the way', () => {
  const s = createSwarm(1), h = home([[100, 100]]);
  run(s, h, 20, { x: 100, y: 100, radius: 100, on: true });
  assert.ok(Math.hypot(s.ox[0], s.oy[0]) > 4);
  assert.ok(Number.isFinite(s.ox[0]) && Number.isFinite(s.oy[0]));
});
