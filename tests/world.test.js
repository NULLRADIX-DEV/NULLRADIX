import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as W from '../src/film/world.js';

for (const fmt of ['l', 'p']) {
  test(`camera is finite and continuous (${fmt})`, () => {
    const w = W.makeWorld(fmt);
    let prev = null;
    for (let f = 0; f <= W.FRAMES; f++) {
      const c = w.cam(f / W.FPS);
      for (const v of [...c.eye, ...c.tgt, c.F, c.roll, c.sx, c.sy]) assert.ok(Number.isFinite(v), `frame ${f}`);
      if (prev) assert.ok(W.len3(W.sub3(c.eye, prev.eye)) < 400, `camera jump at frame ${f}`);
      prev = c;
    }
  });

  test(`skill panels face the camera while shown (${fmt})`, () => {
    const w = W.makeWorld(fmt);
    const c = w.cam(37);
    for (const p of w.panels) assert.ok(w.proj(c, p.pos)[2] > 200);
  });
}

test('scroll keys strictly increasing', () => {
  for (let i = 1; i < W.SCROLL_KEYS.length; i++) {
    assert.ok(W.SCROLL_KEYS[i][0] > W.SCROLL_KEYS[i - 1][0]);
    assert.ok(W.SCROLL_KEYS[i][1] > W.SCROLL_KEYS[i - 1][1]);
  }
  assert.equal(W.SCROLL_KEYS.at(-1)[0], W.DUR);
});

test('scenes tile the film', () => {
  const s = W.SCENES;
  assert.equal(s[0].t0, 0);
  assert.equal(s.at(-1).t1, W.DUR);
  for (let i = 1; i < s.length; i++) assert.equal(s[i].t0, s[i - 1].t1);
  for (const x of s) assert.ok(x.anchorT >= x.t0 && x.anchorT < x.t1);
});

test('origin is in front of the camera during the intro', () => {
  const w = W.makeWorld('l');
  const p = w.proj(w.cam(0.8), W.ORIGIN);
  assert.ok(p[2] > 0 && Math.abs(p[0] - w.CX) < 200 && Math.abs(p[1] - w.CY) < 200);
});

test('each project node is on screen during its hold', () => {
  for (const fmt of ['l', 'p']) {
    const w = W.makeWorld(fmt);
    W.STOPS.forEach((s, i) => {
      const p = w.proj(w.cam((s.tHold + s.t1) / 2), W.NODES[i].top);
      assert.ok(p[2] > 0 && p[0] > 0 && p[0] < w.W && p[1] > 0 && p[1] < w.H, `${fmt} stop ${i}`);
    });
  }
});

test('milestones pass the screen centre at their time', () => {
  const w = W.makeWorld('l');
  for (const m of W.MILESTONES) {
    const p = w.proj(w.cam(m.t), m.pos);
    assert.ok(Math.abs(p[0] - w.CX) < w.W * 0.2, `milestone at ${m.t}`);
  }
});

test('cues are sorted and inside the film', () => {
  for (let i = 0; i < W.CUES.length; i++) {
    assert.ok(W.CUES[i].t > 0 && W.CUES[i].t < W.DUR);
    if (i) assert.ok(W.CUES[i].t >= W.CUES[i - 1].t);
  }
});

test('impactAt is quiet between cues and peaks right after a drop', () => {
  const calm = W.impactAt(25.5);
  assert.equal(calm.flash, 0);
  const hit = W.impactAt(46.62);
  assert.ok(hit.flash > 0.5 && hit.ca > 5 && Math.hypot(hit.sx, hit.sy) > 0);
  const before = W.impactAt(46.55);
  assert.ok(before.flash < 0.05);
});
