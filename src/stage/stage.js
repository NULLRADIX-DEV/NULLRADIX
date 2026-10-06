/**
 * The stage: scroll position -> film time -> film frame + everything anchored into it.
 *
 * Sections are tall spacers (their heights come from SCROLL_KEYS), their content lives in fixed
 * layers. Every frame: read scroll, ease the film time towards it, show the matching frame and
 * hand all subscribers a context with the camera of the frame that is actually on screen.
 */
import Lenis from 'lenis';
import * as W from '../film/world.js';
import { createPlayer } from '../film/player.js';
import { coverFit, toScreen, pickFormat } from './cover.js';
import { makeScrollMap } from './scrollmap.js';

const INTRO_KEY = 'nr-intro-seen';
const OVER = 1.04; // cover overscan, room for parallax

export function createStage({ onStatus = () => {}, onFail = () => {}, hold = Promise.resolve() } = {}) {
  const canvas = document.querySelector('[data-film]');
  const sections = [...document.querySelectorAll('[data-scene]')];
  const map = makeScrollMap(W.SCROLL_KEYS);
  const T0 = W.SCROLL_KEYS[0][0];
  const coarse = matchMedia('(pointer: coarse)').matches;
  const lenis = coarse ? null : new Lenis({ autoRaf: false, lerp: 0.085, wheelMultiplier: 0.85 });
  const subs = [];
  const listen = new AbortController(); // every listener goes away with the stage
  const on = { signal: listen.signal };
  // the layout viewport: without the classic scrollbar, exactly what the fixed canvas covers
  const viewW = () => document.documentElement.clientWidth;
  const viewH = () => document.documentElement.clientHeight;

  let vw = viewW(), vh = viewH(), unit = vh, lastW = vw;
  let fmt = pickFormat(vw, vh);
  let world = W.makeWorld(fmt);
  let fit = coverFit(vw, vh, world.W, world.H, OVER);
  let player = null;
  let t = T0, intro = null, raf = 0, last = 0, failed = false, selfFocus = false;
  const pointer = { x: vw / 2, y: vh / 2, nx: 0, ny: 0, tx: 0, ty: 0, inside: false };

  const scrollY = () => (lenis ? lenis.scroll : window.scrollY);
  const scrollT = () => map.toT(scrollY() / unit);

  /* ---------------- film ---------------- */
  function mountPlayer() {
    player?.destroy();
    const p = createPlayer({
      canvas,
      base: `/film/${fmt}/`,
      over: OVER,
      onStatus: (s) => {
        if (player !== p) return; // a replaced player keeps quiet
        onStatus(s, p);
        if (s === 'failed') fail();
      },
    });
    player = p;
    p.ready.then(
      () => player === p && p.resize(vw, vh, devicePixelRatio),
      (e) => {
        if (player !== p) return;
        console.warn('film unavailable', e);
        fail();
      },
    );
  }
  function fail() {
    if (failed) return;
    failed = true;
    onFail();
  }

  /* ---------------- scroll geometry ---------------- */
  function layout() {
    sections.forEach((s, i) => {
      const sc = W.SCENES.find((x) => x.id === s.dataset.scene);
      const v0 = map.toV(Math.max(sc.t0, T0)), v1 = map.toV(sc.t1);
      const extra = i === sections.length - 1 ? unit : 0;
      s.style.height = `${Math.round((v1 - v0) * unit + extra)}px`;
    });
    lenis?.resize(); // its scroll limit must know the new height before anything scrolls
  }

  function scrollToT(target, { immediate = false } = {}) {
    const y = map.toV(target) * unit;
    if (intro) intro = null;
    if (lenis) {
      const dist = Math.abs(target - t);
      // immediate jumps also land while scrolling is held (entrance, open dialog)
      lenis.scrollTo(y, { immediate, force: immediate, duration: Math.min(3.2, 0.9 + dist * 0.06), easing: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2) });
    } else window.scrollTo({ top: y, behavior: immediate ? 'instant' : 'smooth' });
  }

  // in-page links fly the camera to the scene's anchor
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || e.defaultPrevented) return;
    const id = a.getAttribute('href').slice(1);
    const sc = W.SCENES.find((s) => s.id === id);
    if (!sc && id !== 'main') return;
    e.preventDefault();
    scrollToT(sc ? sc.anchorT : T0);
    history.replaceState(null, '', `#${id}`);
    // move keyboard focus with the camera, so Tab continues inside that scene
    const heading = document.querySelector(`#${sc ? sc.id : 'top'} :is(h1, h2)`);
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      selfFocus = true;
      heading.focus({ preventScroll: true });
      selfFocus = false;
    }
  }, on);

  // keyboard focus inside a scene that is not on screen: bring the camera there
  document.addEventListener('focusin', (e) => {
    if (selfFocus || !e.target.matches(':focus-visible')) return; // mouse clicks focus too - leave those alone
    const host = e.target.closest('[data-focus-t], [data-scene]');
    if (!host || e.target.closest('.hud, .panel')) return;
    const ft = host.dataset.focusT ? +host.dataset.focusT : W.SCENES.find((s) => s.id === host.dataset.scene)?.anchorT;
    if (ft != null && Math.abs(ft - t) > 0.5) scrollToT(ft, { immediate: true });
  }, on);

  addEventListener('pointermove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.tx = (e.clientX / vw) * 2 - 1;
    pointer.ty = (e.clientY / vh) * 2 - 1;
    pointer.inside = true;
  }, on);
  document.documentElement.addEventListener('pointerleave', () => {
    pointer.inside = false;
    pointer.tx = pointer.ty = 0;
  }, on);

  // the fixed stage is the viewport minus scrollbars: watching it also catches the scrollbar appearing
  const ro = new ResizeObserver(() => onResize());
  ro.observe(canvas.parentElement);
  function onResize() {
    if (viewW() === vw && viewH() === vh) return;
    const keep = intro ? null : scrollT(); // where the scroll is, not where the eased playhead lags
    vw = viewW();
    vh = viewH();
    // on touch screens the address bar changes the height while scrolling - only re-measure on real resizes
    const newUnit = !coarse || vw !== lastW ? vh : unit;
    lastW = vw;
    const nf = pickFormat(vw, vh);
    if (nf !== fmt) {
      fmt = nf;
      world = W.makeWorld(fmt);
      mountPlayer();
    } else player?.resize(vw, vh, devicePixelRatio);
    fit = coverFit(vw, vh, world.W, world.H, OVER);
    if (newUnit !== unit) {
      unit = newUnit;
      layout();
      if (keep !== null) scrollToT(keep, { immediate: true });
    }
  }

  /* ---------------- intro ---------------- */
  function startIntro() {
    let seen = false;
    try {
      seen = sessionStorage.getItem(INTRO_KEY) === '1';
      sessionStorage.setItem(INTRO_KEY, '1');
    } catch {
      /* private mode: always play */
    }
    const hash = location.hash.slice(1);
    const sc = W.SCENES.find((s) => s.id === hash);
    if (sc && sc.id !== 'top') {
      // the browser jumps to the #fragment itself once the page has loaded; land on the anchor after that
      const land = () => scrollToT(sc.anchorT, { immediate: true });
      land();
      if (document.readyState !== 'complete') addEventListener('load', () => requestAnimationFrame(land), { once: true, signal: listen.signal });
      t = sc.anchorT;
    } else if (seen || scrollY() > 4) t = scrollT();
    else {
      // the clock starts once the first segment is decoded; until then hold the black first frame
      intro = { start: null, y0: scrollY() };
      t = 0;
      Promise.all([player.ready, hold]).then(() => intro && (intro.start = performance.now()), () => {});
    }
  }

  /* ---------------- frame loop ---------------- */
  const film = { x: 0, y: 0 };
  const ctx = {
    t, shownT: t, cam: null, world, fit, vw, vh, fmt, pointer, impact: null,
    progress: 0, buffer: 0, intro: false, playing: false,
    proj(p, out = [0, 0, 0, 0]) {
      const r = world.proj(ctx.cam, p);
      if (r[2] < 40) return null;
      const [x, y] = toScreen(fit, r[0] + ctx.impact.sx, r[1] + ctx.impact.sy);
      out[0] = x + film.x;
      out[1] = y + film.y;
      out[2] = r[2];
      out[3] = (ctx.cam.F / r[2]) * fit.k; // CSS px per world unit at that depth
      return out;
    },
  };

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - (last || now)) / 1000);
    last = now;
    lenis?.raf(now);

    let target;
    if (intro) {
      const ti = intro.start === null ? 0 : (now - intro.start) / 1000;
      if (ti >= T0 || Math.abs(scrollY() - intro.y0) > 4) intro = null;
      target = intro ? ti : scrollT();
      if (intro) t = target;
    }
    if (!intro) {
      target = scrollT();
      t += (target - t) * Math.min(1, dt * 14);
      if (Math.abs(target - t) < 1e-4) t = target;
    }

    player?.setFrame(t * W.FPS);
    const shown = player && player.frame >= 0 ? player.frame / W.FPS : t;

    // parallax: the film drifts against the pointer; overscan hides the edges
    pointer.nx += (pointer.tx - pointer.nx) * Math.min(1, dt * 3);
    pointer.ny += (pointer.ty - pointer.ny) * Math.min(1, dt * 3);
    film.x = -pointer.nx * 12;
    film.y = -pointer.ny * 8;
    canvas.style.transform = `translate3d(${film.x.toFixed(2)}px,${film.y.toFixed(2)}px,0)`;

    ctx.t = t;
    ctx.shownT = shown;
    ctx.cam = world.cam(shown);
    ctx.world = world;
    ctx.fit = fit;
    ctx.vw = vw;
    ctx.vh = vh;
    ctx.fmt = fmt;
    ctx.impact = W.impactAt(shown);
    ctx.progress = (t - T0) / (W.DUR - T0);
    ctx.buffer = player ? player.progress : 0;
    ctx.intro = !!intro;
    ctx.film = film;
    ctx.dt = dt;
    for (const fn of subs) fn(ctx);
  }

  layout();
  mountPlayer();

  return {
    get t() {
      return t;
    },
    get frame() {
      return player ? player.frame : -1;
    },
    get mode() {
      return player ? player.mode : null;
    },
    ready: () => player.ready,
    start() {
      startIntro();
      raf = requestAnimationFrame(frame);
    },
    add(fn) {
      subs.push(fn);
    },
    scrollToT,
    pause() {
      lenis?.stop();
    },
    resume() {
      lenis?.start();
    },
    destroy() {
      listen.abort();
      ro.disconnect();
      cancelAnimationFrame(raf);
      lenis?.destroy();
      player?.destroy();
      sections.forEach((s) => (s.style.height = ''));
      canvas.style.transform = '';
    },
  };
}
