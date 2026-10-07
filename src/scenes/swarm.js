/**
 * The wordmark at the end, live. The film forms NULLRADIX out of particles and fades its own copy
 * out over WM_HANDOFF; this layer samples the same glyphs, projects them through the same camera
 * and takes over, so the cursor can push the particles around (swarm-sim.js does the physics).
 */
import { IMPLODE_C, WM_HANDOFF, PLANE_N, sstep, rnd } from '../film/world.js';
import { qs } from '../utils/dom.js';
import { createSwarm, stepSwarm } from './swarm-sim.js';
import { createPoints } from './points.js';

const N = PLANE_N * PLANE_N; // the film's wordmark uses exactly this many particles
const FONT = '"Roboto Flex Variable"';

export function createSwarmLayer() {
  const points = createPoints(qs('[data-swarm]'));

  const wx = new Float32Array(N), wy = new Float32Array(N), phase = new Float32Array(N);
  const hx = new Float32Array(N), hy = new Float32Array(N), data = new Float32Array(N * 3);
  const sim = createSwarm(N);
  for (let i = 0; i < N; i++) phase[i] = rnd(i * 6.61 + 0.6) * 6.2832;
  let sampledFor = '', fontReady = false;
  document.fonts.load(`700 100px ${FONT}`).then(() => (fontReady = true));

  // same glyph sampling as the film engine (film pixels around the frame centre)
  function sample(world) {
    const { W, H, CX, CY } = world;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.letterSpacing = '-4px';
    g.font = `700 200px ${FONT}`;
    const size = (200 * 0.7 * W) / g.measureText('NULLRADIX').width;
    g.font = `700 ${size.toFixed(1)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    g.fillText('NULLRADIX', CX, CY);
    const d = g.getImageData(0, 0, W, H).data, pts = [];
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (d[(y * W + x) * 4 + 3] > 120) pts.push(x, y);
    const n = pts.length / 2;
    for (let i = 0; i < N; i++) {
      const j = Math.floor(rnd(i * 9.91 + 3) * n);
      wx[i] = pts[j * 2] + (rnd(i * 4.4) - 0.5) * 2 - CX;
      wy[i] = pts[j * 2 + 1] + (rnd(i * 5.5) - 0.5) * 2 - CY;
    }
  }

  function clear() {
    if (!points.shown) return;
    points.clear();
    sim.ox.fill(0);
    sim.oy.fill(0);
    sim.vx.fill(0);
    sim.vy.fill(0);
  }

  return (ctx) => {
    const t = ctx.shownT;
    const a = sstep(WM_HANDOFF[0], WM_HANDOFF[1], t);
    if (a <= 0.001 || !fontReady) return clear();
    const { world, cam, fit, film, impact } = ctx;
    if (sampledFor !== ctx.fmt) {
      sample(world);
      sampledFor = ctx.fmt;
    }
    points.resize(ctx.vw, ctx.vh);

    // homes: the film's wordmark plane through the camera of the frame on screen
    const { r, d, f, F, eye, sx, sy } = cam;
    const ex = IMPLODE_C[0] - eye[0], ey = IMPLODE_C[1] - eye[1], ez = IMPLODE_C[2] - eye[2];
    const k = fit.k, ox = fit.ox + film.x, oy = fit.oy + film.y;
    const cx = world.CX + sx + impact.sx, cy = world.CY + sy + impact.sy;
    for (let i = 0; i < N; i++) {
      const px = ex + wx[i], py = ey + wy[i], pz = ez;
      const dz = f[0] * px + f[1] * py + f[2] * pz;
      const X = cx + (F * (r[0] * px + r[1] * py + r[2] * pz)) / dz;
      const Y = cy + (F * (d[0] * px + d[1] * py + d[2] * pz)) / dz;
      hx[i] = ox + X * k;
      hy[i] = oy + Y * k;
    }
    const radius = Math.max(70, Math.min(150, ctx.vw * 0.075));
    stepSwarm(sim, hx, hy, Math.min(ctx.dt, 1 / 30), { x: ctx.pointer.x, y: ctx.pointer.y, radius, on: ctx.pointer.inside && a > 0.5 });

    const base = 0.17 * a;
    for (let i = 0, j = 0; i < N; i++, j += 3) {
      const speed = Math.abs(sim.vx[i]) + Math.abs(sim.vy[i]);
      data[j] = hx[i] + sim.ox[i] + Math.sin(t * 1.7 + phase[i]) * 0.6;
      data[j + 1] = hy[i] + sim.oy[i] + Math.cos(t * 1.3 + phase[i]) * 0.6;
      data[j + 2] = base * (1 + 0.15 * Math.sin(t * 3 + phase[i])) + Math.min(0.6, speed * 0.0025) * a;
    }
    points.draw(data, N, Math.max(3, 4.2 * k));
  };
}
