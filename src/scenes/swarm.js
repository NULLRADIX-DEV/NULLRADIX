/**
 * The wordmark at the end, live. The film forms NULLRADIX out of particles and fades its own copy
 * out over WM_HANDOFF; this layer samples the same glyphs, projects them through the same camera
 * and takes over, so the cursor can push the particles around (swarm-sim.js does the physics).
 */
import { IMPLODE_C, WM_HANDOFF, PLANE_N, sstep, rnd } from '../film/world.js';
import { qs } from '../utils/dom.js';
import { createSwarm, stepSwarm } from './swarm-sim.js';

const N = PLANE_N * PLANE_N; // the film's wordmark uses exactly this many particles
const FONT = '"Roboto Flex Variable"';

const VERT = `#version 300 es
in vec3 a;
uniform vec2 uView;
uniform float uSize;
out float vB;
void main() {
  gl_Position = vec4(a.x / uView.x * 2.0 - 1.0, 1.0 - a.y / uView.y * 2.0, 0.0, 1.0);
  gl_PointSize = uSize;
  vB = a.z;
}`;
const FRAG = `#version 300 es
precision mediump float;
in float vB;
out vec4 o;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float k = exp(-dot(c, c) * 9.0) * vB;
  o = vec4(vec3(0.98, 0.98, 0.985) * k, k);
}`;

export function createSwarmLayer() {
  const canvas = qs('[data-swarm]');
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
  const g2 = gl ? null : canvas.getContext('2d');
  let prog, vbo, uView, uSize;
  if (gl) {
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    uView = gl.getUniformLocation(prog, 'uView');
    uSize = gl.getUniformLocation(prog, 'uSize');
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE); // particles add up like light, as in the film
  }

  const wx = new Float32Array(N), wy = new Float32Array(N), phase = new Float32Array(N);
  const hx = new Float32Array(N), hy = new Float32Array(N), data = new Float32Array(N * 3);
  const sim = createSwarm(N);
  for (let i = 0; i < N; i++) phase[i] = rnd(i * 6.61 + 0.6) * 6.2832;
  let sampledFor = '', fontReady = false, shown = false, cw = 0, ch = 0;
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
    if (!shown) return;
    shown = false;
    if (gl) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    } else g2.clearRect(0, 0, canvas.width, canvas.height);
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
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (cw !== ctx.vw || ch !== ctx.vh) {
      cw = ctx.vw;
      ch = ctx.vh;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
    }

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
    shown = true;
    if (gl) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      gl.uniform2f(uView, cw, ch);
      gl.uniform1f(uSize, Math.max(3, 4.2 * k) * dpr);
      gl.drawArrays(gl.POINTS, 0, N);
    } else {
      g2.setTransform(dpr, 0, 0, dpr, 0, 0);
      g2.clearRect(0, 0, cw, ch);
      g2.globalCompositeOperation = 'lighter';
      g2.fillStyle = `rgba(250,250,251,${(0.42 * a).toFixed(3)})`;
      for (let j = 0; j < data.length; j += 3) g2.fillRect(data[j] - 0.8, data[j + 1] - 0.8, 1.6, 1.6);
    }
  };
}
