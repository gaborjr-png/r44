# Feltöltés Rackforest cPanelre

A weboldal statikus HTML + egy PHP-fájl (ajánlatkérő űrlap). Adatbázis, WordPress nem kell.

## 0. A csomag elkészítése
```
python3 src/build.py --zip
```
Eredmény: `dist/steelriders-weboldal.zip` – ennek a **tartalmát** kell a `public_html` mappába tenni.

## 1. A régi oldal mentése
cPanel → **Fájlkezelő** → `public_html` → bal felül **Beállítások** → pipa: *Rejtett fájlok megjelenítése (dotfiles)*.
Jelöljön ki mindent → **Tömörítés** (Zip) → a kész `.zip`-et töltse le a gépére.

## 2. A régi fájlok eltávolítása
A `public_html` tartalmát törölje, vagy helyezze át egy `regi-oldal` mappába (a `.well-known` és a `cgi-bin` mappát hagyja meg).

## 3. Feltöltés
`public_html` → **Feltöltés** → `steelriders-weboldal.zip`.
Utána jobb klikk a zip-en → **Kibontás** → célmappa: `/public_html`. Végül a zip-et törölje.
Ellenőrizze: az `index.html` közvetlenül a `public_html`-ben legyen (ne egy almappában), és látszódjon a `.htaccess` is.

## 4. PHP verzió
cPanel → **MultiPHP Manager** vagy **Select PHP Version** → PHP **8.1 vagy újabb**.

## 5. E-mail az ajánlatkérő űrlaphoz
- cPanel → **E-mail fiókok** → hozza létre: `weboldal@steelriderskft.hu` (erről a címről mennek ki a levelek).
- A címzett az `api/config.php` fájlban állítható (`'to' => 'info1@steelriderskft.hu'`) – Fájlkezelőben jobb klikk → **Szerkesztés**.
- Ha a levelek spambe kerülnek: cPanel → **E-mail kézbesíthetőség** → SPF és DKIM „Javítás”.

## 6. HTTPS
cPanel → **SSL/TLS állapot** → **AutoSSL futtatása** (ha még nincs érvényes tanúsítvány).
A `.htaccess` automatikusan átirányít a `https://steelriderskft.hu` címre.

## 7. Ellenőrzés
- https://steelriderskft.hu és https://steelriderskft.hu/en/
- Egy nem létező cím (pl. /teszt) → saját 404-es oldal
- Régi cím (pl. /hu/kapcsolat) → átirányít az új Kapcsolat oldalra
- Kapcsolat → próba-ajánlatkérés egy PDF-fel → megérkezik-e a levél

## 8. Google
- **Google Search Console**: tulajdon hozzáadása → *Webhelytérképek* → `sitemap.xml` beküldése.
- **Google Analytics**: a mérési azonosítót (`G-…`) a `src/build.py` → `SITE["ga4"]` helyre kell írni, majd újra build + feltöltés.

## Frissítés később
Csak a megváltozott fájlokat kell felülírni, vagy az egész zip-et újra kibontani a `public_html`-be (felülírással).
