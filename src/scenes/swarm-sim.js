/**
 * Physics of the live wordmark swarm. Each particle keeps an offset from its home point (the home
 * moves with the film camera); the pointer pushes particles out of a soft disc and a damped spring
 * pulls them back. Screen pixels, seconds.
 */
const SPRING = 38; // pull back home (1/s²)
const DAMP = 7.5; // velocity damping (1/s)
const PUSH = 5200; // pointer force at the centre (px/s²)

export function createSwarm(n) {
  return { n, ox: new Float32Array(n), oy: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n) };
}

/** advance the swarm by dt; pointer = { x, y, radius, on } */
export function stepSwarm(s, hx, hy, dt, pointer) {
  const { n, ox, oy, vx, vy } = s;
  const r = pointer.radius, r2 = r * r, on = pointer.on;
  const damp = Math.exp(-DAMP * dt);
  for (let i = 0; i < n; i++) {
    let ax = -SPRING * ox[i], ay = -SPRING * oy[i];
    if (on) {
      let dx = hx[i] + ox[i] - pointer.x, dy = hy[i] + oy[i] - pointer.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < r2) {
        let d = Math.sqrt(d2);
        if (d < 1e-3) {
          // dead centre: pick a stable direction per particle
          dx = Math.cos(i * 2.399963);
          dy = Math.sin(i * 2.399963);
          d = 1;
        }
        const k = 1 - d / r, f = (PUSH * k * k) / d;
        ax += dx * f;
        ay += dy * f;
      }
    }
    vx[i] = (vx[i] + ax * dt) * damp;
    vy[i] = (vy[i] + ay * dt) * damp;
    ox[i] += vx[i] * dt;
    oy[i] += vy[i] * dt;
  }
}
