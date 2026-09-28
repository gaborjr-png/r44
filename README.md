# Steel Riders Kft. – weboldal

Kétnyelvű (magyar / angol), többoldalas statikus weboldal a Steel Riders Kft. (Verpelét) számára.

## Szerkezet

```
src/
  build.py               – build: a sablonokból legenerálja a public/ mappát
  templates/base.html.j2 – közös fejléc, menü, lábléc
  templates/pages/*.j2   – oldalak; minden szöveg _("magyar", "english") párban
  assets/css/site.css    – stílus
  assets/js/site.js      – mobilmenü, fotó-helyőrzők, ajánlatkérő űrlap
  assets/img/            – fotók helye (lásd assets/img/README.md)
public/                  – a kész, feltölthető weboldal (generált)
```

Oldalak: Főoldal, Rólunk, Tevékenységek, Géppark, Minőség, HC-02, Karrier, Kapcsolat –
magyarul a gyökérben (`/rolunk.html`), angolul az `/en/` alatt (`/en/about.html`).
A géplista a `src/build.py` `MACHINES` listájában van, a darabszámokat a build számolja.

## Build

```
pip install jinja2
python3 src/build.py
```

A `public/` mappa tartalma build nélkül feltölthető bármilyen statikus tárhelyre.

## Helyi megtekintés

```
cd public && python3 -m http.server 8000   # http://localhost:8000
```

## Ajánlatkérő űrlap

Az űrlap összeállítja az ajánlatkérést, és a látogató levelezőprogramjában nyitja meg
(`info1@steelriderskft.hu`), így szerver nélkül is működik. Éles üzemben szerveroldali
küldésre (pl. PHP mailer, Formspree) cserélhető.
