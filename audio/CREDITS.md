# Klangquellen

Zwei klar getrennte Gruppen. Der Unterschied ist wichtig, weil nur die eine
Gruppe fremdes Aufnahmematerial enthaelt.

## Vollstaendig synthetisch — kein Aufnahmematerial

Sieben Motoren — Porsche (Boxer-6), BMW (Reihen-6 Turbo), Mustang (V8 Cross-Plane),
GT3-V8 (Flat-Plane), GT3-V10, B-Max (Reihen-3 Turbo) und Formel 1 (V12) — sowie alle
Effekte (Bremsenquietschen, Crash-Varianten, Schlagschrauber, Tankgeraeusch,
Karosseriereparatur, Motorstart) sind von Grund auf gerechnet. Es wird nichts aus einer
Aufnahme abgespielt.

Jeder dieser Motoren hat vier Schleifen: drei Drehzahlbaender (`idle`, `mid`, `high`), die
nach Drehzahl ueberblendet werden, und eine Schubschleife (`over`) am mittleren Band, die
parallel dazu nach **Last** eingeblendet wird. Voll auf Zug ab 36 % Gas, voller Schub unter
6 %, dazwischen linear; die Summe aller Stimmen ist immer genau 1, damit im Uebergang kein
Loch und keine Beule entsteht.

Die Hubraum- und Auspuffdaten sind nicht geraten: die Laenge des Kruemmerprimaerrohrs
bestimmt die Resonanz physikalisch als `c / (4 L)`, und die Zylinderzahlen, Drehzahlgrenzen
und Kurbelwellenwinkel stammen aus den Motordefinitionen von engine-sim. Die drei
urspruenglichen Motoren behielten ihren Klang: fuer sie wurde die Rohrlaenge so gesetzt,
dass sie die vorher von Hand eingestellten Resonanzen (148 / 150 / 95 Hz) genau trifft.

Das Modell folgt dem Ansatz von ange-yaghi/engine-sim (MIT-Lizenz):
Zuendereignisse als Druckimpulse, gefaltet mit der Resonanz des
Auspuffkruemmers, dazu Ventiltrieb-Klappern im Nockenwellentakt,
Zuendungenauigkeit, Saettigung und Fehlzuendungen im Schubbetrieb. Der
Charakter entsteht aus den Zuendabstaenden: ein gleichmaessig zuendender
Sechszylinder klingt anders als ein V8 mit Cross-Plane-Kurbelwelle, dessen
Baenke ungleich zuenden — daher das Blubbern.

Die Fahrzeugnamen bezeichnen das nachempfundene Motorkonzept, nicht eine
Aufnahme des jeweiligen Fahrzeugs.

## Aus Pixabay-Aufnahmen geschnitten (lizenzfrei)

Hier wird tatsaechlich Aufnahmematerial verwendet — die Pixabay-Lizenz erlaubt
das, und es gab keinen Grund zu modellieren, was eine gute Aufnahme schon
liefert.

- **Corvette C6** (`corvette_idle/mid/high.ogg`) — aus
  `astonmartinvantagev12-chevrolet-corvette-c6-sound-effect-360531.mp3`.
  Basisdrehzahlen aus der gemessenen Zuendfrequenz abgeleitet (V8, vier
  Zuendungen je Kurbelwellenumdrehung).
- **Strecken-Ambience** (`amb_bed.ogg`, `amb_pass_0..4.ogg`) — aus
  `fjc_media-sounds-of-nuerburgring-engines-of-classic-race-cars-234929.mp3`.
  Der Teppich ist der Abschnitt mit der geringsten Energieschwankung, die
  Vorbeifahrten sind die mit der hoechsten.
- **Regen und Donner** (`rain_bed.ogg`, `thunder_0..2.ogg`) — aus
  `pwlpl-heavy-thunderstorm-sound-effect-473418.mp3`, nach demselben Verfahren.

Die unbearbeiteten Quelldateien sind nicht Teil dieses Repos.

### Boxenstopp-Schleifen (`pit_wrench`, `pit_fuel`, `pit_repair`)

Erzeugt von `tools/pit_sounds.py` (Tanken und Reparatur) bzw. `tools/engine_fx.py`
(Schlagschrauber). Alle drei sind Schleifen, weil sie so lange laufen wie ihre
Aufgabe. Schleifen werden **zirkular** im Frequenzbereich gebaut, sonst klickt die
Naht bei jedem Durchlauf; das Skript gibt den gemessenen Nahtsprung mit aus
(0,74 bzw. 0,25 relativ zum mittleren Schrittbetrag).

Reparatur und Schlagschrauber laufen absichtlich gleichzeitig und wurden deshalb
unterscheidbar angelegt: der Schrauber ist ein schneller, gleichmaessiger
Hammerzug (~26 Hz), die Reparatur sind langsame, ungleichmaessige Blechschlaege mit
wechselnder Tonhoehe.


## Nachpruefbarkeit der synthetischen Motoren

`tools/engine_synth.py` gibt fuer jede der 28 Schleifen vier Messwerte aus, und jeder
einzelne pruefte eine Behauptung, die ohne ihn nur eine Absicht gewesen waere:

- **Zyklus-Verriegelung** — die Schleife ist per Konstruktion ueber ganze 720-Grad-Zyklen
  periodisch, also *muss* alle Spektralenergie auf ganzzahligen Vielfachen von `rpm/120`
  liegen. Trifft bei allen 28 zu. Zwei frueher benutzte Pruefungen waren falsch: "der
  lauteste Peak ist die Zuendfrequenz" (ist er nicht, und muss er nicht sein — welche
  Harmonische gewinnt, haengt an der Impulsschaerfe und daran, wie die Baenke eines V
  verschraenkt zuenden) und eine Autokorrelation der Huellkurve, die schlicht beliebige
  Werte lieferte.
- **Gleichanteil** — bei sechs der 28 Schleifen war der Gleichanteil die *staerkste*
  Spektralkomponente. Er verschenkt Aussteuerung und kann an der Naht ticken. Jetzt 0,000
  ueberall.
- **Kodierdrift** (`dn`, `err`) — Vorbis arbeitet blockweise, und der Browser legt die
  *dekodierte* Laenge in die Schleife. Ueberzaehlige Abtastwerte landen genau am Uebergang.
  Gemessen: `dn = 0` bei allen 28, die Laenge uebersteht den Kodierzyklus also exakt; die
  Wellenformabweichung liegt bei 0,05–0,11 vom Vollausschlag, die normale gehoerangepasste
  Vorbis-Abweichung bei q4.
- **Reproduzierbarkeit** — der Seed kam vorher aus `hash()`, das Python pro Prozess
  zufaellig macht: jeder Lauf erzeugte andere Sounds, und die eingecheckten Dateien waren
  nie reproduzierbar. Jetzt `zlib.crc32` ueber den Namen; zwei Laeufe liefern
  byte-identische WAVs. Die `.ogg` unterscheiden sich trotzdem, weil libvorbis eine
  zufaellige Bitstream-Seriennummer in den Container stempelt — dafuer sind die WAVs in
  `audio-work/` da.

Was **nicht** geprueft ist: wie es klingt. Dass die Zuendstruktur richtig ist, sagt nichts
darueber, ob ein Motor ueberzeugt.
