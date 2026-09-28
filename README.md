# Steel Riders Kft. – weboldal

Kétnyelvű (magyar / angol), többoldalas statikus weboldal a Steel Riders Kft. (Verpelét) számára.

## Szerkezet

```
src/
  build.py               – build: a sablonokból legenerálja a public/ mappát
  templates/base.html.j2 – közös fejléc, menü, lábléc
  templates/pages/*.j2   – oldalak; minden szöveg _("magyar", "english") párban
  assets/css/site.css    – stílus
  assets/js/part3d.js    – valós idejű 3D: esztergálási szimuláció és alkatrész-renderek
  assets/js/site.js      – menü, animációk, fülek, géppark-szűrő, ajánlatkérő varázsló
  assets/vendor/         – three.js r128 (MIT licenc), helyben tárolva
  assets/img/            – fotók helye (lásd assets/img/README.md)
public/                  – a kész, feltölthető weboldal (generált)
```

Oldalak: Főoldal, Rólunk, Tevékenységek, Géppark, Minőség, HC-02, Karrier, Kapcsolat –
magyarul a gyökérben (`/rolunk.html`), angolul az `/en/` alatt (`/en/about.html`).
A géplista a `src/build.py` `MACHINES` listájában van, a darabszámokat a build számolja.

## Interaktív elemek

- Főoldal: valós idejű 3D esztergálási szimuláció (homlokesztergálás → nagyolás → fúrás →
  simítás → beszúrás → menetvágás → leszúrás), egérrel forgatható, anyagváltóval.
- Fotók: amíg egy kép hiányzik az `assets/img/` mappából, a helyén a 3D motor által
  renderelt alkatrészkép jelenik meg. A valódi fotó feltöltése után automatikusan az látszik.
- Géppark: kategória- és gyártószűrő, keresés, gyártónkénti megoszlás.
- Ajánlatkérés: háromlépéses varázsló összesítéssel.

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
