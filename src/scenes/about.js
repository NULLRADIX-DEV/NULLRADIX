/**
 * About, inside the code bore: the lead lights up word by word, then each principle slams in
 * on its film impact - heavy and wide, settling into the resting cut - and is blown past.
 */
import { qs, qsa } from '../utils/dom.js';
import { SLAMS } from '../film/world.js';
import { P, eOut, eIO, lerp, show } from './kit.js';

export function createAbout() {
  const block = qs('[data-about]');
  const parts = [...block.children];
  const words = qsa('[data-about-lead] .word');
  const items = qsa('[data-principles] .principle');
  const ends = SLAMS.map((s, i) => (SLAMS[i + 1] ?? 16.25) - 0.35);

  return (ctx) => {
    const t = ctx.t;
    // lead
    const out = eIO(P(t, 9.55, 9.95));
    parts.forEach((p, i) => {
      const a = eOut(P(t, 7.55 + i * 0.1, 8.15 + i * 0.1)) * (1 - out);
      show(p, a, `translate3d(0,${((1 - eOut(P(t, 7.55 + i * 0.1, 8.15 + i * 0.1))) * 40 - out * 30).toFixed(1)}px,0)`);
    });
    const fill = P(t, 8.15, 9.45) * words.length;
    words.forEach((w, i) => {
      const k = Math.min(1, Math.max(0, fill - i));
      const o = (0.16 + 0.84 * k).toFixed(3);
      if (w._o !== o) {
        w._o = o;
        w.style.opacity = o;
      }
    });
    // principles
    items.forEach((li, i) => {
      const s = SLAMS[i], u = t - s;
      if (u < -0.02 || t > ends[i] + 0.4) {
        show(li, 0);
        return;
      }
      const k = eOut(P(u, 0, 0.22)), kw = eOut(P(u, 0, 0.55));
      const ke = P(t, ends[i] - 0.05, ends[i] + 0.35);
      const word = li.querySelector('.principle__k');
      word.style.fontVariationSettings = `"wght" ${lerp(1000, 760, kw).toFixed(0)},"wdth" ${lerp(150, 80, k).toFixed(1)},"opsz" 144`;
      word.style.letterSpacing = `${lerp(0.12, -0.035, k).toFixed(3)}em`;
      word.style.transform = `scale(${(lerp(1.55, 1, k) * (1 + 0.35 * ke)).toFixed(4)})`;
      const desc = eOut(P(u, 0.2, 0.65));
      li.querySelector('.principle__v').style.opacity = desc.toFixed(3);
      li.querySelector('.principle__v').style.transform = `translate3d(0,${((1 - desc) * 16).toFixed(1)}px,0)`;
      li.querySelector('.principle__n').style.opacity = desc.toFixed(3);
      show(li, Math.min(1, u / 0.035) * (1 - ke));
    });
  };
}
