#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Menuebilder aus photos/ erzeugen: verkleinert, gedreht, als JPEG.

    python tools/bilder.py                 -> mockup/img/
    python tools/bilder.py --ziel img      -> img/ (fuer die App)

Die Originale in photos/ sind bis 4080 px gross und kommen NICHT ins Repo. Hier entstehen
je Motiv zwei Groessen: <name>-bg.jpg (1920 px, Hintergrund) und <name>.jpg (720 px, Kachel).
Die EXIF-Drehung wird angewandt, sonst stehen Handyfotos im Browser quer.

Alle Fotos sind vom Nutzer selbst (eigene Aufnahmen bzw. sein Flickr-Konto RLukas).
"""
import argparse
import os
import sys

from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
QUELLE = os.path.join(REPO, 'photos')

# Motiv -> Datei in photos/, wahlweise mit Drehung in Grad (gegen den Uhrzeigersinn).
# Zweite Runde eigener Fotos (BESTELLT: "Neue Bilder (von mir fotografiert) in die App
# einbauen (vom Auto und von der Strecke)"): der BMW M4 GT3 von hinten und von oben, die
# ausgedruckten Streifen mit blauen und roten Pfeilen, der Controller. 24225 ist das
# ACC-Foto und dient nur zur Orientierung - es kommt nicht in die App.
MOTIVE = {
    'titel': '18056.jpg',
    'haupt': '5093976649_62c0292c23_b.jpg',
    'fahren': '24281.jpg',                  # blaue und rote Pfeilstreifen, wie die Spuren
    'auto': '24276.jpg',                    # M4 GT3 von hinten
    'garage': ('24273.jpg', 90),            # M4 GT3 von oben, quer gelegt
    'strecke-bahn': '46540087335_c9ef8b2130_b.jpg',
    'strecke-frei': '24282.jpg',            # ausgedruckte Streifen
    'rennen': '5312287579_dc9129400c_b.jpg',
    'start': '8235257227_85c36413c3_b.jpg',
    'mehrspieler': '24279.jpg',             # Auto, Controller mit Telefonhalter
    'optionen': '24277.jpg',                # Controller nah
    'info': '24280.jpg',                    # roter Pfeil auf Schwarz
}
GROESSEN = {'-bg': 1920, '': 720}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ziel', default=os.path.join('mockup', 'img'))
    a = ap.parse_args()
    ziel = os.path.join(REPO, a.ziel)
    os.makedirs(ziel, exist_ok=True)
    summe = 0
    for name, eintrag in MOTIVE.items():
        datei, drehung = eintrag if isinstance(eintrag, tuple) else (eintrag, 0)
        pfad = os.path.join(QUELLE, datei)
        if not os.path.exists(pfad):
            print('fehlt: ' + datei, file=sys.stderr)
            return 1
        bild = ImageOps.exif_transpose(Image.open(pfad)).convert('RGB')
        if drehung:
            bild = bild.rotate(drehung, expand=True)
        for endung, breite in GROESSEN.items():
            b = bild.copy()
            b.thumbnail((breite, breite * 2), Image.LANCZOS)
            aus = os.path.join(ziel, name + endung + '.jpg')
            b.save(aus, 'JPEG', quality=78, optimize=True, progressive=True)
            summe += os.path.getsize(aus)
    print('%d Bilder in %s, %.1f MB' % (len(MOTIVE) * len(GROESSEN), a.ziel, summe / 1e6))
    return 0


if __name__ == '__main__':
    sys.exit(main())
