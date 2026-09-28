#!/usr/bin/env python3
"""Build the static Steel Riders site into ../public.

Every page template holds both languages side by side:
    {{ _("Magyar szöveg", "English text") }}
The build renders each template twice – Hungarian into public/,
English into public/en/.

Usage:  python3 src/build.py
"""
import shutil
from datetime import date
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined

SRC = Path(__file__).resolve().parent
OUT = SRC.parent / "public"
SITE_URL = "https://steelriderskft.hu"

# key: (template, hu file, en file, hu nav label, en nav label)
PAGES = [
    ("home",      "index.html",         "index.html",        "Főoldal",        "Home"),
    ("about",     "rolunk.html",        "about.html",        "Rólunk",         "About us"),
    ("services",  "tevekenysegek.html", "capabilities.html", "Tevékenységek",  "Capabilities"),
    ("machinery", "geppark.html",       "machinery.html",    "Géppark",        "Machinery"),
    ("quality",   "minoseg.html",       "quality.html",      "Minőség",        "Quality"),
    ("hc02",      "hc-02.html",         "hc-02.html",        "HC-02",          "HC-02"),
    ("careers",   "karrier.html",       "careers.html",      "Karrier",        "Careers"),
    ("contact",   "kapcsolat.html",     "contact.html",      "Kapcsolat",      "Contact"),
]

# Machine park, as listed on the company's own "Géppark" page.
MACHINES = [
    {
        "hu": "CNC automata esztergák", "en": "CNC automatic lathes",
        "items": [
            ("INDEX GS30", "MBL", 4),
            ("INDEX GS30", "HydroBar", 1),
            ("INDEX GS42", "FMB Turbo", 1),
            ("STAR SR-20", "FMB Turbo", 3),
            ("STAR SR-16", "FMB Turbo", 2),
            ("STAR SA-12", "FMB Minimag", 2),
            ("STAR SB-16", "FMB Minimag 18", 1),
            ("STAR SB-20R type G", "LNS", 4),
            ("STAR SR-32J II", "LNS", 1),
            ("Hanwha ML26", "IEMCA Boss 542", 1),
            ("Nakamura-Tome TW-10", "", 1),
            ("Nakamura-Tome TW-20", "", 2),
        ],
    },
    {
        "hu": "CNC megmunkálóközpontok", "en": "CNC machining centres",
        "items": [
            ("Chiron FZ16", "", 1),
            ("Chiron FZ22", "", 1),
            ("KIWA Excel Center E31504", "", 1),
            ("OKK MCV-410", "", 1),
            ("Akira-Seiki SR 42 XP", "", 1),
            ("Bridgeport VMC 1000", "5 tengely / 5-axis", 1),
            ("Bridgeport Interact 412H", "", 1),
            ("Bridgeport Interact 720H", "", 2),
            ("Bridgeport 760", "", 1),
        ],
    },
    {
        "hu": "Egyéb CNC esztergák", "en": "Other CNC lathes",
        "items": [
            ("Mori Seiki ZL-15 SMC", "", 1),
            ("Mori Seiki ZL-25", "", 1),
            ("SZIM EEN-400", "", 3),
            ("SZIM EEN-630", "", 3),
        ],
    },
    {
        "hu": "Fűrészelés és szerszámkezelés", "en": "Sawing & tool management",
        "items": [
            ("Bomar STG 240 GANC", "CNC fűrész / CNC saw", 1),
            ("Forte BA-251", "CNC fűrész / CNC saw", 2),
            ("Matrix Maxi T", "Szerszámkiadó automata / Tool vending system", 1),
        ],
    },
]
for g in MACHINES:
    g["total"] = sum(q for _, _, q in g["items"])
TOTALS = {
    "lathes": MACHINES[0]["total"] + MACHINES[2]["total"],
    "centres": MACHINES[1]["total"],
    "cnc": sum(g["total"] for g in MACHINES[:3]) + 3,  # + 3 CNC saws
}


def render():
    env = Environment(
        loader=FileSystemLoader(SRC / "templates"),
        undefined=StrictUndefined,
        trim_blocks=True,
        lstrip_blocks=True,
    )
    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(SRC / "assets", OUT / "assets")

    for lang in ("hu", "en"):
        root = "" if lang == "hu" else "../"
        other_root = "en/" if lang == "hu" else "../"
        for key, hu_file, en_file, hu_label, en_label in PAGES:
            file = hu_file if lang == "hu" else en_file

            def _(hu, en, _lang=lang):
                return hu if _lang == "hu" else en

            def href(page_key, _lang=lang):
                p = next(p for p in PAGES if p[0] == page_key)
                return p[1] if _lang == "hu" else p[2]

            nav = [
                {"key": p[0], "href": href(p[0]), "label": p[3] if lang == "hu" else p[4]}
                for p in PAGES if p[0] not in ("home",)
            ]
            ctx = dict(
                _=_, lang=lang, page=key, href=href, nav=nav,
                root=root, asset=root + "assets/",
                alt_href=other_root + (en_file if lang == "hu" else hu_file),
                hu_url=f"{SITE_URL}/{'' if hu_file == 'index.html' else hu_file}",
                en_url=f"{SITE_URL}/en/{'' if en_file == 'index.html' else en_file}",
                machines=MACHINES, totals=TOTALS,
                year=date.today().year, years=date.today().year - 1997,
            )
            html = env.get_template(f"pages/{key}.html.j2").render(**ctx)
            dest = OUT / ("" if lang == "hu" else "en") / file
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(html, encoding="utf-8")
            print("built", dest.relative_to(OUT))


if __name__ == "__main__":
    render()
