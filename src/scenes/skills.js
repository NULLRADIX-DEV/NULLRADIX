/**
 * Skills + experience. The glass panels are real DOM placed in the film camera with one
 * projective matrix each, so their text stays crisp while particles trace their frames.
 * Experience milestones ride on the timeline ticks as the camera tracks along it.
 */
import { qs, qsa } from '../utils/dom.js';
import { MILESTONES, mm, T4 } from '../film/world.js';
import { P, eOut, eIO, show, c01 } from './kit.js';

const m3 = (m) => 'matrix3d(' + m.map((v) => +v.toFixed(6)).join(',') + ')';

export function createSkills() {
  const head = qs('[data-skills-head]');
  const panels = qsa('[data-skills] .glass');
  const track = qs('[data-track]');
  const trackLabel = qs('.track__label');
  const items = qsa('[data-experience] .milestone');
  const pt = [0, 0, 0, 0];
  let sizes = null;
  addEventListener('resize', () => (sizes = null));

  return (ctx) => {
    const t = ctx.t, { cam, world, fit, vw } = ctx;

    // portrait: the panels fill the screen, so the heading leaves before they arrive
    const ha = eOut(P(t, 34.5, 35.3)) * (1 - eIO(ctx.fmt === 'p' ? P(t, 35.2, 35.6) : P(t, 38.8, 39.3)));
    show(head, ha, `translate3d(0,${((1 - ha) * 24).toFixed(1)}px,0)`);

    // glass panels: screen = translate(cover) . scale(k) . translate(principal point) . perspective(F) . [T(0,0,F) V M]
    const pa = P(t, 34.85, 35.6) * (1 - P(t, 39.0, 39.45));
    if (pa > 0.002) {
      const pre = mm(T4(0, 0, cam.F), cam.V);
      const ox = fit.ox + ctx.film.x + ctx.impact.sx * fit.k, oy = fit.oy + ctx.film.y + ctx.impact.sy * fit.k;
      const base = `translate3d(${ox.toFixed(2)}px,${oy.toFixed(2)}px,0) scale(${fit.k.toFixed(5)}) translate3d(${(world.CX + cam.sx).toFixed(2)}px,${(world.CY + cam.sy).toFixed(2)}px,0) perspective(${cam.F.toFixed(2)}px) `;
      panels.forEach((el, i) => {
        const p = world.panels[i];
        const depth = world.proj(cam, p.pos)[2];
        const a = depth > 120 ? pa * eOut(P(t, 34.85 + i * 0.12, 35.55 + i * 0.12)) : 0;
        el.style.width = `${p.w}px`;
        el.style.height = `${p.h}px`;
        show(el, a, base + m3(mm(pre, p.M)));
        el.style.setProperty('--sheen', ((ctx.pointer.nx + 1) * 50).toFixed(1) + '%');
      });
    } else panels.forEach((el) => show(el, 0));

    // timeline
    const ta = eOut(P(t, 39.5, 40.2)) * (1 - eIO(P(t, 43.9, 44.3)));
    show(trackLabel, ta);
    show(track, ta > 0 ? 1 : 0);
    if (!sizes) sizes = items.map((c) => [c.offsetWidth, c.offsetHeight]);
    items.forEach((li, i) => {
      const m = MILESTONES[i];
      const q = ta > 0 && ctx.proj([m.pos[0], -150, m.pos[2]], pt);
      if (!q) return show(li, 0);
      const off = Math.abs(pt[0] / vw - 0.5);
      const a = ta * (1 - c01((off - 0.17) / 0.17));
      const [w, h] = sizes[i];
      const x = Math.min(Math.max(pt[0] - w / 2, 16), vw - w - 16);
      const y = Math.max(76, pt[1] - h - 34);
      show(li, a, `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`);
      li.style.setProperty('--stem', `${Math.max(0, pt[1] - y - h).toFixed(1)}px`);
      li.style.setProperty('--stem-x', `${(pt[0] - x).toFixed(1)}px`);
    });
  };
}
