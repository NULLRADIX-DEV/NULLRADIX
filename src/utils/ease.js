/**
 * Easing for page-level motion that runs without the film (the lens between pages). The film's own
 * copies live in the generated world.js; these match them.
 */
const c01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const sstep = (a, b, v) => {
  const k = c01((v - a) / (b - a));
  return k * k * (3 - 2 * k);
};

function bez(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x, d = dx(t);
      if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    return sy(c01(t));
  };
}

export const eOut = bez(0.2, 1, 0.3, 1);
export const eIn = (k) => k * k * k;
