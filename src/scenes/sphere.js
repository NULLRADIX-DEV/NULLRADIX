/**
 * The hero sphere, live. The film forms the sphere in the intro and hands it over (SPHERE_LIVE);
 * this layer computes the same points with the same world function and the same camera, then lets
 * the visitor play: the sphere keeps turning on its own, leans towards the cursor, and the cursor
 * pushes its points apart (swarm-sim.js) before they spring back. Before the dive the film takes over.
 */
import { SPHERE_N, spherePoint, sphereLive, rnd } from '../film/world.js';
import { qs } from '../utils/dom.js';
import { createSwarm, stepSwarm } from './swarm-sim.js';
import { createPoints } from './points.js';

const SPIN = 0.12; // idle turn, rad/s
const TURN = 0.6; // how far it turns towards the cursor (rad at the screen edge)
const LEAN = 0.14; // and tilts

export function createSphereLayer() {
  const points = createPoints(qs('[data-sphere]'));
  const N = SPHERE_N;
  const sim = createSwarm(N);
  const hx = new Float32Array(N), hy = new Float32Array(N), lit = new Float32Array(N), data = new Float32Array(N * 3);
  const phase = new Float32Array(N);
  for (let j = 0; j < N; j++) phase[j] = rnd((30000 + j) * 6.61 + 0.6) * 6.2832;
  const P = [0, 0, 0];
  let spin = 0, turn = 0, lean = 0;

  return (ctx) => {
    const t = ctx.shownT;
    const a = sphereLive(t);
    if (a <= 0.001) {
      if (points.shown) {
        points.clear();
        sim.ox.fill(0);
        sim.oy.fill(0);
        sim.vx.fill(0);
        sim.vy.fill(0);
      }
      return;
    }
    points.resize(ctx.vw, ctx.vh);
    const dt = Math.min(ctx.dt, 1 / 30);
    // a uniform point cloud looks the same at any yaw, so the extra turn needs no unwinding at the
    // handoffs; the lean tilts the scan band, so it fades out with the handoff
    spin += dt * SPIN * a;
    const want = ctx.pointer.inside ? ctx.pointer.nx : 0;
    turn += (want * TURN - turn) * Math.min(1, dt * 2.5);
    lean += ((ctx.pointer.inside ? ctx.pointer.ny : 0) * LEAN - lean) * Math.min(1, dt * 2.5);

    const { r, d, f, F, eye, sx, sy } = ctx.cam;
    const k = ctx.fit.k, ox = ctx.fit.ox + ctx.film.x, oy = ctx.fit.oy + ctx.film.y;
    const cx = ctx.world.CX + sx + ctx.impact.sx, cy = ctx.world.CY + sy + ctx.impact.sy;
    for (let j = 0; j < N; j++) {
      lit[j] = spherePoint(j, t, P, spin + turn, lean * a);
      const px = P[0] - eye[0], py = P[1] - eye[1], pz = P[2] - eye[2];
      const dz = f[0] * px + f[1] * py + f[2] * pz;
      if (dz < 40) {
        lit[j] = 0;
        continue;
      }
      hx[j] = ox + (cx + (F * (r[0] * px + r[1] * py + r[2] * pz)) / dz) * k;
      hy[j] = oy + (cy + (F * (d[0] * px + d[1] * py + d[2] * pz)) / dz) * k;
    }
    const radius = Math.max(60, Math.min(120, ctx.vw * 0.06));
    stepSwarm(sim, hx, hy, dt, { x: ctx.pointer.x, y: ctx.pointer.y, radius, on: ctx.pointer.inside && a > 0.5 });

    const base = 0.14 * a;
    for (let j = 0, o = 0; j < N; j++, o += 3) {
      const speed = Math.abs(sim.vx[j]) + Math.abs(sim.vy[j]);
      data[o] = hx[j] + sim.ox[j];
      data[o + 1] = hy[j] + sim.oy[j];
      data[o + 2] = lit[j] ? base * lit[j] * (1 + 0.08 * Math.sin(t * 3 + phase[j])) + Math.min(0.6, speed * 0.0025) * a : 0;
    }
    points.draw(data, N, Math.max(3, 4.7 * k));
  };
}
