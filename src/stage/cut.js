/**
 * The director's cut (D, or shift+D anywhere): the machinery behind the film, drawn over it.
 * The world the film was rendered from as a wireframe through the same camera, a box around every
 * live element that is match-moved into it, the camera's whole flight from above, the cue sheet,
 * and the player's telemetry - all from the same data the page runs on.
 */
import * as W from '../film/world.js';
import { onKey } from './keys.js';
import { qs, qsa } from '../utils/dom.js';
import { sfx } from '../utils/sfx.js';

const FONT = '"Space Grotesk Variable", ui-sans-serif, system-ui, sans-serif';
const INK = 'rgba(250,250,251,';
const MOVED = '.anchor, .project, .glass, .milestone, .slam, .contact, .hero, .about, .work__head, .plot, .skills__head, .track__label';
const tag = (el) => el.className.split(' ')[0];

export function createCut({ stage, swarm }) {
  const canvas = qs('[data-cut]');
  const g = canvas.getContext('2d');
  const root = document.documentElement;
  let on = false, dpr = 1, cw = 0, ch = 0, path = null, pathFmt = '', fps = 60, cost = 0, moved = [];
  const P0 = [0, 0, 0, 0], P1 = [0, 0, 0, 0];

  function toggle() {
    on = !on;
    root.classList.toggle('is-cut', on);
    canvas.hidden = !on;
    sfx(on ? 'power' : 'off');
    if (on) moved = qsa(MOVED);
    return on;
  }
  onKey((e) => (e.shiftKey && e.code === 'KeyD' ? (toggle(), true) : false), 9);
  onKey((e) => (!e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && e.code === 'KeyD' && !swarm.live ? (toggle(), true) : false), 0);

  // the camera's flight, seen from above (x, z), sampled once per format
  function flight(world) {
    const pts = [];
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let t = 0; t <= W.DUR; t += 0.1) {
      const e = world.cam(t).eye;
      pts.push([t, e[0], e[2]]);
      x0 = Math.min(x0, e[0]);
      x1 = Math.max(x1, e[0]);
      z0 = Math.min(z0, e[2]);
      z1 = Math.max(z1, e[2]);
    }
    return { pts, x0, x1, z0, z1 };
  }

  /* ---------------- drawing helpers ---------------- */
  const text = (s, x, y, a = 0.75, align = 'left', size = 10) => {
    g.font = `600 ${size}px ${FONT}`;
    g.textAlign = align;
    g.fillStyle = `${INK}${a})`;
    g.fillText(s, x, y);
  };
  // a world segment, cut into steps so a line that leaves the view still draws its visible part
  function seg(ctx, a, b, alpha = 0.35, steps = 16) {
    g.strokeStyle = `${INK}${alpha})`;
    g.beginPath();
    let pen = false;
    for (let i = 0; i <= steps; i++) {
      const k = i / steps, p = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
      const q = ctx.proj(p, P0);
      if (!q || Math.abs(q[0]) > 4 * cw || Math.abs(q[1]) > 4 * ch) {
        pen = false;
        continue;
      }
      if (pen) g.lineTo(q[0], q[1]);
      else g.moveTo(q[0], q[1]);
      pen = true;
    }
    g.stroke();
  }
  function ring(ctx, c, r, axis, alpha = 0.3, n = 40) {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const at = (a) => (axis === 'z' ? [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, c[2]] : [c[0] + Math.cos(a) * r, c[1], c[2] + Math.sin(a) * r]);
      seg(ctx, at(a0), at(a1), alpha, 1);
    }
  }
  const mark = (ctx, p, label, alpha = 0.8) => {
    const q = ctx.proj(p, P1);
    if (!q || q[0] < -50 || q[0] > cw + 50 || q[1] < -50 || q[1] > ch + 50) return;
    g.strokeStyle = `${INK}${alpha})`;
    g.beginPath();
    g.moveTo(q[0] - 5, q[1]);
    g.lineTo(q[0] + 5, q[1]);
    g.moveTo(q[0], q[1] - 5);
    g.lineTo(q[0], q[1] + 5);
    g.stroke();
    if (label) text(label, q[0] + 8, q[1] - 6, alpha);
  };

  function world3d(ctx) {
    g.lineWidth = 1;
    // the work plane: grid, axes, pillars
    const L = W.AXIS_LEN;
    for (let k = -L; k <= L + 1; k += L / 5) {
      seg(ctx, W.add3(W.W0, [k, 0, -L]), W.add3(W.W0, [k, 0, L]), k ? 0.12 : 0.4);
      seg(ctx, W.add3(W.W0, [-L, 0, k]), W.add3(W.W0, [L, 0, k]), k ? 0.12 : 0.4);
    }
    for (const n of W.NODES) {
      seg(ctx, n.pos, n.top, 0.5, 4);
      mark(ctx, n.top, `${n.id}  (${n.coord.x}, ${n.coord.y})`);
    }
    mark(ctx, W.W0, 'W0 work plane', 0.5);
    // the hero sphere and the bore it dives into
    ring(ctx, W.SPHERE_C, W.SPHERE_R, 'z', 0.25);
    ring(ctx, W.SPHERE_C, W.SPHERE_R, 'y', 0.25);
    mark(ctx, W.SPHERE_C, 'sphere', 0.6);
    for (let t = 4.6; t <= 16.8; t += 1.2) ring(ctx, [0, W.TUBE_Y, W.tubeZ(t)], W.TUBE_R, 'z', 0.12, 32);
    // glass panels, the track, the implosion point
    for (const p of ctx.world.panels) {
      const c = [[0, 0, 0], [p.w, 0, 0], [p.w, p.h, 0], [0, p.h, 0]].map((v) => W.xf(p.M, v));
      for (let i = 0; i < 4; i++) seg(ctx, c[i], c[(i + 1) % 4], 0.35, 6);
    }
    seg(ctx, [W.TL_X0, 0, W.TL_Z], [W.TL_X1, 0, W.TL_Z], 0.35);
    W.MILESTONES.forEach((m, i) => mark(ctx, m.pos, `m${i + 1}  t ${m.t.toFixed(1)}`, 0.6));
    mark(ctx, W.IMPLODE_C, 'implode C', 0.6);
  }

  function frameGuides(ctx) {
    const { fit, film, world } = ctx;
    g.setLineDash([4, 6]);
    g.strokeStyle = `${INK}0.35)`;
    g.strokeRect(fit.ox + film.x + 0.5, fit.oy + film.y + 0.5, world.W * fit.k, world.H * fit.k);
    g.setLineDash([]);
    // centre of the camera
    const cx = fit.ox + film.x + (world.CX + ctx.cam.sx) * fit.k, cy = fit.oy + film.y + (world.CY + ctx.cam.sy) * fit.k;
    g.strokeStyle = `${INK}0.6)`;
    g.beginPath();
    g.arc(cx, cy, 10, 0, Math.PI * 2);
    g.moveTo(cx - 18, cy);
    g.lineTo(cx + 18, cy);
    g.moveTo(cx, cy - 18);
    g.lineTo(cx, cy + 18);
    g.stroke();
  }

  function boxes() {
    g.lineWidth = 1;
    for (const el of moved) {
      // containers fade their children, not themselves: they are as visible as their brightest child
      let op = el.style.opacity;
      if (op === '') op = Math.max(0, ...[...el.children].map((c) => +(c.style.opacity || 0)));
      op = +op;
      if (!(op > 0.12)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.bottom < 0 || r.top > ch || r.right < 0 || r.left > cw) continue;
      g.strokeStyle = `${INK}${0.25 + 0.5 * op})`;
      g.strokeRect(r.left + 0.5, r.top + 0.5, r.width, r.height);
      // corner ticks, like a tracker locked on
      text(`${tag(el)}  op ${op.toFixed(2)}`, r.left + 4, r.top - 5, 0.55 + 0.4 * op, 'left', 9);
    }
  }

  function minimap(ctx) {
    if (!path || pathFmt !== ctx.fmt) {
      path = flight(ctx.world);
      pathFmt = ctx.fmt;
    }
    const w = Math.min(240, cw * 0.32), h = w * 0.62, x0 = 24, y0 = ch - h - 118;
    g.fillStyle = 'rgba(12,12,13,0.66)';
    g.fillRect(x0, y0, w, h);
    g.strokeStyle = `${INK}0.25)`;
    g.strokeRect(x0 + 0.5, y0 + 0.5, w, h);
    text('camera path - top view (x, z)', x0, y0 - 8, 0.7, 'left', 9);
    const sx = (w - 20) / (path.x1 - path.x0 || 1), sz = (h - 20) / (path.z1 - path.z0 || 1), s = Math.min(sx, sz);
    const X = (x) => x0 + 10 + (x - path.x0) * s, Z = (z) => y0 + 10 + (z - path.z0) * s;
    let scene = '';
    g.beginPath();
    for (const [t, x, z] of path.pts) {
      const id = W.sceneAt(t).id;
      if (id !== scene) {
        if (scene) {
          g.stroke();
          g.beginPath();
        }
        scene = id;
        g.strokeStyle = `${INK}${['top', 'work', 'contact'].includes(id) ? 0.8 : 0.4})`;
        g.moveTo(X(x), Z(z));
      } else g.lineTo(X(x), Z(z));
    }
    g.stroke();
    for (const c of W.CUES) {
      const e = ctx.world.cam(c.t).eye;
      g.fillStyle = `${INK}0.6)`;
      g.fillRect(X(e[0]) - 1.5, Z(e[2]) - 1.5, 3, 3);
    }
    const e = ctx.cam.eye, f = ctx.cam.f;
    g.fillStyle = `${INK}1)`;
    g.beginPath();
    g.arc(X(e[0]), Z(e[2]), 3.5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = `${INK}0.9)`;
    g.beginPath();
    g.moveTo(X(e[0]), Z(e[2]));
    g.lineTo(X(e[0]) + f[0] * 22, Z(e[2]) + f[2] * 22);
    g.stroke();
  }

  function cueSheet(ctx) {
    const x0 = 24, x1 = cw - 24, y = ch - 92, X = (t) => x0 + ((x1 - x0) * t) / W.DUR;
    g.strokeStyle = `${INK}0.3)`;
    g.beginPath();
    g.moveTo(x0, y);
    g.lineTo(x1, y);
    g.stroke();
    for (const s of W.SCENES) {
      g.fillStyle = `${INK}0.5)`;
      g.fillRect(X(s.t0), y - 6, 1, 12);
      text(s.id, X(s.t0) + 4, y - 8, 0.55, 'left', 9);
    }
    for (const c of W.CUES) {
      g.fillStyle = `${INK}0.85)`;
      g.fillRect(X(c.t) - 1, y - 3, 2, 6);
      text(c.kind, X(c.t), y + 16, 0.45, 'center', 8);
    }
    for (const s of W.STOPS) {
      g.fillStyle = `${INK}0.4)`;
      g.fillRect(X(s.t0), y + 4, X(s.t1) - X(s.t0) - 2, 2);
    }
    const n = X(ctx.t);
    g.fillStyle = `${INK}1)`;
    g.fillRect(n - 0.5, y - 14, 1, 28);
    text(`t ${ctx.t.toFixed(2)}`, n, y - 18, 0.95, 'center', 9);
  }

  function telemetry(ctx) {
    const s = stage.stats, x = cw - 24;
    const next = W.CUES.find((c) => c.t > ctx.t);
    const rows = [
      ['fps', fps.toFixed(0)],
      ['decode', `${s.decodeFps.toFixed(0)} fps · ${s.mode}`],
      ['frame', `${Math.round(s.frame)} / ${s.target}`],
      ['lag', `${(s.target - s.frame).toFixed(1)} f`],
      ['speed', `${ctx.speed.toFixed(2)} s/s`],
      ['scroll v', s.velocity.toFixed(1)],
      ['gops', `${s.gops} cached`],
      ['buffer', `${Math.round(s.buffer * 100)}%`],
      ['cover', ctx.cover.toFixed(2)],
      ['canvas', `${cw}x${ch} @${dpr}`],
      ['next cue', next ? `${next.kind} @ ${next.t}` : '-'],
      ['overlay', `${cost.toFixed(2)} ms`],
    ];
    const y0 = 104;
    g.fillStyle = 'rgba(12,12,13,0.66)';
    g.fillRect(x - 210, y0 - 18, 210, rows.length * 15 + 16);
    rows.forEach(([k, v], i) => {
      text(k.toUpperCase(), x - 200, y0 + i * 15, 0.5, 'left', 9);
      text(v, x - 8, y0 + i * 15, 0.95, 'right', 10);
    });
  }

  return {
    toggle,
    get on() {
      return on;
    },
    update(ctx) {
      if (ctx.dt > 0) fps += (1 / ctx.dt - fps) * 0.05;
      if (!on) return;
      const t0 = performance.now();
      const r = Math.min(devicePixelRatio || 1, 2);
      if (cw !== ctx.vw || ch !== ctx.vh || dpr !== r) {
        cw = ctx.vw;
        ch = ctx.vh;
        dpr = r;
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, cw, ch);
      if (!ctx.buried) {
        world3d(ctx);
        frameGuides(ctx);
        boxes();
      }
      minimap(ctx);
      cueSheet(ctx);
      telemetry(ctx);
      const blink = Math.floor(performance.now() / 600) % 2;
      g.fillStyle = `${INK}${blink ? 1 : 0.25})`;
      g.beginPath();
      g.arc(cw / 2 - 92, 86, 3.5, 0, Math.PI * 2);
      g.fill();
      text("DIRECTOR'S CUT  ·  D TO EXIT", cw / 2 - 82, 90, 0.95, 'left', 10);
      cost += (performance.now() - t0 - cost) * 0.1;
    },
  };
}
