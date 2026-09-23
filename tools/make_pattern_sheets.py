#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Streifenmuster zum Auslegen: eine Gerade und eine 60-Grad-Rechtskurve, ohne
Strichcode-Anspruch, randlos bis zum Blattrand gedruckt.

    python tools/make_pattern_sheets.py

BESTELLT (Verlauf): "ausdrucke für geraden und kurven machen nur mit kachelmuster, ohne
strichcodes experimentell" -> nach Ansicht von fünf Infrarot-Fotos (app_screenshots/)
und einer Referenzzeichnung des Nutzers verworfen zugunsten von: "DIN A4 Blatt
horizontal. Dann gilt, die Trapeze sind oben ~5mm und unten ~20mm breit. Die weißen
Lücken sollen genau dieselben Maße nur eben kopfüber haben." Zuletzt: "now make it so
they run to the border of the pages" / "the curve also needs the trapecoids" - beide
Blaetter randlos, die Kurve mit dergleichen direkt vorgegebenen Innen-/Aussenbreite wie
die Gerade oben/unten, statt einer aus dem Radienverhaeltnis berechneten.

WARUM EIN EIGENES SKRIPT UND NICHT tools/make_track_sheets.py ERWEITERT
========================================================================

Jenes Skript behauptet Maschinenlesbarkeit - ein Strichcode-Wort je Kachelart -, und
genau das ist dort ein bekannter, dokumentierter Fehler: die Woerter der Geraden (0x02)
und der Rechtskurve (0x04) sind nicht entziffert, jedes Blatt dort traegt deshalb
notgedrungen das Wort von Start/Ziel (0x01). Dieses Skript hier gibt genau diesen
Anspruch NICHT ab: ein reines Muster zum Auslegen und Fotografieren, ohne jede
Behauptung ueber Maschinenlesbarkeit.

WARUM TRAPEZE UND KEINE PARALLELEN BALKEN
============================================

Ein erster Entwurf hier zeichnete parallele Rechtecke quer zur Fahrtrichtung - nach
CARRERA_HYBRID.md ("die Balken bedecken die ganze Kachel... in Kurven laufen sie
radial") eine vertretbare Lesart. Der Nutzer hat das anhand von fuenf eigenen
Infrarot-Fotos UND einer eigenen Referenzzeichnung korrigiert: es sind Trapeze, nicht
Rechtecke - senkrecht stehende Keile nebeneinander, oben schmal (~5mm) und unten breit
(~20mm), mit einer Luecke dazwischen, die exakt dieselbe Form kopfueber hat. Eine
genaue Herleitung der Millimeterzahlen aus den Fotos ist NICHT versucht - CARRERA_
HYBRID.md dokumentiert einen bereits gemachten, gescheiterten Versuch genau dazu
(31.08., Fluchtpunkt-Fit-Restabstand 237-579 px statt weniger) und rät zu einem
Flachbett-Scan statt eines weiteren Fotoversuchs. Die Zahlen 5/20 mm sind daher eine
grobe Ausseneinschaetzung, direkt uebernommen, keine Messung.

RANDLOS: das Muster fuellt die ganze A4-Seite, keine Kalibrier-/Beschriftungsraender
mehr (BESTELLT: "make it so they run to the border of the pages") - Kontrollmass und
Beschriftung stehen nur noch als Kommentar im SVG-Kopf, nicht mehr auf der Seite.
"""
import io
import math
import os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

W, H = 297.01, 210.02   # A4 quer


def kopf(kommentar):
    return ('<svg xmlns="http://www.w3.org/2000/svg"\n'
            '     width="%.2fmm" height="%.2fmm" viewBox="0 0 %.2f %.2f">\n'
            '  <!--\n%s\n  -->\n'
            '  <rect x="0" y="0" width="%.2f" height="%.2f" fill="#ffffff"/>\n'
            % (W, H, W, H, kommentar, W, H))


# ---- 1. Gerade, senkrechte Trapez-Balken, randlos bis zum Blattrand -----------------
def kachel_gerade(oben_mm=5.0, unten_mm=20.0):
    """N senkrechte Trapeze nebeneinander, jedes von oben_mm (Blattoberkante) auf
    unten_mm (Blattunterkante) verbreitert, ueber die GANZE Seitenbreite und -hoehe -
    randlos, keine Kalibrierraender mehr. Balken+Luecke ist bei jeder Hoehe konstant
    (oben_mm + unten_mm) - deshalb ist die Luecke von selbst dieselbe Form kopfueber,
    ohne separat gezeichnet zu sein. Eine ERFUNDENE Folge: das echte Wort der Geraden
    (Byte 12 = 0x02) ist nicht entziffert (CARRERA_HYBRID.md)."""
    periode = oben_mm + unten_mm
    n = max(2, round(W / periode))
    breite_ist = n * periode
    x0 = (W - breite_ist) / 2

    komm = ('    GERADE, SENKRECHTE TRAPEZ-BALKEN, RANDLOS, KEIN STRICHCODE-ANSPRUCH.\n'
            '    A4 QUER, 1 SVG-Einheit = 1 mm. Experimentell, zum Auslegen und\n'
            '    Vergleichen mit einer Infrarot-Aufnahme der echten Bahn.\n'
            '\n'
            '    %d Trapeze nebeneinander, randlos ueber die volle Blattbreite/-hoehe,\n'
            '    jedes oben (Blattoberkante) %.0f mm und unten (Blattunterkante) %.0f mm\n'
            '    breit - eine ERFUNDENE Folge, das echte Wort der Geraden (Byte 12 =\n'
            '    0x02) ist nicht entziffert (CARRERA_HYBRID.md, gescheiterter\n'
            '    Messversuch vom 31.08.). Balken + Luecke ist bei jeder Hoehe konstant\n'
            '    %.0f mm, die Luecke ist deshalb von selbst dieselbe Form kopfueber.\n'
            '\n'
            '    DRUCKEN: 100 %% / "Tatsaechliche Groesse", NICHT "an Seite anpassen".\n'
            '    Randlos: ein Drucker ohne echten Randlos-Druck schneidet aussen etwas ab.'
            % (n, oben_mm, unten_mm, periode))

    teile = [kopf(komm), '  <g fill="#000000">\n']
    for k in range(n):
        mitte = x0 + (k + 0.5) * periode
        to, tu = mitte - oben_mm / 2, mitte + oben_mm / 2
        bo, bu = mitte - unten_mm / 2, mitte + unten_mm / 2
        teile.append('    <path d="M %.3f %.3f L %.3f %.3f L %.3f %.3f L %.3f %.3f Z"/>\n'
                     % (to, 0.0, tu, 0.0, bu, H, bo, H))
    teile.append('  </g>\n')
    teile.append('</svg>\n')
    return ''.join(teile), n


# ---- 2. 60-Grad-Rechtskurve, radiale Trapez-Keile, randlos --------------------------
def kachel_kurve(innen_mm=5.0, aussen_mm=20.0, grad_gesamt=60.0):
    """Randlos: ra = W (die Sehne des Sektors beruehrt beide Seitenraender), ri so
    gewaehlt, dass die Innenkante ebenfalls die Blattoberkante beruehrt - der Sektor
    fuellt damit die ganze Seite, statt wie zuvor mittig mit Rand zu stehen.

    JEDER KEIL EIN TRAPEZ MIT UNABHAENGIG VORGEGEBENER INNEN-/AUSSENBREITE (nicht mehr
    ein Kreissektor bei konstantem Winkel wie in der Vorfassung): ring_sektor()s
    konstanter Winkel haette Innen- und Aussenbreite nicht unabhaengig treffen koennen,
    weil ihr Verhaeltnis vom Radienverhaeltnis abhaengt. Hier werden Innen- und
    Aussenbreite UNABHAENGIG als Winkel eingesetzt (Sehne statt Bogen an der Innen-/
    Aussenkante) - dieselben zwei Zahlen wie bei der Geraden (5/20 mm), nur radial
    statt geradlinig."""
    halb_deg = grad_gesamt / 2.0
    halb = math.radians(halb_deg)
    ra = W / 2.0 / math.sin(halb)   # Sehne bei Radius ra ueber den vollen Winkel = W
    ri = (ra - H) / math.cos(halb)  # Innenkante beruehrt y=0, wenn die Aussenkante y=H beruehrt

    cx = W / 2.0
    cy = H - ra   # Aussenkante (Winkel 90 Grad, gerade nach unten) beruehrt y=H

    # winkel_deg=0 zeigt hier gerade nach unten (+90 Grad im math. Standardwinkel) -
    # dieselbe Konvention wie ring_sektor()/bogen_kurve() in make_track_sheets.py.
    def kart(r, winkel_deg):
        a = math.radians(90.0 + winkel_deg)
        return cx + r * math.cos(a), cy + r * math.sin(a)

    theta_innen = math.degrees(innen_mm / ri)   # Winkel, bei dem die Sehne an der Innenkante = innen_mm
    theta_aussen = math.degrees(aussen_mm / ra)  # dito an der Aussenkante
    theta_periode = theta_innen + theta_aussen
    n = max(1, int(grad_gesamt / theta_periode))

    komm = ('    RECHTSKURVE, 60 GRAD, RADIALE TRAPEZ-KEILE, RANDLOS, KEIN\n'
            '    STRICHCODE-ANSPRUCH. A4 QUER, 1 SVG-Einheit = 1 mm. Experimentell,\n'
            '    zum Auslegen und Vergleichen mit einer Infrarot-Aufnahme.\n'
            '\n'
            '    RANDLOS: Aussenradius %.1f mm, sodass die Sehne ueber den vollen\n'
            '    60-Grad-Winkel genau die Blattbreite (%.1f mm) ergibt; Innenradius\n'
            '    %.1f mm, sodass die Innenkante ebenfalls die Blattoberkante beruehrt.\n'
            '    Der Sektor fuellt damit die ganze Seite.\n'
            '\n'
            '    %d Keile, jeder ein TRAPEZ mit unabhaengig vorgegebener Innenbreite\n'
            '    (%.0f mm) und Aussenbreite (%.0f mm) - dieselben zwei Zahlen wie bei\n'
            '    der Geraden (5/20 mm), grob am Foto geschaetzt (CARRERA_HYBRID.md:\n'
            '    eine genauere Herleitung ist dort bereits gescheitert dokumentiert,\n'
            '    31.08.). Anders als ein Kreissektor bei konstantem Winkel trifft das\n'
            '    beide Breiten unabhaengig, nicht nur die eine mit der anderen\n'
            '    rechnerisch aus dem Radienverhaeltnis.\n'
            '\n'
            '    DRUCKEN: 100 %% / "Tatsaechliche Groesse", NICHT "an Seite anpassen".'
            % (ra, W, ri, n, innen_mm, aussen_mm))

    teile = [kopf(komm), '  <g fill="#000000">\n']
    for k in range(n):
        mitte = -halb_deg + (k + 0.5) * theta_periode
        ti_l, ti_r = mitte - theta_innen / 2, mitte + theta_innen / 2
        ta_l, ta_r = mitte - theta_aussen / 2, mitte + theta_aussen / 2
        p1, p2 = kart(ri, ti_l), kart(ri, ti_r)
        p3, p4 = kart(ra, ta_r), kart(ra, ta_l)
        teile.append('    <path d="M %.3f %.3f L %.3f %.3f L %.3f %.3f L %.3f %.3f Z"/>\n'
                     % (p1[0], p1[1], p2[0], p2[1], p3[0], p3[1], p4[0], p4[1]))
    teile.append('  </g>\n')
    teile.append('</svg>\n')
    return ''.join(teile), n, ri, ra


def main():
    svg, n = kachel_gerade()
    print('Gerade: %d Trapeze, randlos ueber %.1f x %.1f mm' % (n, W, H))
    p = os.path.join(REPO, 'muster-gerade-a4.svg')
    io.open(p, 'w', encoding='utf-8', newline='\n').write(svg)
    print('  muster-gerade-a4.svg (%d Zeichen)' % len(svg))

    svg, n, ri, ra = kachel_kurve()
    print('Kurve: %d Keile, randlos, Innenradius %.1f mm, Aussenradius %.1f mm' % (n, ri, ra))
    p = os.path.join(REPO, 'muster-kurve-60grad-a4.svg')
    io.open(p, 'w', encoding='utf-8', newline='\n').write(svg)
    print('  muster-kurve-60grad-a4.svg (%d Zeichen)' % len(svg))


if __name__ == '__main__':
    main()
