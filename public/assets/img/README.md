# Fotók / Photos

Megvan: `logo-badge.webp` (logó), `telephely.webp` (üzemépület), `alkatreszek-maras.webp`
(mart alkatrészek, megmunkálóközpont), `star-sr16.webp` (STAR SR-16 automata eszterga, alkatrészek).
További fotók: `csarnok.webp` (gyártócsarnok, nyitókép), `maras-munka.webp` (megmunkálóközpont munka
közben), `meroszoba.webp` (optikai mérőrendszer), `szallitas.webp` (szállításra kész alkatrészek),
`telephely-legi.webp`, `telephely-naplemente.webp` (légifotók), `hc02-repules.jpg` (HC-02 repülés közben),
`star-sr32.webp` (STAR SR-32J rúdadagolóval).
Ezek kivágásai (`pos`, `zoom` paraméter a sablonokban) töltik ki a legtöbb képhelyet.

Tegye ide a fotókat az alábbi fájlnevekkel (JPG, kb. 2000 px széles, 80% minőség).
Amíg egy fájl hiányzik, a helyén a 3D motor valós idejű alkatrész-renderje jelenik meg.

| Fájl | Hol jelenik meg | Javasolt tartalom |
|---|---|---|
| hero-csarnok.jpg | Főoldal fejléce | Gyártócsarnok, géppark áttekintő kép (fekvő, széles) |
| telephely.webp ✓ | Főoldal, Rólunk, Kapcsolat | Üzemépület (megvan) |
| cnc-esztergalas.jpg | Főoldal, Tevékenységek | INDEX / STAR eszterga munkatere |
| cnc-maras.jpg | Főoldal, Tevékenységek | Megmunkálóközpont (Chiron, Bridgeport) |
| alkatreszek.jpg | Főoldal, Tevékenységek | Kész esztergált/mart alkatrészek közelről |
| ontveny.jpg | Tevékenységek | Megmunkált alumínium- vagy sárgaréz-öntvény |
| geppark.jpg | Géppark fejléc + galéria | Csarnok, gépsor |
| index-gs30.jpg | Géppark galéria | INDEX GS30 |
| star-sr20.jpg | Géppark galéria | STAR SR-20 |
| chiron.jpg | Géppark galéria | Chiron FZ16 / FZ22 |
| rudadagolo.jpg | Géppark galéria | Rúdadagolók |
| meroszoba.jpg | Minőség | Mérőszoba, mérőeszközök |
| hc02.jpg | Főoldal, HC-02 | HC-02 helikopter |
| hc02-gyartas.jpg | HC-02 galéria | HC-02 alkatrészgyártás |
| hc02-szereles.jpg | HC-02 galéria | HC-02 szerelés |
| csapat.jpg | Karrier fejléc | Munkatársak a gépeknél |

Csere után futtassa: `python3 src/build.py`
