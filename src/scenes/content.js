/**
 * Builds every content block from src/data/content.js. The same markup serves both modes:
 * the film mode positions it in fixed layers, the static mode lets it flow.
 */
import { profile, projects, about, disciplines, skills, experience, socials, axes } from '../data/content.js';
import { NODES, STOPS, SLAMS, MILESTONES } from '../film/world.js';
import { qs, qsa, el } from '../utils/dom.js';

export const STATUS = { live: 'Live', wip: 'In progress', archived: 'Archived' };
export const pad = (n) => String(n).padStart(2, '0');
export const coordText = (c) => `x ${c.x < 0 ? '-' : '+'}${String(Math.abs(c.x)).padStart(3, '0')}  y ${c.y < 0 ? '-' : '+'}${String(Math.abs(c.y)).padStart(3, '0')}`;

/** projects in film tour order (the plane's flight path), each with its content index */
export const tour = NODES.map((n) => {
  const index = projects.findIndex((p) => p.id === n.id);
  return { project: projects[index], index };
});

export function renderContent(panel) {
  qs('[data-profile-status]').textContent = profile.status;
  qs('[data-year]').textContent = String(new Date().getFullYear());

  // about: the lead is split into words for the scroll fill
  qs('[data-about-lead]').replaceChildren(
    ...about.lead.split(' ').flatMap((w, i) => [i ? ' ' : '', el('span', { class: 'word' }, w)]),
  );
  qs('[data-tenets]').replaceChildren(
    ...about.principles.map((p) => el('div', { class: 'tenet' }, [el('dt', { class: 'tenet__k' }, p.k), el('dd', { class: 'tenet__v' }, p.v)])),
  );
  // the bore's slam words (film only)
  qs('[data-slams]').replaceChildren(
    ...disciplines.map((d, i) =>
      el('li', { class: 'slam' }, [
        el('span', { class: 'slam__n label' }, `${pad(i + 1)} / ${pad(disciplines.length)}`),
        el('p', { class: 'slam__k' }, `${d.k}.`),
        el('p', { class: 'slam__v label' }, d.v),
      ]),
    ),
  );

  // projects in tour order
  const total = pad(tour.length);
  qs('[data-projects]').replaceChildren(
    ...tour.map(({ project: p }, i) => {
      const open = el('button', { class: 'btn btn--primary', type: 'button' }, 'Open case');
      open.addEventListener('click', () => panel.open(p, i + 1, open));
      const links = Object.entries(p.links || {}).map(([k, href]) =>
        el('a', { class: 'btn', href, target: '_blank', rel: 'noopener' }, k === 'live' ? 'Live ↗' : k === 'repo' ? 'Repository ↗' : `${k} ↗`),
      );
      return el('li', { class: 'project', 'data-focus-t': STOPS[i].tHold + 0.5, 'data-project': p.id }, [
        el('article', { class: 'project__card' }, [
          el('header', { class: 'project__top label' }, [
            el('span', { class: 'project__idx' }, `${pad(i + 1)} / ${total}`),
            el('span', { class: 'project__coord' }, coordText(p.coord)),
            p.status ? el('span', { class: 'project__status', 'data-status': p.status }, STATUS[p.status]) : null,
          ]),
          el('h3', { class: 'project__name' }, el('span', { class: 'project__name-in' }, p.name)),
          el('p', { class: 'project__meta' }, `${p.year}  ·  ${p.tech.slice(0, 2).join(' / ')}`),
          el('p', { class: 'project__blurb' }, p.blurb),
          el('ul', { class: 'tags project__tags' }, p.tech.map((t) => el('li', { class: 'tag' }, t))),
          el('div', { class: 'project__actions' }, [open, ...links]),
        ]),
      ]);
    }),
  );

  // the plot: an index of every node (accessible twin of the clickable labels on the plane)
  qs('[data-plot-count]').textContent = `${pad(tour.length)} projects`;
  qs('[data-plot-index]').replaceChildren(
    ...tour.map(({ project: p }, i) => {
      const b = el('button', { type: 'button', class: 'plot__item', 'data-focus-t': 33.2 }, [
        el('span', { class: 'plot__n' }, pad(i + 1)),
        el('span', { class: 'plot__name' }, p.name),
        el('span', { class: 'plot__coord' }, coordText(p.coord)),
      ]);
      b.addEventListener('click', () => panel.open(p, i + 1, b));
      return el('li', {}, b);
    }),
  );

  // skills: one glass panel per group
  qs('[data-skills]').replaceChildren(
    ...skills.map((g, i) =>
      el('article', { class: 'glass', 'data-focus-t': 36.6 + i * 0.6 }, [
        el('div', { class: 'glass__sheen' }),
        el('header', { class: 'glass__top' }, [
          el('h3', { class: 'glass__k' }, g.group),
          el('span', { class: 'glass__n' }, `${pad(i + 1)} / ${pad(skills.length)}`),
        ]),
        el('ul', { class: 'glass__items' }, g.items.map((s) => el('li', {}, s))),
      ]),
    ),
  );

  // experience: one milestone per entry
  qs('[data-experience]').replaceChildren(
    ...experience.map((x, i) =>
      el('li', { class: 'milestone', 'data-focus-t': MILESTONES[i]?.t ?? 42 }, [
        el('p', { class: 'milestone__range label' }, `${x.from} - ${x.to}`),
        el('h3', { class: 'milestone__role' }, x.role),
        el('p', { class: 'milestone__org' }, x.org),
        el('p', { class: 'milestone__summary' }, x.summary),
        x.tech ? el('ul', { class: 'tags' }, x.tech.map((t) => el('li', { class: 'tag' }, t))) : null,
      ]),
    ),
  );

  qs('[data-socials]').replaceChildren(
    ...socials.map((s) => el('li', {}, el('a', { href: s.href, target: '_blank', rel: 'noopener' }, s.label))),
  );

  // decorative labels anchored into the film (axis poles, origins, node names)
  const anchors = qs('[data-anchors]');
  const mk = (cls, text) => anchors.appendChild(el('div', { class: `anchor ${cls}` }, text));
  return {
    origin: mk('anchor--origin', '(0,0)'),
    plotOrigin: mk('anchor--origin', '(0,0)'),
    axes: {
      xneg: mk('anchor--axis', axes.x.neg),
      xpos: mk('anchor--axis', axes.x.pos),
      yneg: mk('anchor--axis', axes.y.neg),
      ypos: mk('anchor--axis', axes.y.pos),
    },
    nodes: tour.map(({ project: p }, i) => {
      const n = mk('anchor--node', [el('span', { class: 'anchor__n' }, pad(i + 1)), el('span', { class: 'anchor__name' }, p.name), el('span', { class: 'anchor__coord' }, coordText(p.coord))]);
      n.addEventListener('click', () => panel.open(p, i + 1, n));
      return n;
    }),
  };
}

/** copy-to-clipboard for the contact email (the film's contact block and the index) */
export function wireCopy() {
  for (const btn of qsa('[data-copy-email]'))
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(profile.email);
        btn.textContent = 'Copied';
      } catch {
        btn.textContent = profile.email;
      }
      setTimeout(() => (btn.textContent = 'Copy email'), 1800);
    });
}
