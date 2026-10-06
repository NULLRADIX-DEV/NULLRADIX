/**
 * The entrance. Browsers only allow sound after a real gesture, so the film starts behind a
 * single "Enter": that click unlocks the audio and starts the intro in the same moment.
 * The film keeps loading underneath; the origin crosshair here hands over to the film's own.
 */
import { qs } from '../utils/dom.js';

export function createGate({ onEnter }) {
  const el = qs('[data-gate]');
  const enter = qs('[data-gate-enter]', el);
  const mute = qs('[data-gate-mute]', el);
  const load = qs('[data-gate-load]', el);
  const fill = qs('.gate__fill', el);
  const root = document.documentElement;
  let open = true, resolve;
  const done = new Promise((r) => (resolve = r));

  el.hidden = false;
  root.classList.add('is-gated');
  requestAnimationFrame(() => enter.focus({ preventScroll: true }));

  function go(withSound) {
    if (!open) return;
    open = false;
    onEnter(withSound); // synchronous: the click is what lets the audio start
    el.classList.add('is-leaving');
    root.classList.remove('is-gated');
    setTimeout(() => (el.hidden = true), 1100);
    resolve(withSound);
  }
  enter.addEventListener('click', () => go(true));
  mute.addEventListener('click', () => go(false));

  return {
    done,
    update(ctx) {
      if (!open) return;
      const p = Math.max(0, Math.min(1, ctx.buffer));
      fill.style.transform = `scaleX(${p.toFixed(3)})`;
      const txt = p < 0.999 ? `Loading ${Math.round(p * 100)}%` : 'Ready';
      if (load.textContent !== txt) load.textContent = txt;
    },
  };
}
