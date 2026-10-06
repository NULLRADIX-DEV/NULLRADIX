# NULLRADIX — The Film (scroll-scrubbed 3D redesign)

Status: approved 2026-10-06 (user gave creative freedom: "komplett rogue gehen").
Scope: local only. Branch `redesign/scroll-film`, no push, no deploy.

## Intent

Complete redesign of nullradix.de as one continuous 3D camera flight. Scroll is
the playhead. Brand stays: monochrome tokens (`src/styles/tokens.css`), Roboto
Flex with animated variable axes, Space Grotesk HUD labels, Inter body,
JetBrains Mono for code, the origin (0,0), the jittered dot field, the
coordinate plane (Frontend ↔ Backend, Infrastructure ↔ Product), grain.
All copy keeps coming from `src/data/content.js`.

Success: a first-time visitor scrolls through a cinematic film whose text,
cards and panels sit exactly inside the 3D world, stays readable and clickable
throughout, and the page still works without motion, without WebCodecs and
without JS.

## Architecture

Two layers that share one world definition.

1. **Film** (pre-rendered, `NULLRADIX_Videos/nullradix-video-kit/work/site-film/`).
   Deterministic `renderAt(t)` engine (video-kit contract) that draws only the
   environment: ~60k particles, plane, sphere, code tube, project pillars, graph,
   timeline, wordmark, plus post-FX (bloom, CA, shockwaves, flash). No content
   text. Grain is *not* baked (live overlay instead) to keep files small.
   Rendered at 1600×900 (landscape) and 900×1600 (portrait), 30 fps, 50 s.
   Packaged as H.264 MP4 segments (GOP 15, no B-frames, closed GOPs,
   faststart) + WebP stills + `manifest.json`, copied to `public/film/`.

2. **Live layer** (the site, vanilla JS + Vite + Lenis). Fixed full-screen
   film canvas, fixed HUD, and per-section fixed content layers whose
   choreography is a pure function of film time `t`.

3. **Shared `world.js`** — the single source of truth for timeline, camera
   path (`cam(t, fmt)`), projection and 3D anchors (origin, axis ends, project
   nodes, skill panels, experience markers). Lives in the video kit; a pack
   step copies it to `src/film/world.js`. Because the site evaluates the same
   camera the film was rendered with, DOM labels, callouts and CSS-3D glass
   panels are match-moved to the film with zero extra data.

## Storyboard (film seconds)

| Scene | t | Film | DOM |
|---|---|---|---|
| Intro (auto ~3 s on load) | 0–3 | Black → origin point + crosshair → shockwave ignites the plane → camera swoops from top-down to a low angle while particles spiral up into a sphere above the origin | HUD boots with scramble |
| Hero | 3–4.6 | Sphere turning above an endless dot plane | Headline (axes animate in), status, sub, CTAs |
| Dive | 4.6–7.5 | Camera rushes into the sphere, streaks, barrel roll; sphere unwinds into rings of a cylindrical code tube | Hero lines exit through masks |
| About | 7.5–16 | Flight down a tube of real C#/.NET code; particle rings pulse | Lead with scroll-fill; slams *Correctness. Clarity. Durability.* (wght 1000→760, wdth 150→80) + text |
| Breakout | 16–19 | Light portal, flash + shockwave, camera bursts out high over the work plane; axes draw; six project pillars ignite | Section head, axis labels anchored in 3D |
| Work | 19–31 | Node-to-node flight, slow orbit per stop | Tracked callout card per project → panel |
| Plot | 31–34 | Near top-down: whole plot, nodes wire up, data pulses | All node labels + index, clickable |
| Skills | 34–39.5 | Particles trace four panel frames rising from the plane | Four CSS-3D glass panels in film camera space, crisp text, sheen follows cursor |
| Experience | 39.5–44 | Low tracking shot along a light timeline with milestone ticks | Tracked milestone callouts |
| Contact | 44–50 | Freeze, dolly zoom, implosion into a point, flash, particles form NULLRADIX | Slogan, email (scramble), copy, socials, legal footer |

Scroll mapping is piecewise linear from scroll keyframes defined in
`world.js` (≈36 viewport heights in total, more scroll on reading holds).

## Player

- Own MP4 demuxer (moov → avcC, stsz, stco, stsc, stss; single video track),
  `VideoDecoder` (WebCodecs), decode whole GOPs into `ImageBitmap`s, LRU of
  GOPs sized by device memory, prefetch next GOP in scroll direction, always
  draw the nearest available frame (never blank).
- Segments of 150 frames; hero segment first, the rest loads in background;
  HUD shows buffer percentage.
- Fallback when WebCodecs/H.264 is unavailable or errors: per-segment `<video>`
  seeking into the same canvas.
- Canvas is drawn with object-fit: cover math; the same cover transform maps
  film pixel coordinates to the viewport for anchors and the CSS-3D layer.

## Live extras

HUD (brand + nav, live camera coordinates + scene label, fov/f, timecode,
buffer, sound toggle), mouse parallax (stage vs. HUD), cursor crosshair, live
grain, RGB split on DOM type at film impacts (driven by shared cue list).

## Sound

WebAudio, synthesized live, off by default, toggle in the HUD: drone whose
filter follows scroll velocity, air/whoosh noise on fast scroll, kick on the
film beat grid inside the tube (tempo follows scroll speed), impacts when the
playhead crosses cue times (both directions), soft HUD ticks.

## Modes and fallbacks

- `film` (default): everything above.
- `static`: `prefers-reduced-motion`, Save-Data, or no film support. Classic
  stacked page, each section on a film still, no scrubbing. A HUD button lets
  the visitor opt into the film. `?motion=1` forces film, `?motion=0` forces
  static (the owner's Windows has animations off).
- No JS: same markup renders as the static page.
- Legal pages keep their current styling.

## Out of scope

Deploy, pushing, Git LFS/CDN decision for the ~35 MB of film media
(`public/film/` is git-ignored for now), copy changes, i18n.

## Testing

- `node --test`: world camera finite and continuous across shot boundaries,
  scroll map monotonic and invertible, MP4 demuxer against a real segment.
- Video kit: `snap.py` contact sheets per scene for both formats, inspected.
- Site: Playwright (Edge/Chrome channel for H.264) screenshots at scene
  stations in film and static mode, desktop and phone viewports, no console
  errors; Lighthouse-style sanity on static mode.
