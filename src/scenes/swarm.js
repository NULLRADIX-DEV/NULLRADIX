/**
 * The wordmark at the end, live. The film forms NULLRADIX out of particles and fades its own copy
 * out over WM_HANDOFF; this layer samples the same glyphs, projects them through the same camera
 * and takes over, so the cursor can push the particles around (swarm-sim.js does the physics).
 * Typed words re-form it: every particle flies to a spot on the new glyphs, in a wave from the left.
 */
import { IMPLODE_C, WM_HANDOFF, PLANE_N, sstep, rnd } from '../film/world.js';
import { qs } from '../utils/dom.js';
import { createSwarm, stepSwarm } from './swarm-sim.js';
import { createPoints } from './points.js';

const N = PLANE_N * PLANE_N; // the film's wordmark uses exactly this many particles
const FONT = '"Roboto Flex Variable"';
const WORD = 'NULLRADIX';
const DUR = 0.9; // seconds one particle takes to fly to its new home
const WAVE = 0.45; // the flights start as a wave from left to right over this long
const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

export function createSwarmLayer({ react = { state: { pulse: 0 } } } = {}) {
  const points = createPoints(qs('[data-swarm]'), { crisp: 0.8 }); // sharp dots at device resolution

  const wx = new Float32Array(N), wy = new Float32Array(N), phase = new Float32Array(N);
  const hx = new Float32Array(N), hy = new Float32Array(N), data = new Float32Array(N * 3);
  // a morph flies every particle from (ax, ay) to (bx, by), each with its own delay and arc
  const ax = new Float32Array(N), ay = new Float32Array(N), bx = new Float32Array(N), by = new Float32Array(N);
  const delay = new Float32Array(N), lift = new Float32Array(N);
  const ids = Array.from({ length: N }, (_, i) => i);
  const sim = createSwarm(N);
  for (let i = 0; i < N; i++) {
    phase[i] = rnd(i * 6.61 + 0.6) * 6.2832;
    lift[i] = 20 + rnd(i * 7.3 + 1.1) * 70;
  }
  let sampledFor = '', fontReady = false, word = WORD, morph = null, nRef = 1;
  let gain = 1, gainFrom = 1, gainTo = 1, flare = 0, live = false, world = null;
  const box = { x0: 0, y0: 0, x1: 0, y1: 0 };
  document.fonts.load(`700 100px ${FONT}`).then(() => (fontReady = true));
  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d', { willReadFrequently: true });

  // the film engine's glyph sampling (film pixels around the frame centre); other words are set
  // the same way, never bigger than the wordmark and narrow enough to fit the frame
  function sample(w, text) {
    const { W, H, CX, CY } = w;
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    } else g.clearRect(0, 0, W, H);
    g.letterSpacing = '-4px';
    g.font = `700 200px ${FONT}`;
    let size = (200 * 0.7 * W) / g.measureText(WORD).width;
    if (text !== WORD) {
      g.font = `700 ${size.toFixed(1)}px ${FONT}`;
      size *= Math.min(1, (0.8 * W) / g.measureText(text).width);
    }
    g.font = `700 ${size.toFixed(1)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    g.fillText(text, CX, CY);
    const d = g.getImageData(0, 0, W, H).data, pts = [];
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (d[(y * W + x) * 4 + 3] > 120) pts.push(x, y);
    return { pts, n: pts.length / 2, CX, CY };
  }
  // where particle i lands on the sampled glyphs (with replacement: short words double up)
  function spot(smp, i, X, Y) {
    const j = Math.floor(rnd(i * 9.91 + 3) * smp.n);
    X[i] = smp.pts[j * 2] + (rnd(i * 4.4) - 0.5) * 2 - smp.CX;
    Y[i] = smp.pts[j * 2 + 1] + (rnd(i * 5.5) - 0.5) * 2 - smp.CY;
  }

  // the wordmark exactly as the film hands it over
  function home(w) {
    const smp = sample(w, WORD);
    nRef = smp.n || 1;
    for (let i = 0; i < N; i++) spot(smp, i, wx, wy);
    word = WORD;
    morph = null;
    gain = gainFrom = gainTo = 1;
  }

  // fly the particles into another word; an empty one flies them home
  function start(w, text) {
    text = text.trim() ? text : WORD;
    if (text === word) return;
    const smp = sample(w, text);
    if (!smp.n) return;
    // pair by rank along x: particles sorted by where they are, targets by where they go,
    // so the flights run side by side instead of criss-crossing
    for (let i = 0; i < N; i++) spot(smp, i, bx, by);
    const tx = bx.slice(), ty = by.slice();
    const tgt = ids.slice().sort((p, q) => tx[p] - tx[q] || ty[p] - ty[q]);
    const src = ids.slice().sort((p, q) => wx[p] - wx[q] || wy[p] - wy[q]);
    for (let k = 0; k < N; k++) {
      const i = src[k], j = tgt[k];
      ax[i] = wx[i];
      ay[i] = wy[i];
      bx[i] = tx[j];
      by[i] = ty[j];
      delay[i] = ((tx[j] + w.W / 2) / w.W) * WAVE + rnd(i * 3.17) * 0.08;
    }
    gainFrom = gain;
    gainTo = Math.min(1.2, Math.max(0.3, Math.pow(smp.n / nRef, 0.75))); // fewer pixels: particles stack, so dim them
    morph = { at: performance.now() };
    word = text;
  }

  function clear() {
    if (!points.shown) return;
    points.clear();
    sim.ox.fill(0);
    sim.oy.fill(0);
    sim.vx.fill(0);
    sim.vy.fill(0);
  }

  function update(ctx) {
    const t = ctx.shownT;
    const a = sstep(WM_HANDOFF[0], WM_HANDOFF[1], t);
    world = ctx.world;
    live = a > 0.999 && !ctx.buried && ctx.cover < 0.3 && fontReady;
    if (!fontReady) return clear();
    if (sampledFor !== ctx.fmt) {
      home(ctx.world); // new format: back to the wordmark the film hands over
      sampledFor = ctx.fmt;
    }
    if (a <= 0.001 || ctx.buried) {
      if (word !== WORD && a <= 0.001) home(ctx.world); // scrolled back into the film: its wordmark again
      return clear(); // buried: under the index, nothing to see
    }
    points.resize(ctx.vw, ctx.vh);

    if (morph) {
      const el = (performance.now() - morph.at) / 1000;
      let done = true;
      for (let i = 0; i < N; i++) {
        const p = Math.max(0, Math.min(1, (el - delay[i]) / DUR));
        if (p < 1) done = false;
        const e = ease(p);
        wx[i] = ax[i] + (bx[i] - ax[i]) * e;
        wy[i] = ay[i] + (by[i] - ay[i]) * e - Math.sin(Math.PI * p) * lift[i];
      }
      gain = gainFrom + (gainTo - gainFrom) * ease(Math.min(1, el / (DUR + WAVE)));
      if (done) morph = null;
    }

    // homes: the film's wordmark plane through the camera of the frame on screen
    const { r, d, f, F, eye, sx, sy } = ctx.cam;
    const { fit, film, impact } = ctx;
    const ex = IMPLODE_C[0] - eye[0], ey = IMPLODE_C[1] - eye[1], ez = IMPLODE_C[2] - eye[2];
    const k = fit.k, ox = fit.ox + film.x, oy = fit.oy + film.y;
    const cx = ctx.world.CX + sx + impact.sx, cy = ctx.world.CY + sy + impact.sy;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < N; i++) {
      const px = ex + wx[i], py = ey + wy[i], pz = ez;
      const dz = f[0] * px + f[1] * py + f[2] * pz;
      const X = cx + (F * (r[0] * px + r[1] * py + r[2] * pz)) / dz;
      const Y = cy + (F * (d[0] * px + d[1] * py + d[2] * pz)) / dz;
      const sxi = ox + X * k, syi = oy + Y * k;
      hx[i] = sxi;
      hy[i] = syi;
      if (sxi < x0) x0 = sxi;
      if (sxi > x1) x1 = sxi;
      if (syi < y0) y0 = syi;
      if (syi > y1) y1 = syi;
    }
    box.x0 = x0;
    box.y0 = y0;
    box.x1 = x1;
    box.y1 = y1;
    const radius = Math.max(70, Math.min(150, ctx.vw * 0.075));
    stepSwarm(sim, hx, hy, Math.min(ctx.dt, 1 / 30), { x: ctx.pointer.x, y: ctx.pointer.y, radius, on: ctx.pointer.inside && a > 0.5 });

    flare = Math.max(0, flare - ctx.dt * 3);
    const base = 0.45 * a * gain * (1 + 0.9 * flare + 0.5 * react.state.pulse);
    for (let i = 0, j = 0; i < N; i++, j += 3) {
      const speed = Math.abs(sim.vx[i]) + Math.abs(sim.vy[i]);
      data[j] = hx[i] + sim.ox[i] + Math.sin(t * 1.7 + phase[i]) * 0.6;
      data[j + 1] = hy[i] + sim.oy[i] + Math.cos(t * 1.3 + phase[i]) * 0.6;
      data[j + 2] = base * (1 + 0.15 * Math.sin(t * 3 + phase[i])) + Math.min(0.6, speed * 0.0025) * a;
    }
    points.draw(data, N);
  }

  return {
    update,
    /** the particles become this word ('' = back to NULLRADIX) */
    morph(text) {
      if (world && fontReady) start(world, text.slice(0, 14));
    },
    /** a brief glow, e.g. on a key strike */
    flare(k = 1) {
      flare = Math.max(flare, k);
    },
    get word() {
      return word;
    },
    /** fully formed, on screen and not covered: ready to listen */
    get live() {
      return live;
    },
    /** screen box of the formed word (homes, without the cursor's push) */
    box,
  };
}
