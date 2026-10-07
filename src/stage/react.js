/**
 * The picture follows the sound: the HUD equaliser shows the real bands, the film breathes in on
 * the bore's beat and every slam, and a 'pulse' (how far the sound jumps above its running level)
 * lights up the particles and the cursor. With the sound off everything stays still.
 */
import { qs, qsa } from '../utils/dom.js';

const HITS = { beat: 0.55, slam: 1, shock: 0.8, burst: 0.8, drop: 1 };

export function createReactive({ sound, stage }) {
  const box = qs('.hud__eq');
  const bars = qsa('.hud__eq i');
  const root = document.documentElement;
  const state = { pulse: 0 };
  let avg = 0, pulse = 0, live = false, shown = '';
  const bandAvg = bars.map(() => 0);

  sound.on(({ kind }) => {
    if (HITS[kind]) stage.pulse(HITS[kind]);
  });

  function update(ctx) {
    const on = sound.running;
    if (on !== live) {
      live = on;
      box?.classList.toggle('is-live', on);
      if (!on) for (const b of bars) b.style.transform = '';
    }
    const lv = sound.level;
    avg += (lv - avg) * Math.min(1, ctx.dt * 0.6);
    pulse = Math.max(Math.max(0, Math.min(1, (lv - avg) * 4)), pulse - ctx.dt * 3);
    state.pulse = on ? pulse : 0;
    if (on) {
      // each bar: a little of its band's level, mostly how far it moves away from its own average
      const b = sound.bands, ease = Math.min(1, ctx.dt * 0.7);
      bars.forEach((el, k) => {
        const v = b[k] ?? 0;
        bandAvg[k] += (v - bandAvg[k]) * ease;
        const h = Math.max(0.12, Math.min(1, 0.2 + v * 0.45 + (v - bandAvg[k]) * 3.5));
        el.style.transform = `scaleY(${h.toFixed(2)})`;
      });
    }
    const p = state.pulse.toFixed(2);
    if (p !== shown) root.style.setProperty('--pulse', (shown = p));
  }

  return { update, state };
}
