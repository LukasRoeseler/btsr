# -*- coding: utf-8 -*-
"""Druckmuster erzeugen: Boxengasse, und Probemuster zum Knacken der Kodierung.

    python tools/make_patterns.py            alle Muster nach ./
    python tools/make_patterns.py --nur box  nur die Boxengasse

Warum dieses Werkzeug es gibt
=============================

Am 25.08. gemessen, mit dem Auto ueber gedruckte Muster gefahren:

    Original-Blatt des Benutzers      -> 0x0a
    target_finish.pdf, treu kopiert   -> 0x03
    boxengasse-a4.svg                 -> nichts erkannt

Der zweite Wert ist der aufschlussreiche. Die Kopie ist NACHWEISLICH treu - Balkenzahl,
Hoehen auf 0,000 mm und Luecken auf 0,001 mm stimmen mit dem PDF ueberein, und das PDF
enthaelt nachgeprueft keine weiteren Formen (ein Klipprechteck, neun Balken, ein Pfeil).
Trotzdem meldet das Original des Benutzers etwas anderes. Also ist target_finish.pdf nicht
die Vorlage, die 0x0a erzeugt.

Und 0x03 ist in der gemessenen Tabelle die LINKSKURVE. Es ist gut moeglich, dass dieses PDF
die Linkskurven-Vorlage ist. Sicher ist nur: als Start/Ziel gedruckt richtet es Schaden an,
weil die App dann eine Linkskurve liest, wo Start/Ziel liegt.

Was die Boxengasse betrifft: ihr altes Muster hatte NEUN GLEICH DICKE Balken (4,00 mm) und
nur unterschiedliche Luecken, dazu ein anderes Modulmass als das Original (4,00/7,20 gegen
3,60/6,60 und 3,51/6,52). Zwei unabhaengige Gruende, warum ein Leser damit nicht
synchronisiert - und beide werden hier behoben, indem das Modulmass des Originals uebernommen
wird. Ob das reicht, sagt eine Fahrt darueber.

Die Probemuster
===============

Einen Code auszuwaehlen ("nimm etwas Hoeheres") ist ohne die Kodierregel nicht moeglich: wir
koennen ein Muster zeichnen, aber nicht vorhersagen, welche Zahl das Auto dafuer meldet. Die
Regel ist mit einem einzigen bekannten Paar auch nicht zu erschliessen - dafuer braucht es
mehrere.

Die acht Probemuster sind darum so gebaut, dass jedes GENAU EINEN Faktor gegen das bekannte
Muster aendert. Wer sie der Reihe nach ueberfaehrt und die gemeldeten Codes notiert, hat
danach acht Paare, und daraus faellt die Regel heraus:

    p1  alles schmal                       gibt es ueberhaupt ein "leeres" Muster?
    p2  ein dicker Balken an Stelle 2      wiegt ein dicker Balken etwas, und wieviel?
    p3  eine breite Luecke an Stelle 2     wiegt eine breite Luecke etwas?
    p4  dicke Balken wie im Original,      trennt der Leser Balken und Luecken?
        aber alle Luecken schmal
    p5  Original, unveraendert             Kontrolle: kommt wieder 0x03?
    p6  Original, Reihenfolge umgedreht    haengt der Code an der Fahrtrichtung?
    p7  fuenf Balken statt neun            zaehlt die Balkenzahl mit?
    p8  dreizehn Balken statt neun         dito, in der anderen Richtung

p5 ist die wichtigste: ergibt sie nicht wieder 0x03, ist die Messung selbst nicht
wiederholbar, und dann sind alle anderen Zahlen wertlos. Sie zuerst fahren.
"""

import argparse
import io
import os

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)

# ---- Modulmasse, aus target_finish.pdf ausgemessen ------------------------------------
# Sie werden uebernommen und nicht neu gewaehlt: das ist das einzige Mass, von dem belegt
# ist, dass das Auto es ueberhaupt liest (es meldet 0x03, also einen gueltigen Code).
PAGE_W, PAGE_H = 297.01, 210.02   # mm, A4 quer, wie im Original
BAR_X, BAR_W = 6.52, 275.93       # mm
FIRST_Y = 49.96                   # mm, oberer Rand des ersten Balkens
THIN, THICK = 3.60, 6.60          # Balkenhoehen
GAP_S, GAP_L = 3.51, 6.52         # Lueckenhoehen

# Das bekannte Muster, Zeichen fuer Zeichen aus dem PDF:
#   Balken  d D d d D d d d d      (d = 3,60 mm, D = 6,60 mm)
#   Luecken  l L L l L l l l       (l = 3,51 mm, L = 6,52 mm)
ORIG_BARS = 'dDddDdddd'
ORIG_GAPS = 'lLLlLlll'


def bars_svg(bars, gaps, titel, hinweis):
    """Ein A4-Querformat mit einem Balkenmuster, Pfeil und 100-mm-Kontrollmass."""
    assert len(gaps) == len(bars) - 1, 'zu %d Balken gehoeren %d Luecken' % (
        len(bars), len(bars) - 1)
    y = FIRST_Y
    rects = []
    for i, b in enumerate(bars):
        h = THICK if b == 'D' else THIN
        rects.append('    <rect x="%.3f" y="%.3f" width="%.3f" height="%.3f"/>'
                     % (BAR_X, y, BAR_W, h))
        y += h
        if i < len(gaps):
            y += GAP_L if gaps[i] == 'L' else GAP_S
    ende = y

    # Der Pfeil zeigt in die Fahrtrichtung, also quer zu den Balken, und sitzt unter dem
    # Muster wie im Original. Ohne ihn ist ein Muster ohne Richtung, und die Richtung ist
    # laut Probe p6 moeglicherweise codebestimmend.
    ax, ay = 132.5, ende + 8.0
    pfeil = ('M %.1f %.1f L %.1f %.1f L %.1f %.1f L %.1f %.1f L %.1f %.1f '
             'L %.1f %.1f L %.1f %.1f Z'
             % (ax, ay + 12, ax + 11.5, ay, ax + 23.9, ay + 12,
                ax + 17.5, ay + 12, ax + 17.5, ay + 24.7,
                ax + 6.5, ay + 24.7, ax + 6.5, ay + 12))

    # Kontrollmass: zwei Striche genau 100 mm auseinander. Damit ist der Druckmassstab
    # nachpruefbar, ohne der Druckvorschau zu glauben - und beim Original gegen Kopie war
    # genau das die erste Frage.
    ry = ende + 42
    ruler = ('    <g stroke="#000" stroke-width="0.4">'
             '<line x1="%.2f" y1="%.2f" x2="%.2f" y2="%.2f"/>'
             '<line x1="%.2f" y1="%.2f" x2="%.2f" y2="%.2f"/>'
             '<line x1="%.2f" y1="%.2f" x2="%.2f" y2="%.2f"/></g>'
             % (98.5, ry - 4, 98.5, ry + 4,
                198.5, ry - 4, 198.5, ry + 4,
                98.5, ry, 198.5, ry))

    return ('<svg xmlns="http://www.w3.org/2000/svg"\n'
            '     width="%.2fmm" height="%.2fmm" viewBox="0 0 %.2f %.2f">\n'
            '  <rect width="%.2f" height="%.2f" fill="#fff"/>\n'
            '  <g fill="#000">\n%s\n'
            '    <path d="%s"/>\n'
            '  </g>\n'
            '%s\n'
            '  <text x="%.2f" y="%.2f" font-family="sans-serif" font-size="3.2"'
            ' fill="#000">100 mm Kontrollmass: nachmessen. Stimmt es nicht,'
            ' wurde skaliert gedruckt und das Muster ist ungueltig.</text>\n'
            '  <text x="8" y="%.2f" font-family="sans-serif" font-size="4.2"'
            ' fill="#000">%s</text>\n'
            '  <text x="8" y="%.2f" font-family="sans-serif" font-size="3.2"'
            ' fill="#000">%s</text>\n'
            '  <text x="8" y="%.2f" font-family="sans-serif" font-size="3.2"'
            ' fill="#000">Balken %s   Luecken %s   100 %% drucken, nicht skalieren</text>\n'
            '</svg>\n'
            % (PAGE_W, PAGE_H, PAGE_W, PAGE_H, PAGE_W, PAGE_H,
               '\n'.join(rects), pfeil, ruler,
               98.5, ry + 9,
               ry + 20, titel, ry + 26, hinweis, ry + 31, bars, gaps))


def spiegel(bars, gaps):
    """Dasselbe Muster in umgekehrter Reihenfolge."""
    return bars[::-1], gaps[::-1]


MUSTER = {}

# ---- Boxengasse ----------------------------------------------------------------------
# Modulmass des Originals, und eine Folge, die sich von der bekannten deutlich
# unterscheidet: drei dicke Balken statt zwei, und an anderen Stellen. Welchen Code das
# ergibt, ist NICHT vorhergesagt - das kann dieses Werkzeug nicht, weil die Kodierregel
# unbekannt ist. Ueberfahren, ablesen, im Feld "Ausloese-Code" eintragen.
MUSTER['box'] = (
    'muster-boxengasse-a4.svg',
    'DddDddDdd', 'LlLlLlLl',
    'BOXENGASSE',
    'Modulmass wie das Original. Welchen Code es ausloest, ist ungemessen: ueberfahren, '
    'unten mit der Muster-Sonde ablesen, im Feld Ausloese-Code eintragen.')

# ---- Probemuster ---------------------------------------------------------------------
MUSTER['p1'] = ('muster-probe-1-a4.svg', 'ddddddddd', 'llllllll',
                'PROBE 1: alles schmal',
                'Frage: gibt es ueberhaupt einen Code fuer ein Muster ohne dicke Elemente?')
MUSTER['p2'] = ('muster-probe-2-a4.svg', 'dDddddddd', 'llllllll',
                'PROBE 2: ein dicker Balken an Stelle 2',
                'Frage: wieviel wiegt ein einzelner dicker Balken?')
MUSTER['p3'] = ('muster-probe-3-a4.svg', 'ddddddddd', 'lLllllll',
                'PROBE 3: eine breite Luecke an Stelle 2',
                'Frage: wiegt eine breite Luecke dasselbe wie ein dicker Balken?')
MUSTER['p4'] = ('muster-probe-4-a4.svg', ORIG_BARS, 'llllllll',
                'PROBE 4: Balken wie das bekannte Muster, alle Luecken schmal',
                'Frage: liest der Leser Balken und Luecken getrennt?')
MUSTER['p5'] = ('muster-probe-5-a4.svg', ORIG_BARS, ORIG_GAPS,
                'PROBE 5: KONTROLLE, das bekannte Muster unveraendert',
                'Erwartet wird 0x03. Kommt etwas anderes, ist die Messung nicht '
                'wiederholbar und alle anderen Proben sind wertlos. Diese zuerst fahren.')
_b, _g = spiegel(ORIG_BARS, ORIG_GAPS)
MUSTER['p6'] = ('muster-probe-6-a4.svg', _b, _g,
                'PROBE 6: das bekannte Muster, Reihenfolge umgedreht',
                'Frage: haengt der Code an der Fahrtrichtung? Wenn ja, muss der Pfeil '
                'auf jedem Blatt stimmen.')
MUSTER['p7'] = ('muster-probe-7-a4.svg', 'dDddD', 'lLLl',
                'PROBE 7: fuenf Balken statt neun',
                'Frage: zaehlt die Zahl der Balken mit, oder nur ihr Muster?')
MUSTER['p8'] = ('muster-probe-8-a4.svg', 'dDddDddddDddd', 'lLLlLlllLlll',
                'PROBE 8: dreizehn Balken statt neun',
                'Wie Probe 7, in der anderen Richtung.')


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--nur', nargs='*', default=None,
                    help='nur diese Muster, z. B. --nur box p5')
    ap.add_argument('--out', default=REPO, help='Zielordner (Vorgabe: Repo-Wurzel)')
    a = ap.parse_args()

    namen = a.nur or list(MUSTER)
    fehlend = [n for n in namen if n not in MUSTER]
    assert not fehlend, 'unbekannt: %s (bekannt: %s)' % (', '.join(fehlend),
                                                         ', '.join(MUSTER))
    for n in namen:
        datei, bars, gaps, titel, hinweis = MUSTER[n]
        svg = bars_svg(bars, gaps, titel, hinweis)
        p = os.path.join(a.out, datei)
        io.open(p, 'w', encoding='utf-8', newline='\n').write(svg)
        laenge = sum(THICK if b == 'D' else THIN for b in bars) \
            + sum(GAP_L if g == 'L' else GAP_S for g in gaps)
        print('%-28s %2d Balken  %s / %s  Laenge %.2f mm'
              % (datei, len(bars), bars, gaps, laenge))


if __name__ == '__main__':
    main()
