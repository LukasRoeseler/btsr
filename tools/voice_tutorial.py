#!/usr/bin/env python3
r"""Sprachclips fuer das gefuehrte Tutorial (v1.3.15, WIP): freundliche Frauenstimme, Deutsch.

BESTELLT: "Tutorial von Grund auf ueberarbeiten: mit freundlicher Frauenstimme und
Heranfuehrung an Funktionen." Die App (src/51b-tutorial.js) spielt diese Clips je Schritt
und liest aus audio/tutorial.json Datei, Dauer und Wortlaut. Der Wortlaut hier und in
TUT_SPRUCH (51b-tutorial.js) muss gleich sein; der Selbsttest vergleicht beide.

Stimme: Piper (piper-tts, im venv), Modell de_DE-kerstin-low von
huggingface.co/rhasspy/piper-voices (Modell MIT, Datensatz "Kerstin" CC0). Weder das Modell
noch Roh-WAVs kommen ins Repository, nur die fertigen Ogg-Clips.

Englisch und Spanisch: es gibt keine englische oder spanische Piper-Frauenstimme ohne neuen
Download. Die App zeigt dort die uebersetzten Texte und spricht sie ueber speechSynthesis
(falls das Geraet eine Stimme hat), sonst nur Text.

Kein Funkfilter: die Stimme soll freundlich und klar klingen. Nur Stille an den Enden
abschneiden, leichtes Hochpassfilter gegen Brummen und eine Lautheitsnormalisierung
(EBU R128, -16 LUFS), damit alle Clips gleich laut sind.

Aufruf:
  python tools/voice_tutorial.py --python <venv\Scripts\python.exe> --modell <de_DE-kerstin-low.onnx>
  python tools/voice_tutorial.py --check
Benoetigt ffmpeg und ffprobe im PATH.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / 'audio'
MANIFEST = OUT / 'tutorial.json'
STIMME = 'de_DE-kerstin-low'

# Schluessel = Clipname in der App (TUT_SPRUCH in src/51b-tutorial.js). Keine Gedankenstriche.
TEXTE = {
    'voraussetzung': 'Für das Tutorial brauchst du ein verbundenes Auto und ein Gamepad. '
                     'Ich warte, bis beides bereit ist.',
    'willkommen': 'Willkommen bei OmegaSim! In diesem Tutorial lernst du die App kennen '
                  'und drehst deine ersten Runden.',
    'gas': 'Drücke die Gas-Taste, um zu beschleunigen.',
    'bremse': 'Drücke jetzt die Bremstaste, um zu bremsen.',
    'links': 'Lenke nach links.',
    'rechts': 'Und jetzt nach rechts.',
    'gut': 'Sehr gut!',
    'prima': 'Prima!',
    'arcade': 'Fahr jetzt ein paar Runden im Arcade-Modus. '
              'Das Auto lenkt direkt ein und bremst kräftig.',
    'pacejka': 'Nun wird ein realistischeres Einlenken simuliert.',
    'beschleunigung': 'Das Auto beschleunigt jetzt langsamer, wie ein echter Rennwagen.',
    'untersteuern': 'Fährst du zu schnell in eine Kurve, schiebt das Auto geradeaus. '
                    'Das ist Untersteuern. Bremse also vor der Kurve.',
    'box_erklaerung': 'Zeit für einen Boxenstopp. Gleich erscheinen Tasten auf dem Schirm. '
                      'Drückst du sie rechtzeitig, ist die Crew schneller.',
    'box': 'Tippe jetzt die Boxenstopp-Taste und halte an.',
    'box_fertig': 'Fertig! Fahr weiter.',
    'motor': 'Der Motorsound wird nun geändert zu Ford Mustang.',
    'garage': 'Im Garagenmenü passt du den Motorsound für jedes Auto einzeln an.',
    'optionen': 'Ansagen, Tastenbelegung, Fahrverhalten und vieles mehr '
                'stellst du im Optionenmenü ein.',
    'abschluss': 'Du hast das Tutorial abgeschlossen. Herzlich willkommen bei OmegaSim!',
}
# Piper length_scale: 1 = Modellvorgabe, kleiner = schneller. Kerstin spricht langsam; 0,9 bleibt
# deutlich und haelt das ganze Tutorial unter drei Minuten.
TEMPO = 0.9
SATZPAUSE = 0.15


def datei(key):
    return 'tutorial_%s_de.ogg' % key


def dauer_von(path):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                        '-of', 'default=nw=1:nk=1', str(path)],
                       check=True, capture_output=True, text=True)
    return round(float(r.stdout.strip()), 2)


def pruefen():
    fehler = []
    try:
        m = json.loads(MANIFEST.read_text(encoding='utf-8'))
    except (OSError, ValueError) as exc:
        print('FEHLER: ' + str(exc), file=sys.stderr)
        return 1
    clips = m.get('de', {})
    if set(clips) != set(TEXTE):
        fehler.append('Manifest-Schluessel passen nicht zu TEXTE')
    for key, text in TEXTE.items():
        e = clips.get(key) or {}
        if e.get('text') != text:
            fehler.append('Wortlaut weicht ab: ' + key)
        if e.get('datei') != datei(key):
            fehler.append('Dateiname weicht ab: ' + key)
        p = OUT / datei(key)
        if not p.is_file() or p.stat().st_size == 0:
            fehler.append('fehlt: ' + p.name)
            continue
        with p.open('rb') as f:
            if f.read(4) != b'OggS':
                fehler.append('kein Ogg: ' + p.name)
        if not (0.3 < float(e.get('dauer') or 0) < 20):
            fehler.append('Dauer unplausibel: ' + key)
    if fehler:
        print('Tutorial-Audiopruefung fehlgeschlagen:', file=sys.stderr)
        for t in fehler:
            print('  ' + t, file=sys.stderr)
        return 1
    gesamt = sum(float(e['dauer']) for e in clips.values())
    print('OK: %d Tutorial-Clips, zusammen %.1f s.' % (len(clips), gesamt))
    return 0


def erzeugen(python, modell, nur):
    for exe in ('ffmpeg', 'ffprobe'):
        if not shutil.which(exe):
            raise FileNotFoundError(exe + ' ist nicht im PATH')
    if not modell.is_file() or not Path(str(modell) + '.json').is_file():
        raise FileNotFoundError('Modell oder Modellkonfiguration fehlt: ' + str(modell))
    try:
        alt = json.loads(MANIFEST.read_text(encoding='utf-8')).get('de', {})
    except (OSError, ValueError):
        alt = {}
    neu = {}
    with tempfile.TemporaryDirectory(prefix='tutorial-') as temp:
        work = Path(temp)
        for key, text in TEXTE.items():
            ziel = OUT / datei(key)
            if nur and key not in nur and ziel.is_file() and key in alt and alt[key].get('text') == text:
                neu[key] = alt[key]
                continue
            roh = work / (key + '_raw.wav')
            subprocess.run([str(python), '-m', 'piper', '-m', str(modell), '-f', str(roh),
                            '--length-scale', str(TEMPO), '--sentence-silence', str(SATZPAUSE)],
                           input=text.encode('utf-8'), check=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            ogg = work / datei(key)
            # Stille vorn und hinten weg (dafuer zweimal umkehren), Hochpass 70 Hz, dann
            # -16 LUFS mit -1,5 dBTP Spitze; 22,05 kHz Mono-Vorbis reicht fuer Sprache.
            filt = ('silenceremove=start_periods=1:start_threshold=-50dB,areverse,'
                    'silenceremove=start_periods=1:start_threshold=-50dB,areverse,'
                    'highpass=f=70,loudnorm=I=-16:TP=-1.5:LRA=11,'
                    'apad=pad_dur=0.12,afade=t=in:d=0.01')
            subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(roh), '-af', filt,
                            '-ar', '22050', '-ac', '1', '-c:a', 'libvorbis', '-q:a', '4', str(ogg)],
                           check=True)
            shutil.copyfile(str(ogg), str(ziel) + '.tmp')
            os.replace(str(ziel) + '.tmp', ziel)
            neu[key] = {'datei': datei(key), 'dauer': dauer_von(ziel), 'text': text}
            print('%-16s %5.2f s' % (key, neu[key]['dauer']))
    manifest = {'stimme': STIMME, 'de': neu}
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Zusammen %.1f s in %d Clips.' % (sum(e['dauer'] for e in neu.values()), len(neu)))
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--python', help='Python mit installiertem piper-tts (z. B. venv\\Scripts\\python.exe)')
    ap.add_argument('--modell', help='Pfad zu de_DE-kerstin-low.onnx (daneben die .onnx.json)')
    ap.add_argument('--nur', nargs='*', default=None, help='Nur diese Clips neu erzeugen')
    ap.add_argument('--check', action='store_true', help='Manifest und Clips pruefen')
    args = ap.parse_args()
    if args.check:
        return pruefen()
    if not args.python or not args.modell:
        ap.error('--python und --modell sind zum Erzeugen erforderlich')
    try:
        return erzeugen(Path(args.python), Path(args.modell).expanduser().resolve(), set(args.nur or []))
    except (OSError, subprocess.CalledProcessError, ValueError) as exc:
        print('FEHLER: ' + str(exc), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
