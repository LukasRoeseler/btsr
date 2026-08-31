# Wie Carrera Hybrid Autos funktionieren

Dieses Dokument erklärt die Technik hinter den Carrera Hybrid Fahrzeugen. Es geht nicht um eine bestimmte App, sondern um das Fahrzeug und das System dahinter.

## Überblick

Carrera Hybrid ist eine Mischung aus klassischer Carrera-Rennbahn und freiem Ferngesteuert-Fahren. Bei einer klassischen Carrera-Bahn läuft das Auto in einer Rille auf der Schiene. Es kann die Spur nicht verlassen.

Bei Carrera Hybrid ist das anders. Die Fahrzeuge fahren frei, ohne Schiene und ohne Rille. Sie erkennen die Strecke trotzdem, weil die Streckenteile eine Markierung tragen. Ein Sensor im Auto liest diese Markierung. So weiß das Auto, wo es sich befindet und was für ein Streckenteil vor ihm liegt.

Gesteuert wird das Auto über eine Smartphone-App per Bluetooth. Es gibt auch einen optionalen Controller, in den man das Handy einklemmen kann. Der Controller hat richtige Knöpfe statt Touchscreen-Tasten.

## Der Aufbau des Autos

Ein Carrera Hybrid Auto enthält folgende Hauptteile:

- **Motor**: treibt die Hinterräder an.
- **Lenkservo**: dreht die Vorderräder nach links oder rechts.
- **Akku**: ein wiederaufladbarer Akku im Fahrzeug.
- **Bluetooth-Chip**: ein kleiner Funk-Chip, der die Verbindung zum Handy hält. Vermutlich ein Chip aus der Nordic-nRF52-Familie (dazu mehr weiter unten).
- **Sensor**: erkennt die Markierung auf den Streckenteilen. Ob es sich um eine kleine Kamera oder einen einfacheren Infrarot-Sensor handelt, ist nicht sicher bekannt.
- **Lichter**: mindestens Frontscheinwerfer. Ob es ein separates Bremslicht gibt, ist noch nicht bestätigt.

Die eigentliche Fahrphysik, also wie das Auto auf Gas und Lenkung reagiert, wird im Auto selbst berechnet. Die App schickt nur Zielwerte für Gas und Lenkung. Sie berechnet keine Fahrdynamik.

## Die Streckenteile

Jedes Streckenteil (Gerade, Kurve, Start-Ziel-Linie) hat ein eigenes Muster aufgedruckt. Dieses Muster ist für Menschen kaum sichtbar, aber für den Sensor im Auto lesbar.

So kann das Auto erkennen:

- welche Art von Teil gerade unter ihm liegt (Gerade, Rechtskurve, und so weiter)
- ob es sich noch auf der Strecke befindet oder bereits daneben fährt ("Off-Track")

Weil die Teile lose auf dem Boden oder Tisch liegen und keine feste Schiene bilden, kann jede Strecke frei zusammengebaut werden. Das Auto kann die Strecke auch komplett verlassen und irgendwo frei herumfahren.

### Zwei getrennte Codetabellen

Der Sensor arbeitet in zwei Betriebsarten, und **jede hat ihre eigene Codetabelle**. Das ist
der Punkt, an dem die Musterentzifferung monatelang falsch lief: dasselbe gedruckte Blatt hat
0x0a, 0x03 und 0x01 gemeldet, und daraus wurde geschlossen, der Unterschied liege im Druck —
Maßstab, Strichbreite, Schwärze, Papier. Er lag am Modus.

| Bahn-Modus (Byte 14, Bit 5) | Ausdruck-Modus (Byte 14, Bit 7) |
|---|---|
| `0x02` Gerade | `0x01` Start/Ziel |
| `0x03` Linkskurve | |
| `0x04` Rechtskurve | |
| `0x05` / `0x06` Haarnadel | |
| `0x0a` Start/Ziel | |
| `0x00` abseits der Bahn | |

Die beiden Bits schließen sich aus. Wer Codes vergleicht, muss also den Modus mitnennen —
`0x01` heißt auf Papier Start/Ziel, und auf der Schiene ist `0x0a` dasselbe.

Offen ist damit nur noch, welche Balkenfolgen `0x02` (Gerade) und `0x04` (Rechtskurve)
tragen. Die Folge für `0x01` liegt vektorgenau vor, weil sie aus der Original-Druckvorlage
stammt (siehe unten).

### Wieviel Anlauf der Leser braucht — gemessen

Drei Messungen am gedruckten Start/Ziel-Blatt, alle am Auto gemacht:

1. **Die drei führenden dünnen Striche lassen sich abschneiden**, das Blatt wird weiter
   gelesen. Der Vorlauf ist damit **kein Nutzdatum**, sondern die Strecke, auf der sich der
   Leser auf die Modulbreite einstellt — und dafür genügt weniger als das Original bietet.
2. **Eines der beiden wiederholten Muster genügt.** Zusammen mit Punkt 1 ist die kleinste
   tragende Nutzlast ein einzelnes Wort ohne Vorlauf, etwa **54 mm** in Fahrtrichtung statt
   der 75,5 mm der Vorlage.
3. **Nach einem Erkennen bleibt der Leser etwa eine Sekunde stumm.** Bei 4 km/h
   Maßstabstempo sind das 1,1 m Fahrweg, also gut zweieinhalb Kachellängen. Ein Muster öfter
   als etwa jeden Meter zu wiederholen bringt deshalb nichts — und dieselbe Sperre ist der
   Grund, warum die Boxengassen-Erkennung per Doppel-Ausdruck einen Mindestabstand von einer
   Sekunde zwischen den beiden Kontakten fordert (`PIT_DOUBLE_MIN_MS`). Der Wert war
   ursprünglich geschätzt; er ist damit bestätigt.

Damit sind die fünf Vorlauf- und acht Probeblätter aus dem Repo verschwunden: das Experiment,
für das sie gebaut wurden, ist gelaufen. `tools/make_patterns.py` erzeugt sie in einem Aufruf
wieder, falls doch noch eine Probe gebraucht wird.

### Die Maße des Start/Ziel-Musters

Aus `target_finish.pdf` ausgelesen, nicht nachgemessen (`tools/make_pattern.py`):

```
dünner Balken   3,598 mm      dicker Balken   6,604 mm
dünne Lücke     3,514 mm      dicke Lücke     6,530 mm
Balkenbreite quer 275,9 mm    Musterlänge in Fahrtrichtung 75,5 mm
9 Balken, 8 Lücken:  Balken 000010010   Lücken 00010110   (1 = dick, in Leserichtung)
```

Balken **und** Lücken tragen Information, das Verhältnis dick/dünn ist 1,83 — die Bauform
eines Strichcodes mit schmalen und breiten Elementen, 17 Elemente je Wort. Die Balkenbreite
von 275,9 mm ist volle A4-Querbreite, bei 250 mm Bahnbreite.

## Streckenscan

Bevor ein Rennen beginnt, kann die App die Strecke einmal abscannen. Dabei fährt das Auto (gesteuert von der App oder von Hand) einmal die ganze Strecke ab. Jedes Mal, wenn ein neues Streckenteil erkannt wird, meldet das Auto das per Bluetooth an die App.

So entsteht Stück für Stück eine digitale Karte der Strecke. Diese Karte kann die App später nutzen, zum Beispiel für eine Renn-Übersicht oder für computergesteuerte Gegner.

## Die Bluetooth-Verbindung

Handy und Auto sprechen über **Bluetooth Low Energy** (kurz BLE) miteinander. Das ist der stromsparende Bluetooth-Standard, den auch smarte Kopfhörer oder Fitness-Tracker nutzen.

Die Verbindung läuft über einen Kanal, der als **Nordic UART Service** bekannt ist. Das ist eine Art virtuelle serielle Leitung über Bluetooth. Viele kleine Elektronikgeräte nutzen diesen Standardkanal, weil er einfach einzubauen ist.

Wichtig ist: Die App schickt nicht nur einmal ein Kommando, wenn man Gas gibt. Sie schickt stattdessen etwa 20 bis 45 Mal pro Sekunde ein Datenpaket mit dem aktuellen Gas- und Lenkwert. Das Auto erwartet diesen ständigen Strom an Befehlen. Bleibt der Strom aus, geht das Auto vermutlich in einen sicheren Stillstand über.

In die andere Richtung, vom Auto zum Handy, schickt das Auto ebenfalls ständig Statuspakete. Darin stecken unter anderem:

- der Akkustand
- welches Streckenteil gerade erkannt wurde
- ob das Auto von der Strecke abgekommen ist
- Rohdaten von Bewegungssensoren (vermutlich Beschleunigung oder Drehrate)

```mermaid
flowchart LR
    subgraph Handy
        App[App]
    end
    subgraph Auto
        BLE[Bluetooth-Chip]
        Motor[Motor + Lenkservo]
        Sensor[Streckensensor]
        Firmware[Firmware: Fahrphysik]
    end
    Strecke[Streckenteil mit Muster]

    App -- "Gas/Lenkung, ~20-45x pro Sekunde" --> BLE
    BLE -- "Akku, Streckenteil, Sensorwerte" --> App
    BLE --> Firmware
    Firmware --> Motor
    Sensor --> Firmware
    Strecke -. Muster wird gelesen .-> Sensor
```

## Wer steuert die Fahrphysik?

Ein wichtiger Punkt, den man leicht falsch einschätzt: Die App ist kein Physik-Simulator. Sie schickt dem Auto nur, was der Fahrer will (wie viel Gas, welche Lenkrichtung). Das Auto selbst entscheidet, wie es darauf reagiert.

Das erklärt auch, warum der Gaswert kein einfacher "Stopp bis Vollgas"-Wert ist. Er wirkt eher wie ein Wert, der sich weich hoch- und runterregelt, ähnlich wie beim Gasgeben in einem echten Auto. Die Feinarbeit passiert in der Firmware des Autos, nicht in der App.

## Mehrspieler-Rennen

Laut Hersteller können mehrere Spieler gleichzeitig fahren. Jedes Handy verbindet sich dabei über Bluetooth mit seinem eigenen Auto. Für die Renn-Organisation zwischen den Handys, etwa Rundenzeiten oder Startreihenfolge, wird vermutlich zusätzlich WLAN zwischen den Handys genutzt.

Das ergibt zwei getrennte Funkverbindungen:

1. Bluetooth: Handy zu seinem eigenen Auto (Steuerung).
2. WLAN: Handy zu Handy (Rennorganisation).

## Firmware-Updates

Das Auto unterstützt Updates seiner eigenen Software über Bluetooth. Das nennt man "Over-the-Air-Update" oder kurz OTA-Update. Dafür wird ein Standardverfahren von Nordic Semiconductor genutzt, das bei sehr vielen Bluetooth-Geräten zum Einsatz kommt.

Das bedeutet: Der Hersteller kann über die App neue Firmware auf das Auto spielen, zum Beispiel um Fehler zu beheben oder das Fahrverhalten zu verbessern.

## Was noch nicht sicher bekannt ist

Manche Details lassen sich nur aus dem beobachteten Verhalten ableiten, nicht mit letzter Sicherheit belegen. Dazu gehören:

- der genaue Typ des Streckensensors (Kamera oder Infrarot)
- ob es ein eigenes Bremslicht gibt und wie es angesteuert wird
- die genaue Bedeutung aller Bytes im Bluetooth-Protokoll

Diese Lücken ändern nichts am Grundprinzip: Ein Sensor liest die Strecke, ein Funkchip verbindet Auto und Handy, und die eigentliche Fahrphysik läuft im Auto selbst.
