/**
 * Contact: after the implosion the wordmark forms in the film; the channel opens beneath it,
 * with the legal footer right under it - always above the bottom HUD, whatever the screen height.
 */
import { qs } from '../utils/dom.js';
import { IMPLODE_C } from '../film/world.js';
import { createScramble } from '../utils/scramble.js';
import { P, eOut, show } from './kit.js';

const GAP = 28; // between the contact block and the footer
const CLEAR = 14; // between the footer and the HUD
const REST = '"wght" 800,"wdth" 110,"opsz" 72';

export function createContact() {
  const block = qs('[data-contact]');
  const parts = [...block.children];
  const slogan = qs('.contact__slogan');
  const footer = qs('.scene--contact .site-footer');
  const hud = qs('[data-hud-bottom]');
  const email = qs('[data-profile-email]');
  const scramble = createScramble(email);
  const pt = [0, 0, 0, 0];
  // wide screens: the footer joins the bottom HUD bar, so the contact block keeps its full size
  const inHud = matchMedia('(min-width: 1400px) and (min-aspect-ratio: 17/20)');
  let played = false, dims = null;
  inHud.addEventListener('change', () => (dims = null));
  const remeasure = () => (dims = null);
  addEventListener('resize', remeasure);
  document.fonts?.ready.then(remeasure);

  return (ctx) => {
    const t = ctx.t;
    if (t < 46.9) {
      show(block, 0);
      show(footer, 0);
      played = false;
      return;
    }
    // measure the resting layout once: the slogan's animated width axis would wrap it while it lands
    if (!dims) {
      slogan.style.fontVariationSettings = REST;
      const below = !inHud.matches;
      dims = { block: block.offsetHeight, footer: below ? footer.offsetHeight + GAP : 0, hud: hud.getBoundingClientRect().top };
    }

    // under the particle wordmark; on short screens the block shrinks to fit above the HUD
    const q = ctx.proj(IMPLODE_C, pt);
    const want = q ? pt[1] + (ctx.fmt === 'p' ? 0.07 : 0.085) * ctx.world.H * ctx.fit.k : ctx.vh * 0.55;
    const room = dims.hud - CLEAR - dims.footer - want;
    const k = Math.max(0.8, Math.min(1, room / dims.block));
    const top = Math.round(Math.min(want, dims.hud - CLEAR - dims.footer - dims.block * k));
    block.style.setProperty('--top', `${top}px`);
    block.style.scale = k < 1 ? k.toFixed(3) : '';
    footer.style.setProperty('--top', `${Math.round(top + dims.block * k + GAP)}px`);

    parts.forEach((p, i) => {
      const k = eOut(P(t, 47.55 + i * 0.16, 48.3 + i * 0.16));
      show(p, k, `translate3d(0,${((1 - k) * 28).toFixed(1)}px,0)`);
    });
    const ks = eOut(P(t, 47.7, 48.6));
    slogan.style.fontVariationSettings = `"wght" ${(1000 - 200 * ks).toFixed(0)},"wdth" ${(128 - 18 * ks).toFixed(1)},"opsz" 72`;
    show(block, 1);
    show(footer, eOut(P(t, 48.6, 49.3)));
    if (t > 47.9 && !played) {
      played = true;
      scramble?.play();
    }
  };
}
