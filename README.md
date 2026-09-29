# NULLRADIX

A minimalist developer portfolio that behaves like a graphing instrument.
Everything is plotted from the origin **(0,0)** - an interactive coordinate
dot-field, a live `(x,y)` HUD, and projects placed on the plane.

Direction: **ORIGIN // (0,0)**. Stack: vanilla HTML/CSS/JS + Vite. No framework.

## Edit your content

All copy lives in **one file**: [`src/data/content.js`](src/data/content.js).
Edit `profile`, `projects`, `skills`, `experience`, and `socials` - both the
accessible list and the plotted view read from the same data.

Each project's `coord: { x, y }` (each axis ~ -100..100) places it between the
plane's four direction poles (see `axes` in the same file): `x` runs Frontend (-)
↔ Backend (+), `y` runs Infrastructure (-) ↔ Product (+).

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/
npm run preview  # serve the built site
```

Requires Node 20.19+ / 22.12+ (see `.nvmrc`).

## Design tokens

Palette and type live in [`src/styles/tokens.css`](src/styles/tokens.css). The
canvas reads its colors from these CSS variables, so changing a token updates
both the UI and the field. Single accent: `--c-origin` (#36F1CD).

## How it works

- `src/field/` - the canvas instrument: a jittered lattice (`particles.js`)
  driven by a spatial hash (`grid.js`) so cursor proximity is `O(neighbors)`.
  `field.js` runs the loop; `hud.js` is the live readout; `crosshair.js` pins
  the origin to the wordmark.
- Three render modes (`modules/env.js`): **animated** (desktop), **low-motion**
  (touch/small - calm static field, list-only nav), **static**
  (`prefers-reduced-motion` / Save-Data - one frame, no loop).
- The project **list** is the canonical, keyboard-accessible content; the
  plotted nodes are pointer-only enhancement that cross-highlight the list.

## Accessibility

WCAG-minded: skip link, semantic landmarks, visible focus, `prefers-reduced-motion`
respected, the field is `aria-hidden`, and the list is fully usable without the
scatter. Body text uses `--c-muted` (AA on the dark ground).

## Smooth scroll

Desktop uses [Lenis](https://github.com/darkroomengineering/lenis) (the only
runtime dependency besides fonts), disabled on touch / reduced-motion. To drop
the dependency entirely, remove `initScroll()` from `src/main.js` - native
`scroll-behavior: smooth` is already set in CSS.

## Deploy

Hosted as a container on the VPS (no longer Netlify).

- **Image** - `.github/workflows/image.yml` builds the `Dockerfile` (Node 22
  builds `dist/`, `nginx:stable-alpine` serves it with `deploy/nginx.conf`).
  Push to `main` pushes `ghcr.io/nullradix-dev/nullradix:<sha>` to GHCR; PRs
  only build.
- **Deploy** - push to `main`, wait for the Action, then run `.\deploy.ps1`
  (default: current `origin/main`) or `.\deploy.ps1 -Tag <sha>` for a specific
  commit / rollback. Nothing is built or copied locally.
- **Prerequisites** - the server needs a one-time `docker login ghcr.io -u <github-user>`
  with a Classic PAT (scope `read:packages` only; the packages are private).
  `deploy.ps1` needs the SSH key `~/.ssh/id_ed25519` (or pass `-IdentityFile`).
- **Server** - container `nullradix` (read-only, 64 MB limit) on
  `127.0.0.1:8080`, behind the host nginx (TLS via certbot).
  `www.nullradix.de` is proxied to the container; `nullradix.de` (apex)
  redirects to `www` with a 301.

`netlify.toml` is a leftover and unused.

Add a real `public/og-image.png` (1200×630) for social cards.
