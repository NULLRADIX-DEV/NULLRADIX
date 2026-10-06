# NULLRADIX — The Film Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild nullradix.de as a scroll-scrubbed, pre-rendered 3D film with a match-moved live HTML layer.

**Architecture:** The video kit renders an environment-only film from a deterministic engine; a shared `world.js` (timeline, camera, anchors, cues, scroll keys) is copied into the site so the live layer projects DOM into the same camera. The site decodes H.264 segments with WebCodecs and draws the frame for the current scroll time; content layers are a pure function of film time.

**Tech Stack:** Vanilla JS (ES modules), Vite 7, Lenis, WebCodecs, WebAudio, CSS 3D; video kit: Playwright + Python (OpenCV/NumPy) + ffmpeg.

**Spec:** `docs/superpowers/specs/2026-10-06-scroll-film-design.md`

## Global Constraints

- Palette in `src/styles/tokens.css` lines 1–11 must not change; no accent colour; colour only as lens error (CA).
- Fonts: Roboto Flex (display, animated `wght`/`wdth`/`opsz`), Space Grotesk 600 (labels, `0.2em`, uppercase), Inter (body), JetBrains Mono (code only).
- Easing only `cubic-bezier(.2,1,.3,1)` and `cubic-bezier(.65,0,.35,1)`.
- All copy from `src/data/content.js` (hero copy in `index.html`); no invented facts.
- Film: 30 fps, 50 s, 1500 frames; landscape 1600×900, portrait 900×1600; GOP 15, no B-frames; no baked grain.
- No new runtime dependencies besides what `package.json` already has.
- `?motion=1` forces film, `?motion=0` forces static.
- Local only: no push, no deploy. `public/film/` media is git-ignored.

## Review Focus

- Visitor scrolls faster than segments download → nearest decoded frame stays on screen, HUD shows buffering, no blank canvas or exception.
- Viewport aspect between the two films (e.g. 4:3 tablet, ultrawide) → cover fit crops, anchored labels still land on their 3D points.
- Keyboard user tabs into a hidden scene's link → page scrolls to that scene so the focused element is visible.
- Resize / orientation change mid-scroll → film format switches (landscape ↔ portrait) and scroll position keeps the same film time.
- Browser without WebCodecs or with H.264 decode error → `<video>` fallback, then static mode if that fails too.

---

## File Structure

Video kit (`C:\Users\Tristan\source\repos\NULLRADIX_Videos\nullradix-video-kit\work\site-film\`):
- `world.js` — shared world (canonical). ES module syntax.
- `engine.js` — film renderer: particles, CSS-3D code tube, overlay, post-FX cues, `renderAt`.
- `head.html` — stage markup, styles, embedded fonts.
- `make.py` — builds `film-l.html` / `film-p.html` (strips `export`, injects `FMT`), syncs `world.js` into the site.
- `render_site.py` — renders both formats via `tools/render.py`, cuts web segments, stills, manifest, copies into `NULLRADIX/public/film/`.

Site (`C:\Users\Tristan\source\repos\NULLRADIX\`):
- `src/film/world.js` — generated copy of the shared world (do not edit).
- `src/film/mp4.js` — minimal MP4 demuxer.
- `src/film/player.js` — WebCodecs GOP player with `<video>` fallback.
- `src/stage/cover.js` — cover-fit math.
- `src/stage/scrollmap.js` — pure scroll ↔ time map.
- `src/stage/stage.js` — rAF orchestrator: scroll → t → frame → scenes.
- `src/stage/hud.js`, `src/stage/fx.js` (grain, cursor, parallax, impact RGB split).
- `src/scenes/{hero,about,work,skills,experience,contact}.js` — DOM choreography per scene.
- `src/audio/sound.js` — WebAudio soundscape.
- `src/modules/env.js` — modes + overrides. `src/modules/panel.js` — project dialog (kept).
- `src/styles/{base,stage,scenes,static,panel}.css` (+ existing `tokens.css`, `legal.css`).
- `tests/*.test.js` — `node --test`.

Removed: `src/field/`, `src/modules/{nav,projects,scroll,scrollfill,sections,typo}.js`, `src/styles/{components,field,layout}.css`.

---

### Task 1: Test runner, env overrides, content ↔ world sync guard

**Files:** Modify `package.json`, `src/modules/env.js`, `.gitignore`. Create `tests/env.test.js`.

**Interfaces — Produces:** `resolveMode({reducedMotion, saveData, override, filmSupported}) → 'film'|'static'` exported from `src/modules/env.js`; `npm test` runs `node --test tests/`.

- [ ] Add `"test": "node --test tests/"` to scripts; add `public/film/` to `.gitignore`.
- [ ] Write `tests/env.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMode } from '../src/modules/env.js';
test('override wins', () => {
  assert.equal(resolveMode({ reducedMotion: true, saveData: false, override: '1', filmSupported: true }), 'film');
  assert.equal(resolveMode({ reducedMotion: false, saveData: false, override: '0', filmSupported: true }), 'static');
});
test('reduced motion / save-data / unsupported → static', () => {
  assert.equal(resolveMode({ reducedMotion: true, saveData: false, override: null, filmSupported: true }), 'static');
  assert.equal(resolveMode({ reducedMotion: false, saveData: true, override: null, filmSupported: true }), 'static');
  assert.equal(resolveMode({ reducedMotion: false, saveData: false, override: '1', filmSupported: false }), 'static');
});
test('default film', () => {
  assert.equal(resolveMode({ reducedMotion: false, saveData: false, override: null, filmSupported: true }), 'film');
});
```
- [ ] Run `npm test` → FAIL (`resolveMode` missing). Implement `resolveMode` as a pure function (env.js must stay importable in Node: guard `matchMedia`/`location` with `typeof window`). Run → PASS. Commit.

### Task 2: Shared world (`world.js`)

**Files:** Create video-kit `work/site-film/world.js`, `work/site-film/make.py` (sync only for now); site copy `src/film/world.js`; tests `tests/world.test.js`, `tests/content-sync.test.js`.

**Interfaces — Produces (all named exports):**
- math: `clamp, c01, lerp, P, sstep, eOut, eIO, eIn, rnd, frac, add3, sub3, mul3, dot3, len3, nrm3, cross3, lerp3, I4, mm, T4, S4, RX, RY, xf`
- `FPS=30, DUR=50, FRAMES=1500`
- `FORMATS = { l:{W:1600,H:900}, p:{W:900,H:1600} }`
- `makeWorld(fmt) → { fmt, W, H, CX, CY, F0, cam(t) → {eye,tgt,F,roll,r,d,f,V}, proj(c, p, out=[]) → [X,Y,depth] }`
- `SCENES: {id, t0, t1, label, anchorT}[]` for ids `top, about, work, skills, contact`
- `LABELS: [t, text][]` (HUD scene labels)
- `CUES: {t, kind:'shock'|'slam'|'burst'|'drop', amp}[]`
- `SCROLL_KEYS: [t, vh][]` (strictly increasing in both)
- `NODES: {id, coord:{x,y}, pos:[x,y,z], top:[x,y,z]}[]` in tour order; `STOPS: {id, t0, tHold, t1}[]`
- `AXES: {neg:[x,y,z], pos:[x,y,z]}` for x and z axes of the work plane
- `PANELS: {pos, ry, w, h, M}[]` (4 skill panels, `M` = CSS model matrix incl. centring)
- `MILESTONES: {pos, t}[]` (5 experience markers)
- constants `ORIGIN, SPHERE_C, SPHERE_R, TUBE_Y, TUBE_R, TUBE_Z0, TUBE_Z1, W0`

- [ ] Write `tests/world.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as W from '../src/film/world.js';
for (const fmt of ['l', 'p']) test(`camera finite + continuous (${fmt})`, () => {
  const w = W.makeWorld(fmt); let prev = null;
  for (let f = 0; f <= W.FRAMES; f++) {
    const c = w.cam(f / W.FPS);
    for (const v of [...c.eye, ...c.tgt, c.F, c.roll]) assert.ok(Number.isFinite(v), `frame ${f}`);
    if (prev) assert.ok(W.len3(W.sub3(c.eye, prev.eye)) < 1400, `jump at frame ${f}`);
    prev = c;
  }
});
test('scroll keys strictly increasing', () => {
  for (let i = 1; i < W.SCROLL_KEYS.length; i++) {
    assert.ok(W.SCROLL_KEYS[i][0] > W.SCROLL_KEYS[i - 1][0]); assert.ok(W.SCROLL_KEYS[i][1] > W.SCROLL_KEYS[i - 1][1]);
  }
});
test('scenes tile the film', () => {
  const s = W.SCENES; assert.equal(s[0].t0, 0); assert.equal(s.at(-1).t1, W.DUR);
  for (let i = 1; i < s.length; i++) assert.equal(s[i].t0, s[i - 1].t1);
});
test('origin projects to a finite point in the hero', () => {
  const w = W.makeWorld('l'); const p = w.proj(w.cam(3.5), W.ORIGIN);
  assert.ok(p[2] > 0 && Number.isFinite(p[0]) && Number.isFinite(p[1]));
});
```
- [ ] Write `tests/content-sync.test.js`: every `NODES[i].id` exists in `content.projects` with identical `coord`; `PANELS.length === skills.length`; `MILESTONES.length === experience.length`.
- [ ] Run → FAIL. Implement `world.js` (camera shots per spec storyboard; portrait pulls the eye back from the target on wide shots), sync it with `python make.py --sync`. Run → PASS. Commit (site) — video kit commits on its own branch `site-film`.

### Task 3: Film engine — intro, hero, dive, code tube

**Files:** Create `work/site-film/{engine.js, head.html}`; extend `make.py` to build `film-l.html`, `film-p.html`.

**Interfaces — Consumes:** world.js exports. **Produces:** `window.nrReady`, `window.renderAt(t) → JSON fx` (video-kit contract; `grain` always 0).

- [ ] Particle system (N = 60 000) with groups: plane 0–29 999, sphere/rings/graph 30 000–43 999, dust 44 000–59 999; per-particle `pos(i,t)` with role morphs; DOF discs, motion streaks for fast particles, tonemap `1-exp(-a·1.9)`.
- [ ] Shots 0–16 s: origin ignition + shock ring igniting plane dots (0–1.4), swoop + sphere formation (1.4–3), hero drift (3–4.6), dive with roll + sphere → tube rings (4.6–7.5), cylindrical code tube (12-sided CSS-3D wall segments ≤ 525 px with real C#/.NET lines, opaque dark backing), slam pulses at the `CUES` of kind `slam`.
- [ ] Overlay canvas: origin crosshair (±9 px, ring r=4, “(0,0)”).
- [ ] `python make.py`; `python ../../tools/snap.py film-l.html 0.3,0.9,1.6,2.4,3.0,4.0,5.2,6.2,7.0,8.5,10.1,12.1,14.1,15.6 snaps-l --w 1600 --h 900`; `sheet.py`; inspect: readable black, no torn CSS planes, no empty frames, sphere framed right of centre (landscape) / upper half (portrait). Same for portrait. Commit.

### Task 4: Film engine — breakout, work, plot, skills, experience, contact

**Files:** Modify `work/site-film/engine.js`.

- [ ] Breakout portal + flash/shock (16–19), work plane around `W0` with axes drawn by particles and six pillars (ring + beam + cap) at `NODES`, node-to-node orbit (19–31), near top-down plot with arced edges and travelling pulses (31–34), particles tracing the four `PANELS` frames + under-glow (34–39.5), light timeline with five ticks at `MILESTONES` (39.5–44), hold → dolly zoom → implosion → drop flash → particles form NULLRADIX wordmark (44–50).
- [ ] `fxAt(t)` from `CUES` (flash ≤ .95, ca 6–18 at impacts, zoom ≤ .26 in implosion, glitch ≤ .25 s).
- [ ] Snap + sheet at 16.5, 17.2, 18.5, every `STOPS[i].tHold`, 32.5, 36, 38.5, 40.5, 43, 44.8, 46.2, 47, 48.5, 49.9 for both formats; inspect; fix; commit.

### Task 5: Render + pack pipeline

**Files:** Create `work/site-film/render_site.py`.

**Produces:** `NULLRADIX/public/film/{l,p}/seg-XX.mp4`, `public/film/{l,p}/manifest.json` = `{fps, frames, width, height, gop, segments:[{url, first, count}]}`, `public/film/{l,p}/stills/<sceneId>.webp`, copies `world.js`.

- [ ] Render with `tools/render.py --fps 30 --duration 50 --w W --h H --crf 18` (resumable chunks), cut 10 segments of 150 frames from the master with `trim=start_frame=a:end_frame=b,setpts=PTS-STARTPTS` and `-c:v libx264 -preset slow -crf 23 -profile:v high -g 15 -keyint_min 15 -sc_threshold 0 -bf 0 -pix_fmt yuv420p -movflags +faststart -an`.
- [ ] Stills at each `SCENES[i].anchorT` → WebP q80. Manifest. Report sizes. Commit script (video kit).

### Task 6: MP4 demuxer

**Files:** Create `src/film/mp4.js`, `tests/mp4.test.js`, fixture `tests/fixtures/tiny.mp4` (ffmpeg testsrc, 64×36, 30 frames, GOP 15, bf 0).

**Produces:** `parseMp4(buf: ArrayBuffer) → { codec: string /* 'avc1.PPCCLL' */, description: Uint8Array /* avcC payload */, width, height, timescale, samples: {offset, size, key}[] }`.

- [ ] Test:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMp4 } from '../src/film/mp4.js';
const buf = readFileSync(new URL('./fixtures/tiny.mp4', import.meta.url));
const m = parseMp4(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
test('track basics', () => { assert.match(m.codec, /^avc1\.[0-9a-f]{6}$/); assert.equal(m.width, 64); assert.equal(m.height, 36); });
test('30 samples, keyframes every 15', () => {
  assert.equal(m.samples.length, 30);
  assert.deepEqual(m.samples.map((s, i) => s.key ? i : -1).filter(i => i >= 0), [0, 15]);
});
test('samples lie inside the file', () => { for (const s of m.samples) assert.ok(s.offset + s.size <= buf.byteLength && s.size > 0); });
test('description is avcC (version 1)', () => assert.equal(m.description[0], 1));
```
- [ ] Run → FAIL; implement (boxes: moov/trak/mdia/minf/stbl, stsd→avc1→avcC, stsz, stco/co64, stsc, stss, tkhd/mdhd); run → PASS; commit.

### Task 7: Player + cover fit

**Files:** Create `src/film/player.js`, `src/stage/cover.js`, `tests/cover.test.js`.

**Produces:**
- `coverFit(vw, vh, W, H) → {k, ox, oy}`; `toScreen(fit, X, Y) → [x, y]`.
- `createPlayer({ canvas, base /* '/film/l/' */ }) → { ready: Promise<void>, setFrame(f:int), frame /* shown */, progress /* 0..1 */, onStatus(cb), destroy() }`.

- [ ] Test `coverFit(1000, 1000, 1600, 900)` → `k = 1000/900`, `ox = (1000 - 1600k)/2`, `oy = 0`; `toScreen` of the film centre is the viewport centre for several aspects. Implement; PASS.
- [ ] Player: fetch manifest, load segment 0 first then the rest sequentially (progress), `parseMp4` each, `VideoDecoder` per GOP decode → `createImageBitmap(frame)` → `frame.close()`; GOP LRU (`navigator.deviceMemory >= 8 ? 4 : 2`); prefetch next GOP in scroll direction; draw nearest available frame with cover fit; `<video>` per-segment fallback if `VideoDecoder.isConfigSupported` fails or decode errors; status events `loading|ready|buffering|fallback|failed`.
- [ ] Manual check in Chrome with a draft render; commit.

### Task 8: Site shell — markup, stage loop, scroll map, HUD, fx

**Files:** Rewrite `index.html`, `src/main.js`, `src/styles/base.css`; create `src/stage/{scrollmap,stage,hud,fx}.js`, `src/styles/stage.css`, `tests/scrollmap.test.js`; delete obsolete modules/styles listed above.

**Produces:** `makeScrollMap(keys) → { toT(v), toV(t), total }` (v in viewport heights); stage context passed to scenes: `ctx = { t, frameT, cam, world, fit, vw, vh, proj(p) → [x, y, depth] | null, impact /* 0..1 */ }`; scenes register via `stage.add(scene)` where `scene.update(ctx)`.

- [ ] Test scroll map: endpoints, monotonic, `toT(toV(t)) ≈ t` over the keys, clamps outside.
- [ ] Implement; markup: each scene `<section id class="scene" data-scene>` spacer (height from `SCROLL_KEYS`) + `.scene__layer` (fixed). HUD (brand, nav, coords, label, fov, timecode, buffer, sound + motion toggles). Intro autoplay 0→3 s on load (skippable by scroll, skipped on repeat visit in the session). Focus-in on a hidden scene scrolls to its `anchorT`. Format switch on resize keeps `t`. Commit.

### Task 9: Scenes

**Files:** Create `src/scenes/*.js`, `src/styles/scenes.css`, `src/styles/panel.css`; adapt `src/modules/panel.js`.

- [ ] hero: masked lines, axis-animated headline, status pulse, sub, CTAs; exit 4.0–5.2.
- [ ] about: label + lead with word fill (8.0–9.4), three slams at the `slam` cues with descriptions.
- [ ] work: section head, axis labels at `AXES`, per-stop tracked callout (leader line from projected `NODES[i].top`), “Open” → panel; plot: all labels + index list.
- [ ] skills: four CSS-3D glass panels in a `perspective: F` container using `matrix3d(T(0,0,F)·V·M)` scaled by cover fit; sheen follows cursor.
- [ ] experience: tracked callouts at `MILESTONES`.
- [ ] contact: slogan, scramble email, copy, socials, legal footer.
- [ ] Check with Playwright screenshots (desktop + phone) at every `anchorT` and stop; commit.

### Task 10: Static mode + no-JS

**Files:** Create `src/styles/static.css`; touch scenes for static markup states.

- [ ] `html[data-mode=static]` (and no-JS default): stacked sections on stills, projects list, skills grid, experience list, visible content without transforms; HUD button “Play film” sets override and reloads. Screenshot check; commit.

### Task 11: Sound

**Files:** Create `src/audio/sound.js`.

- [ ] Off by default; toggle creates `AudioContext`; drone (3 detuned saws + sub → lowpass driven by scroll velocity), filtered-noise air, kick on 0.5 s film grid inside the tube, impacts on `CUES` crossings in both directions, quiet HUD ticks; master compressor; mute on `visibilitychange`. Manual listen check; commit.

### Task 12: Verification + review

- [ ] `npm test`, `npm run build`, Playwright run (Edge channel) desktop 1600×900 + 1920×1080 + 390×844 in film mode (`?motion=1`) and static mode: screenshots at all anchors, zero console errors.
- [ ] Final whole-branch review (fresh reviewer), fix findings, update memory + README section.
