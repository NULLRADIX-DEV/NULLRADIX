# NULLRADIX

Das Portfolio von Tristan unter [nullradix.de](https://nullradix.de). Die Startseite ist ein vorgerenderter 3D-Film, den der Scroll abspielt: Wer scrollt, fliegt mit der Kamera von einem Partikel-Ursprung durch eine Röhre aus Code über eine Koordinatenebene mit den Projekten bis zum Kontakt. Alles, was man liest oder anklickt, ist echtes HTML und folgt derselben Kamera wie der Film. Nach dem Film schiebt sich ein ruhiger Index über das letzte Bild, der alle Inhalte noch einmal lesbar auf einer Seite zeigt.

## Was es zu entdecken gibt

- **Terminal:** `^` (oder `~`) oder der `>_`-Button unten öffnet es, `help` zeigt die Befehle (`goto work`, `open noose`, `morph hallo`, `about`, `cut` …).
- **Director's Cut:** `D` (am Filmende `Shift+D`) zeigt die Maschinerie hinter dem Film: die 3D-Welt als Drahtgitter, die mitlaufenden Elemente, den Kamerapfad, die Cue-Liste und die Telemetrie des Players.
- **Wort-Morph:** Am Ende einfach tippen, die Partikel des NULLRADIX-Schriftzugs formen das Wort. Auf dem Handy den Schriftzug antippen.
- **Timeline:** Die Leiste unten rechts zeigt beim Überfahren ein Vorschaubild, ein Klick springt durch die Linse dorthin, Ziehen spult.
- **Speed-Effekte:** Schnell vorwärts scrollen gibt Zoom-Blur, schnell zurück einen VHS-Rewind.
- **Sound:** live erzeugt, standardmäßig an. Der Equalizer, der Film und die Partikel reagieren darauf.
- **Handy:** Der Film folgt der Neigung des Geräts, der Finger drückt Partikel weg. Tastenkürzel gibt es dort nicht.
- **Zwischen den Seiten** (Impressum, Datenschutz) geht es durch die Linse, unbekannte Pfade landen auf einer eigenen 404-Szene.

## Lokal starten

Du brauchst Node 22 (siehe `.nvmrc`).

```bash
npm install
npx vite --host 127.0.0.1    # http://127.0.0.1:5173
npm test                     # node --test
npm run build                # nach dist/
```

Wenn dein System „Bewegung reduzieren“ eingeschaltet hat, bekommst du die statische Fassung. Mit `?motion=1` erzwingst du den Film, mit `?motion=0` die statische Seite.

## Der Film

Die Filmdateien liegen unter `public/film/` im Repo (rund 50 MB, beide Formate: 1600×900 und 900×1600). Sie entstehen im Video-Kit (`NULLRADIX_Videos/nullradix-video-kit/work/site-film`): `python render_site.py` rendert und schreibt Segmente, Standbilder und das Vorschaubild-Sprite der Timeline direkt nach `public/film/`, `python render_site.py --thumbs-only` erneuert nur das Sprite. Danach die geänderten Dateien committen.

## Inhalte ändern

Alle Texte stehen in [`src/data/content.js`](src/data/content.js), nur die Hero-Zeile steht in `index.html`. Film und Seite müssen dieselbe Welt beschreiben: Ein Projekt steht im Film an seiner Koordinate `coord`, und `npm test` schlägt fehl, wenn `content.js` und `src/film/world.js` dabei auseinanderlaufen. Neue Projekte, Skill-Gruppen oder Stationen im Werdegang brauchen deshalb einen neuen Film.

`src/film/world.js` ist eine Kopie. Das Original liegt im Video-Kit, `python make.py --sync` kopiert es hierher.

## Wie die Seite aufgebaut ist

- **Player** (`src/film/player.js`): Der Film liegt als H.264-Segmente mit einem Keyframe alle 15 Bilder vor. WebCodecs dekodiert immer eine ganze Bildgruppe, beim Scrollen erscheint das passende Bild, zwischen zwei Bildern blendet es weich über. Ohne WebCodecs (oder nach Dekodierfehlern) springt ein `<video>`-Element ein.
- **Stage** (`src/stage/stage.js`): rechnet die Scroll-Position in Filmzeit um und gibt jedem Frame die Kamera des sichtbaren Bildes an die Szenen in `src/scenes/`, die damit Karten, Beschriftungen und Glas-Panels an ihre 3D-Punkte setzen. Sie meldet auch, wie weit der Index über dem Film steht (`ctx.cover`), und springt per Linse zu Szenen oder Zeiten (`goto`, `gotoScene`).
- **Live-Ebenen:** Sphere und Schriftzug sind WebGL2-Partikel (`points.js`, `swarm-sim.js`), die Speed-Effekte eine eigene WebGL2-Ebene über dem Film (`speedfx.js`), die nur läuft, solange ein Effekt aktiv ist.
- **Ton** (`src/audio/sound.js`): live mit Web Audio erzeugt. Ein Startbildschirm holt den Klick, ohne den Browser keinen Ton erlauben. Ein Analyser liefert Pegel und Bänder für die audio-reaktiven Teile (`react.js`).
- **Extras:** Tastenkürzel laufen über `src/stage/keys.js`, Terminal (`src/modules/terminal.js`), Director's Cut (`src/stage/cut.js`), Wort-Morph (`src/scenes/wordplay.js`), Timeline (`src/stage/scrub.js`), Hinweise (`src/stage/hints.js`), Linse zwischen Seiten (`src/modules/pagejump.js`).

## Deploy

Die Seite läuft als Container. `.github/workflows/image.yml` baut das Image, `.github/workflows/deploy.yml` rollt einen Commit aus oder zurück. `deploy/nginx.conf` liefert unbekannte Pfade mit der eigenen 404-Seite aus und lässt Browser HTML und Film bei jedem Aufruf neu prüfen, damit nach einem Deploy niemand die alte Version behält. Details zum Server stehen im Betriebshandbuch.
