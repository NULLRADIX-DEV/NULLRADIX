/**
 * Shared "decode" flourish. `scrambleString(final, t)` returns the title at
 * progress t (0..1): glyphs flicker through random characters and lock in
 * left→right, so t=0 is fully scrambled and t>=1 is the final text.
 * `createScramble(el)` binds it to a DOM node (used by the experience headings).
 */
import { sfx } from './sfx.js';

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&/<>*+=-';

export const SCRAMBLE_MS = 360;

export function scrambleString(final, t) {
  let out = '';
  for (let i = 0; i < final.length; i++) {
    const ch = final[i];
    if (ch === ' ' || t >= (i + 1) / final.length) out += ch;
    else out += GLYPHS[(Math.random() * GLYPHS.length) | 0];
  }
  return out;
}

/**
 * Bind the decode flourish to a DOM element. `play()` runs it once: width is
 * pinned for the run so nothing reflows, and the final text is always restored.
 */
export function createScramble(elm) {
  if (!elm) return null;
  const finalText = elm.textContent;
  let raf = 0;
  let start = 0;
  let locked = 0;

  function frame(now) {
    if (!start) start = now;
    const t = Math.min(1, (now - start) / SCRAMBLE_MS);
    elm.textContent = scrambleString(finalText, t);
    // a key strike each time a glyph locks in (every other one: it is fast)
    const n = Math.floor(t * finalText.length);
    if (n > locked) {
      if (n >> 1 !== locked >> 1) sfx('type');
      locked = n;
    }
    if (t < 1) {
      raf = requestAnimationFrame(frame);
    } else {
      elm.textContent = finalText;
      elm.style.width = '';
      elm.style.display = '';
      elm.style.whiteSpace = '';
    }
  }

  return {
    play() {
      cancelAnimationFrame(raf);
      elm.style.display = 'inline-block';
      elm.style.whiteSpace = 'nowrap'; // wider random glyphs must never wrap to a 2nd line
      elm.style.width = `${elm.offsetWidth}px`; // pin width before scrambling
      start = 0;
      locked = 0;
      raf = requestAnimationFrame(frame);
    },
  };
}
