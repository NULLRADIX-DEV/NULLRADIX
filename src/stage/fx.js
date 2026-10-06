/**
 * Live layer effects: chromatic split on type when the film hits, content parallax against
 * the film, and a crosshair cursor that reads plane coordinates while it hovers the plane.
 */
import { ORIGIN, W0, GRID_SCALE, c01 } from '../film/world.js';
import { qs } from '../utils/dom.js';

const f3 = (v) => {
  const n = Math.max(-999, Math.min(999, Math.round(v)));
  return (n < 0 ? '-' : '+') + String(Math.abs(n)).padStart(3, '0');
};

export function createFx() {
  const root = document.documentElement;
  const cursor = qs('[data-cursor]');
  const label = qs('[data-cursor-label]');
  const fine = matchMedia('(pointer: fine)').matches;
  let lastLabel = '';
  if (fine) {
    document.body.classList.add('has-cursor');
    document.addEventListener('pointerover', (e) =>
      cursor.classList.toggle('is-link', !!e.target.closest?.('a, button, .anchors.is-plot .anchor--node')),
    );
  }

  // screen point -> where the view ray meets the plane y = 0
  function planeHit(ctx, x, y) {
    const { cam, fit, world, film } = ctx;
    const X = (x - film.x - fit.ox) / fit.k - world.CX - cam.sx;
    const Y = (y - film.y - fit.oy) / fit.k - world.CY - cam.sy;
    const dir = [0, 1, 2].map((i) => cam.r[i] * (X / cam.F) + cam.d[i] * (Y / cam.F) + cam.f[i]);
    if (dir[1] <= 1e-4 || cam.eye[1] >= 0) return null; // looking away from the plane
    const s = -cam.eye[1] / dir[1];
    return [cam.eye[0] + dir[0] * s, cam.eye[2] + dir[2] * s];
  }

  return (ctx) => {
    const ca = Math.min(ctx.impact.ca, 20);
    root.style.setProperty('--ca', (ca * 0.22).toFixed(2));
    root.style.setProperty('--px', (ctx.pointer.nx * 5).toFixed(2));
    root.style.setProperty('--py', (ctx.pointer.ny * 4).toFixed(2));

    if (!fine) return;
    cursor.style.transform = `translate3d(${ctx.pointer.x.toFixed(1)}px,${ctx.pointer.y.toFixed(1)}px,0)`;
    cursor.classList.toggle('is-out', !ctx.pointer.inside);
    // the plane exists in the hero (around the origin) and from the breakout on (around W0)
    const onHero = ctx.shownT > 0.8 && ctx.shownT < 4.8, onWork = ctx.shownT > 17.6 && ctx.shownT < 45.9;
    let txt = '';
    if (onHero || onWork) {
      const hit = planeHit(ctx, ctx.pointer.x, ctx.pointer.y);
      const c = onHero ? ORIGIN : W0;
      if (hit) {
        const gx = (hit[0] - c[0]) / GRID_SCALE, gy = -(hit[1] - c[2]) / GRID_SCALE;
        if (Math.abs(gx) <= 110 && Math.abs(gy) <= 110) txt = `x ${f3(gx)}  y ${f3(gy)}`;
      }
    }
    if (txt !== lastLabel) {
      lastLabel = txt;
      label.textContent = txt;
      cursor.classList.toggle('has-label', !!txt);
    }
    cursor.style.opacity = c01(1 - ctx.impact.flash * 2).toFixed(2);
  };
}
