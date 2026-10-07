/**
 * Soundscape, synthesized live with WebAudio and played by the scroll:
 *  - a detuned drone whose filter opens with scroll speed and changes colour per scene
 *  - air (filtered noise) that rises when the film moves fast
 *  - a kick on the bore's beat grid - scroll faster, the beat runs faster
 *  - impacts, pings, a riser and the drop whenever the playhead crosses a cue (either way); the four
 *    bore slams duck the bed and ring a step higher each
 *  - under the index (the page after the film) everything sounds muffled, as if from below
 *  - interface sounds (ticks, presses, typing, a tape rewind when the film runs back fast) on their
 *    own bus that the muffle does not touch
 * Visuals can listen: on() reports every hit as it plays, level/bands come from an analyser.
 * On by default. Browsers only let audio start after a real gesture (click, key, tap - not the
 * wheel), so it is armed and starts with the first one. Switching it off is remembered.
 */
import { CUES, SLAMS, sceneAt } from '../film/world.js';
import { qs } from '../utils/dom.js';

const BEATS = [];
for (let b = 6.5; b < 16.7; b += 0.5) BEATS.push(+b.toFixed(2));
const TONE = { top: 420, about: 950, work: 620, skills: 760, contact: 340 };
const SLAM_NOTES = [220, 261.63, 293.66, 329.63]; // Frontend, Backend, Mobile, Infrastructure
const BANDS = [[20, 140], [140, 600], [600, 2500], [2500, 9000]]; // Hz, for the visuals
const SILENT = [0, 0, 0, 0];

export function createSound({ arm = true } = {}) {
  const btn = qs('[data-sound]');
  const label = qs('[data-sound-label]');
  const KEY = 'nr-sound';
  let want = true;
  try {
    want = localStorage.getItem(KEY) !== '0';
  } catch {
    /* storage blocked: default on */
  }
  let ac = null, running = false, lastT = null;
  let master, bed, drone, droneFilter, air, airFilter, wet, noise, sat, under, page, lastCover = -1;
  let comp, uiBus, analyser, fbins, tbins;
  let level = 0, rewindAt = -1e9;
  const bands = [0, 0, 0, 0];
  const listeners = new Set();
  const emit = (kind, amp = 1) => {
    for (const fn of listeners) fn({ kind, amp });
  };

  function impulse(seconds, decay) {
    const len = Math.round(ac.sampleRate * seconds), buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function build() {
    ac = new AudioContext();
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    // soft clip after the compressor: linear up to 0.7, then bends into 1 - loud hits never crackle
    const clip = ac.createWaveShaper(), cc = new Float32Array(2049);
    for (let i = 0; i < cc.length; i++) {
      const x = (i / 1024 - 1) * 1.5, m = Math.abs(x);
      cc[i] = Math.sign(x) * (m < 0.7 ? m : 0.7 + 0.3 * Math.tanh((m - 0.7) / 0.3));
    }
    clip.curve = cc;
    const pre = ac.createGain(); // the curve spans +-1.5: scale into the shaper's +-1 input range
    pre.gain.value = 1 / 1.5;
    comp.connect(pre).connect(clip).connect(ac.destination);
    sat = new Float32Array(1024); // tanh drive: gives low hits harmonics small speakers can play
    for (let i = 0; i < sat.length; i++) sat[i] = Math.tanh(3 * (i / 511.5 - 1));
    master = ac.createGain();
    master.gain.value = 0;
    // the index rising over the film: everything sounds from under the page
    under = ac.createBiquadFilter();
    under.type = 'lowpass';
    under.frequency.value = 18000;
    under.Q.value = 0.5;
    page = ac.createGain();
    master.connect(under).connect(page).connect(comp);
    uiBus = ac.createGain(); // interface sounds: straight to the compressor, never muffled
    uiBus.connect(comp);
    // what visuals react to: the film's sound and the interface, before the muffle
    analyser = ac.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.55;
    analyser.minDecibels = -90;
    analyser.maxDecibels = -12; // the drone alone must not pin the low band
    master.connect(analyser);
    uiBus.connect(analyser);
    fbins = new Uint8Array(analyser.frequencyBinCount);
    tbins = new Float32Array(analyser.fftSize);
    const verb = ac.createConvolver();
    verb.buffer = impulse(3.2, 2.6);
    wet = ac.createGain();
    wet.gain.value = 0.3;
    wet.connect(verb).connect(master);
    bed = ac.createGain(); // drone, sub and air: the hits duck it
    bed.connect(master);

    // drone: A1 / E2 / A2, slightly detuned saws through a resonant low-pass
    droneFilter = ac.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 400;
    droneFilter.Q.value = 3.5;
    drone = ac.createGain();
    drone.gain.value = 0.12;
    droneFilter.connect(drone).connect(bed);
    drone.connect(wet);
    for (const [f, d] of [[55, -7], [55, 6], [82.41, 3], [110, -4]]) {
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = d;
      o.connect(droneFilter);
      o.start();
    }
    const sub = ac.createOscillator(), subG = ac.createGain();
    sub.frequency.value = 55;
    subG.gain.value = 0.16;
    sub.connect(subG).connect(bed);
    sub.start();

    // air: looped noise through a moving band-pass
    noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    airFilter = ac.createBiquadFilter();
    airFilter.type = 'bandpass';
    airFilter.frequency.value = 900;
    airFilter.Q.value = 0.8;
    air = ac.createGain();
    air.gain.value = 0;
    src.connect(airFilter).connect(air).connect(bed);
    air.connect(wet);
    src.start();
  }

  /* ---------------- one-shots ---------------- */
  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function kick(amp = 1) {
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    env(g, t, 0.004, 0.55 * amp, 0.32);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.4);
  }
  function burst(amp, dur, from, to) {
    const t = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noise;
    f.type = 'lowpass';
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    env(g, t, 0.005, amp, dur);
    s.connect(f).connect(g);
    g.connect(master);
    g.connect(wet);
    s.start(t);
    s.stop(t + dur + 0.1);
  }
  function boom(amp, from = 90, to = 28, dur = 1.2) {
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + dur);
    env(g, t, 0.006, amp, dur);
    o.connect(g).connect(master);
    g.connect(wet);
    o.start(t);
    o.stop(t + dur + 0.1);
  }
  function ping(amp) {
    const t = ac.currentTime;
    for (const [f, k] of [[1318.5, 1], [1975.5, 0.4]]) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      env(g, t, 0.003, 0.09 * amp * k, 0.9);
      o.connect(g);
      g.connect(wet);
      g.connect(master);
      o.start(t);
      o.stop(t + 1);
    }
  }
  function rise() {
    const t = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noise;
    s.loop = true;
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(6000, t + 1.4);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 1.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    s.connect(f).connect(g).connect(master);
    s.start(t);
    s.stop(t + 1.6);
  }
  function duck(depth, hold) {
    const t = ac.currentTime, g = bed.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(depth, t + 0.012);
    g.setTargetAtTime(1, t + hold, 0.18);
  }
  function snap(amp) {
    const t = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noise;
    f.type = 'highpass';
    f.frequency.value = 1800;
    env(g, t, 0.001, amp, 0.07);
    s.connect(f).connect(g).connect(master);
    s.start(t, Math.random());
    s.stop(t + 0.1);
  }
  function thump(amp) {
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(), sh = ac.createWaveShaper(), out = ac.createGain();
    o.frequency.setValueAtTime(240, t);
    o.frequency.exponentialRampToValueAtTime(52, t + 0.16);
    env(g, t, 0.002, 1, 0.3);
    sh.curve = sat;
    out.gain.value = amp;
    o.connect(g).connect(sh).connect(out).connect(master);
    o.start(t);
    o.stop(t + 0.35);
  }
  // struck metal: inharmonic partials, the high ones die first
  function clang(amp, f0) {
    const t = ac.currentTime;
    for (const [r, k, d] of [[1, 1, 0.9], [2, 0.5, 0.6], [2.76, 0.45, 0.5], [4.07, 0.25, 0.35], [5.4, 0.18, 0.25]]) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = f0 * r;
      env(g, t, 0.002, amp * k, d);
      o.connect(g);
      g.connect(master);
      g.connect(wet);
      o.start(t);
      o.stop(t + d + 0.05);
    }
  }
  /* ---------------- interface ---------------- */
  const lastUi = {};
  function tone(type, f0, f1, dur, amp, dest = uiBus, at = 0) {
    const t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, 0.002, amp, dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  function hiss(f, q, dur, amp, dest = uiBus) {
    const t = ac.currentTime, s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noise;
    fl.type = 'bandpass';
    fl.frequency.value = f;
    fl.Q.value = q;
    env(g, t, 0.001, amp, dur);
    s.connect(fl).connect(g).connect(dest);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  }
  // the tape running back: a squealing, wobbling sweep down
  function rewind() {
    const t = ac.currentTime, o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain();
    const f = ac.createBiquadFilter(), g = ac.createGain(), s = ac.createBufferSource(), nf = ac.createBiquadFilter(), ng = ac.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(1900, t);
    o.frequency.exponentialRampToValueAtTime(260, t + 0.55);
    lfo.frequency.value = 23;
    lg.gain.value = 70;
    lfo.connect(lg).connect(o.frequency);
    f.type = 'bandpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(2600, t);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.55);
    env(g, t, 0.02, 0.07, 0.55);
    o.connect(f).connect(g).connect(master);
    s.buffer = noise;
    nf.type = 'bandpass';
    nf.Q.value = 1.4;
    nf.frequency.setValueAtTime(5000, t);
    nf.frequency.exponentialRampToValueAtTime(900, t + 0.6);
    env(ng, t, 0.01, 0.16, 0.6);
    s.connect(nf).connect(ng).connect(master);
    for (const n of [o, lfo, s]) {
      n.start(t);
      n.stop(t + 0.7);
    }
  }
  const UI = {
    tick: [40, () => tone('sine', 3000 + Math.random() * 700, 2400, 0.03, 0.035)],
    press: [60, () => {
      tone('triangle', 1700, 1500, 0.025, 0.05);
      tone('triangle', 1150, 1000, 0.03, 0.045, uiBus, 0.035);
      tone('sine', 190, 90, 0.06, 0.08);
    }],
    type: [22, () => {
      hiss(2400 + Math.random() * 2400, 1.6, 0.025, 0.12);
      tone('square', 700 + Math.random() * 300, 500, 0.012, 0.012);
    }],
    enter: [80, () => {
      tone('sine', 880, 1320, 0.07, 0.06);
      tone('sine', 1760, 1760, 0.25, 0.025, uiBus, 0.06);
    }],
    whoosh: [150, () => {
      const t = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = noise;
      f.type = 'bandpass';
      f.Q.value = 1.2;
      f.frequency.setValueAtTime(350, t);
      f.frequency.exponentialRampToValueAtTime(3200, t + 0.35);
      f.frequency.exponentialRampToValueAtTime(500, t + 0.8);
      env(g, t, 0.12, 0.22, 0.7);
      s.connect(f).connect(g).connect(uiBus);
      g.connect(wet);
      s.start(t);
      s.stop(t + 1);
      tone('sine', 70, 40, 0.5, 0.12);
    }],
    power: [200, () => {
      tone('sine', 140, 900, 0.22, 0.07);
      tone('square', 2200, 2200, 0.015, 0.02, uiBus, 0.22);
    }],
    off: [200, () => tone('sine', 900, 120, 0.22, 0.06)],
    glitch: [300, () => {
      rewind();
      for (let i = 0; i < 5; i++) tone('square', 80 + Math.random() * 1800, 60, 0.05, 0.04, uiBus, i * 0.11);
    }],
  };
  function ui(kind) {
    if (!running || !UI[kind]) return;
    const [gap, play] = UI[kind], now = performance.now();
    if (now - (lastUi[kind] || 0) < gap) return;
    lastUi[kind] = now;
    play();
    emit(`ui:${kind}`);
  }

  const HIT = {
    shock: (a) => { burst(0.5 * a, 1.4, 9000, 200); boom(0.6 * a); },
    pass: (a) => burst(0.35 * a, 0.8, 3000, 400),
    slam: (a, c) => {
      duck(0.2, 0.14);
      snap(0.8 * a);
      thump(0.7 * a);
      kick(1.3 * a);
      clang(0.16 * a, SLAM_NOTES[SLAMS.indexOf(c.t)] ?? 260);
      burst(0.6 * a, 0.6, 7000, 300);
      boom(0.5 * a, 70, 35, 0.6);
    },
    burst: (a) => { burst(0.8 * a, 2.2, 12000, 120); boom(0.9 * a, 100, 24, 2); },
    ping: (a) => ping(a),
    rise: () => rise(),
    drop: (a) => { burst(0.9 * a, 2.6, 12000, 90); boom(1.0 * a, 120, 22, 2.6); kick(1.3); },
  };

  /* ---------------- control ---------------- */
  let fadeOut = 0, armedAt = -1e9;
  function render() {
    btn.setAttribute('aria-pressed', String(want));
    btn.toggleAttribute('data-running', running);
    label.textContent = want ? 'Sound on' : 'Sound off';
  }
  // start (needs a user gesture) or stop; stopping fades out, then lets the device sleep
  function apply() {
    clearTimeout(fadeOut);
    if (want) {
      if (!ac) build();
      ac.resume().then(() => {
        running = ac.state === 'running';
        render();
      });
      master.gain.setTargetAtTime(0.9, ac.currentTime, 0.3);
    } else if (ac) {
      master.gain.setTargetAtTime(0, ac.currentTime, 0.2);
      fadeOut = setTimeout(() => ac.suspend(), 900);
      running = false;
    }
    render();
  }
  btn.addEventListener('click', (e) => {
    // the first gesture may be this click: it starts the armed sound instead of switching it off
    if ((want && !running) || performance.now() - armedAt < 600) return want && apply();
    want = !want;
    try {
      localStorage.setItem(KEY, want ? '1' : '0');
    } catch {
      /* not remembered */
    }
    apply();
    e.stopPropagation();
  });
  const gesture = () => {
    if (!want || running) return;
    armedAt = performance.now();
    apply();
  };
  const listen = () => {
    for (const type of ['pointerdown', 'keydown', 'touchend']) addEventListener(type, gesture, { capture: true, passive: true });
  };
  if (arm) listen();
  document.addEventListener('visibilitychange', () => {
    if (!ac || !want) return;
    if (document.hidden) ac.suspend();
    else ac.resume();
  });
  render();

  return {
    get running() {
      return running;
    },
    /** 0..1, follows the loudness of what plays */
    get level() {
      return running ? level : 0;
    },
    /** 0..1 each: lows, low mids, mids, highs */
    get bands() {
      return running ? bands : SILENT;
    },
    /** every hit as it plays: fn({kind, amp}) - film cues, 'beat', 'rewind', 'ui:*', 'jump:*' */
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    ui,
    /** the scene jump: a whoosh into the origin, a lock-on ping, an impact as it opens */
    jump(phase) {
      if (!running) return;
      emit(`jump:${phase}`);
      if (phase === 'out') {
        burst(0.45, 0.5, 9000, 260);
        boom(0.35, 320, 60, 0.45);
      } else if (phase === 'lock') ping(0.7);
      else if (phase === 'in') {
        burst(0.5, 1.2, 11000, 140);
        boom(0.6, 95, 26, 1.1);
      }
    },
    /** called inside the entrance click: that gesture is what lets the audio start */
    enter(withSound) {
      want = withSound;
      armedAt = performance.now();
      apply();
      listen();
    },
    update(ctx) {
      const t = ctx.t;
      if (!running) {
        lastT = t;
        return;
      }
      const dt = Math.max(1e-3, ctx.dt);
      const speed = lastT === null ? 0 : Math.abs(t - lastT) / dt; // film seconds per second
      const now = ac.currentTime;
      const base = TONE[sceneAt(t).id] || 500;
      droneFilter.frequency.setTargetAtTime(base * (1 + Math.min(3, speed) * 0.55), now, 0.12);
      air.gain.setTargetAtTime(Math.min(0.22, speed * 0.05), now, 0.1);
      airFilter.frequency.setTargetAtTime(600 + Math.min(4, speed) * 1400, now, 0.1);
      // crossings: small steps only - a nav jump across the film should not fire everything at once
      if (lastT !== null && t !== lastT && Math.abs(t - lastT) < 1.5) {
        const lo = Math.min(t, lastT), hi = Math.max(t, lastT);
        for (const c of CUES)
          if (c.t > lo && c.t <= hi) {
            HIT[c.kind]?.(c.amp, c);
            emit(c.kind, c.amp);
          }
        for (const b of BEATS)
          if (b > lo && b <= hi && !CUES.some((c) => Math.abs(c.t - b) < 0.05)) {
            kick(0.7);
            emit('beat', 0.7);
          }
      }
      lastT = t;
      // running back fast: the tape rewinds, once per gesture
      const wall = performance.now();
      if (ctx.speed < -2.5) {
        if (wall - rewindAt > 800 && ctx.cover < 0.5) {
          rewind();
          emit('rewind');
        }
        rewindAt = wall;
      }
      // levels for the visuals: rms of what plays, energy in four bands
      analyser.getFloatTimeDomainData(tbins);
      let sum = 0;
      for (let i = 0; i < tbins.length; i++) sum += tbins[i] * tbins[i];
      const rms = Math.min(1, Math.sqrt(sum / tbins.length) * 3);
      level += (rms - level) * (rms > level ? 0.6 : 0.12);
      analyser.getByteFrequencyData(fbins);
      const hz = ac.sampleRate / analyser.fftSize;
      BANDS.forEach(([a, b], k) => {
        let m = 0, n = 0;
        for (let i = Math.max(1, Math.floor(a / hz)); i < Math.min(fbins.length, Math.ceil(b / hz)); i++, n++) m += fbins[i];
        const v = n ? m / n / 255 : 0;
        bands[k] += (v - bands[k]) * (v > bands[k] ? 0.7 : 0.15);
      });
      const cover = Math.round(ctx.cover * 100) / 100;
      if (cover !== lastCover) {
        lastCover = cover;
        under.frequency.setTargetAtTime(18000 * Math.pow(700 / 18000, cover), now, 0.15);
        page.gain.setTargetAtTime(1 - 0.5 * cover, now, 0.15);
      }
    },
  };
}
