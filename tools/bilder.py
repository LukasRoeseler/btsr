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

# Motiv -> Datei in photos/. Die Zuordnung steht im Plan (Bildzuordnung).
MOTIVE = {
    'titel': '18056.jpg',
    'haupt': '5093976649_62c0292c23_b.jpg',
    'fahren': '21657.jpg',
    'auto': '22587.jpg',
    'garage': '22588.jpg',
    'strecke-bahn': '46540087335_c9ef8b2130_b.jpg',
    'strecke-frei': '6910463278_f7aa66a535_b.jpg',
    'rennen': '5312287579_dc9129400c_b.jpg',
    'start': '8235257227_85c36413c3_b.jpg',
    'mehrspieler': '6200027413_b0d71daac1_b.jpg',
    'optionen': '4606860454_93191a0463_b.jpg',
}
GROESSEN = {'-bg': 1920, '': 720}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ziel', default=os.path.join('mockup', 'img'))
    a = ap.parse_args()
    ziel = os.path.join(REPO, a.ziel)
    os.makedirs(ziel, exist_ok=True)
    summe = 0
    for name, datei in MOTIVE.items():
        pfad = os.path.join(QUELLE, datei)
        if not os.path.exists(pfad):
            print('fehlt: ' + datei, file=sys.stderr)
            return 1
        bild = ImageOps.exif_transpose(Image.open(pfad)).convert('RGB')
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
