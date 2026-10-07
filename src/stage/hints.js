/**
 * Hints for what is hidden in the film: once per session, a small card above the HUD says that
 * there is a terminal (when the film starts moving) and a director's cut (at the first project).
 * The matching key chip in the HUD pulses while it shows; a click on the card does the thing.
 */
import { qs } from '../utils/dom.js';
import { sfx } from '../utils/sfx.js';

const KEY = 'nr-hints';
const SHOW_MS = 9000;

export function createHints({ terminal, cut }) {
  const root = qs('[data-hint]');
  const keyEl = qs('[data-hint-key]');
  const text = qs('[data-hint-text]');
  const coarse = matchMedia('(pointer: coarse)').matches;
  let seen = [];
  try {
    seen = JSON.parse(sessionStorage.getItem(KEY) || '[]');
  } catch {
    /* every visit then */
  }
  const HINTS = [
    {
      id: 'term',
      at: (ctx) => ctx.t >= 5.2 && ctx.t < 44,
      key: coarse ? '>_' : '^',
      text: coarse ? 'Psst - this site has a terminal. Tap >_ below and type help.' : 'Psst - this site has a terminal. Press ^ and type help.',
      chip: '[data-term-open]',
      go: () => terminal.open(),
    },
    {
      id: 'cut',
      at: (ctx) => !coarse && ctx.t >= 19.6 && ctx.t < 44, // a keyboard thing: not on touch screens
      key: 'D',
      text: "Press D for the director's cut - the machinery behind the film.",
      chip: '[data-cut-open]',
      go: () => cut.toggle(),
    },
  ];
  let current = null, timer = 0, rest = 0;

  function show(h) {
    current = h;
    seen.push(h.id);
    try {
      sessionStorage.setItem(KEY, JSON.stringify(seen));
    } catch {
      /* not remembered */
    }
    keyEl.textContent = h.key;
    text.textContent = h.text;
    root.hidden = false;
    requestAnimationFrame(() => root.classList.add('is-in'));
    qs(h.chip)?.classList.add('is-calling');
    sfx('enter');
    timer = setTimeout(hide, SHOW_MS);
  }
  function hide() {
    if (!current) return;
    clearTimeout(timer);
    qs(current.chip)?.classList.remove('is-calling');
    root.classList.remove('is-in');
    setTimeout(() => !root.classList.contains('is-in') && (root.hidden = true), 320);
    current = null;
    rest = performance.now() + 4000; // a breath before the next one
  }
  qs('[data-hint-go]').addEventListener('click', () => {
    const h = current;
    hide();
    h?.go();
  });
  qs('[data-hint-close]').addEventListener('click', hide);

  return (ctx) => {
    if (current) {
      if (terminal.isOpen || cut.on || ctx.cover > 0.3 || ctx.t > 46) hide(); // the end has its own hint
      return;
    }
    if (ctx.intro || terminal.isOpen || cut.on || ctx.cover > 0.3 || performance.now() < rest) return;
    const next = HINTS.find((h) => !seen.includes(h.id) && h.at(ctx));
    if (next) show(next);
  };
}
