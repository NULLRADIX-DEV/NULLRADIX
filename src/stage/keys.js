/**
 * One keyboard router for the film's shortcuts (terminal, director's cut, the wordmark that listens
 * at the end). Handlers run in the order they were added; the first one that returns true takes
 * the key. Nothing fires while the entrance gate or the case dialog is up, or while a text field
 * has focus - those own the keyboard.
 */
const handlers = [];

export function onKey(fn) {
  handlers.push(fn);
}

/** a key that types something: one printable character (AltGr combos included) */
export const printable = (e) => e.key.length === 1 && !e.metaKey && !(e.ctrlKey && !e.altKey); // AltGr = ctrl+alt

export function keyboardTaken() {
  const a = document.activeElement;
  return (
    document.documentElement.classList.contains('is-gated') ||
    !document.querySelector('[data-panel]')?.hidden ||
    (a && (a.matches('input, textarea, select') || a.isContentEditable))
  );
}

addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.isComposing || keyboardTaken()) return;
  for (const h of handlers) {
    if (h(e)) {
      e.preventDefault();
      return;
    }
  }
});
