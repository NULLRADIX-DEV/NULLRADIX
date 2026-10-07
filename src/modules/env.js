/**
 * Capability snapshot + render mode.
 *  mode: 'film'   - the scroll-scrubbed film with the live layer
 *        'static' - stacked page on film stills (reduced motion, Save-Data, no support)
 * Overrides: ?motion=1 forces the film, ?motion=0 forces static. A choice made with
 * the in-page "Play film" button is kept for the session.
 */

const OVERRIDE_KEY = 'nr-motion';

/** pure: decide the render mode from capabilities and an optional override ('1' | '0' | null) */
export function resolveMode({ reducedMotion, saveData, override, filmSupported }) {
  if (!filmSupported) return 'static';
  if (override === '1') return 'film';
  if (override === '0') return 'static';
  return reducedMotion || saveData ? 'static' : 'film';
}

function readOverride() {
  const q = new URLSearchParams(location.search).get('motion');
  if (q === '1' || q === '0') return q;
  try {
    return sessionStorage.getItem(OVERRIDE_KEY);
  } catch {
    return null;
  }
}

/** remember a motion choice for this session (used by the HUD toggle) */
export function setMotionOverride(value) {
  try {
    sessionStorage.setItem(OVERRIDE_KEY, value);
  } catch {
    /* storage blocked - the choice simply won't survive a reload */
  }
}

function snapshot() {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarsePointer = matchMedia('(pointer: coarse)').matches;
  const saveData = navigator.connection?.saveData === true;
  const filmSupported =
    typeof createImageBitmap === 'function' && typeof HTMLCanvasElement !== 'undefined';
  const mode = resolveMode({ reducedMotion, saveData, override: readOverride(), filmSupported });
  return { reducedMotion, coarsePointer, saveData, filmSupported, mode };
}

export const env = typeof window === 'undefined' ? null : snapshot();
