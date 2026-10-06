/**
 * Soundscape, synthesized live with WebAudio and played by the scroll:
 *  - a detuned drone whose filter opens with scroll speed and changes colour per scene
 *  - air (filtered noise) that rises when the film moves fast
 *  - a kick on the bore's beat grid - scroll faster, the beat runs faster
 *  - impacts, pings, a riser and the drop whenever the playhead crosses a cue (either way)
 * On by default. Browsers only let audio start after a real gesture (click, key, tap - not the
 * wheel), so it is armed and starts with the first one. Switching it off is remembered.
 */
import { CUES, sceneAt } from '../film/world.js';
import { qs } from '../utils/dom.js';

const BEATS = [];
for (let b = 6.5; b < 16.7; b += 0.5) BEATS.push(+b.toFixed(2));
const TONE = { top: 420, about: 950, work: 620, skills: 760, contact: 340 };

export function createSound() {
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
  let master, drone, droneFilter, air, airFilter, wet, noise;

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
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    comp.connect(ac.destination);
    master = ac.createGain();
    master.gain.value = 0;
    master.connect(comp);
    const verb = ac.createConvolver();
    verb.buffer = impulse(3.2, 2.6);
    wet = ac.createGain();
    wet.gain.value = 0.3;
    wet.connect(verb).connect(master);

    // drone: A1 / E2 / A2, slightly detuned saws through a resonant low-pass
    droneFilter = ac.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 400;
    droneFilter.Q.value = 3.5;
    drone = ac.createGain();
    drone.gain.value = 0.12;
    droneFilter.connect(drone).connect(master);
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
    sub.connect(subG).connect(master);
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
    src.connect(airFilter).connect(air).connect(master);
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
  const HIT = {
    shock: (a) => { burst(0.5 * a, 1.4, 9000, 200); boom(0.6 * a); },
    pass: (a) => burst(0.35 * a, 0.8, 3000, 400),
    slam: (a) => { kick(1.2 * a); burst(0.45 * a, 0.5, 6000, 300); boom(0.4 * a, 70, 35, 0.6); },
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
  for (const type of ['pointerdown', 'keydown', 'touchend']) addEventListener(type, gesture, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!ac || !want) return;
    if (document.hidden) ac.suspend();
    else ac.resume();
  });
  render();

  return {
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
        for (const c of CUES) if (c.t > lo && c.t <= hi) HIT[c.kind]?.(c.amp);
        for (const b of BEATS) if (b > lo && b <= hi && !CUES.some((c) => Math.abs(c.t - b) < 0.05)) kick(0.7);
      }
      lastT = t;
    },
  };
}
