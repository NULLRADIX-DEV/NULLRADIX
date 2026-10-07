/**
 * Work: the plane of projects. Axis poles and node labels are pinned to the film's 3D points;
 * at each stop the project card unfolds next to its pillar, tied to it by a leader line.
 */
import { qs, qsa } from '../utils/dom.js';
import { NODES, STOPS, AXES, ORIGIN, W0, add3 } from '../film/world.js';
import { P, eOut, eIO, show, mark, c01 } from './kit.js';

const SVG = 'http://www.w3.org/2000/svg';

export function createWork(anchors) {
  const head = qs('[data-work-head]');
  const plot = qs('[data-plot]');
  const cards = qsa('[data-projects] .project');
  const leaders = qs('[data-leaders]');
  const anchorLayer = qs('[data-anchors]');
  const paths = cards.map(() => {
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('pathLength', '1');
    leaders.append(p);
    return p;
  });
  const dots = cards.map(() => {
    const c = document.createElementNS(SVG, 'circle');
    c.setAttribute('r', '5');
    leaders.append(c);
    return c;
  });
  let sizes = null;
  addEventListener('resize', () => (sizes = null));
  const pt = [0, 0, 0, 0];
  const LABEL_UP = [0, -70, 0];

  return (ctx) => {
    const t = ctx.t, { vw, vh } = ctx;
    const tall = ctx.fmt === 'p';
    leaders.setAttribute('viewBox', `0 0 ${vw} ${vh}`);

    // hero origin label
    const ho = c01(P(t, 0.6, 0.9)) * (1 - P(t, 4.2, 4.7));
    const op = ho > 0 && ctx.proj(ORIGIN, pt);
    mark(anchors.origin, op ? ho : 0, op ? pt[0] + 14 : 0, op ? pt[1] + 10 : 0);

    // section head
    const ha = eOut(P(t, 17.0, 17.7)) * (1 - eIO(P(t, 19.05, 19.55)));
    show(head, ha, `translate3d(0,${((1 - ha) * 24).toFixed(1)}px,0)`);

    // axis poles and the plane's origin
    const talking = Math.max(...STOPS.map((s) => eOut(P(t, s.t0 + 0.55, s.tHold + 0.3)) * (1 - eIO(P(t, s.t1 - 0.05, s.t1 + 0.35)))));
    let aa = eOut(P(t, 17.8, 18.6)) * (1 - P(t, 34.0, 34.7)) * (1 - P(t, 45.6, 45.95)) * (1 - 0.65 * talking);
    if (tall) aa *= 1 - ha; // no room for both on a phone
    for (const [key, p] of [['xneg', AXES.x.neg], ['xpos', AXES.x.pos], ['yneg', AXES.y.neg], ['ypos', AXES.y.pos]]) {
      const q = aa > 0 && ctx.proj(p, pt);
      const inside = q && pt[0] > -40 && pt[0] < vw + 40 && pt[1] > -20 && pt[1] < vh + 20;
      mark(anchors.axes[key], inside ? aa : 0, inside ? pt[0] : 0, inside ? pt[1] : 0);
    }
    const wo = aa > 0 && ctx.proj(W0, pt);
    mark(anchors.plotOrigin, wo ? aa : 0, wo ? pt[0] + 14 : 0, wo ? pt[1] + 10 : 0);

    // project cards
    if (!sizes) sizes = cards.map((c) => [c.offsetWidth, c.offsetHeight]);
    const inPlot = t > 31.5 && t < 34.6;
    anchorLayer.classList.toggle('is-plot', inPlot);
    let cardOn = new Array(cards.length).fill(0);
    STOPS.forEach((s, i) => {
      const kin = eOut(P(t, s.t0 + 0.55, s.tHold + 0.3));
      const kout = eIO(P(t, s.t1 - 0.05, s.t1 + 0.35));
      const a = kin * (1 - kout);
      cardOn[i] = a;
      const card = cards[i], path = paths[i], dot = dots[i];
      const q = a > 0.002 && ctx.proj(NODES[i].top, pt);
      if (!q) {
        show(card, 0);
        path.style.opacity = dot.style.opacity = '0';
        return;
      }
      const [w, h] = sizes[i];
      const nx = pt[0], ny = pt[1];
      let x, y, ex, ey;
      if (tall) {
        x = (vw - w) / 2;
        y = vh - h - 78;
        ex = Math.min(Math.max(nx, x + 24), x + w - 24);
        ey = y;
      } else {
        x = Math.min(Math.max(nx + 120, 24), vw - w - 32);
        y = Math.min(Math.max(ny - h * 0.32, 84), vh - h - 84);
        ex = x;
        ey = y + 30;
      }
      const lift = (1 - kin) * 26 + kout * -18;
      show(card, a, `translate3d(${x.toFixed(1)}px,${(y + lift).toFixed(1)}px,0)`);
      card.style.setProperty('--k', kin.toFixed(3));
      const mid = tall ? `L${nx.toFixed(1)} ${(ey - 36).toFixed(1)} L${ex.toFixed(1)} ${(ey - 36).toFixed(1)}` : `L${(ex - 46).toFixed(1)} ${ey.toFixed(1)}`;
      path.setAttribute('d', `M${nx.toFixed(1)} ${ny.toFixed(1)} ${mid} L${ex.toFixed(1)} ${ey.toFixed(1)}`);
      path.style.opacity = a.toFixed(3);
      path.style.strokeDashoffset = (1 - eOut(P(t, s.t0 + 0.6, s.tHold + 0.45))).toFixed(3);
      dot.setAttribute('cx', nx.toFixed(1));
      dot.setAttribute('cy', ny.toFixed(1));
      dot.style.opacity = a.toFixed(3);
    });

    // node labels: everywhere on the plane, except next to the card that is talking about them
    const la = eOut(P(t, 18.2, 18.9)) * (1 - P(t, 34.0, 34.6)) * (1 - P(t, 45.6, 45.95));
    NODES.forEach((n, i) => {
      const q = la > 0 && ctx.proj(add3(n.top, LABEL_UP), pt);
      const depth = q ? c01(1.4 - pt[2] / 5200) : 0;
      const a = q ? la * Math.max(inPlot ? 1 : 0.35, depth) * (1 - cardOn[i]) : 0;
      mark(anchors.nodes[i], a, q ? pt[0] : 0, q ? pt[1] : 0);
    });

    // the plot index
    const pa = eOut(P(t, 31.9, 32.6)) * (1 - eIO(P(t, 34.0, 34.5)));
    show(plot, pa, `translate3d(0,${((1 - pa) * 24).toFixed(1)}px,0)`);
  };
}
