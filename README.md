# NULLRADIX

Das Portfolio von Tristan unter [nullradix.de](https://nullradix.de). Die Startseite ist ein vorgerenderter 3D-Film, den der Scroll abspielt: Wer scrollt, fliegt mit der Kamera von einem Partikel-Ursprung durch eine Röhre aus Code über eine Koordinatenebene mit den Projekten bis zum Kontakt. Alles, was man liest oder anklickt, ist echtes HTML und folgt derselben Kamera wie der Film.

## Lokal starten

Du brauchst Node 20.19 oder neuer (siehe `.nvmrc`).

```bash
npm install
npx vite --host 127.0.0.1    # http://127.0.0.1:5173
npm test                     # node --test
npm run build                # nach dist/
```

Die Filmdateien unter `public/film/` sind nicht im Repo, weil sie rund 50 MB groß sind. Sie entstehen im Video-Kit (`NULLRADIX_Videos/nullradix-video-kit/work/site-film`) mit `python render_site.py`, das die Segmente direkt nach `public/film/` schreibt. Ohne sie zeigt die Seite die statische Fassung.

Wenn dein System „Bewegung reduzieren“ eingeschaltet hat, bekommst du ebenfalls die statische Fassung. Mit `?motion=1` erzwingst du den Film, mit `?motion=0` die statische Seite.

## Inhalte ändern

Alle Texte stehen in [`src/data/content.js`](src/data/content.js), nur die Hero-Zeile steht in `index.html`. Film und Seite müssen dieselbe Welt beschreiben: Ein Projekt steht im Film an seiner Koordinate `coord`, und `npm test` schlägt fehl, wenn `content.js` und `src/film/world.js` dabei auseinanderlaufen. Neue Projekte, Skill-Gruppen oder Stationen im Werdegang brauchen deshalb einen neuen Film.

`src/film/world.js` ist eine Kopie. Das Original liegt im Video-Kit, `python make.py --sync` kopiert es hierher.

## Wie die Seite aufgebaut ist

Der Film liegt als H.264-Segmente mit einem Keyframe alle 15 Bilder vor. `src/film/player.js` dekodiert per WebCodecs immer eine ganze Bildgruppe und zeigt beim Scrollen das passende Bild, zwischen zwei Bildern blendet es weich über. Ohne WebCodecs springt ein `<video>`-Element ein. `src/stage/stage.js` rechnet die Scroll-Position in Filmzeit um und gibt jedem Frame die Kamera des sichtbaren Bildes an die Szenen in `src/scenes/` weiter, die damit Karten, Beschriftungen und die Glas-Panels an ihre 3D-Punkte setzen. Der Ton in `src/audio/sound.js` wird live erzeugt und ist standardmäßig aus.

## Deploy

Die Seite läuft als Container. `.github/workflows/image.yml` baut das Image, `.github/workflows/deploy.yml` rollt einen Commit aus oder zurück. Details zum Server stehen im Betriebshandbuch.
