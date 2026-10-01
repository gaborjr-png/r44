#!/usr/bin/env python3
"""Build the static Steel Riders site into ../public.

Every page template holds both languages side by side:
    {{ _("Magyar szöveg", "English text") }}
The build renders each template twice – Hungarian into public/,
English into public/en/.

Usage:  python3 src/build.py
"""
import hashlib
import shutil
import sys
import zipfile
from datetime import date
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined

from grants import GRANTS

SRC = Path(__file__).resolve().parent
OUT = SRC.parent / "public"
SITE_URL = "https://steelriderskft.hu"

# key: (template, hu file, en file, hu nav label, en nav label)
PAGES = [
    ("home",      "index.html",         "index.html",        "Főoldal",        "Home"),
    ("about",     "rolunk.html",        "about.html",        "Rólunk",         "About us"),
    ("services",  "tevekenysegek.html", "capabilities.html", "Tevékenységek",  "Capabilities"),
    ("machinery", "geppark.html",       "machinery.html",    "Géppark",        "Machinery"),
    ("quality",   "minosegugy.html",    "quality.html",      "Minőségügy",     "Quality"),
    ("projects",  "projektek.html",     "projects.html",     "Projektek",      "Projects"),
    ("hc02",      "helikopter.html",    "helicopter.html",   "Helikopter",     "Helicopter"),
    ("careers",   "karrier.html",       "careers.html",      "Karrier",        "Careers"),
    ("contact",   "kapcsolat.html",     "contact.html",      "Kapcsolat",      "Contact"),
    ("imprint",   "impresszum.html",    "imprint.html",      "Impresszum",     "Imprint"),
    ("privacy",   "adatvedelem.html",   "privacy.html",      "Adatvédelem",    "Privacy"),
    ("notfound",  "404.html",           "404.html",          "404",            "404"),
]
HIDDEN = {"home", "imprint", "privacy", "notfound"}          # not in the main navigation
NO_INDEX = {"notfound"}                           # not in the sitemap

# Search / share descriptions per page (hu, en)
DESCRIPTIONS = {
    "home": ("Steel Riders Kft. – CNC forgácsolt fém alkatrészek gyártása 1997 óta Verpeléten. Közép- és nagysorozatú esztergált és mart alkatrészek alumíniumból, sárgarézből, acélból és műanyagból.",
             "Steel Riders Kft. – CNC machined metal components since 1997 in Verpelét, Hungary. Medium and large series of turned and milled parts in aluminium, brass, steel and plastics."),
    "about": ("A Steel Riders Kft. története: családi vállalkozás 1997 óta, 50 munkatárs, 27 000 m²-es saját telephely, 3 műszakos gyártás Verpeléten.",
              "The history of Steel Riders Kft.: a family business since 1997 with 50 employees, a 27,000 m² own site and 3-shift production in Verpelét, Hungary."),
    "services": ("CNC esztergálás, CNC marás, öntvény-megmunkálás, általános fémforgácsolás és sorozatgyártás – nézze meg, hogyan készül egy esztergált alkatrész.",
                 "CNC turning, CNC milling, casting machining, general metal cutting and series production – see how a turned part is made."),
    "machinery": ("A Steel Riders géppark: CNC automata esztergák (INDEX, STAR), ellenorsós esztergák, vertikális megmunkálóközpontok, NC és hagyományos gépek vezérlőkkel.",
                  "The Steel Riders machine park: CNC automatic lathes (INDEX, STAR), sub-spindle lathes, vertical machining centres, NC and conventional machines with controls."),
    "quality": ("ISO 9001 és ISO 14001, klimatizált mérőszoba 3D koordináta-mérőgéppel és optikai mérőrendszerrel, SAP alapú nyomon követés.",
                "ISO 9001 and ISO 14001, an air-conditioned measuring room with a 3D coordinate measuring machine and optical measuring system, SAP-based traceability."),
    "projects": ("A Steel Riders Kft. uniós és hazai támogatással megvalósult beruházásai 2012 óta: GINOP kapacitásbővítések, Irinyi Terv, napelemes rendszer, helikopterfejlesztés, csarnokátalakítás, SAP.",
                 "EU and national funded investments of Steel Riders Kft. since 2012: GINOP capacity expansions, Irinyi Plan, solar PV, helicopter development, hall conversion, SAP."),
    "hc02": ("Hungarocopter HC-02 – az első magyar fejlesztésű és gyártású kétszemélyes helikopter, amelyet a Hungaro-Copter Kft. és a Steel Riders Kft. közösen gyárt.",
             "Hungarocopter HC-02 – the first Hungarian-designed and built two-seat helicopter, manufactured jointly by Hungaro-Copter Kft. and Steel Riders Kft."),
    "careers": ("Karrier a Steel Riders Kft.-nél: CNC gépkezelő munkatársakat keresünk verpeléti üzemünkbe.",
                "Careers at Steel Riders Kft.: we are hiring CNC machine operators for our plant in Verpelét."),
    "contact": ("Kapcsolat és ajánlatkérés: Steel Riders Kft., 3351 Verpelét, Kossuth út 64. Tel.: +36 36 494 183.",
                "Contact and quotation requests: Steel Riders Kft., Kossuth út 64, 3351 Verpelét, Hungary. Phone: +36 36 494 183."),
    "imprint": ("A Steel Riders Kft. cégadatai: székhely, adószám, cégjegyzékszám, elérhetőségek.",
                "Company details of Steel Riders Kft.: registered office, VAT number, company registration number, contacts."),
    "privacy": ("A Steel Riders Kft. adatkezelési tájékoztatója és süti-szabályzata.",
                "Privacy notice and cookie policy of Steel Riders Kft."),
    "notfound": ("Az oldal nem található.", "Page not found."),
}

# Company data used across the site.
# Values marked PLACEHOLDER are approximate sample data – replace them with the
# real figures before going live (see TODO_ADATOK.md in the repository root).
SITE = {
    # Where the RFQ form is delivered (also set in src/api/config.php)
    "rfq_email": "info1@steelriderskft.hu",
    "response_hours": 48,                                   # PLACEHOLDER
    # Hosting provider – legally required in the imprint (Ektv. 4. §)
    "host": {
        "name": "Rackforest Zrt.",
        "address": "1132 Budapest, Victor Hugo utca 11. 5. em. B05001",
        "email": "info@rackforest.hu",
        "web": "https://rackforest.com",
        "phone": "+36 1 211 0044",
    },
    # Google Analytics 4 measurement ID – loaded only after cookie consent.
    # Leave as "G-XXXXXXXXXX" to disable analytics entirely.
    "ga4": "G-XXXXXXXXXX",                                  # PLACEHOLDER
    # Google Business Profile
    "maps_url": "https://www.google.com/maps/search/?api=1&query=Steel+Riders+Kft+Verpel%C3%A9t+Kossuth+%C3%BAt+64",
    "review_url": "https://www.google.com/maps/search/?api=1&query=Steel+Riders+Kft+Verpel%C3%A9t",  # PLACEHOLDER: g.page/r/…/review
    # Certificates (PDFs in src/assets/docs/)
    "certs": [                                              # PLACEHOLDER
        {"std": "ISO 9001:2015", "hu": "Minőségirányítási rendszer", "en": "Quality management system",
         "body": "SGS Hungária Kft.", "no": "HU25/000000", "valid": "2027-06-30", "file": "iso-9001.pdf"},
        {"std": "ISO 14001:2015", "hu": "Környezetirányítási rendszer", "en": "Environmental management system",
         "body": "SGS Hungária Kft.", "no": "HU25/000001", "valid": "2027-06-30", "file": "iso-14001.pdf"},
    ],
}

# Machine park – official list supplied by Steel Riders Kft.
# (model, description HU, description EN, controller, quantity)
AUTO = ("automata eszterga", "automatic lathe")
TWIN = ("két revolverfejes, C-tengelyes ellenorsós eszterga", "twin-turret lathe with C-axis and sub-spindle")
VMC = ("vertikális maró megmunkálóközpont", "vertical machining centre")
MACHINES = [
    {
        "key": "auto", "hu": "CNC automata esztergák", "en": "CNC automatic lathes",
        "items": [
            ("INDEX GS30", "két revolverfejes, mellékorsós automata eszterga", "twin-turret automatic lathe with sub-spindle", "Sinumerik C200", 1),
            ("STAR SA 12", *AUTO, "Fanuc 18i-T", 2),
            ("STAR SB 16", *AUTO, "Fanuc 18i-TB", 1),
            ("STAR SR 16", *AUTO, "Fanuc 16T", 2),
            ("STAR SR 20", *AUTO, "Fanuc 16-TT", 3),
            ("STAR SB 20", *AUTO, "Fanuc 0i-TF", 3),
            ("STAR SR 32 JII", *AUTO, "Fanuc 32i", 1),
            ("STAR SR 32 J", *AUTO, "Fanuc 18i-TB", 2),
        ],
    },
    {
        "key": "lathe", "hu": "CNC esztergák", "en": "CNC lathes",
        "items": [
            ("Mori Seiki ZL 15", *TWIN, "Fanuc 0-TT", 1),
            ("Mori Seiki ZL 25", "két revolverfejes eszterga", "twin-turret lathe", "Fanuc 15-TT", 1),
            ("Nakamura TW10", *TWIN, "Fanuc", 3),
            ("Nakamura TW20", *TWIN, "Fanuc", 1),
            ("Takisawa NEX108", "CNC eszterga", "CNC lathe", "Fanuc", 1),
            ("Takisawa NEX108Y", "CNC eszterga, Y-tengely", "CNC lathe, Y-axis", "Fanuc", 1),
            ("Takisawa EX910", "CNC eszterga", "CNC lathe", "Fanuc", 1),
        ],
    },
    {
        "key": "vmc", "hu": "CNC megmunkálóközpontok", "en": "CNC machining centres",
        "items": [
            ("Bridgeport Interact INT720H", *VMC, "Heidenhain TNC2500", 1),
            ("Bridgeport Interact VMC 760/22", *VMC, "Heidenhain TNC355", 1),
            ("Bridgeport Interact VMC1000 3D", *VMC, "Heidenhain TNC355", 1),
            ("Mori Seiki SV403", "vertikális megmunkálóközpont", "vertical machining centre", "Fanuc", 1),
            ("OKK MCV-410", *VMC, "Fanuc", 1),
            ("Akira Seiki SV1350", *VMC, "Mitsubishi", 1),
            ("Akira Seiki SR42 XP", *VMC, "Mitsubishi", 1),
            ("Akira Seiki V4 XP", *VMC, "Mitsubishi", 2),
            ("Akira Seiki RMV 650", *VMC, "Mitsubishi", 1),
            ("Akira Seiki RMV 700", *VMC, "Mitsubishi", 1),
        ],
    },
    {
        "key": "nc", "hu": "NC csúcsesztergák", "en": "NC centre lathes",
        "items": [
            ("EEN400", "csúcseszterga", "centre lathe", "Hunor PNC721", 3),
            ("EEN320", "csúcseszterga", "centre lathe", "Hunor PNC721", 1),
            ("EEN630", "csúcseszterga", "centre lathe", "Hunor PNC721", 1),
        ],
    },
    {
        "key": "saw", "hu": "Fűrészgépek", "en": "Sawing machines",
        "items": [
            ("Bomar STG 240 GA", "NC szalagfűrészgép", "NC band saw", "NC", 1),
            ("Forte BA-251", "szalagfűrészgép", "band saw", "–", 1),
        ],
    },
    {
        "key": "conv", "hu": "Hagyományos gépek", "en": "Conventional machines",
        "items": [
            ("E3N-01", "csúcseszterga", "centre lathe", "–", 2),
            ("Kraszny Proletar", "csúcseszterga", "centre lathe", "–", 1),
            ("FNGJ 32", "szerszámmarógép", "tool milling machine", "–", 1),
            ("FUS 22", "marógép vésőfej opcióval", "milling machine with slotting head", "–", 1),
            ("EZ 45-2", "oszlopos fúrógép", "column drilling machine", "–", 1),
            ("MM 435", "palástköszörű", "cylindrical grinder", "–", 1),
            ("TOS AT420", "síkköszörű", "surface grinder", "–", 1),
        ],
    },
]
for g in MACHINES:
    g["items"] = [dict(model=m, hu=h, en=e, ctrl=c, qty=q) for m, h, e, c, q in g["items"]]
    g["total"] = sum(i["qty"] for i in g["items"])
_by = {g["key"]: g["total"] for g in MACHINES}
TOTALS = {
    "auto": _by["auto"],
    "cnc_lathes": _by["auto"] + _by["lathe"],     # CNC automatic + CNC lathes
    "lathes": _by["auto"] + _by["lathe"] + _by["nc"],  # all CNC/NC lathes
    "centres": _by["vmc"],
    "cnc": _by["auto"] + _by["lathe"] + _by["vmc"] + _by["nc"],
    "all": sum(_by.values()),
}


def brand(model):
    if model.startswith("EEN"):
        return "EEN"
    for multi in ("Mori Seiki", "Akira Seiki", "Kraszny Proletar"):
        if model.startswith(multi):
            return multi
    return model.split(" ")[0]


def render():
    env = Environment(
        loader=FileSystemLoader(SRC / "templates"),
        undefined=StrictUndefined,
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.globals["brand"] = brand
    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(SRC / "assets", OUT / "assets")
    shutil.copytree(SRC / "api", OUT / "api")
    shutil.copytree(SRC / "static", OUT, dirs_exist_ok=True)   # .htaccess etc.
    # cache-busting version for CSS/JS
    ver = hashlib.md5(b"".join((SRC / "assets" / f).read_bytes() for f in
                               ("css/site.css", "js/site.js", "js/part3d.js"))).hexdigest()[:8]

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
                for p in PAGES if p[0] not in HIDDEN
            ]
            ctx = dict(
                _=_, lang=lang, page=key, href=href, nav=nav,
                root=root, asset=root + "assets/",
                alt_href=other_root + (en_file if lang == "hu" else hu_file),
                description=DESCRIPTIONS[key][0 if lang == "hu" else 1],
                noindex=key in NO_INDEX,
                site_url=SITE_URL,
                hu_url=f"{SITE_URL}/{'' if hu_file == 'index.html' else hu_file}",
                en_url=f"{SITE_URL}/en/{'' if en_file == 'index.html' else en_file}",
                machines=MACHINES, totals=TOTALS, site=SITE, grants=GRANTS, ver=ver,
                year=date.today().year, years=date.today().year - 1997,
            )
            html = env.get_template(f"pages/{key}.html.j2").render(**ctx)
            dest = OUT / ("" if lang == "hu" else "en") / file
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(html, encoding="utf-8")
            print("built", dest.relative_to(OUT))


def write_sitemap():
    today = date.today().isoformat()
    rows = []
    for key, hu_file, en_file, *_ in PAGES:
        if key in NO_INDEX:
            continue
        hu = f"{SITE_URL}/{'' if hu_file == 'index.html' else hu_file}"
        en = f"{SITE_URL}/en/{'' if en_file == 'index.html' else en_file}"
        for loc in (hu, en):
            rows.append(
                f"  <url><loc>{loc}</loc><lastmod>{today}</lastmod>"
                f'<xhtml:link rel="alternate" hreflang="hu" href="{hu}"/>'
                f'<xhtml:link rel="alternate" hreflang="en" href="{en}"/></url>'
            )
    (OUT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
        'xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + "\n".join(rows) + "\n</urlset>\n",
        encoding="utf-8")
    (OUT / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {SITE_URL}/sitemap.xml\n", encoding="utf-8")
    print("built sitemap.xml, robots.txt")


def package(dest):
    """Zip the finished site for upload (cPanel: extract into public_html)."""
    dest = Path(dest).resolve()
    dest.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(OUT.rglob("*")):
            if f.is_file() and f.name != "README.md":
                z.write(f, f.relative_to(OUT).as_posix())
    print("packaged", dest)


if __name__ == "__main__":
    render()
    write_sitemap()
    if "--zip" in sys.argv:
        i = sys.argv.index("--zip")
        package(sys.argv[i + 1] if len(sys.argv) > i + 1 else SRC.parent / "dist" / "steelriders-weboldal.zip")
