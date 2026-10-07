/**
 * Going to another page of the site through the lens: the iris closes here, the destination's name
 * is handed over in sessionStorage, and the next page (whose inline head script keeps it closed from
 * the first paint) locks on and opens. Modifier clicks, new tabs and downloads go the normal way.
 */
import { createJump } from '../stage/jump.js';

const KEY = 'nr-iris';
const NAMES = { '/': 'Origin', '/index.html': 'Origin', '/impressum.html': 'Impressum', '/datenschutz.html': 'Datenschutz', '/404.html': 'Nowhere' };
const HASHES = { about: 'How I work', work: 'Selected work', skills: 'Stack', contact: 'Open channel', index: 'Index' };

// a stable pseudo-coordinate for a path
function coordOf(path) {
  let h = 0;
  for (const ch of path) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const f = (v) => (v < 0 ? '-' : '+') + String(Math.abs(v) % 10000).padStart(4, '0');
  return `x ${f(h % 4096)}  y ${f((h >> 12) % 4096)}  z ${f((h >> 20) % 2048)}`;
}

/** the destination's name for the lens */
export function nameOf(url) {
  const hash = url.hash.slice(1);
  return (HASHES[hash] || NAMES[url.pathname] || url.pathname.replace(/^\/|\.html$/g, '') || 'Origin').toUpperCase();
}

/** the page that was just left through the lens, if any (read once) */
export function takeArrival() {
  try {
    const v = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

export function wirePageJumps({ onPhase } = {}) {
  const jump = createJump({ onPhase });
  document.addEventListener('click', async (e) => {
    const a = e.target.closest?.('a[href]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target && a.target !== '_self') return;
    if (a.hasAttribute('download') || a.getAttribute('href').startsWith('#') || a.protocol === 'mailto:') return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
    e.preventDefault();
    const text = nameOf(url);
    if (!(await jump.leave())) return;
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ text, xyz: coordOf(url.pathname + url.hash) }));
    } catch {
      /* no handover: the next page simply opens */
    }
    location.href = url.href;
  });
  // back to a page that is still closed (back/forward cache): open it again
  addEventListener('pageshow', (e) => e.persisted && jump.reset());
  return jump;
}

export { coordOf };
