/**
 * The instrument HUD: live camera coordinates of the frame on screen, the scene label
 * (decoded with a scramble on change), lens, film clock, scroll progress and buffer.
 * Over the index the label reads INDEX and the film's instruments fade.
 */
import { labelAt, sceneAt } from '../film/world.js';
import { qs, qsa } from '../utils/dom.js';

const GLYPHS = '01#/<>+*=_';
export const f4 = (v) => {
  const n = Math.max(-9999, Math.min(9999, Math.round(v)));
  return (n < 0 ? '-' : '+') + String(Math.abs(n)).padStart(4, '0');
};
function scramble(s, k) {
  if (k >= 1) return s;
  let o = '';
  for (let i = 0; i < s.length; i++) {
    const th = i / s.length;
    if (s[i] === ' ' || k * 1.3 - 0.3 >= th) o += s[i];
    else if (k * 1.3 >= th) o += GLYPHS[(Math.random() * GLYPHS.length) | 0];
  }
  return o;
}

export function createHud() {
  const xyz = qs('[data-hud-xyz]');
  const label = qs('[data-hud-label]');
  const time = qs('[data-hud-time]');
  const lens = qs('[data-hud-lens]');
  const progress = qs('[data-hud-progress]');
  const loaded = qs('[data-hud-loaded]');
  const buffer = qs('[data-hud-buffer]');
  const nav = qsa('[data-nav]');
  const clock = qs('.hud__group--end'); // the film's clock means nothing on the index
  const set = (el, v) => {
    if (el.textContent !== v) el.textContent = v;
  };
  let cur = '', since = 0, scene = '', boot = 0, dim = '';

  return (ctx) => {
    const now = performance.now();
    boot = Math.min(1, boot + ctx.dt * 1.4);
    const e = ctx.cam.eye;
    set(xyz, scramble(`x ${f4(e[0] / 10)}  y ${f4(-e[1] / 10)}  z ${f4(e[2] / 10)}`, boot));
    const onIndex = ctx.cover > 0.5;
    const L = onIndex ? 'INDEX' : labelAt(ctx.t).toUpperCase();
    if (L !== cur) {
      cur = L;
      since = now;
    }
    set(label, scramble(cur, Math.min(boot, (now - since) / 320)));
    set(time, `t ${ctx.shownT.toFixed(2).padStart(5, '0')} s`);
    const fov = (2 * Math.atan(ctx.world.W / 2 / ctx.cam.F) * 180) / Math.PI;
    set(lens, `fov ${fov.toFixed(0).padStart(3, '0')}°   f ${Math.round(ctx.cam.F)}`);
    progress.style.transform = `scaleX(${Math.max(0, ctx.progress).toFixed(4)})`;
    loaded.style.transform = `scaleX(${ctx.buffer.toFixed(3)})`;
    set(buffer, ctx.buffer < 0.999 ? `buf ${Math.round(ctx.buffer * 100)}%` : '');
    const fade = (1 - ctx.cover).toFixed(2);
    if (fade !== dim) {
      dim = fade;
      clock.style.opacity = fade;
      lens.style.opacity = fade;
    }
    // floors under the bars: the bottom one as soon as reading text comes up, the top one once it can reach it
    const b = document.body, rising = ctx.cover > 0.3, inside = ctx.cover > 0.98;
    if (rising !== b.hasAttribute('data-index-rising')) b.toggleAttribute('data-index-rising', rising);
    if (inside !== b.hasAttribute('data-on-index')) b.toggleAttribute('data-on-index', inside);
    const id = onIndex ? 'index' : sceneAt(ctx.t).id;
    if (id !== scene) {
      scene = id;
      for (const a of nav) a.toggleAttribute('aria-current', a.dataset.nav === id);
    }
  };
}
