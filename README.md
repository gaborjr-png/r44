# Steel Riders Kft. – weboldal

Kétnyelvű (magyar / angol) statikus weboldal a Steel Riders Kft. (Verpelét) számára,
precíziós CNC forgácsolással foglalkozó cégként.

## Szerkezet

```
index.html        – teljes oldal (magyar szöveg közvetlenül a HTML-ben)
css/style.css     – stílusok
js/main.js        – HU/EN nyelvváltás (angol szótár), animációk, ajánlatkérő űrlap
assets/favicon.svg
```

## Nyelvváltás

- A magyar szöveg a HTML-ben van, `data-i18n="kulcs"` attribútummal.
- Az angol fordítás a `js/main.js` `EN` objektumában ugyanazzal a kulccsal.
- A nyelv közvetlenül linkelhető: `?lang=en` / `?lang=hu`; a választást a böngésző megjegyzi.

## Ajánlatkérő űrlap

Az űrlap jelenleg a látogató levelezőprogramját nyitja meg előre kitöltött e-maillel
(`info1@steelriderskft.hu`), így szerver nélkül is működik. Éles üzemben érdemes
szerveroldali küldésre (pl. PHP mailer, Formspree, Netlify Forms) cserélni.

## Futtatás helyben

```
python3 -m http.server 8000
# majd: http://localhost:8000
```

Bármilyen statikus tárhelyre (tárhelyszolgáltató, Netlify, GitHub Pages) feltölthető build nélkül.
