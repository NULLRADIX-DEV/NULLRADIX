/* GENERATED - do not edit. Source: NULLRADIX_Videos/nullradix-video-kit/work/site-film/world.js
   Change it there and run `python make.py --sync`. */
/*
 * NULLRADIX - The Film: shared world.
 *
 * Single source of truth for the film engine (renders the frames) and the website (match-moves
 * its DOM into the same camera). Edit here, then `python make.py --sync` copies it into the site.
 * Pure ES module, no DOM access: it must run in Node (tests), the browser and the capture page.
 *
 * Conventions: world y points DOWN (up is -y), the camera looks along +f, screen = CX + sx + F*x/z.
 */

/* ---------------- math ---------------- */
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const c01 = (v) => clamp(v, 0, 1);
export const lerp = (a, b, k) => a + (b - a) * k;
export const P = (t, a, b) => c01((t - a) / (b - a));
export const sstep = (a, b, v) => {
  const k = c01((v - a) / (b - a));
  return k * k * (3 - 2 * k);
};
function bez(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x, d = dx(t);
      if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    return sy(clamp(t, 0, 1));
  };
}
export const eOut = bez(0.2, 1, 0.3, 1);
export const eIO = bez(0.65, 0, 0.35, 1);
export const eIn = (k) => k * k * k;
export const rnd = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
};
export const frac = (x) => x - Math.floor(x);
export const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
export const nrm3 = (a) => mul3(a, 1 / (len3(a) || 1));
export const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const lerp3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
// column-major 4x4, same layout as CSS matrix3d()
export const I4 = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export function mm(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  return o;
}
export const T4 = (x, y, z) => {
  const m = I4();
  m[12] = x; m[13] = y; m[14] = z;
  return m;
};
export const S4 = (s) => {
  const m = I4();
  m[0] = m[5] = m[10] = s;
  return m;
};
export const RY = (a) => {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
};
export const RX = (a) => {
  const c = Math.cos(a), s = Math.sin(a);
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
};
export const xf = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];
// cubic Hermite between p0 (velocity v0) and p1 (velocity v1) over duration T, s in 0..1
const herm = (p0, v0, p1, v1, s, T) => {
  const s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * v0 * T + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * v1 * T;
};
const herm3 = (p0, v0, p1, v1, s, T) => [0, 1, 2].map((i) => herm(p0[i], v0[i], p1[i], v1[i], s, T));

/* ---------------- film ---------------- */
export const FPS = 30;
export const DUR = 50;
export const FRAMES = FPS * DUR;
export const FORMATS = { l: { W: 1600, H: 900 }, p: { W: 900, H: 1600 } };

/* ---------------- world layout ---------------- */
export const ORIGIN = [0, 0, 0];
export const PLANE_STEP = 28; // hero plane dot spacing
export const PLANE_N = 173; // dots per side (173² ≈ 30k)
export const SPHERE_C = [0, -520, 0];
export const SPHERE_R = 300;
export const TUBE_Y = -520;
export const TUBE_R = 460;
export const TUBE_Z0 = -150;
export const W0 = [0, 0, -13400]; // centre of the work plane
export const GRID_SCALE = 22; // world units per content coordinate unit
export const PILLAR_H = 560;
export const SLAMS = [10.0, 12.0, 14.0];

const TUBE_V = 850;
export function tubeZ(t) {
  let z = -1200 - TUBE_V * (t - 7.5);
  for (const s of SLAMS) z -= 90 * sstep(s - 0.05, s + 0.35, t);
  return z;
}
export const PORTAL_Z = tubeZ(16.8);

// tour order (smooth flight path); ids + coords mirror src/data/content.js (guarded by a test)
const TOUR = [
  ['kosguardian', { x: 62, y: -85 }],
  ['fluidsim', { x: 45, y: -72 }],
  ['nuget', { x: 72, y: -30 }],
  ['noose', { x: 48, y: 45 }],
  ['bookheart', { x: -28, y: 68 }],
  ['nullradix', { x: -80, y: 48 }],
];
export const planeAt = (coord) => add3(W0, [coord.x * GRID_SCALE, 0, -coord.y * GRID_SCALE]);
export const NODES = TOUR.map(([id, coord]) => {
  const pos = planeAt(coord);
  return { id, coord, pos, top: add3(pos, [0, -PILLAR_H, 0]) };
});
export const STOPS = NODES.map((n, i) => {
  const t0 = 19 + i * 2;
  return { id: n.id, t0, tHold: t0 + 0.9, t1: t0 + 2 };
});

// axis ends of the work plane: x = Frontend (-) / Backend (+), y (= world -z) = Infrastructure (-) / Product (+)
export const AXIS_LEN = 2300;
export const AXES = {
  x: { neg: add3(W0, [-AXIS_LEN, 0, 0]), pos: add3(W0, [AXIS_LEN, 0, 0]) },
  y: { neg: add3(W0, [0, 0, AXIS_LEN]), pos: add3(W0, [0, 0, -AXIS_LEN]) },
};

// experience timeline: a line of light on the near edge of the work plane
export const TL_Z = W0[2] + 1700;
export const TL_X0 = -2100;
export const TL_X1 = 2100;
const TRACK_T0 = 40.3, TRACK_T1 = 43.8, TRACK_X0 = -1900, TRACK_X1 = 1900, TRACK_LEAD = 235;
const trackX = (t) => lerp(TRACK_X0, TRACK_X1, P(t, TRACK_T0, TRACK_T1));
export const MILESTONES = [0, 1, 2, 3, 4].map((i) => {
  const x = -1600 + i * 800;
  const t = TRACK_T0 + ((x - TRACK_LEAD - TRACK_X0) / (TRACK_X1 - TRACK_X0)) * (TRACK_T1 - TRACK_T0);
  return { pos: [x, 0, TL_Z], t };
});

// contact: everything implodes into C, the wordmark forms in the plane z = C.z
export const IMPLODE_C = add3(W0, [0, -420, 0]);
export const T_HOLD = 44.0, T_DOLLY = 45.0, T_IMPLODE = 45.9, T_DROP = 46.6;

/* ---------------- timeline ---------------- */
export const SCENES = [
  { id: 'top', t0: 0, t1: 7.5, label: 'Index', anchorT: 3.0 },
  { id: 'about', t0: 7.5, t1: 16, label: 'How I work', anchorT: 8.7 },
  { id: 'work', t0: 16, t1: 34, label: 'Selected work', anchorT: 18.4 },
  { id: 'skills', t0: 34, t1: 44, label: 'Stack', anchorT: 36.0 },
  { id: 'contact', t0: 44, t1: 50, label: 'Open channel', anchorT: 49.2 },
];
export const sceneAt = (t) => SCENES.find((s) => t < s.t1) || SCENES.at(-1);

// HUD context label
export const LABELS = [
  [0, 'Init'], [0.6, 'Origin'], [3.0, 'Index'], [4.6, 'Diving in'], [7.5, 'How I work'],
  [16.0, 'Breaking out'], [19.0, 'Selected work'], [31.0, 'The plot'], [34.0, 'Stack'],
  [39.2, 'Track record'], [44.0, 'Hold'], [45.9, 'Signal'], [46.6, 'NULLRADIX'], [47.6, 'Open channel'],
];
export const labelAt = (t) => {
  let cur = LABELS[0][1];
  for (const [lt, s] of LABELS) if (t >= lt) cur = s;
  return cur;
};

// impacts - drive post-FX in the film and RGB split + sound on the site
export const CUES = [
  { t: 0.7, kind: 'shock', amp: 0.7 },
  { t: 5.9, kind: 'pass', amp: 0.6 },
  ...SLAMS.map((t) => ({ t, kind: 'slam', amp: 0.8 })),
  { t: 16.8, kind: 'burst', amp: 1 },
  ...NODES.map((_, i) => ({ t: 17.5 + i * 0.18, kind: 'ping', amp: 0.3 })),
  ...STOPS.map((s) => ({ t: s.tHold, kind: 'ping', amp: 0.18 })),
  { t: T_DOLLY, kind: 'rise', amp: 0.6 },
  { t: T_DROP, kind: 'drop', amp: 1 },
].sort((a, b) => a.t - b.t);

// how hard each cue kind hits: flash, chromatic aberration (px), shake (px), bloom+, zoom blur, decay (s)
const KIND = {
  shock: { fl: 0.35, ca: 9, sh: 10, bl: 0.6, zm: 0.05, dc: 0.35 },
  slam: { fl: 0.12, ca: 8, sh: 14, bl: 0.3, zm: 0.03, dc: 0.16 },
  burst: { fl: 0.9, ca: 16, sh: 22, bl: 1.2, zm: 0.12, dc: 0.5 },
  pass: { fl: 0, ca: 7, sh: 6, bl: 0.3, zm: 0.06, dc: 0.3 },
  ping: { fl: 0, ca: 1.5, sh: 0, bl: 0.25, zm: 0, dc: 0.3 },
  rise: { fl: 0, ca: 0, sh: 0, bl: 0, zm: 0, dc: 0.1 },
  drop: { fl: 0.95, ca: 18, sh: 26, bl: 1.3, zm: 0.13, dc: 0.7 },
};
/** impact state at film time t (shared by film post-FX and the site's live layer); sx/sy in film px */
export function impactAt(t) {
  let flash = 0, ca = 0, shake = 0, bloom = 0, zoom = 0;
  for (const c of CUES) {
    const u = t - c.t, K = KIND[c.kind];
    if (u < 0 || u > K.dc * 6) continue;
    const e = Math.exp(-u / K.dc) * c.amp;
    flash = Math.max(flash, K.fl * c.amp * Math.exp(-u / (K.dc * 0.15)));
    ca += K.ca * e;
    shake += K.sh * c.amp * Math.exp(-u / (K.dc * 0.6));
    bloom += K.bl * e;
    zoom += K.zm * c.amp * Math.exp(-u / (K.dc * 0.5));
  }
  const sx = shake * (Math.sin(t * 97.3) * 0.6 + Math.sin(t * 151.1 + 1) * 0.4);
  const sy = shake * (Math.sin(t * 83.7 + 2) * 0.6 + Math.sin(t * 131.9) * 0.4);
  return { flash, ca, shake, bloom, zoom, sx, sy };
}

// scroll keyframes: [film time, cumulative viewport heights]. Scroll 0 = end of the intro (t = 3).
export const SCROLL_KEYS = (() => {
  const k = [
    [3.0, 0], [4.6, 1.1], [5.9, 2.0], [7.5, 2.9], [8.1, 3.4], [9.6, 5.0], [10.6, 5.8], [11.8, 6.6],
    [12.6, 7.3], [13.8, 8.0], [14.6, 8.7], [15.8, 9.4], [16.8, 10.1], [19.0, 11.8],
  ];
  let v = 11.8;
  for (const s of STOPS) {
    k.push([s.tHold, (v += 0.6)]);
    k.push([s.t1, (v += 1.1)]);
  }
  k.push([32.6, (v += 1.0)], [34.0, (v += 1.2)], [35.2, (v += 0.8)], [39.2, (v += 3.4)], [TRACK_T0, (v += 0.7)]);
  k.push([TRACK_T1, (v += 4.0)], [T_HOLD, (v += 0.2)], [T_DOLLY, (v += 0.7)], [T_IMPLODE, (v += 0.6)]);
  k.push([T_DROP, (v += 0.4)], [48.2, (v += 1.1)], [DUR, (v += 1.4)]);
  return k;
})();

/* ---------------- camera ---------------- */
const shot = (eye, tgt, F, roll = 0, sx = 0, sy = 0) => ({ eye, tgt, F, roll, sx, sy });
const mixShot = (a, b, k) =>
  shot(lerp3(a.eye, b.eye, k), lerp3(a.tgt, b.tgt, k), lerp(a.F, b.F, k), lerp(a.roll, b.roll, k), lerp(a.sx, b.sx, k), lerp(a.sy, b.sy, k));
const orbit = (tgt, az, el, dist) => add3(tgt, [Math.sin(az) * Math.cos(el) * dist, -Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist]);

export function makeWorld(fmt = 'l') {
  const { W, H } = FORMATS[fmt];
  const tall = fmt === 'p';
  const CX = W / 2, CY = H / 2;
  const F0 = Math.round(tall ? 0.95 * W : (1100 / 1920) * W);
  // portrait sees less sideways: wide shots move the eye back from the target
  const pk = (k) => (tall ? k : 1);
  const pullEye = (tgt, eye, k) => add3(tgt, mul3(sub3(eye, tgt), k));

  const HERO_TGT = [0, -340, 0];
  const heroShift = tall ? [0, -0.17 * H] : [0.2 * W, 0];
  const stopShift = tall ? [0, -0.2 * H] : [-0.17 * W, 0.02 * H];
  const trackShift = tall ? [0, 0.16 * H] : [0, 0.16 * H];
  const wordShift = tall ? [0, -0.15 * H] : [0, -0.1 * H];

  /* intro + hero */
  function heroShot(t) {
    const u = P(t, 3.0, 4.6);
    const tgt = HERO_TGT;
    const eye = pullEye(tgt, orbit(tgt, lerp(-0.3, -0.42, u), lerp(0.25, 0.21, u), lerp(1320, 1220, u)), pk(1.35));
    return shot(eye, tgt, F0, 0, heroShift[0], heroShift[1]);
  }
  function introShot(t) {
    const h = heroShot(3.0);
    const hRel = sub3(h.eye, HERO_TGT);
    const hDist = len3(hRel), hEl = Math.asin(-hRel[1] / hDist), hAz = Math.atan2(hRel[0], hRel[2]);
    const topDist = 1700 * pk(1.2);
    if (t < 1.3) return shot(orbit(ORIGIN, 1.1, 1.39, lerp(topDist, topDist * 0.86, eOut(P(t, 0, 1.3)))), ORIGIN, F0);
    const k = eIO(P(t, 1.3, 3.0));
    const tgt = lerp3(ORIGIN, HERO_TGT, k);
    const eye = orbit(tgt, lerp(1.1, hAz, k), lerp(1.39, hEl, k), lerp(topDist * 0.86, hDist, k));
    return shot(eye, tgt, F0, 0, lerp(0, heroShift[0], k), lerp(0, heroShift[1], k));
  }

  /* dive into the sphere, down the tube */
  const DIVE_A = [0, TUBE_Y, 330]; // sphere surface
  const DIVE_B = [0, TUBE_Y, -1200]; // tube cruise starts
  const diveRoll = (t) => 0.55 * Math.sin(Math.PI * P(t, 5.3, 7.5));
  function diveShot(t) {
    const h = heroShot(4.6);
    if (t < 5.9) {
      const k = P(t, 4.6, 5.9), ke = eIO(k);
      const eye = lerp3(h.eye, DIVE_A, k * k);
      const tgt = lerp3(h.tgt, add3(DIVE_A, [0, 0, -1000]), ke);
      return shot(eye, tgt, F0, diveRoll(t), lerp(h.sx, 0, ke), lerp(h.sy, 0, ke));
    }
    const v0 = mul3(sub3(DIVE_A, h.eye), 2 / 1.3); // end velocity of the k² approach
    const eye = herm3(DIVE_A, v0, DIVE_B, [0, 0, -TUBE_V], P(t, 5.9, 7.5), 1.6);
    return shot(eye, add3(eye, [0, 0, -1000]), F0, diveRoll(t));
  }
  function tubeShot(t) {
    const z = tubeZ(t), u = t - 7.5;
    const eye = [0, TUBE_Y, z];
    const tgt = [60 * Math.sin(0.8 * u), TUBE_Y + 25 * Math.sin(0.55 * u), z - 1000];
    return shot(eye, tgt, F0, 0.06 * Math.sin(1.3 * u));
  }

  /* breakout over the work plane */
  const E1_TGT = add3(W0, [0, 0, -500]);
  const E1 = pullEye(E1_TGT, [0, -1600, -10900], pk(1.25));
  function breakoutShot(t) {
    const p0 = [0, TUBE_Y, PORTAL_Z];
    const s = P(t, 16.8, 19.0);
    const eye = herm3(p0, [0, 0, -TUBE_V], E1, [0, 0, 0], s, 2.2);
    const k = eIO(P(t, 16.8, 18.4));
    const tgt = lerp3(add3(eye, [0, 0, -1000]), E1_TGT, k);
    return shot(eye, tgt, F0, 0.2 * Math.sin(Math.PI * s));
  }
  const breakoutEnd = () => shot(E1, E1_TGT, F0);

  /* project stops */
  const AZ = [0.35, -0.25, 0.45, 0.3, -0.3, -0.45];
  function stopShot(i, u) {
    const focus = add3(NODES[i].pos, [0, -300, 0]);
    const eye = orbit(focus, AZ[i] + (u - 0.5) * 0.24, 0.34, 1100 * pk(1.45));
    return shot(eye, focus, F0, 0, stopShift[0], stopShift[1]);
  }
  function hop(a, b, k) {
    const m = mixShot(a, b, k);
    const lift = 300 * Math.sin(Math.PI * k) * Math.min(1, len3(sub3(a.eye, b.eye)) / 1500);
    m.eye = add3(m.eye, [0, -lift, 0]);
    return m;
  }
  function workShot(t) {
    const i = clamp(Math.floor((t - 19) / 2), 0, STOPS.length - 1);
    const s = STOPS[i];
    if (t < s.tHold) return hop(i ? stopShot(i - 1, 1) : breakoutEnd(), stopShot(i, 0), eIO(P(t, s.t0, s.tHold)));
    return stopShot(i, P(t, s.tHold, s.t1));
  }

  /* plot: near top-down over the whole plane */
  function plotShot(u) {
    const tgt = add3(W0, [0, 0, 250]);
    return shot(orbit(tgt, -0.05 + 0.18 * u, 1.05, 5000 * pk(1.25)), tgt, F0);
  }

  /* skills: four glass panels rise from the plane */
  const panels = (tall
    ? [0, 1, 2, 3].map((j) => ({ pos: add3(W0, [0, -1960 + j * 600, -300]), ry: j % 2 ? -0.16 : 0.16 }))
    : [[-1180, -180, 0.3], [-395, -420, 0.1], [395, -420, -0.1], [1180, -180, -0.3]].map(([x, z, ry]) => ({
        pos: add3(W0, [x, -600, z]),
        ry,
      }))
  ).map((p) => {
    const w = 720, h = tall ? 520 : 540;
    return { ...p, w, h, M: mm(mm(T4(p.pos[0], p.pos[1], p.pos[2]), RY(p.ry)), T4(-w / 2, -h / 2, 0)) };
  });
  function skillShot(u) {
    if (tall) {
      const x = clamp(u * 3.6 - 0.3, 0, 3);
      const step = Math.min(3, Math.floor(x) + sstep(0.3, 0.7, frac(x)));
      const yc = -1960 + step * 600;
      const tgt = [W0[0], yc + 40, W0[2] - 300];
      return shot([W0[0] + 60 * Math.sin(u * Math.PI), yc, W0[2] - 300 + 860], tgt, F0);
    }
    const tgt = add3(W0, [0, -580, -300]);
    return shot(add3(W0, [lerp(-80, 80, u), -700, lerp(1900, 1780, u)]), tgt, F0);
  }

  /* experience: low tracking shot along the timeline */
  function trackShot(X) {
    const tgt = [X + 260, -40, TL_Z - 120];
    return shot(pullEye(tgt, [X, -430, TL_Z + 1150], pk(1.35)), tgt, F0, 0, trackShift[0], trackShift[1]);
  }

  /* contact */
  const PULL_TGT = IMPLODE_C;
  const PULL_EYE = pullEye(PULL_TGT, add3(W0, [0, -1300, 3900]), pk(1.3));
  const pullShot = () => shot(PULL_EYE, PULL_TGT, F0);
  function dollyShot(t) {
    const dir = nrm3(sub3(PULL_EYE, PULL_TGT)), d0 = len3(sub3(PULL_EYE, PULL_TGT));
    const d = lerp(d0, d0 * 0.42, eIO(P(t, T_DOLLY, T_IMPLODE)));
    return shot(add3(PULL_TGT, mul3(dir, d)), PULL_TGT, (F0 * d) / d0);
  }
  function wordShot(t) {
    const k = P(t, 47.5, DUR);
    const eye = add3(IMPLODE_C, [18 * Math.sin(1.3 * (t - T_DROP)) * k, -10 * k, F0 + 40 * k]);
    return shot(eye, IMPLODE_C, F0, 0, wordShift[0], wordShift[1]);
  }

  function rawCam(t) {
    if (t < 3.0) return introShot(t);
    if (t < 4.6) return heroShot(t);
    if (t < 7.5) return diveShot(t);
    if (t < 16.8) return tubeShot(t);
    if (t < 19.0) return breakoutShot(t);
    if (t < 31.0) return workShot(t);
    if (t < 32.6) return mixShot(stopShot(5, 1), plotShot(0), eIO(P(t, 31.0, 32.6)));
    if (t < 34.0) return plotShot(P(t, 32.6, 34.0));
    if (t < 35.2) return mixShot(plotShot(1), skillShot(0), eIO(P(t, 34.0, 35.2)));
    if (t < 39.2) return skillShot(P(t, 35.2, 39.2));
    if (t < TRACK_T0) return mixShot(skillShot(1), trackShot(TRACK_X0), eIO(P(t, 39.2, TRACK_T0)));
    if (t < T_HOLD) return trackShot(trackX(t));
    if (t < T_DOLLY) return mixShot(trackShot(TRACK_X1), pullShot(), eIO(P(t, T_HOLD, T_DOLLY)));
    if (t < T_IMPLODE) return dollyShot(t);
    if (t < T_DROP) {
      const a = dollyShot(T_IMPLODE), b = wordShot(T_DROP), k = eIO(P(t, T_IMPLODE, T_DROP));
      const m = mixShot(a, b, k);
      m.F = lerp(a.F, b.F, eIn(P(t, T_IMPLODE, T_DROP)));
      m.roll = 0.5 * Math.sin(Math.PI * k);
      return m;
    }
    return wordShot(t);
  }

  function cam(t) {
    const c = rawCam(clamp(t, 0, DUR));
    const f = nrm3(sub3(c.tgt, c.eye));
    let r = nrm3(cross3([0, -1, 0], f));
    let d = cross3(r, f);
    if (c.roll) {
      const co = Math.cos(c.roll), si = Math.sin(c.roll);
      const r2 = add3(mul3(r, co), mul3(d, si)), d2 = add3(mul3(d, co), mul3(r, -si));
      r = r2;
      d = d2;
    }
    c.r = r;
    c.d = d;
    c.f = f;
    c.V = [r[0], d[0], -f[0], 0, r[1], d[1], -f[1], 0, r[2], d[2], -f[2], 0, -dot3(r, c.eye), -dot3(d, c.eye), dot3(f, c.eye), 1];
    return c;
  }

  // world -> film pixels; out = [X, Y, depth]
  function proj(c, p, out = [0, 0, 0]) {
    const x = p[0] - c.eye[0], y = p[1] - c.eye[1], z = p[2] - c.eye[2];
    const xc = c.r[0] * x + c.r[1] * y + c.r[2] * z;
    const yc = c.d[0] * x + c.d[1] * y + c.d[2] * z;
    const dz = c.f[0] * x + c.f[1] * y + c.f[2] * z;
    out[0] = CX + c.sx + (c.F * xc) / dz;
    out[1] = CY + c.sy + (c.F * yc) / dz;
    out[2] = dz;
    return out;
  }

  return { fmt, W, H, CX, CY, F0, cam, proj, panels };
}
