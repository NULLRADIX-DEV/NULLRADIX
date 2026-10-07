/**
 * Interface sounds without a dependency on the sound engine: modules call sfx('tick'), main.js
 * binds it to the engine once it exists. Unbound (static mode, sound off) it does nothing.
 */
let out = () => {};

export const sfx = (kind) => out(kind);

export function bindSfx(fn) {
  out = fn;
}
