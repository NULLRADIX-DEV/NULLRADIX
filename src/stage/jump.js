/**
 * The lens - jumps between scenes (tab clicks) and between pages. Three beats:
 *  1. collapse - the film rushes forward and blurs while an iris with a glowing rim closes onto the origin
 *  2. lock-on  - on black, the crosshair holds; the destination's name and coordinates decode, a signal
 *                line runs out. This beat lasts exactly as long as the destination frame needs to decode.
 *  3. open     - the iris opens from the centre, the new scene lands from a slight zoom and the copy
 *                returns with a settling chromatic split.
 * Between pages the old page collapses and the new one locks on and opens (arrive).
 */
import { qs } from '../utils/dom.js';
import { eIn, eOut, sstep } from '../utils/ease.js';

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
  const radius = () => Math.hypot(innerWidth, innerHeight) / 2 + 60;
  let busy = false;

  function begin() {
    label.textContent = '';
    coords.textContent = '';
    el.classList.remove('is-locked', 'is-opening');
    el.hidden = false;
    root.classList.add('is-jumping');
  }

  async function collapse() {
    const R = radius();
    onPhase('out');
    await tween(430, (k) => {
      const e = eIn(k);
      set('--jr', `${(R * (1 - e)).toFixed(1)}px`);
      set('--jz', (1 + 0.2 * e).toFixed(4));
      set('--jb', `${(7 * e).toFixed(2)}px`);
    });
    set('--jr', '0px');
  }

  async function lock(text, xyz, ready) {
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
  }

  async function open() {
    const R = radius();
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
    reset();
  }

  /** back to no lens at all (also when a page comes back from the back/forward cache) */
  function reset() {
    root.classList.remove('is-jumping', 'is-arriving');
    el.hidden = true;
    el.classList.remove('is-locked', 'is-opening');
    for (const p of ['--jr', '--jz', '--jb', '--jm', '--cj']) root.style.removeProperty(p);
    busy = false;
  }

  return {
    /** a scene jump - text: destination name; xyz: its coordinates; land(): cut to it; ready(): resolves once it shows */
    async run({ text, xyz, land, ready }) {
      if (busy) return;
      busy = true;
      begin();
      await collapse();
      land();
      await lock(text, xyz, ready);
      await open();
    },
    /** leaving the page: close the lens and stay closed (the next page opens it) */
    async leave() {
      if (busy) return false;
      busy = true;
      begin();
      await collapse();
      return true;
    },
    /** arriving on a page that was left through the lens: lock on, then open */
    async arrive({ text, xyz, ready = () => Promise.resolve() }) {
      busy = true;
      begin();
      set('--jr', '0px');
      root.classList.remove('is-arriving'); // the inline style takes over from the pre-paint class
      await lock(text, xyz, ready);
      await open();
    },
    reset,
    get busy() {
      return busy;
    },
  };
}
