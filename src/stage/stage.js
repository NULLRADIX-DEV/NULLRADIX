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
import { createJump } from './jump.js';
import { createSpeedFx } from './speedfx.js';
import { f4 } from './hud.js';

const INTRO_KEY = 'nr-intro-seen';
const INDEX = { id: 'index', label: 'Index' }; // the page after the film: a jump target, not a scene
const OVER = 1.04; // cover overscan, room for parallax

export function createStage({ onStatus = () => {}, onFail = () => {}, onJump = () => {}, hold = Promise.resolve() } = {}) {
  const canvas = document.querySelector('[data-film]');
  const sections = [...document.querySelectorAll('[data-scene]')];
  const dossier = document.querySelector('[data-dossier]'); // the index after the film, in normal flow
  const fxLayer = document.querySelector('[data-film-fx]');
  const speedfx = fxLayer ? createSpeedFx(canvas, fxLayer) : null; // fast scrubbing: blur forwards, rewind back
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
  let indexTop = Infinity; // document y where the index begins
  let lastPlay = t, speed = 0, kick = 0, fxSpeed = true;
  const pointer = { x: vw / 2, y: vh / 2, nx: 0, ny: 0, tx: 0, ty: 0, inside: false, tilt: false };

  const scrollY = () => (lenis ? lenis.scroll : window.scrollY);
  const scrollT = () => map.toT(scrollY() / unit);

  /* ---------------- film ---------------- */
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
    if (dossier) indexTop = dossier.getBoundingClientRect().top + window.scrollY;
    lenis?.resize(); // its scroll limit must know the new height before anything scrolls
  }

  function scrollToY(y) {
    if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
    else window.scrollTo({ top: y, behavior: 'instant' });
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

  // tab clicks jump: collapse into the origin, lock onto the destination, open onto it (jump.js)
  const jump = createJump({ onPhase: onJump });
  const nextFrame = () => new Promise(requestAnimationFrame);
  let queued = null;
  // y: land on a document position instead of the film time (the index below the film)
  async function travel(target, sc, y = null) {
    if (intro) intro = null;
    if (jump.busy) return void (queued = [target, sc, y]); // a click mid-jump runs right after it
    if (y === null ? Math.abs(target - t) < 0.02 && scrollY() < indexTop - vh * 0.5 : Math.abs(scrollY() - y) < 4) return;
    lenis?.stop();
    const eye = world.cam(target).eye;
    await jump.run({
      text: (sc ? sc.label : W.labelAt(target)).toUpperCase(),
      xyz: `x ${f4(eye[0] / 10)}  y ${f4(-eye[1] / 10)}  z ${f4(eye[2] / 10)}`,
      land: () => {
        if (y === null) scrollToT(target, { immediate: true });
        else scrollToY(y);
        t = target;
      },
      ready: async () => {
        while (player && player.mode === 'webcodecs' && Math.abs(player.frame - target * W.FPS) > 1.01) await nextFrame();
      },
    });
    lenis?.start();
    if (queued) {
      const [nt, nsc, ny] = queued;
      queued = null;
      travel(nt, nsc, ny);
    }
  }

  /** jump to a scene (or 'index', 'main') through the lens; false if there is no such place */
  function gotoScene(id, { focus = true } = {}) {
    const sc = id === 'index' ? INDEX : W.SCENES.find((s) => s.id === id);
    if (!sc && id !== 'main') return false;
    if (sc === INDEX) travel(W.DUR, sc, indexTop);
    else travel(sc ? sc.anchorT : T0, sc);
    history.replaceState(null, '', `#${id}`);
    // move keyboard focus with the camera, so Tab continues inside that scene
    const heading = focus && document.querySelector(`#${sc ? sc.id : 'top'} :is(h1, h2)`);
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      selfFocus = true;
      heading.focus({ preventScroll: true });
      selfFocus = false;
    }
    return true;
  }

  // in-page links jump to the scene's anchor
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || e.defaultPrevented) return;
    if (gotoScene(a.getAttribute('href').slice(1))) e.preventDefault();
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
    pointer.inside = true;
    if (e.pointerType === 'touch') return; // a finger pushes particles; the parallax is the phone's tilt
    pointer.tx = (e.clientX / vw) * 2 - 1;
    pointer.ty = (e.clientY / vh) * 2 - 1;
  }, on);
  // phones: a finger on the glass pushes the particles too, also while it scrolls the page
  const touch = (e) => {
    const p = e.touches[0];
    if (!p) return;
    pointer.x = p.clientX;
    pointer.y = p.clientY;
    pointer.inside = true;
  };
  const untouch = (e) => {
    if (!e.touches.length) pointer.inside = false;
  };
  addEventListener('touchstart', touch, { passive: true, signal: listen.signal });
  addEventListener('touchmove', touch, { passive: true, signal: listen.signal });
  addEventListener('touchend', untouch, { passive: true, signal: listen.signal });
  addEventListener('touchcancel', untouch, { passive: true, signal: listen.signal });

  // and the film drifts with how the phone is held (relative to how it was held at first)
  let tiltBase = null;
  function onTilt(e) {
    if (e.beta == null || e.gamma == null) return;
    if (!tiltBase) tiltBase = { b: e.beta, g: e.gamma };
    tiltBase.b += (e.beta - tiltBase.b) * 0.004; // slowly settles on a new way of holding it
    tiltBase.g += (e.gamma - tiltBase.g) * 0.004;
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    pointer.tx = clamp((e.gamma - tiltBase.g) / 15);
    pointer.ty = clamp((e.beta - tiltBase.b) / 15);
    pointer.tilt = true;
  }
  /** call inside a user gesture (iOS asks for permission) */
  function enableTilt() {
    if (!coarse || typeof DeviceOrientationEvent === 'undefined') return;
    const go = () => addEventListener('deviceorientation', onTilt, on);
    const ask = DeviceOrientationEvent.requestPermission;
    if (typeof ask === 'function') ask.call(DeviceOrientationEvent).then((r) => r === 'granted' && go(), () => {});
    else go();
  }
  document.documentElement.addEventListener('pointerleave', (e) => {
    pointer.inside = false;
    if (e.pointerType !== 'touch') pointer.tx = pointer.ty = 0;
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
    if (hash === 'index') {
      const land = () => scrollToY(indexTop);
      land();
      if (document.readyState !== 'complete') addEventListener('load', () => requestAnimationFrame(land), { once: true, signal: listen.signal });
      t = W.DUR;
    } else if (sc && sc.id !== 'top') {
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
    progress: 0, buffer: 0, intro: false, playing: false, cover: 0, buried: false, speed: 0,
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
    if (!intro && !jump.busy) {
      target = scrollT();
      t += (target - t) * Math.min(1, dt * 14);
      if (Math.abs(target - t) < 1e-4) t = target;
    }
    // playhead speed in film seconds per second, signed; jumps and the intro are not motion
    const step = t - lastPlay;
    lastPlay = t;
    const v = intro || jump.busy || !dt || Math.abs(step) >= 1.5 ? 0 : step / dt;
    speed += (v - speed) * Math.min(1, dt * 12);
    if (Math.abs(speed) < 1e-3) speed = 0;
    kick = Math.max(0, kick - dt * 5);

    player?.setFrame(t * W.FPS);
    const shown = player && player.frame >= 0 ? player.frame / W.FPS : t;

    // parallax: the film drifts against the pointer; overscan hides the edges
    pointer.nx += (pointer.tx - pointer.nx) * Math.min(1, dt * 3);
    pointer.ny += (pointer.ty - pointer.ny) * Math.min(1, dt * 3);
    film.x = -pointer.nx * 12;
    film.y = -pointer.ny * 8;
    canvas.style.transform = `translate3d(${film.x.toFixed(2)}px,${film.y.toFixed(2)}px,0)`;
    speedfx?.render({ speed: fxSpeed ? speed : 0, kick: kick * kick, transform: canvas.style.transform });

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
    ctx.speed = speed;
    // how far the index has risen over the film: 0 below the viewport, 1 once its top reaches the top
    const rise = (scrollY() + vh - indexTop) / vh;
    ctx.cover = Math.max(0, Math.min(1, rise));
    ctx.buried = rise > 1.5; // the film is fully behind the index's opaque part
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
      return player ? player.frame : -1;
    },
    get mode() {
      return player ? player.mode : null;
    },
    get decodeFps() {
      return player ? player.decodeFps : 0;
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
    /** through the lens to any film time */
    goto(target) {
      travel(Math.max(T0, Math.min(W.DUR, target)), null);
    },
    gotoScene,
    enableTilt,
    /** a beat: the film breathes in once (decays by itself) */
    pulse(k = 1) {
      kick = Math.max(kick, Math.min(1, k));
    },
    /** the speed effects can be switched off (the terminal, tests) */
    set speedFx(on) {
      fxSpeed = !!on;
    },
    get jumping() {
      return jump.busy;
    },
    /** telemetry for the director's cut */
    get stats() {
      return {
        frame: player ? player.frame : -1,
        target: Math.round(t * W.FPS),
        decodeFps: player ? player.decodeFps : 0,
        mode: player ? `${player.mode} · fx ${speedfx ? speedfx.kind : 'off'}` : '-',
        gops: player ? player.cached : 0,
        buffer: player ? player.progress : 0,
        velocity: lenis ? lenis.velocity : 0,
        speed,
        pointer: { ...pointer },
        film: { ...film },
      };
    },
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
