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
  assets/vendor/         – three.js r128 + utófeldolgozó modulok (MIT licenc), helyben tárolva
  assets/img/            – fotók helye (lásd assets/img/README.md)
public/                  – a kész, feltölthető weboldal (generált)
```

Oldalak: Főoldal, Rólunk, Tevékenységek, Géppark, Minőség, HC-02, Karrier, Kapcsolat –
magyarul a gyökérben (`/rolunk.html`), angolul az `/en/` alatt (`/en/about.html`).
A géplista (típus, kivitel, vezérlő, darabszám) a `src/build.py` `MACHINES` listájában van;
minden összesítést (CNC esztergák, megmunkálóközpontok, összes gép) a build számol belőle.

## Interaktív elemek

- Főoldal: valós idejű 3D esztergálási szimuláció revolverfejjel, szerszámcserével, csigafúróval,
  hűtő-kenő folyadékkal és forgáccsal. Mellette fut a valódi Fanuc 0i-TF szintaxisú NC program
  (G71 nagyolás, G74 mélyfúrás, G70 simítás, G76 menetvágás) soronkénti kiemeléssel és
  X/Z/S/F/T kijelzővel. Az alkatrész: M20×1,5 menetes sárgaréz persely.
- Filmes utófeldolgozás (bloom, mélységélesség, ACES tónusleképezés, vignetta), 3D Steel Riders
  fémjelvény a gép hátfalán. A vezérlőpulton élő szerszámpálya-rajz, ciklusidő, darabszámláló,
  orsóterhelés és modális G-kód.
- Fotóbemutató: a valódi fotókon pulzáló jelölők, kattintásra információs kártyák.
- Fotók: amíg egy kép hiányzik az `assets/img/` mappából, a helyén a 3D motor által
  renderelt alkatrészkép jelenik meg. A valódi fotó feltöltése után automatikusan az látszik.
- Géppark: kategória-, gyártó- és vezérlőszűrő, keresés, gyártónkénti és vezérlőnkénti megoszlás.
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
