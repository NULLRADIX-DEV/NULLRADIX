/**
 * The wordmark listens: once NULLRADIX has formed at the end, whatever the visitor types becomes the
 * particles (swarm.js does the flying). Backspace edits, Esc - or a few quiet seconds - brings the
 * wordmark back. On touch screens a tap on the wordmark opens the keyboard through a hidden input.
 */
import { qs } from '../utils/dom.js';
import { sfx } from '../utils/sfx.js';
import { onKey, printable } from '../stage/keys.js';
import { show } from './kit.js';

const MAX = 14;
const IDLE = 8000; // ms without a key: back to the wordmark
const CHARS = /^[\p{L}\p{N} .,!?&@#+*'-]$/u;

export function createWordplay(swarm) {
  const hint = qs('[data-wordplay]');
  const hintText = qs('[data-wordplay-text]');
  const input = qs('[data-wordplay-input]');
  const coarse = matchMedia('(pointer: coarse)').matches;
  const hud = qs('[data-hud]');
  let buf = '', timer = 0, idle = 0, shown = '', floor = 0;
  const measure = () => (floor = hud.getBoundingClientRect().bottom + 6);
  addEventListener('resize', measure);
  measure();

  function commit() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const was = swarm.word;
      swarm.morph(buf);
      if (swarm.word !== was && (buf === '' || was === 'NULLRADIX')) sfx('whoosh');
    }, 120);
    clearTimeout(idle);
    if (buf) idle = setTimeout(() => set(''), IDLE);
  }
  function set(next) {
    next = next.slice(0, MAX);
    if (next === buf) return;
    buf = next;
    if (input && input.value !== buf) input.value = buf;
    commit();
  }

  onKey((e) => {
    if (!swarm.live) return false;
    if (e.key === 'Escape') {
      if (!buf) return false;
      set('');
      return true;
    }
    if (e.key === 'Backspace') {
      if (!buf) return false;
      set(buf.slice(0, -1));
      sfx('type');
      return true;
    }
    if (!printable(e) || !CHARS.test(e.key)) return false;
    if (e.key === ' ' && !buf) return false; // nothing typed yet: space still scrolls
    set(buf + e.key);
    sfx('type');
    swarm.flare(0.8);
    return true;
  });

  // touch: a tap on the wordmark brings up the keyboard
  if (input) {
    input.addEventListener('input', () => {
      set(input.value.replace(/[^\p{L}\p{N} .,!?&@#+*'-]/gu, ''));
      sfx('type');
      swarm.flare(0.8);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') input.blur();
    });
    document.addEventListener('click', (e) => {
      if (!swarm.live || e.target.closest('a, button, input')) return;
      const b = swarm.box;
      if (e.clientX < b.x0 - 20 || e.clientX > b.x1 + 20 || e.clientY < b.y0 - 20 || e.clientY > b.y1 + 20) return;
      input.focus({ preventScroll: true });
    });
  }

  // the hint above the wordmark, only where there is room for it
  return () => {
    const live = swarm.live;
    const want = !live ? '' : buf ? 'Esc to reset' : coarse ? 'Tap the wordmark to type' : 'Type anything';
    if (want && want !== shown) hintText.textContent = want;
    shown = want || shown;
    const top = swarm.box.y0 - 34;
    const room = top >= floor;
    show(hint, live && room ? 1 : 0, `translate3d(${((swarm.box.x0 + swarm.box.x1) / 2).toFixed(0)}px,${top.toFixed(0)}px,0) translateX(-50%)`);
    if (!live && buf && swarm.word === 'NULLRADIX') buf = ''; // the film took the wordmark back
  };
}
