#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""index.html aus den Quelldateien in src/ zusammenbauen.

    python tools/build.py            baut index.html
    python tools/build.py --check    baut nichts, prueft nur ob index.html dem Bau entspricht

Warum es diesen Schritt gibt, und warum die Auslieferung trotzdem EINE Datei bleibt:

Der Wert dieser App ist, dass index.html per file:// laeuft, ohne Installation, ohne
Bundler, ohne Netz. Das bleibt so. Was sich aendert, ist die QUELLE: statt einer Datei mit
14000 Zeilen liegen die Teile in src/ und werden hier aneinandergehaengt. Genau dieses
Muster benutzt antragsmodule.html im selben Projektordner schon.

Die Reihenfolge steckt in den Zahlenpraefixen der Dateinamen und wird alphabetisch
gelesen. Das ist Absicht: die temporale Todeszone hat in dieser Datei schon vier
Ladeabbrueche verursacht (ein let/const, das weiter oben gelesen wird als es steht, bricht
die ganze IIFE ab). Eine Reihenfolge, die man im Verzeichnis SIEHT, ist gegen diesen Fehler
mehr wert als eine, die in einer Liste im Code steht.

Zusammengehaengt wird byteweise, ohne Trenner und ohne Zeilenumbruch dazwischen. Die
Dateien enthalten ihre Umbrueche selbst. Das ist die Voraussetzung dafuer, dass der Bau die
bisherige index.html Byte fuer Byte reproduzieren kann - und dieser Vergleich ist die
Abnahme, die den ganzen Umbau risikolos macht.
"""
import argparse
import io
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SRC = os.path.join(REPO, 'src')
OUT = os.path.join(REPO, 'index.html')


def pieces():
    """Alle Quelldateien in Namensreihenfolge."""
    if not os.path.isdir(SRC):
        raise SystemExit('FEHLER: %s gibt es nicht' % SRC)
    names = sorted(n for n in os.listdir(SRC)
                   if n.endswith(('.js', '.html')) and not n.startswith('.'))
    if not names:
        raise SystemExit('FEHLER: keine Quelldateien in %s' % SRC)
    return [os.path.join(SRC, n) for n in names]


def build():
    parts = []
    for p in pieces():
        with io.open(p, encoding='utf-8', newline='') as f:
            parts.append(f.read())
    return ''.join(parts)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--check', action='store_true',
                    help='nur pruefen, ob index.html dem Bau entspricht')
    a = ap.parse_args()

    built = build()
    names = [os.path.basename(p) for p in pieces()]

    if a.check:
        if not os.path.exists(OUT):
            print('index.html gibt es nicht', file=sys.stderr)
            return 1
        with io.open(OUT, encoding='utf-8', newline='') as f:
            have = f.read()
        if have == built:
            print('gleich: %d Zeichen aus %d Dateien' % (len(built), len(names)))
            return 0
        # Wo genau geht es auseinander? Eine Zahl allein hilft beim Suchen nicht.
        n = min(len(have), len(built))
        i = next((k for k in range(n) if have[k] != built[k]), n)
        zeile = have[:i].count('\n') + 1
        print('UNTERSCHIED ab Zeichen %d (Zeile %d): index.html %d Zeichen, Bau %d'
              % (i, zeile, len(have), len(built)), file=sys.stderr)
        print('  index.html: %r' % have[i:i + 60], file=sys.stderr)
        print('  Bau       : %r' % built[i:i + 60], file=sys.stderr)
        return 1

    with io.open(OUT, 'w', encoding='utf-8', newline='') as f:
        f.write(built)
    print('index.html gebaut: %d Zeichen aus %d Dateien' % (len(built), len(names)))
    for n in names:
        print('  ' + n)
    return 0


if __name__ == '__main__':
    sys.exit(main())
