/**
 * 404: no film here, just the void and a field of particles that forms the number. The cursor (or a
 * finger) pushes them apart and they spring back; now and then the signal tears along a line.
 * Leaving goes through the lens like every other page.
 */
import './styles/notfound.css';
import '@fontsource-variable/roboto-flex/full.css';
import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import { createPoints } from './scenes/points.js';
import { createSwarm, stepSwarm } from './scenes/swarm-sim.js';
import { wirePageJumps, takeArrival, coordOf } from './modules/pagejump.js';

const N = 12000;
const FONT = '"Roboto Flex Variable"';
const rnd = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
};

const canvas = document.querySelector('[data-nf]');
const xyz = document.querySelector('[data-nf-xyz]');
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const points = createPoints(canvas, { crisp: 0.85 });
const sim = createSwarm(N);
const ux = new Float32Array(N), uy = new Float32Array(N); // home in units of the glyph box
const hx = new Float32Array(N), hy = new Float32Array(N), data = new Float32Array(N * 3), phase = new Float32Array(N);
const pointer = { x: 0, y: 0, inside: false };
let vw = 0, vh = 0, box = null, tear = 0;

document.querySelector('[data-nf-path]').textContent = `${location.pathname}  ->  ${coordOf(location.pathname)}`;

// sample the glyphs once, in a unit box; the screen size is applied every frame
function sample() {
  const W = 1200, H = 520, cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.font = `800 460px ${FONT}`;
  g.letterSpacing = '-12px';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  g.fillText('404', W / 2, H / 2 + 20);
  const d = g.getImageData(0, 0, W, H).data, pts = [];
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (d[(y * W + x) * 4 + 3] > 120) pts.push(x, y);
  const n = pts.length / 2;
  for (let i = 0; i < N; i++) {
    const j = Math.floor(rnd(i * 9.91 + 3) * n);
    ux[i] = (pts[j * 2] + (rnd(i * 4.4) - 0.5) * 2) / W - 0.5;
    uy[i] = (pts[j * 2 + 1] + (rnd(i * 5.5) - 0.5) * 2) / H - 0.5;
    phase[i] = rnd(i * 6.61) * 6.2832;
  }
}

function layout() {
  vw = innerWidth;
  vh = innerHeight;
  points.resize(vw, vh);
  const w = Math.min(vw * 0.86, 980), h = (w * 520) / 1200;
  box = { cx: vw / 2, cy: Math.min(vh * 0.36, vh / 2 - 60), w, h };
}

addEventListener('pointermove', (e) => {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.inside = true;
});
document.documentElement.addEventListener('pointerleave', () => (pointer.inside = false));
addEventListener('touchmove', (e) => {
  pointer.x = e.touches[0].clientX;
  pointer.y = e.touches[0].clientY;
  pointer.inside = true;
}, { passive: true });
addEventListener('touchend', () => (pointer.inside = false), { passive: true });
addEventListener('resize', layout);

let last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(1 / 30, (now - (last || now)) / 1000);
  last = now;
  const t = now / 1000;
  for (let i = 0; i < N; i++) {
    hx[i] = box.cx + ux[i] * box.w + (still ? 0 : Math.sin(t * 0.8 + phase[i]) * 0.8);
    hy[i] = box.cy + uy[i] * box.h + (still ? 0 : Math.cos(t * 0.7 + phase[i]) * 0.8);
  }
  // signal lost: now and then a band of the field tears sideways
  if (!still && (tear -= dt) < 0) {
    tear = 2.5 + Math.random() * 3;
    const y0 = box.cy + (Math.random() - 0.5) * box.h, band = 6 + Math.random() * 18, kick = (Math.random() - 0.5) * 2600;
    for (let i = 0; i < N; i++) if (Math.abs(hy[i] - y0) < band) sim.vx[i] += kick;
  }
  stepSwarm(sim, hx, hy, dt, { x: pointer.x, y: pointer.y, radius: Math.max(70, Math.min(150, vw * 0.08)), on: pointer.inside });
  for (let i = 0, j = 0; i < N; i++, j += 3) {
    const speed = Math.abs(sim.vx[i]) + Math.abs(sim.vy[i]);
    data[j] = hx[i] + sim.ox[i];
    data[j + 1] = hy[i] + sim.oy[i];
    data[j + 2] = 0.5 * (1 + 0.15 * Math.sin(t * 3 + phase[i])) + Math.min(0.6, speed * 0.0025);
  }
  points.draw(data, N);
  if (pointer.inside) {
    const f = (v) => (v < 0 ? '-' : '+') + String(Math.abs(Math.round(v))).padStart(4, '0');
    xyz.textContent = `x ${f(pointer.x - vw / 2)}  y ${f(vh / 2 - pointer.y)}`;
  }
}

document.fonts.load(`800 100px ${FONT}`).then(() => {
  sample();
  layout();
  // the field arrives from everywhere
  if (!still)
    for (let i = 0; i < N; i++) {
      sim.ox[i] = (rnd(i * 1.7) - 0.5) * vw * 1.4;
      sim.oy[i] = (rnd(i * 2.9) - 0.5) * vh * 1.4;
    }
  requestAnimationFrame(frame);
});

const arrival = takeArrival();
if (!still || arrival) {
  const jump = wirePageJumps();
  if (arrival) jump.arrive({ ...arrival, ready: () => document.fonts.ready });
}
