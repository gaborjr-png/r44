# Kitöltendő adatok – élesítés előtt

A weboldalon jelenleg **mintaadatok** szerepelnek az alábbi helyeken. Mindegyiket cseréljük valós adatra,
majd futtassuk a `python3 src/build.py` parancsot.

| # | Mi | Hol javítandó | Jelenlegi mintaadat |
|---|----|---------------|---------------------|
| 1 | Tárhelyszolgáltató neve, címe, e-mailje (Impresszum – kötelező, Ektv. 4. §) | `src/build.py` → `SITE["host"]` | Rackhost Zrt., Szeged |
| 1 | Adatkezelési tájékoztató: hatálybalépés, megőrzési idők, adatfeldolgozók (könyvelő, IT) – jogásszal átnézetni | `src/templates/pages/privacy.html.j2` | általános GDPR-sablon |
| 2 | Ajánlatkérő űrlap címzett és feladó (a feladó a saját domainen legyen) | `src/api/config.php` | info1@ / weboldal@steelriderskft.hu |
| 3 | Technológiai paraméterek (rúdátmérők, munkaterek, tűrés, érdesség, átfutás) | `src/templates/pages/services.html.j2` → `#parameterek` | Ø1–32, Ø250, Ø630, 1020×510 mm, ±0,01 mm, Ra 0,4 |
| 4 | Válaszidő ajánlatkérésre | `src/build.py` → `SITE["response_hours"]`; GYIK: `contact.html.j2` | 48 óra; ajánlat 3–5 / 5–10 munkanap |
| 5 | ISO tanúsítványok: tanúsító, szám, érvényesség + **valós PDF-ek** | `SITE["certs"]`; fájlok: `src/assets/docs/iso-9001.pdf`, `iso-14001.pdf` | SGS Hungária Kft., 2027-06-30, „MINTA” PDF |
| 6 | Referenciák (iparág, alkatrész, számok) – vagy partnerlogók írásos engedéllyel | `src/templates/pages/home.html.j2` → `#referenciak` | 3 kitalált esettanulmány |
| 7 | Pályázatok: projektazonosító, támogatás összege és mértéke, befejezés | `src/templates/pages/projects.html.j2` | GINOP-1.2.8-20-2019-00123 (58,2 M Ft, 50%), GINOP-1.2.1-15-2015-00456 (149,6 M Ft, 45%) |
| 7 | Széchenyi 2020 infoblokk: a rajzolt változatot a **hivatalos képfájlra** cserélni | `src/templates/_infoblokk.html.j2` | HTML/SVG utánzat |
| 8 | Google Analytics 4 mérési azonosító | `SITE["ga4"]` | `G-XXXXXXXXXX` (így a mérés ki van kapcsolva) |
| 8 | Google Cégprofil értékelési link (`g.page/r/…/review`) | `SITE["review_url"]` | Google Térkép keresés |
| – | Munkásszálló: férőhely, szobák, távolság, szolgáltatások | `src/templates/pages/careers.html.j2` → `#szallas` | 24 férőhely, 2–3 ágyas (a 20 m-es távolság valós) |

## Tárhely-követelmények
- PHP 8.x a `mail()` függvénnyel (vagy SMTP) – az ajánlatkérő űrlap: `public/api/ajanlatkeres.php`
- `upload_max_filesize` és `post_max_size` legalább 20 MB
- HTTPS tanúsítvány
- 404-es oldal: `ErrorDocument 404 /404.html` (Apache) – az angol verzió: `/en/404.html`
