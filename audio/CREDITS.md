# Klangquellen

Zwei klar getrennte Gruppen. Der Unterschied ist wichtig, weil nur die eine
Gruppe fremdes Aufnahmematerial enthaelt.

## Vollstaendig synthetisch — kein Aufnahmematerial

Vierzehn Motoren — Porsche (Boxer-6), BMW (Reihen-6 Turbo), Mustang (V8 Cross-Plane),
GT3-V8 (Flat-Plane), GT3-V10, B-Max (Reihen-3 Turbo), Formel 1 (V12) und sieben
Rennmotoren nach technischen Angaben (Corvette C6.R, Corvette Z06 GT3.R,
Mercedes-AMG GT3, Ferrari 296 GT3, BMW M4 GT3, Huracan GT3 / R8 LMS,
Aston Martin Vantage GT3) — sowie alle
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

### Die sieben Rennmotoren, und was an ihnen Angabe ist und was Wahl

Aus den technischen Angaben kommen Zylinderzahl, Bauart, Kurbelwelle, Drehzahl und die
Zuendfolge. Aus der Zuendfolge folgt die Bankaufteilung, und daraus kommt der Charakter,
weil jede Bank ihren eigenen Kruemmer hat. Dabei entscheidet die Nummerierung des
Herstellers mit: GM zaehlt ungerade Zylinder links, Mercedes und BMW die erste Haelfte.
Unter der falschen Konvention wird aus der Ferrari-Folge `1-2-3-4-5-6` Unsinn
(120/120/480 Grad je Bank statt gleichmaessig 240).

**Nicht** aus den Angaben kommen Hubraum, Bohrung und Hub: das Modell synthetisiert
Zuendereignisse und rechnet keine Gasdynamik, es gibt also keine Groesse, in die ein
Hubraum eingehen koennte. Rohrlaenge, Impuls, Helligkeit, Rauschen, Klappern und Saettigung
sind nach Gehoer gesetzt.

Drei der sieben sind im Original aufgeladen (Ferrari 296 GT3, BMW M4 GT3, Aston Martin
Vantage GT3). Dieses Modell hat **keinen Lader**: Geometrie, Kurbelwelle und Zuendfolge
stimmen, der Ladedruck fehlt. Der Charakter der Bauart bleibt, das Pfeifen nicht.

Beim Corvette Z06 GT3.R widersprechen sich zwei gelieferte Angaben: die Kurbelwelle ist als
Flat-Plane (180 Grad) angegeben, die Zuendfolge `1-4-3-6-8-5-2-7` ergibt unter
GM-Nummerierung aber 180/270/180/90 Grad je Bank — die Signatur einer Cross-Plane, und
zeichengleich mit dem LS7.R des C6.R. Gebaut ist er nach der **Kurbelwelle**, weil die den
Klang entscheidet und weil sonst zwei Motoren identisch klingen wuerden und der Name
„Flat-Plane“ falsch waere.

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
  Zuendungen je Kurbelwellenumdrehung). Zwei Korrekturen nach einer Rueckmeldung, sie klinge
  zu hoch: die Zuendfrequenzen von `mid` und `high` waren um rund 10 Prozent zu tief
  deklariert (gemessen 303 und 332 statt 269 und 301 Hz). Die eigentliche Ursache war aber
  die Streckung - `high` stand bei 4522/min, also lief die Schleife bei 9000 Redline am
  2.0-Anschlag. Der Faktor `rpmScale` 0,62 ist eine ausdrueckliche
  Geschmacksentscheidung und keine Messung; er weicht bewusst von der geometrischen
  Zentrierung ab, die beim Porsche verwendet wird, weil die Corvette danach immer noch zu
  hoch klang. Was NICHT zutraf: eine Oktavverwechslung. Gemessen traegt 118,4 Hz bei
  `idle` allein 40 Prozent der Energie, f0/2 und f0/4 je 0,01 Prozent.
- **Porsche (Aufnahme)** (`porsche_rec_idle/mid/high.ogg`) — aus einer eigenen Aufnahme
  des Nutzers (`porschesound/Porsche sounds.m4a`, nicht Teil dieses Repos, nicht Pixabay).
  Geschnitten von `tools/porsche_rec.py`. Die Aufnahme deckt nur 3230 bis 4522/min ab, also
  1:1,40 gegen die 1:6 der App; der Faktor `rpmScale` 0,961 zentriert sie geometrisch auf
  den Bereich der App, damit sie an beiden Enden etwa gleich stark klemmt. Ein erster
  Versuch nagelte stattdessen das obere Band an die Drehzahlgrenze und schob damit alles
  nach unten, bis die Schleife am unteren Ende eine Oktave zu tief lief.
  Steht als eigenes Profil neben dem synthetischen Porsche, damit beide vergleichbar sind.
- **Strecken-Ambience** (`amb_bed.ogg`, `amb_pass_0..4.ogg`) — aus
  `fjc_media-sounds-of-nuerburgring-engines-of-classic-race-cars-234929.mp3`.
  Der Teppich ist der Abschnitt mit der geringsten Energieschwankung, die
  Vorbeifahrten sind die mit der hoechsten.
- **Hupen f&uuml;r die Lichthupe** (`horn_car`, `horn_ship`, `horn_donkey`, `horn_goat`,
  `horn_fart`) — aus fuenf Pixabay-Aufnahmen, geschnitten von `tools/horn_sounds.py`.
  Zwei Entscheidungen dabei, beide gemessen begruendet: geschnitten wird auf das LAUTE
  EREIGNIS und nicht auf die erste Nicht-Stille (die Ziege meckert in der Quelldatei erst
  nach 3,3 s, ein Schnitt auf 2 s Hoechstdauer behielt also nur den Vorlauf und das Meckern
  war weg), und angepasst wird auf gleichen RMS statt gleiche Spitze (bei
  Spitzennormalisierung verschwindet der kurze Furz gegen die durchgehend laute
  Schiffshupe). Ergebnis: alle fuenf bei RMS 0,130, Anschlagzeiten 59 bis 327 ms.
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
