/**
 * Contact: after the implosion the wordmark forms in the film; the channel opens beneath it.
 */
import { qs } from '../utils/dom.js';
import { IMPLODE_C } from '../film/world.js';
import { createScramble } from '../utils/scramble.js';
import { P, eOut, show } from './kit.js';

export function createContact() {
  const block = qs('[data-contact]');
  const parts = [...block.children];
  const slogan = qs('.contact__slogan');
  const footer = qs('.scene--contact .site-footer');
  const email = qs('[data-profile-email]');
  const scramble = createScramble(email);
  const pt = [0, 0, 0, 0];
  let played = false;

  return (ctx) => {
    const t = ctx.t;
    // the block sits under the particle wordmark
    const q = ctx.proj(IMPLODE_C, pt);
    const top = q ? pt[1] + (ctx.fmt === 'p' ? 0.07 : 0.1) * ctx.world.H * ctx.fit.k : ctx.vh * 0.55;
    block.style.setProperty('--top', `${Math.round(top)}px`);
    parts.forEach((p, i) => {
      const k = eOut(P(t, 47.55 + i * 0.16, 48.3 + i * 0.16));
      show(p, k, `translate3d(0,${((1 - k) * 28).toFixed(1)}px,0)`);
    });
    const ks = eOut(P(t, 47.7, 48.6));
    slogan.style.fontVariationSettings = `"wght" ${(1000 - 200 * ks).toFixed(0)},"wdth" ${(150 - 40 * ks).toFixed(1)},"opsz" 72`;
    show(block, t > 46.9 ? 1 : 0);
    show(footer, eOut(P(t, 48.6, 49.3)));
    if (t > 47.9 && !played) {
      played = true;
      scramble?.play();
    } else if (t < 47.4) played = false;
  };
}
