/**
 * The index after the film: everything the film shows in passing, as one calm page to read.
 * Same data, same numbering (projects in tour order, like the film and the case dialog).
 */
import { profile, projects, about, disciplines, skills, experience, socials } from '../data/content.js';
import { qs, el } from '../utils/dom.js';
import { tour, pad, STATUS } from './content.js';

const LINK = { live: 'Live', repo: 'Repository', docs: 'Docs' };

export function renderDossier(panel) {
  qs('[data-dossier-who]').textContent = `${profile.name} - ${profile.role}`;
  qs('[data-dossier-status]').textContent = profile.status;

  const facts = [
    ['Projects', pad(projects.length)],
    ['Disciplines', pad(disciplines.length)],
    ['Tools', pad(skills.reduce((n, g) => n + g.items.length, 0))],
    ['Building since', experience[0].from],
  ];
  qs('[data-dossier-facts]').replaceChildren(
    ...facts.map(([k, v]) => el('div', { class: 'dossier__fact' }, [el('dt', { class: 'label' }, k), el('dd', {}, v)])),
  );

  qs('[data-dossier-lead]').textContent = about.lead;
  qs('[data-dossier-tenets]').replaceChildren(
    ...about.principles.map((p) => el('div', {}, [el('dt', { class: 'label' }, p.k), el('dd', {}, p.v)])),
  );
  qs('[data-dossier-disciplines]').replaceChildren(
    ...disciplines.map((d, i) =>
      el('li', {}, [el('span', { class: 'label' }, pad(i + 1)), el('p', { class: 'dossier__dk' }, d.k), el('p', { class: 'dossier__dv' }, d.v)]),
    ),
  );

  // one row per project; the name opens the case dialog, the whole row is its hit area
  const total = pad(tour.length);
  qs('[data-dossier-work]').replaceChildren(
    ...tour.map(({ project: p }, i) => {
      const open = el('button', { class: 'dossier__open', type: 'button', 'aria-label': `${p.name} - open case` }, [p.name, el('span', { 'aria-hidden': 'true' }, ' ↗')]);
      open.addEventListener('click', () => panel.open(p, i + 1, open));
      const links = Object.entries(p.links || {}).map(([k, href]) =>
        el('a', { href, target: '_blank', rel: 'noopener' }, `${LINK[k] || k} ↗`),
      );
      return el('li', { class: 'dossier__row' }, [
        el('span', { class: 'dossier__n', 'aria-hidden': 'true' }, pad(i + 1)),
        el('div', { class: 'dossier__main' }, [
          el('h4', { class: 'dossier__name' }, open),
          el('p', { class: 'dossier__blurb' }, p.blurb),
          el('ul', { class: 'tags' }, p.tech.map((t) => el('li', { class: 'tag' }, t))),
        ]),
        el('div', { class: 'dossier__side label' }, [
          el('span', { class: 'sr-only' }, `${pad(i + 1)} of ${total}`),
          p.status ? el('span', { class: 'dossier__state', 'data-status': p.status }, STATUS[p.status]) : null,
          el('span', {}, String(p.year)),
          links.length ? el('span', { class: 'dossier__links' }, links) : null,
        ]),
      ]);
    }),
  );

  qs('[data-dossier-skills]').replaceChildren(
    ...skills.map((g) =>
      el('div', { class: 'dossier__group' }, [
        el('h4', { class: 'label' }, g.group),
        el('ul', { class: 'dossier__chips' }, g.items.map((s) => el('li', {}, s))),
      ]),
    ),
  );

  // newest first: the short version leads with what is current
  qs('[data-dossier-track]').replaceChildren(
    ...[...experience].reverse().map((x) =>
      el('li', { class: 'dossier__stint' }, [
        el('p', { class: 'dossier__range label' }, `${x.from} - ${x.to}`),
        el('div', {}, [
          el('h4', { class: 'dossier__role' }, [x.role, el('span', { class: 'dossier__org' }, ` · ${x.org}`)]),
          el('p', { class: 'dossier__summary' }, x.summary),
          x.tech ? el('ul', { class: 'tags' }, x.tech.map((t) => el('li', { class: 'tag' }, t))) : null,
        ]),
      ]),
    ),
  );

  qs('[data-dossier-socials]').replaceChildren(
    ...socials.map((s) =>
      el('li', {}, el('a', { href: s.href, target: '_blank', rel: 'noopener' }, [s.label, ' ', el('span', { class: 'dossier__handle' }, s.handle)])),
    ),
  );
}
