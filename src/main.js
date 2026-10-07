import './styles/index.css';

// self-hosted variable fonts
import '@fontsource-variable/roboto-flex/full.css'; // wght + wdth + opsz axes
import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';

import { env, setMotionOverride } from './modules/env.js';
import { createPanel } from './modules/panel.js';
import { renderContent, wireCopy, tour } from './scenes/content.js';
import { renderDossier } from './scenes/dossier.js';
import { createStage } from './stage/stage.js';
import { createHud } from './stage/hud.js';
import { createFx } from './stage/fx.js';
import { createGate } from './stage/gate.js';
import { createHero } from './scenes/hero.js';
import { createAbout } from './scenes/about.js';
import { createWork } from './scenes/work.js';
import { createSkills } from './scenes/skills.js';
import { createContact } from './scenes/contact.js';
import { createSwarmLayer } from './scenes/swarm.js';
import { createWordplay } from './scenes/wordplay.js';
import { createTerminal } from './modules/terminal.js';
import { createCut } from './stage/cut.js';
import { createReactive } from './stage/react.js';
import { createScrub } from './stage/scrub.js';
import { createHints } from './stage/hints.js';
import { wirePageJumps, takeArrival } from './modules/pagejump.js';
import { createSphereLayer } from './scenes/sphere.js';
import { createSound } from './audio/sound.js';
import { pickFormat } from './stage/cover.js';
import { qs, qsa } from './utils/dom.js';
import { bindSfx } from './utils/sfx.js';

let stage = null;

function boot() {
  takeArrival(); // the start page opens onto its gate, not through the lens
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  const panel = createPanel({ onOpen: () => stage?.pause(), onClose: () => stage?.resume(), list: tour.map((x) => x.project) });
  const anchors = renderContent(panel);
  renderDossier(panel);
  wireCopy();
  if (env.mode === 'film') startFilm(anchors, panel);
  else startStatic(false);
}

function startFilm(anchors, panel) {
  document.body.dataset.mode = 'film';
  const sound = createSound({ arm: false });
  const gate = createGate({
    onEnter: (withSound) => {
      sound.enter(withSound);
      stage?.enableTilt(); // inside the click: iOS asks for motion access here
      stage?.resume();
    },
  });
  stage = createStage({
    hold: gate.done,
    onJump: (phase) => sound.jump(phase),
    onStatus: (s) => (document.body.dataset.filmState = s),
    onFail: () => {
      stage?.destroy();
      stage = null;
      startStatic(true);
    },
  });
  stage.add(gate.update);
  stage.add(sound.update); // first: the visuals read this frame's levels and hits
  const react = createReactive({ sound, stage });
  stage.add(react.update);
  stage.add(createHud());
  stage.add(createScrub({ stage }));
  stage.add(createFx());
  stage.add(createSphereLayer({ react }));
  stage.add(createHero());
  stage.add(createAbout());
  stage.add(createWork(anchors));
  stage.add(createSkills());
  const swarm = createSwarmLayer({ react });
  stage.add(swarm.update);
  const wordplay = createWordplay(swarm);
  stage.add(wordplay.update);
  stage.add(createContact());
  const cut = createCut({ stage, swarm });
  stage.add(cut.update); // last: it reads where everything ended up this frame
  const terminal = createTerminal({ stage, panel, wordplay, swarm, cut: cut.toggle });
  stage.add(createHints({ terminal, cut }));
  wirePageJumps({ onPhase: (p) => sound.jump(p) }); // Impressum, Datenschutz: through the lens
  wireUiSound(sound);
  motionToggle('Motion on', () => {
    setMotionOverride('0');
    location.reload();
  });
  stage.start();
  stage.pause(); // no scrolling past the entrance
  if (import.meta.env.DEV) Object.assign(window, { __nrStage: stage, __nrSound: sound, __nrSwarm: swarm });
}

// interface sounds: a tick when the pointer reaches something clickable, a press when it is used
function wireUiSound(sound) {
  bindSfx(sound.ui);
  const hit = 'a, button, [data-scrub]';
  let over = null;
  if (matchMedia('(pointer: fine)').matches)
    document.addEventListener('pointerover', (e) => {
      const t = e.target.closest?.(hit);
      if (t && t !== over) sound.ui('tick');
      over = t;
    });
  document.addEventListener('click', (e) => e.target.closest?.('a, button') && sound.ui('press'), true);
}

function startStatic(fallback) {
  document.body.dataset.mode = 'static';
  qs('[data-gate]').hidden = true;
  document.documentElement.classList.remove('is-gated');
  // the film is gone: drop every inline style the choreography left behind
  for (const n of qsa('main [style], [data-anchors] [style], [data-leaders] *')) {
    if (n.closest('[data-panel]')) continue;
    if (n.namespaceURI === 'http://www.w3.org/2000/svg') n.remove();
    else n.removeAttribute('style');
  }
  window.scrollTo(0, 0);
  const fmt = pickFormat(innerWidth, innerHeight);
  for (const s of qsa('[data-scene]')) s.style.setProperty('--still', `url(/film/${fmt}/stills/${s.dataset.scene}.webp)`);
  qs('[data-sound]').hidden = true;
  if (!fallback && env.filmSupported)
    motionToggle('Play film', () => {
      setMotionOverride('1');
      location.reload();
    });
}

function motionToggle(text, onClick) {
  const b = qs('[data-motion]');
  b.hidden = false;
  b.textContent = text;
  b.onclick = onClick;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
