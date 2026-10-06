/**
 * Small helpers for time-driven choreography. Content stays focusable while it is off-stage
 * (opacity, not visibility) so keyboard focus can pull the camera to it.
 */
export { P, sstep, eOut, eIO, eIn, lerp, clamp, c01 } from '../film/world.js';

/** fade/transform an element; a = 0..1 */
export function show(el, a, transform) {
  const on = a > 0.002;
  const op = on ? (a >= 0.999 ? '1' : a.toFixed(3)) : '0';
  if (el._op !== op) {
    el._op = op;
    el.style.opacity = op;
    el.style.pointerEvents = a > 0.6 ? 'auto' : 'none';
  }
  if (transform !== undefined && el._tf !== transform) {
    el._tf = transform;
    el.style.transform = transform;
  }
}

/** decorative element: hidden completely when off */
export function mark(el, a, x, y) {
  const on = a > 0.002;
  if (el._on !== on) {
    el._on = on;
    el.style.visibility = on ? 'visible' : 'hidden';
  }
  if (!on) return;
  el.style.opacity = a.toFixed(3);
  el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
}

/** wrap every character of a text node container in spans (keeps words together for wrapping) */
export function splitChars(node) {
  const text = node.textContent.trim();
  node.textContent = '';
  node.setAttribute('aria-label', text);
  const chars = [];
  text.split(' ').forEach((word, wi) => {
    if (wi) node.append(' ');
    const w = document.createElement('span');
    w.className = 'w';
    w.setAttribute('aria-hidden', 'true');
    for (const ch of word) {
      const c = document.createElement('span');
      c.className = 'ch';
      c.textContent = ch;
      w.append(c);
      chars.push(c);
    }
    node.append(w);
  });
  return chars;
}
