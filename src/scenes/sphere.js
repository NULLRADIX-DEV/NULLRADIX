/**
 * The hero sphere, live. The film forms the sphere in the intro and hands it over (SPHERE_LIVE);
 * this layer computes the same points with the same world function and the same camera, then lets
 * the visitor play: the sphere keeps turning on its own, leans towards the cursor, and the cursor
 * pushes its points apart (swarm-sim.js) before they spring back. Before the dive the film takes over.
 */
import { SPHERE_N, SPHERE_C, SPHERE_R, spherePoint, sphereLive, rnd } from '../film/world.js';
import { qs } from '../utils/dom.js';
import { createSwarm, stepSwarm } from './swarm-sim.js';
import { createPoints } from './points.js';

const SPIN = 0.12; // idle turn, rad/s
const TURN = 0.6; // how far it turns towards the cursor (rad at the screen edge)
const LEAN = 0.14; // and tilts

export function createSphereLayer({ react = { state: { pulse: 0 } } } = {}) {
  const points = createPoints(qs('[data-sphere]'), { crisp: 0.85 }); // sharp dots at device resolution
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
    const steer = ctx.pointer.inside || ctx.pointer.tilt; // the cursor, or how the phone is held
    turn += ((steer ? ctx.pointer.nx : 0) * TURN - turn) * Math.min(1, dt * 2.5);
    lean += ((steer ? ctx.pointer.ny : 0) * LEAN - lean) * Math.min(1, dt * 2.5);

    const { r, d, f, F, eye, sx, sy } = ctx.cam;
    // depth of the sphere's centre: points behind it are dimmed a little, which reads as volume
    const zc = f[0] * (SPHERE_C[0] - eye[0]) + f[1] * (SPHERE_C[1] - eye[1]) + f[2] * (SPHERE_C[2] - eye[2]);
    const k = ctx.fit.k, ox = ctx.fit.ox + ctx.film.x, oy = ctx.fit.oy + ctx.film.y;
    const cx = ctx.world.CX + sx + ctx.impact.sx, cy = ctx.world.CY + sy + ctx.impact.sy;
    // the sound's pulse swells the sphere a little around its centre
    const pulse = react.state.pulse, swell = 1 + 0.03 * pulse;
    const qx = SPHERE_C[0] - eye[0], qy = SPHERE_C[1] - eye[1], qz = SPHERE_C[2] - eye[2];
    const ccx = ox + (cx + (F * (r[0] * qx + r[1] * qy + r[2] * qz)) / zc) * k;
    const ccy = oy + (cy + (F * (d[0] * qx + d[1] * qy + d[2] * qz)) / zc) * k;
    for (let j = 0; j < N; j++) {
      lit[j] = spherePoint(j, t, P, spin + turn, lean * a);
      const px = P[0] - eye[0], py = P[1] - eye[1], pz = P[2] - eye[2];
      const dz = f[0] * px + f[1] * py + f[2] * pz;
      if (dz < 40) {
        lit[j] = 0;
        continue;
      }
      lit[j] *= 0.8 + 0.2 * Math.max(-1, Math.min(1, (zc - dz) / SPHERE_R));
      hx[j] = ccx + (ox + (cx + (F * (r[0] * px + r[1] * py + r[2] * pz)) / dz) * k - ccx) * swell;
      hy[j] = ccy + (oy + (cy + (F * (d[0] * px + d[1] * py + d[2] * pz)) / dz) * k - ccy) * swell;
    }
    const radius = Math.max(60, Math.min(120, ctx.vw * 0.06));
    stepSwarm(sim, hx, hy, dt, { x: ctx.pointer.x, y: ctx.pointer.y, radius, on: ctx.pointer.inside && a > 0.5 });

    const base = 0.42 * a * (1 + 0.6 * pulse);
    for (let j = 0, o = 0; j < N; j++, o += 3) {
      const speed = Math.abs(sim.vx[j]) + Math.abs(sim.vy[j]);
      data[o] = hx[j] + sim.ox[j];
      data[o + 1] = hy[j] + sim.oy[j];
      data[o + 2] = lit[j] ? base * lit[j] * (1 + 0.08 * Math.sin(t * 3 + phase[j])) + Math.min(0.6, speed * 0.0025) * a : 0;
    }
    points.draw(data, N);
  };
}
