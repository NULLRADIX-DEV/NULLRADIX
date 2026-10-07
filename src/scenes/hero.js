/**
 * Hero: the headline condenses out of the intro (variable axes slam from wide/heavy to the
 * resting cut), leans towards the cursor, and is squeezed out as the camera dives.
 * Its line breaks are those of the resting cut, fixed once measured: the wide letters of the intro
 * (and the cursor's bulge) must never re-wrap the sentence while it condenses.
 */
import { qs, qsa, el } from '../utils/dom.js';
import { P, eOut, eIO, lerp, show, splitChars } from './kit.js';

export function createHero() {
  const lines = qsa('.hero__title .line__inner');
  const chars = lines.map((l) => splitChars(l));
  const parts = qsa('[data-hero-part]');
  const cue = qs('[data-scroll-cue]');
  let rects = null;
  const measure = () => {
    rects = chars.map((cs) => cs.map((c) => {
      const r = c.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    }));
  };
  // measure where the resting cut wraps, then hold those breaks (the lines do not wrap by themselves)
  const title = qs('.hero__title');
  function lockBreaks() {
    title.classList.add('is-measuring'); // resting axes, free wrapping
    for (const line of lines) {
      for (const b of line.querySelectorAll('br.hero__br')) b.remove();
      let top = null;
      for (const w of line.querySelectorAll('.w')) {
        const y = w.offsetTop;
        if (top !== null && y > top + 2) line.insertBefore(el('br', { class: 'hero__br' }), w);
        top = y;
      }
    }
    title.classList.remove('is-measuring');
    rects = null;
  }
  document.fonts.ready.then(lockBreaks);
  let resizeT = 0;
  addEventListener('resize', () => {
    rects = null;
    clearTimeout(resizeT);
    resizeT = setTimeout(lockBreaks, 120);
  });

  return (ctx) => {
    const t = ctx.t;
    if (t > 6) {
      show(lines[0].closest('.hero'), 0);
      show(cue, 0);
      return;
    }
    show(lines[0].closest('.hero'), 1);
    const live = t > 2.95 && t < 4.2;
    if (live && !rects) measure();
    lines.forEach((line, j) => {
      const kin = eOut(P(t, 2.1 + j * 0.14, 2.95 + j * 0.14));
      const kout = eIO(P(t, 4.2 + j * 0.1, 5.1 + j * 0.1));
      line.style.transform = `translate3d(0,${(lerp(110, 0, kin) - 115 * kout).toFixed(2)}%,0)`;
      chars[j].forEach((c, i) => {
        const kc = eOut(P(t, 2.15 + j * 0.14 + i * 0.012, 2.95 + j * 0.14 + i * 0.012));
        let wght = lerp(1000, 640, kc), wdth = lerp(150, 78, kc);
        if (live && rects && ctx.pointer.inside) {
          const [cx, cy] = rects[j][i];
          const d = Math.hypot(ctx.pointer.x - cx, ctx.pointer.y - cy);
          const bump = Math.exp(-((d / 170) ** 2));
          wght += 300 * bump;
          wdth += 34 * bump;
        }
        wdth = lerp(wdth, 25, kout);
        const v = `"wght" ${wght.toFixed(0)},"wdth" ${wdth.toFixed(1)},"opsz" 144`;
        if (c._v !== v) {
          c._v = v;
          c.style.fontVariationSettings = v;
        }
      });
    });
    parts.forEach((p, i) => {
      const a = eOut(P(t, 2.55 + i * 0.12, 3.15 + i * 0.12)) * (1 - eIO(P(t, 3.9 + i * 0.05, 4.45 + i * 0.05)));
      show(p, a, `translate3d(0,${((1 - a) * 18).toFixed(1)}px,0)`);
    });
    show(cue, P(t, 2.9, 3.2) * (1 - P(t, 3.2, 3.6)));
  };
}
