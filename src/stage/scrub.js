/**
 * The progress bar as a timeline, like a video player's: chapter marks for the scenes (and small
 * ones for the projects and the bore's slams), a preview of the frame under the pointer from the
 * film's thumbnail sheet, a click that jumps there through the lens, a drag that scrubs the film
 * live, and the keyboard (arrows: a second, page up/down: a scene, home/end).
 */
import * as W from '../film/world.js';
import { qs, el } from '../utils/dom.js';
import { sfx } from '../utils/sfx.js';

const T0 = W.SCROLL_KEYS[0][0];
const span = W.DUR - T0;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createScrub({ stage }) {
  const root = qs('[data-scrub]');
  if (!root) return () => {};
  const bar = root.querySelector('.hud__bar');
  const marks = qs('[data-scrub-marks]');
  const tip = qs('[data-scrub-tip]');
  const thumb = qs('[data-scrub-thumb]');
  const label = qs('[data-scrub-label]');
  const fine = matchMedia('(pointer: fine)').matches;
  let drag = null, hoverT = null, sheet = '', lastScene = '', shownT = -1;

  // chapter marks: scenes tall, project stops and slams short
  const at = (t) => `${(((Math.max(T0, t) - T0) / span) * 100).toFixed(3)}%`;
  marks.replaceChildren(
    ...W.SCENES.map((s) => el('i', { class: 'scrub__mark', style: `left:${at(s.t0)}` })),
    ...W.STOPS.map((s) => el('i', { class: 'scrub__mark scrub__mark--minor', style: `left:${at(s.tHold)}` })),
    ...W.SLAMS.map((t) => el('i', { class: 'scrub__mark scrub__mark--minor', style: `left:${at(t)}` })),
  );

  const tAt = (x) => {
    const r = bar.getBoundingClientRect();
    return T0 + clamp((x - r.left) / r.width, 0, 1) * span;
  };

  function preview(x, t) {
    const r = root.getBoundingClientRect();
    const th = stage.manifest?.thumbs;
    if (th) {
      const url = `/film/${stage.fmt}/${th.url}`;
      if (url !== sheet) {
        sheet = url;
        thumb.style.backgroundImage = `url(${url})`;
        thumb.style.width = `${th.w}px`;
        thumb.style.height = `${th.h}px`;
      }
      const i = clamp(Math.floor(t / th.every), 0, th.count - 1);
      thumb.style.backgroundPosition = `-${(i % th.cols) * th.w}px -${Math.floor(i / th.cols) * th.h}px`;
    }
    label.textContent = `${W.labelAt(t)}  ·  t ${t.toFixed(1)} s`;
    // keep the preview on screen
    const half = Math.max(tip.offsetWidth, th ? th.w : 0) / 2;
    const vx = clamp(x, half + 8, innerWidth - half - 8);
    tip.style.left = `${vx - r.left}px`;
    root.classList.add('is-hover');
    const id = W.sceneAt(t).id;
    if (id !== lastScene) {
      if (lastScene) sfx('tick'); // crossing into another chapter
      lastScene = id;
    }
    hoverT = t;
  }
  const leave = () => {
    root.classList.remove('is-hover');
    hoverT = null;
    lastScene = '';
  };

  root.addEventListener('pointermove', (e) => {
    const t = tAt(e.clientX);
    if (drag) {
      if (!drag.moved && Math.abs(e.clientX - drag.x) > 4) drag.moved = true;
      if (drag.moved) stage.scrollToT(t, { immediate: true }); // scrubbing, like a video
    }
    if (fine || drag) preview(e.clientX, t);
  });
  root.addEventListener('pointerleave', () => !drag && leave());
  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    root.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, moved: false };
    e.preventDefault();
  });
  const end = (e) => {
    if (!drag) return;
    const wasDrag = drag.moved;
    drag = null;
    if (!wasDrag && e.type === 'pointerup') stage.goto(tAt(e.clientX)); // a click: through the lens
    if (!fine || !root.matches(':hover')) leave();
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);

  root.addEventListener('keydown', (e) => {
    const t = stage.t;
    const scenes = W.SCENES.map((s) => Math.max(T0, s.anchorT));
    let to = null, lens = false;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') to = t + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') to = t - 1;
    else if (e.key === 'PageDown') (to = scenes.find((s) => s > t + 0.1) ?? W.DUR), (lens = true);
    else if (e.key === 'PageUp') (to = [...scenes].reverse().find((s) => s < t - 0.1) ?? T0), (lens = true);
    else if (e.key === 'Home') (to = T0), (lens = true);
    else if (e.key === 'End') (to = W.DUR), (lens = true);
    if (to === null) return;
    e.preventDefault();
    to = clamp(to, T0, W.DUR);
    if (lens) stage.goto(to);
    else stage.scrollToT(to, { immediate: true });
  });

  return (ctx) => {
    const t = Math.round(ctx.t * 10) / 10;
    if (t !== shownT) {
      shownT = t;
      root.setAttribute('aria-valuenow', t.toFixed(1));
      root.setAttribute('aria-valuetext', `${W.labelAt(t)}, ${t.toFixed(1)} seconds`);
    }
  };
}
