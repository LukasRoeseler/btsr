# Klangquellen

Zwei klar getrennte Gruppen. Der Unterschied ist wichtig, weil nur die eine
Gruppe fremdes Aufnahmematerial enthaelt.

## Vollstaendig synthetisch — kein Aufnahmematerial

Porsche, BMW und Mustang sowie alle Effekte (Bremsenquietschen, Crash-Varianten,
Schlagschrauber, Tankgeraeusch, Karosseriereparatur, Motorstart) sind von Grund auf
gerechnet. Es wird nichts aus
einer Aufnahme abgespielt.

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
