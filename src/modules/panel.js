import { qs, qsa, el } from '../utils/dom.js';
import { projects } from '../data/content.js';

/** Raw status → display label; the dot + uppercasing live in CSS. */
const STATUS_LABEL = { live: 'Live', wip: 'In Progress', archived: 'Archived' };

/** Shared project detail dialog. */
export function createPanel({ onOpen = () => {}, onClose = () => {} } = {}) {
  const root = qs('[data-panel]');
  const card = qs('[data-panel-card]', root);
  let lastFocus = null;
  let closeTimer = 0;
  let typers = [];
  let currentIndex = 0; // 0-based index into `projects`

  /** Cancel any in-flight typewriters, snapping their text to the final string. */
  function clearTypers() {
    for (const cancel of typers) cancel();
    typers = [];
  }

  /**
   * Reveal `text` in `node` character-by-character. Every glyph is laid out
   * up-front (hidden), so the box keeps its final size - no reflow, no jump,
   * and the open-from-click origin measures against the real height.
   */
  function typeText(node, text, delay, duration) {
    text = text ?? '';
    // opacity-only reveal (no movement) → safe to run even under reduced motion
    if (!text) {
      node.textContent = text;
      return;
    }
    const spans = [...text].map((ch) => {
      const s = el('span', {}, ch);
      s.style.opacity = '0';
      return s;
    });
    node.replaceChildren(...spans);

    let start = 0;
    let rafId = 0;
    const timer = setTimeout(() => {
      const step = (now) => {
        start ||= now;
        const p = Math.min((now - start) / duration, 1);
        const shown = Math.round(p * spans.length);
        for (let i = 0; i < shown; i++) spans[i].style.opacity = '1';
        if (p < 1) rafId = requestAnimationFrame(step);
      };
      rafId = requestAnimationFrame(step);
    }, delay);

    typers.push(() => {
      clearTimeout(timer);
      cancelAnimationFrame(rafId);
      node.textContent = text;
    });
  }

  /** Point the card's transform-origin at the clicked element so it grows out of it. */
  function setOrigin(source) {
    if (!source) {
      card.style.removeProperty('--ox');
      card.style.removeProperty('--oy');
      return;
    }
    // measure the card at its resting (untransformed) box
    card.style.transform = 'none';
    const c = card.getBoundingClientRect();
    card.style.transform = '';
    const s = source.getBoundingClientRect();
    card.style.setProperty('--ox', `${s.left + s.width / 2 - c.left}px`);
    card.style.setProperty('--oy', `${s.top + s.height / 2 - c.top}px`);
  }

  /** Label a prev/next button with its target project. */
  function setNav(btn, project) {
    const nameEl = qs('.panel__nav-name', btn);
    if (nameEl) nameEl.textContent = project.name;
    btn.setAttribute('aria-label', `View ${project.name}`);
  }

  /** Populate the card from `projects[currentIndex]` and cascade the reveal. */
  function render() {
    clearTypers();
    const project = projects[currentIndex];
    const total = String(projects.length).padStart(2, '0');
    const num = String(currentIndex + 1).padStart(2, '0');

    // the four typed fields cascade out as the card lands (status now has its own badge)
    typeText(qs('[data-panel-index]', root), num, 60, 200);
    qs('[data-panel-total]', root).textContent = `/ ${total}`; // constant, not typed
    typeText(qs('[data-panel-title]', root), project.name, 140, 320);
    typeText(qs('[data-panel-meta]', root), String(project.year), 300, 220);
    typeText(qs('[data-panel-blurb]', root), project.blurb, 360, 520);

    const status = qs('[data-panel-status]', root);
    if (project.status && STATUS_LABEL[project.status]) {
      status.hidden = false;
      status.dataset.status = project.status;
      status.textContent = STATUS_LABEL[project.status];
    } else {
      status.hidden = true;
      status.removeAttribute('data-status');
      status.textContent = '';
    }

    qs('[data-panel-tech]', root).replaceChildren(
      ...project.tech.map((t) => el('li', { class: 'tag' }, t))
    );
    qs('[data-panel-links]', root).replaceChildren(
      ...Object.entries(project.links || {}).map(([k, href]) =>
        el('a', { class: 'btn', href, target: '_blank', rel: 'noopener' }, labelFor(k))
      )
    );

    const n = projects.length;
    setNav(qs('[data-panel-prev]', root), projects[(currentIndex - 1 + n) % n]);
    setNav(qs('[data-panel-next]', root), projects[(currentIndex + 1) % n]);
  }

  /** Step to another project without closing - re-types the text, keeps the card in place. */
  function go(delta) {
    const n = projects.length;
    currentIndex = (currentIndex + delta + n) % n;
    render();
  }

  function open(project, index, source) {
    clearTimeout(closeTimer);
    lastFocus = document.activeElement;

    const zero = Number.isFinite(index) ? index - 1 : projects.indexOf(project);
    currentIndex = zero >= 0 ? zero : 0;
    render();

    root.hidden = false;
    document.body.style.overflow = 'hidden';
    onOpen();
    setOrigin(source); // grow-from-click only on the initial open, not on nav
    void root.offsetWidth; // commit the closed state, then transition into the open one
    root.classList.add('is-open');
    card.focus({ preventScroll: true });
    document.addEventListener('keydown', onKey);
  }

  function close() {
    if (root.hidden || !root.classList.contains('is-open')) return;
    clearTypers();
    root.classList.remove('is-open');
    document.body.style.overflow = '';
    onClose();
    document.removeEventListener('keydown', onKey);
    lastFocus?.focus?.();
    closeTimer = setTimeout(() => {
      root.hidden = true;
    }, 420); // hold for the close transition (matches --dur-modal) before removing from view
  }

  function onKey(e) {
    if (e.key === 'Escape') return close();
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      return go(-1);
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      return go(1);
    }
    if (e.key === 'Tab') {
      const f = qsa('a, button, [tabindex]:not([tabindex="-1"])', root).filter(
        (n) => !n.hasAttribute('disabled') && n.offsetParent !== null
      );
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  qsa('[data-panel-close]', root).forEach((b) => b.addEventListener('click', close));
  qs('[data-panel-prev]', root).addEventListener('click', () => go(-1));
  qs('[data-panel-next]', root).addEventListener('click', () => go(1));

  return { open, close };
}

function labelFor(key) {
  return { live: 'Live ↗', repo: 'Repository ↗', docs: 'Docs ↗' }[key] || key + ' ↗';
}
