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


def local_refs(html):
    """Alle lokalen src=/href= aus dem Markup, mit Zeilennummer.

    Auch aus KOMMENTAREN. Das ist Absicht und nicht Faulheit: ein auskommentierter
    Block mit href= auf eine geloeschte Datei ist eine Zeitbombe - er wird eines Tages
    wieder einkommentiert, und dann fehlt die Datei. Wer einen Block stilllegt, soll
    die Verweise darin mit stilllegen.
    """
    raus = []
    for nr, zeile in enumerate(html.split(chr(10)), 1):
        for attr in ('src="', 'href="'):
            i = 0
            while True:
                i = zeile.find(attr, i)
                if i < 0:
                    break
                i += len(attr)
                j = zeile.find(chr(34), i)
                if j < 0:
                    break
                ziel = zeile[i:j]
                i = j
                if not ziel or ziel[0] in '#?':
                    continue
                if '://' in ziel or ziel.startswith(('data:', 'mailto:', '//')):
                    continue
                raus.append((nr, ziel.split('?')[0].split('#')[0]))
    return raus


def check_dict(quelle):
    # Das Anfuehrungszeichen als Zeichencode, damit diese Datei selbst keine
    # verschachtelten Anfuehrungszeichen braucht.
    Q = chr(34)
    """Waisen im Woerterbuch I18N_EN finden.

    Es hat zwei Schreibweisen: ein Paar auf einer Zeile, oder Schluessel und Wert auf
    zwei. Loescht man bei der zweiten nur die Schluesselzeile, bleibt die Wertzeile als
    nackte Zeichenkette stehen - ein SyntaxError, der die ganze IIFE abbricht. Dann
    existiert OMEGA_TEST nicht, und der Selbsttest kann nichts melden: man sieht eine
    leere App und "Unexpected string" in der Konsole.

    Deshalb hier und nicht im Selbsttest - der laeuft erst NACH dem Parsen.
    """
    zeilen = quelle.split(chr(10))
    start = None
    for n, z in enumerate(zeilen):
        if 'I18N_EN' in z and '=' in z:
            start = n
            break
    if start is None:
        return []
    ende = len(zeilen)
    for n in range(start + 1, len(zeilen)):
        if zeilen[n] == '  };':
            ende = n
            break

    def art(z):
        t = z.strip()
        if not t or t.startswith('//'):
            return 'kommentar'
        if Q + ': ' + Q in t:
            return 'paar'
        if t.endswith(Q + ':'):
            return 'schluessel'
        if t.startswith(Q) and (t.endswith(Q + ',') or t.endswith(Q)):
            return 'wert'
        return 'unklar'

    fehler = []
    vorige = None
    for n in range(start + 1, ende):
        a = art(zeilen[n])
        if a == 'kommentar':
            continue
        if a == 'wert' and vorige != 'schluessel':
            fehler.append((n + 1, 'Wert ohne Schluessel davor', zeilen[n].strip()[:70]))
        if a == 'schluessel' and vorige == 'schluessel':
            fehler.append((n, 'Schluessel ohne Wert danach', zeilen[n - 1].strip()[:70]))
        if a == 'unklar':
            fehler.append((n + 1, 'weder Paar noch Schluessel noch Wert',
                           zeilen[n].strip()[:70]))
        vorige = a
    return fehler


def check_refs(html):
    fehlend = []
    for nr, ziel in local_refs(html):
        if not os.path.exists(os.path.join(REPO, ziel)):
            fehlend.append((nr, ziel))
    return fehlend


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

    fehlend = check_refs(built)
    dictfehler = check_dict(built)

    with io.open(OUT, 'w', encoding='utf-8', newline='') as f:
        f.write(built)
    print('index.html gebaut: %d Zeichen aus %d Dateien' % (len(built), len(names)))
    for n in names:
        print('  ' + n)

    # Die Pruefung steht NACH dem Schreiben und bricht nicht ab: ein fehlender Verweis
    # macht die App nicht unbrauchbar, und ein Bau, der gar nichts schreibt, macht das
    # Suchen schwerer. Aber sie ist laut und gibt einen Fehlerwert zurueck - damit
    # faellt sie in einer Kette auf.
    if fehlend:
        print('', file=sys.stderr)
        print('FEHLENDE VERWEISE: %d' % len(fehlend), file=sys.stderr)
        for nr, ziel in fehlend:
            print('  Zeile %-6d %s' % (nr, ziel), file=sys.stderr)
        return 2

    if dictfehler:
        print('', file=sys.stderr)
        print('WOERTERBUCH KAPUTT: %d Stellen' % len(dictfehler), file=sys.stderr)
        for nr, warum, text in dictfehler:
            print('  Zeile %-6d %-32s %s' % (nr, warum, text), file=sys.stderr)
        print('  Eine Waise ist ein SyntaxError: die IIFE bricht ab, OMEGA_TEST fehlt,'
              ' und der Selbsttest kann nichts melden.', file=sys.stderr)
        return 2
    print('  Woerterbuch geprueft: keine Waisen')
    print('  Verweise geprueft: %d lokale src/href, alle vorhanden'
          % len(local_refs(built)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
