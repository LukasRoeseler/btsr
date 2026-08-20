# Klangquellen

Zwei klar getrennte Gruppen. Der Unterschied ist wichtig, weil nur die eine
Gruppe fremdes Aufnahmematerial enthaelt.

## Vollstaendig synthetisch — kein Aufnahmematerial

Porsche, BMW und Mustang sowie alle Effekte (Bremsenquietschen, Crash-Varianten,
Schlagschrauber, Motorstart, Schaltgeraeusch) sind von Grund auf gerechnet. Es
wird nichts aus einer Aufnahme abgespielt.

Das Schaltgeraeusch (shift_up.ogg, shift_down.ogg) besteht aus drei getrennt
platzierten Ereignissen innerhalb von etwa 80 ms: Schaltklaue (unharmonische
Teiltoene, sehr schnelles Abklingen), Entlueftung des Stellers (hochpassgefiltertes
Rauschen) und Lastaufnahme im Antriebsstrang (dumpfer Anteil um 128 Hz). Runter-
schalten sitzt tiefer und entlueftet laenger, weil der Steller gegen Motormoment
haelt.

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
