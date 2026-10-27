# Lokale Rennpause

Basis: OmegaSim 1.1.54, Commit 6b89a02. Feature-Branch, kein offizieller Release.

## Bedienung
Controllerbelegung: Pause / Fortsetzen einer freien Taste zuweisen (anfangs unbelegt).
Alternativ Pause im Cockpit. Erneuter Druck startet die Wiederanlaufampel.
Noch ein Druck waehrend der Ampel bricht den Wiederanlauf ab und bleibt pausiert.
Nach Gruen Gas/Bremse und Lenkung zuerst neutral stellen.

Gilt fuer lokale Fahrmodi inkl. Training, Endurance, Time Attack, Qualifying,
Runden, Knockout, Derby, virtuelles Fahren. Multiplayer und Kalibrierung ausgenommen.
Keine Renn-Neuinitialisierung beim normalen Fortsetzen.

## Durchgefuehrte Softwarepruefungen
- Build und build.py --check erfolgreich, 268 lokale Referenzen vorhanden.
- Drei Inline-Skriptbloecke syntaktisch geprueft; Chromium ohne Ladefehler.
- 45 gezielte Tests gegen echte App-Funktionen mit simulierten Uhren, Pads
  und BLE-Zielen: alle bestanden (tools/test_renn_pause.py).
- Alle 514 eingebauten Selbsttests nacheinander in separaten Chromium-Seiten
  fuer Original und Patch, identischer Zufallsstart: jeweils 495 bestanden,
  17 ohne ok-Ergebnis/ausgelassen, 2 bestehende Layout-/Kontrastbefunde.
  Keine neu hinzugekommenen Fehlschlaege.
- Native Paketneutralisierung aus OmegaBlePlugin.java separat mit Java 21
  kompiliert und getestet, CRC mit echtem JS-crc8 verglichen (0x47).
- Update-Manifest gegen LF-normalisierte Dateien geprueft.

## Test wiederholen
python tools/build.py
python tools/build.py --check

Optional (Python-Paket playwright und dessen Chromium erforderlich):
python tools/test_renn_pause.py

## Grenzen und erforderliche Handtests
KEIN Android-APK-Build und KEIN Test an echten Fahrzeugen/Controllern ausgefuehrt.
Native Warteschlangensperre ist erst nach neuem APK-Build verfuegbar;
auf alten APKs sperrt der JS-Sendepfad, aber schon nativ eingereihte Pakete
koennen nicht aus JavaScript zurueckgerufen werden.
Auch neue APKs koennen bereits an GATT/Fahrzeug uebergebene Befehle nicht widerrufen.
Neutralgas ist der vorhandene Software-Stopp, kein garantierter Hardware-Not-Aus.
Bluetooth-Latenz und Bremsweg bleiben. Erst mit niedriger Leistung testen.

Handtests: Spieler 1-3 und Gegner; Pause waehrend Startampel, Gelb,
Einfuehrungsrunde, Zielauslauf, Tank-/Reifen-/Reparaturstopp; Runden-/Sektor-
und Restzeit nach langer Pause; Abbruch; Verbindungsabbruch/Wiederverbinden.

Release-Version und Service-Worker-Cache bleiben 1.1.54: bei lokalen Tests
alte Service Worker/Website-Caches entfernen. Kein Commit/Push im Patch.
