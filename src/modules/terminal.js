/**
 * A terminal for the curious: ~ (or ^ on a German keyboard, or the >_ button) opens it.
 * It drives the same machinery as the page - lens jumps, the case dialog, the sound, the wordmark,
 * the director's cut - with tab completion and a history that lasts the session.
 */
import { profile, skills, disciplines, socials } from '../data/content.js';
import { SCENES, STOPS, DUR } from '../film/world.js';
import { tour } from '../scenes/content.js';
import { setMotionOverride } from './env.js';
import { onKey } from '../stage/keys.js';
import { qs, el } from '../utils/dom.js';
import { sfx } from '../utils/sfx.js';

const HIST_KEY = 'nr-term-history';
const PROMPT = 'visitor@nullradix:~$';
const PLACES = ['top', ...SCENES.map((s) => s.id).filter((id) => id !== 'top'), 'index'];
const born = performance.now();

const NR = [
  '███╗   ██╗██████╗ ',
  '████╗  ██║██╔══██╗',
  '██╔██╗ ██║██████╔╝',
  '██║╚██╗██║██╔══██╗',
  '██║ ╚████║██║  ██║',
  '╚═╝  ╚═══╝╚═╝  ╚═╝',
];

export function createTerminal({ stage, panel, wordplay, swarm, cut }) {
  const root = qs('[data-term]');
  const out = qs('[data-term-out]');
  const form = qs('[data-term-form]');
  const input = qs('[data-term-in]');
  const opener = qs('[data-term-open]');
  let open = false, lastFocus = null, hist = [], at = 0, queue = Promise.resolve(), dead = false;
  try {
    hist = JSON.parse(sessionStorage.getItem(HIST_KEY) || '[]');
  } catch {
    /* no history */
  }

  const find = (q) => {
    q = (q || '').toLowerCase();
    if (!q) return -1;
    return tour.findIndex(({ project: p }) => p.id === q || p.name.toLowerCase() === q || p.id.startsWith(q) || p.name.toLowerCase().startsWith(q));
  };

  /* ---------------- output ---------------- */
  // lines appear one after another, each with a key strike
  function print(lines, cls = '') {
    for (const line of [].concat(lines)) {
      queue = queue.then(
        () =>
          new Promise((res) => {
            out.append(el('p', { class: `term__l ${cls}` }, line === '' ? ' ' : line));
            out.scrollTop = out.scrollHeight;
            sfx('type');
            setTimeout(res, 18);
          }),
      );
    }
    return queue;
  }
  const echo = (cmd) => out.append(el('p', { class: 'term__l term__l--cmd' }, [el('span', { class: 'term__p' }, PROMPT), ` ${cmd}`]));

  /* ---------------- commands ---------------- */
  const leave = (fn) => {
    close();
    setTimeout(fn, 260); // let the window go before the lens runs
  };
  const C = {
    help: {
      about: 'what you can do here',
      run: () =>
        print([
          'commands:',
          ...Object.entries(C)
            .filter(([, c]) => c.about)
            .map(([k, c]) => `  ${k.padEnd(8)} ${c.about}`),
          '',
          'tab completes, up/down walks the history, esc closes.',
        ]),
    },
    ls: {
      about: 'ls [projects|skills|scenes|disciplines]',
      args: ['projects', 'skills', 'scenes', 'disciplines'],
      run: ([what]) => {
        if (!what) return print(['projects/  skills/  scenes/  disciplines/  contact.txt']);
        if (what.startsWith('proj'))
          return print(tour.map(({ project: p }, i) => `  ${String(i + 1).padStart(2, '0')}  ${p.name.padEnd(17)} ${p.year}  ${p.status || ''}`));
        if (what.startsWith('skill')) return print(skills.map((g) => `  ${g.group.padEnd(13)} ${g.items.join(', ')}`));
        if (what.startsWith('scene')) return print(PLACES.map((id) => `  ${id}`));
        if (what.startsWith('disc')) return print(disciplines.map((d) => `  ${d.k.padEnd(15)} ${d.v}`));
        return print(`ls: ${what}: no such directory`, 'term__l--err');
      },
    },
    open: {
      about: 'open <project> - the case file',
      args: () => tour.map(({ project: p }) => p.id),
      run: ([q]) => {
        const i = find(q);
        if (i < 0) return print(q ? `open: ${q}: no such project (try ls projects)` : 'usage: open <project>', 'term__l--err');
        leave(() => panel.open(tour[i].project, i + 1, opener));
      },
    },
    goto: {
      about: 'goto <scene|project|seconds> - through the lens',
      args: () => [...PLACES, ...tour.map(({ project: p }) => p.id)],
      run: ([q]) => {
        if (!q) return print('usage: goto <scene|project|seconds>', 'term__l--err');
        const n = Number(q.replace(/s$/, ''));
        if (Number.isFinite(n)) return leave(() => stage.goto(n));
        if (PLACES.includes(q)) return leave(() => stage.gotoScene(q));
        const i = find(q);
        if (i >= 0) return leave(() => stage.goto(STOPS[i].tHold + 0.5));
        return print(`goto: ${q}: nowhere to go (try ls scenes)`, 'term__l--err');
      },
    },
    cd: { args: () => PLACES, run: (a) => C.goto.run(a) },
    whoami: {
      about: 'who is who',
      run: () => print(['visitor - welcome.', `this is the portfolio of ${profile.name}, ${profile.role}.`, `status: ${profile.status.toLowerCase()}`]),
    },
    about: {
      about: 'the machine, in short',
      run: () => {
        const up = Math.round((performance.now() - born) / 1000);
        const info = [
          `${profile.name.toLowerCase()}@nullradix`,
          '-----------------',
          `role    ${profile.role}`,
          `stack   ${skills[0].items.slice(0, 3).join(', ')}, .NET`,
          `film    ${DUR}s @ 30fps, scrubbed by scroll`,
          `decode  ${stage.stats.mode}`,
          `uptime  ${up}s`,
          `mail    ${profile.email}`,
        ];
        return print(NR.map((l, i) => `${l}   ${info[i] ?? ''}`).concat(info.slice(NR.length).map((l) => `${' '.repeat(21)}${l}`)), 'term__l--art');
      },
    },
    contact: {
      about: 'copy the email address',
      run: async () => {
        try {
          await navigator.clipboard.writeText(profile.email);
          return print([`copied ${profile.email} to the clipboard.`, ...socials.map((s) => `  ${s.label.padEnd(8)} ${s.href}`)]);
        } catch {
          return print([profile.email, ...socials.map((s) => `  ${s.label.padEnd(8)} ${s.href}`)]);
        }
      },
    },
    sound: {
      about: 'sound on|off',
      args: ['on', 'off'],
      run: ([v]) => {
        const btn = qs('[data-sound]'), now = btn.getAttribute('aria-pressed') === 'true';
        if (v !== 'on' && v !== 'off') return print(`sound is ${now ? 'on' : 'off'}. usage: sound on|off`);
        if ((v === 'on') !== now) btn.click();
        return print(`sound ${v}.`);
      },
    },
    motion: {
      about: 'motion off - the calm, static page',
      args: ['off'],
      run: ([v]) => {
        if (v !== 'off') return print('motion is on. usage: motion off');
        setMotionOverride('0');
        const u = new URL(location.href);
        u.searchParams.delete('motion');
        location.href = u.toString();
      },
    },
    cut: {
      about: "the director's cut (also shift+d)",
      run: () => print(cut() ? "director's cut on. the machinery is showing." : "director's cut off."),
    },
    morph: {
      about: 'morph <word> - the wordmark becomes it',
      run: (a) => {
        const word = a.join(' ').slice(0, 14);
        if (!word) return print('usage: morph <word>', 'term__l--err');
        leave(async () => {
          if (!swarm.live) stage.goto(DUR);
          for (let i = 0; i < 300 && !swarm.live; i++) await new Promise(requestAnimationFrame);
          wordplay.say(word);
        });
      },
    },
    history: { about: 'what you typed', run: () => print(hist.map((h, i) => `  ${String(i + 1).padStart(3)}  ${h}`)) },
    date: { run: () => print(new Date().toString()) },
    uptime: { run: () => print(`up ${Math.round((performance.now() - born) / 1000)}s on this page`) },
    pwd: { run: () => print(`/film/${location.hash.slice(1) || 'top'}`) },
    echo: { run: (a) => print(a.join(' ')) },
    clear: {
      about: 'clear the screen',
      run: () => {
        queue = Promise.resolve();
        out.replaceChildren();
      },
    },
    exit: { about: 'close the terminal', run: () => close() },
    sudo: { run: () => print('nice try.') },
    rm: {
      run: async (a) => {
        if (a.join(' ') !== '-rf /') return print('rm: refusing to remove anything here.', 'term__l--err');
        await print(['removing /film ...', 'removing /particles ...', 'removing /universe ...']);
        sfx('glitch');
        document.documentElement.classList.add('is-glitch');
        await new Promise((r) => setTimeout(r, 900));
        document.documentElement.classList.remove('is-glitch');
        return print('just kidding. nothing was harmed.');
      },
    },
  };

  function run(line) {
    const [name, ...args] = line.trim().split(/\s+/);
    if (!name) return;
    const c = C[name.toLowerCase()];
    if (!c) return print(`${name}: command not found. try help`, 'term__l--err');
    return c.run(args);
  }

  /* ---------------- input ---------------- */
  function complete() {
    const v = input.value, parts = v.split(/\s+/);
    let pool, word;
    if (parts.length <= 1) {
      pool = Object.keys(C);
      word = parts[0] || '';
    } else {
      const c = C[parts[0].toLowerCase()];
      pool = typeof c?.args === 'function' ? c.args() : c?.args || [];
      word = parts.at(-1);
    }
    const hits = pool.filter((p) => p.startsWith(word.toLowerCase()));
    if (hits.length === 1) {
      parts[parts.length - 1] = hits[0];
      input.value = `${parts.join(' ')} `;
    } else if (hits.length > 1) {
      // longest shared start, then show the options
      let pre = hits[0];
      for (const h of hits) while (!h.startsWith(pre)) pre = pre.slice(0, -1);
      parts[parts.length - 1] = pre;
      input.value = parts.join(' ');
      echo(v);
      print(hits.join('  '));
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const line = input.value;
    input.value = '';
    echo(line);
    sfx('enter');
    if (line.trim()) {
      hist = [...hist.filter((h) => h !== line), line].slice(-50);
      try {
        sessionStorage.setItem(HIST_KEY, JSON.stringify(hist));
      } catch {
        /* not kept */
      }
    }
    at = hist.length;
    run(line);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      complete();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      at = Math.max(0, Math.min(hist.length, at + (e.key === 'ArrowUp' ? -1 : 1)));
      input.value = hist[at] ?? '';
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      C.clear.run();
    } else if (e.key.length === 1) sfx('type');
  });
  root.addEventListener('pointerdown', (e) => {
    if (e.target === root) close(); // the backdrop
  });
  root.querySelector('[data-term-close]')?.addEventListener('click', close);

  /* ---------------- open / close ---------------- */
  function show() {
    if (open) return;
    open = true;
    lastFocus = document.activeElement;
    root.hidden = false;
    requestAnimationFrame(() => root.classList.add('is-open'));
    stage.pause();
    document.body.style.overflow = 'hidden'; // the wheel over the window must not move the film
    sfx('power');
    at = hist.length;
    if (!out.childElementCount) {
      // the first time: say hello and show what it can do right away
      print(['welcome to the nullradix terminal.', 'here is what it can do (type help any time):', '']);
      C.help.run();
    }
    input.value = ''; // a fresh prompt every time it opens
    input.focus({ preventScroll: true });
  }
  function close() {
    if (!open) return;
    open = false;
    root.classList.remove('is-open');
    document.body.style.overflow = '';
    stage.resume();
    sfx('off');
    setTimeout(() => !open && (root.hidden = true), 240);
    if (lastFocus && lastFocus !== document.body) lastFocus.focus({ preventScroll: true });
    else input.blur();
  }

  onKey((e) => {
    if (e.key === '~' || e.code === 'Backquote') {
      // on a German keyboard ^ is a dead key: the system holds it back and puts it in front of the
      // next letter typed (^h, or ê for a vowel) - nothing in the page can cancel that, so the
      // first thing typed gets cleaned up instead
      dead = e.key === 'Dead';
      show();
      return true;
    }
    return false;
  }, 10);
  input.addEventListener('input', () => {
    if (!dead) return;
    dead = false;
    const v = input.value;
    const clean = v.replace(/^[\^`´]/, '').replace(/^./, (c) => c.normalize('NFD').replace(/[\u0300-\u0302]/g, '').normalize('NFC'));
    if (clean !== v) input.value = clean;
  });
  input.addEventListener('blur', () => (dead = false));
  opener?.addEventListener('click', () => (open ? close() : show()));

  return { open: show, close, run, get isOpen() { return open; } };
}

