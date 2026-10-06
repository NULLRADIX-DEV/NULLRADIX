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
  // a half-resolution proxy decodes ~4x faster: tab flights run on it, landings switch back to full res
  const proxyCanvas = document.querySelector('[data-film-proxy]');
  let proxy = null, proxyReady = false;
  function mountProxy() {
    proxy?.destroy();
    proxyReady = false;
    if (!proxyCanvas || player?.mode !== 'webcodecs') return (proxy = null);
    const q = createPlayer({ canvas: proxyCanvas, base: `/film/${fmt}/proxy/`, over: OVER, software: true });
    proxy = q;
    q.ready.then(
      () => {
        if (proxy !== q) return;
        q.resize(vw, vh, devicePixelRatio);
        proxyReady = true;
      },
      () => proxy === q && ((proxy = null), q.destroy()), // no proxy: flights use the full film, slower
    );
  }

  function mountPlayer() {
    player?.destroy();
    const p = createPlayer({
      canvas,
      base: `/film/${fmt}/`,
      over: OVER,
      // desktops decode on CPU threads: no per-frame GPU copies competing with the compositor
      software: !coarse && (navigator.hardwareConcurrency || 4) >= 6,
      onStatus: (s) => {
        if (player !== p) return; // a replaced player keeps quiet
        onStatus(s, p);
        if (s === 'failed') fail();
      },
    });
    player = p;
    p.ready.then(
      () => {
        if (player !== p) return;
        p.resize(vw, vh, devicePixelRatio);
        mountProxy();
      },
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
    if (flight) land();
    if (lenis) {
      const dist = Math.abs(target - t);
      // immediate jumps also land while scrolling is held (entrance, open dialog)
      lenis.scrollTo(y, { immediate, force: immediate, duration: Math.min(3.2, 0.9 + dist * 0.06), easing: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2) });
    } else window.scrollTo({ top: y, behavior: immediate ? 'instant' : 'smooth' });
  }

  // tab clicks fly the camera the whole way: accelerate, glide, brake - never faster than frames decode,
  // so every frame on the way is shown in order and the page stays locked to it. Flights run on the
  // half-resolution proxy (decodes ~4x faster) and land on the full-quality frame.
  let flight = null;
  const stageEl = canvas.parentElement;
  function travel(target) {
    if (intro) intro = null;
    if (Math.abs(target - t) < 0.02) return;
    const viaProxy = !!(proxy && proxyReady);
    // the proxy takes over only once it shows the very frame we are on (armed), never a stale one
    flight = { to: target, v: 0, dir: Math.sign(target - t), src: viaProxy ? proxy : player, armed: !viaProxy };
    lenis?.stop();
    flight.src?.setLookahead(4);
  }
  function land() {
    flight?.src?.setLookahead(1);
    flight = null;
    stageEl.classList.remove('is-flying');
    lenis?.start();
  }
  // any input of the visitor's own takes the controls back
  for (const type of ['wheel', 'touchstart', 'keydown'])
    addEventListener(type, (e) => flight && !(type === 'keydown' && e.key === 'Tab') && land(), { ...on, passive: true });
  const ACCEL = 3.2; // film seconds per second²
  function fly(dt) {
    if (!flight.armed) return; // hold until the proxy shows this frame
    dt = Math.min(dt, 1 / 40); // a hitch slows the flight down for a moment instead of skipping ahead
    const src = flight.src;
    const rate = src && src.decodeFps ? src.decodeFps : src === proxy ? 240 : 90; // decoded frames per second
    const vmax = Math.min(8, Math.max(1.5, (0.8 * rate) / W.FPS)); // film seconds per second
    const remaining = Math.abs(flight.to - t);
    const vWant = Math.min(vmax, Math.sqrt(2 * ACCEL * remaining) + 0.15);
    flight.v += Math.max(-ACCEL * 2 * dt, Math.min(ACCEL * dt, vWant - flight.v));
    let next = t + flight.v * dt * flight.dir;
    if ((flight.to - next) * flight.dir <= 0) next = flight.to;
    // frame pacing: hold until the frames we are about to show are decoded
    if (src && src.mode === 'webcodecs') {
      const f = next * W.FPS, f0 = Math.floor(f), f1 = Math.min(f0 + 1, Math.round(flight.to * W.FPS));
      if (!src.has(f0) || (f - f0 > 0.02 && !src.has(f1))) {
        next = t;
        flight.v *= 0.92;
      }
    }
    t = next;
    const y = map.toV(t) * unit; // the scrollbar travels along
    if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
    else window.scrollTo(0, y);
    if (t === flight.to) land();
  }

  // in-page links fly the camera to the scene's anchor
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || e.defaultPrevented) return;
    const id = a.getAttribute('href').slice(1);
    const sc = W.SCENES.find((s) => s.id === id);
    if (!sc && id !== 'main') return;
    e.preventDefault();
    travel(sc ? sc.anchorT : T0);
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
      if (flight) land();
      proxy?.destroy();
      proxy = null;
      mountPlayer();
    } else {
      player?.resize(vw, vh, devicePixelRatio);
      if (proxyReady) proxy.resize(vw, vh, devicePixelRatio);
    }
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
    if (flight) fly(dt);
    else if (!intro) {
      target = scrollT();
      t += (target - t) * Math.min(1, dt * 14);
      if (Math.abs(target - t) < 1e-4) t = target;
    }

    if (flight && !flight.armed) {
      proxy.setFrame(t * W.FPS);
      if (Math.abs(proxy.frame - t * W.FPS) < 0.75) {
        flight.armed = true;
        player?.setFrame(flight.to * W.FPS); // decode the landing frame in full quality meanwhile
        stageEl.classList.add('is-flying');
      }
    }
    const src = flight && flight.armed && flight.src === proxy ? proxy : player;
    src?.setFrame(t * W.FPS);
    const shown = src && src.frame >= 0 ? src.frame / W.FPS : t;

    // parallax: the film drifts against the pointer; overscan hides the edges
    pointer.nx += (pointer.tx - pointer.nx) * Math.min(1, dt * 3);
    pointer.ny += (pointer.ty - pointer.ny) * Math.min(1, dt * 3);
    film.x = -pointer.nx * 12;
    film.y = -pointer.ny * 8;
    canvas.style.transform = `translate3d(${film.x.toFixed(2)}px,${film.y.toFixed(2)}px,0)`;
    if (proxyCanvas) proxyCanvas.style.transform = canvas.style.transform;

    // everything on the page follows the frame that is actually on screen, never the target ahead of it
    ctx.t = shown;
    ctx.targetT = t;
    ctx.shownT = shown;
    ctx.cam = world.cam(shown);
    ctx.world = world;
    ctx.fit = fit;
    ctx.vw = vw;
    ctx.vh = vh;
    ctx.fmt = fmt;
    ctx.impact = W.impactAt(shown);
    ctx.progress = (shown - T0) / (W.DUR - T0);
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
    get sceneT() {
      return ctx.t;
    },
    get frame() {
      const src = flight && flight.armed && flight.src ? flight.src : player; // the frame actually on screen
      return src ? src.frame : -1;
    },
    get mode() {
      return player ? player.mode : null;
    },
    get decodeFps() {
      const src = flight && flight.src ? flight.src : player;
      return src ? src.decodeFps : 0;
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
      proxy?.destroy();
      sections.forEach((s) => (s.style.height = ''));
      canvas.style.transform = '';
    },
  };
}
