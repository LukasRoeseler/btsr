# Klangquellen

Zwei klar getrennte Gruppen. Der Unterschied ist wichtig, weil nur die eine
Gruppe fremdes Aufnahmematerial enthaelt.

## Vollstaendig synthetisch — kein Aufnahmematerial

Porsche, BMW und Mustang sowie alle Effekte (Bremsenquietschen, Crash-Varianten,
Schlagschrauber, Motorstart, Schaltgeraeusch) sind von Grund auf gerechnet. Es
wird nichts aus einer Aufnahme abgespielt.

Das Schaltgeraeusch (shift_up.ogg, shift_down.ogg) besteht aus drei getrennt
platzierten Ereignissen: mechanischer Eingriff (unharmonische Teiltoene um 410-640
Hz), Entlueftung des Stellers (tiefpassgefiltertes Rauschen) und Lastaufnahme im
Antriebsstrang (um 104 Hz) - letztere ist der LAUTESTE Anteil. Runterschalten sitzt
tiefer und entlueftet laenger, weil der Steller gegen Motormoment haelt.

Die erste Fassung hatte 92 Prozent ihrer Energie unter 500 Hz und klang trotzdem
nach Klacken. Das zeigt, wo die Ursache liegt: nicht im Spektrum, sondern im
EINSCHWINGEN. Ein Einsatz, der binnen weniger Abtastwerte die Vollamplitude
erreicht, wird als Klick gehoert, egal wie wenig Hochtonenergie er traegt. Jeder
Anteil bekommt daher eine Anstiegszeit von 7-12 ms. Gemessen: Schwerpunkt von 610
bzw. 1249 Hz auf 106 bzw. 81 Hz, Anteil ueber 2 kHz von 7,4 bzw. 17,5 Prozent auf
0,01 Prozent, Anstiegszeit auf 25 bzw. 29 ms, Spitzenpegel von 0,80 auf 0,55.

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
