/**
 * The jump between scenes (tab clicks). Three beats:
 *  1. collapse - the film rushes forward and blurs while an iris with a glowing rim closes onto the origin
 *  2. lock-on  - on black, the crosshair holds; the destination's name and coordinates decode, a signal
 *                line runs out. This beat lasts exactly as long as the destination frame needs to decode.
 *  3. open     - the iris opens from the centre, the new scene lands from a slight zoom and the copy
 *                returns with a settling chromatic split.
 */
import { qs } from '../utils/dom.js';
import { eIn, eOut, sstep } from '../film/world.js';

const GLYPHS = '01#/<>+*=_';
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function tween(ms, fn) {
  return new Promise((done) => {
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      fn(k);
      if (k < 1) requestAnimationFrame(step);
      else done();
    };
    requestAnimationFrame(step);
  });
}

export function createJump({ onPhase = () => {} } = {}) {
  const el = qs('[data-jump]');
  const label = qs('[data-jump-label]', el);
  const coords = qs('[data-jump-coords]', el);
  const root = document.documentElement;
  const set = (k, v) => root.style.setProperty(k, v);
  let busy = false;

  /** text: destination name; xyz: its camera coordinates; land(): cut to it; ready(): resolves once it shows */
  async function run({ text, xyz, land, ready }) {
    if (busy) return;
    busy = true;
    const R = Math.hypot(innerWidth, innerHeight) / 2 + 60;
    label.textContent = '';
    coords.textContent = '';
    el.classList.remove('is-locked', 'is-opening');
    el.hidden = false;
    root.classList.add('is-jumping');

    // 1. collapse into the origin
    onPhase('out');
    await tween(430, (k) => {
      const e = eIn(k);
      set('--jr', `${(R * (1 - e)).toFixed(1)}px`);
      set('--jz', (1 + 0.2 * e).toFixed(4));
      set('--jb', `${(7 * e).toFixed(2)}px`);
    });
    set('--jr', '0px');
    land();

    // 2. lock onto the destination
    el.classList.add('is-locked');
    onPhase('lock');
    await Promise.all([
      tween(420, (k) => {
        label.textContent = scramble(text, k);
        coords.textContent = scramble(xyz, Math.min(1, k * 1.15));
      }),
      Promise.race([ready(), sleep(2500)]),
    ]);
    label.textContent = text;
    coords.textContent = xyz;

    // 3. open onto the new scene
    onPhase('in');
    el.classList.add('is-opening');
    await tween(680, (k) => {
      const e = eOut(k);
      set('--jr', `${(R * e).toFixed(1)}px`);
      set('--jz', (1.14 - 0.14 * e).toFixed(4));
      set('--jb', `${(5 * (1 - e)).toFixed(2)}px`);
      set('--jm', sstep(0.4, 0.95, k).toFixed(3));
      set('--cj', (10 * (1 - sstep(0.4, 1, k))).toFixed(2));
    });

    root.classList.remove('is-jumping');
    el.hidden = true;
    for (const p of ['--jr', '--jz', '--jb', '--jm', '--cj']) root.style.removeProperty(p);
    busy = false;
  }

  return {
    run,
    get busy() {
      return busy;
    },
  };
}
