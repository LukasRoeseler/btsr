#!/usr/bin/env python3
"""Motoren aus Speed Dreams (nur CC0-Aufnahmen) als Baender fuer audio/loops.json.

    python tools/sd_engines.py <Ordner mit data/sound aus Speed Dreams 2.4>

BESTELLT: Motorklaenge aus Speed Dreams. Verwendet werden NUR die Proben, die
data/sound/SoundCredits.txt ausdruecklich als CC0 ausweist (Freesound, Nov. 2024). Die
uebrigen Speed-Dreams-Klaenge sind entweder CC-BY von YouTube-Mitschnitten, ohne Angabe
oder Teil der GPL-Spieldaten - die bleiben draussen.

WIE TORCS/SPEED DREAMS ES MACHT: eine einzige Schleife, deren Abspielrate mit der Drehzahl
steigt. Die App blendet stattdessen zwischen Baendern ueber und spielt jedes hoechstens
etwa eine Oktave verschoben ab. Also werden aus der einen Schleife mehrere Baender
gerechnet - jedes ist dieselbe Aufnahme, nur mit der Rate auf seine Drehzahl gebracht. Das
ist klanglich genau das, was Speed Dreams selbst tut, nur vorab statt zur Laufzeit.

Die Aufnahmedrehzahl wird aus der Zuendfrequenz geschaetzt (Harmonic Product Spectrum,
f0 = U/min / 60 * Zylinder / 2). Liegt die Schaetzung eine Oktave daneben, klingt der Motor
insgesamt eine Oktave hoeher oder tiefer - deshalb ist jeder Motor als WIP markiert.
"""
import json
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
AUDIO = os.path.join(REPO, 'audio')
SR_OUT = 22050          # wie die gerechneten Motoren
BAND_FAKTOR = 1.8       # groesster Abstand zweier Nachbarbaender
ZIEL_RMS = None         # wird am Mustang-Mittelband gemessen

# id, Datei, Bezeichnung, Zylinder, Leerlauf, Begrenzer, Knallen, Quelle
MOTOREN = [
    ('sd_v8gt', 'v8_formula.wav', 'Speed Dreams: Japanischer GT-V8 (Vorbeifahrt)', 8, 1800, 9000, 0.45,
     'Heigh-hoo, Freesound 128611 (CC0)'),
    ('sd_v10', 'v10_raw.wav', 'Speed Dreams: Deutscher V10-Sportwagen', 10, 1200, 8500, 0.35,
     'kevp888, Freesound 649889 (CC0)'),
    ('sd_v8muscle', 'v8-ears68.wav', 'Speed Dreams: Australischer Muscle-V8', 8, 900, 7000, 0.7,
     'Ears68, Freesound 260445 (CC0)'),
    ('sd_v8alt', 'v8-cr4sht3st.wav', 'Speed Dreams: Alter amerikanischer V8', 8, 800, 6000, 0.6,
     'cr4sht3st, Freesound 157144 (CC0)'),
    ('sd_v12', 'v12_raw.wav', 'Speed Dreams: Italienischer V12, roh', 12, 1100, 8500, 0.35,
     'cheesepuff, Freesound 112075 (CC0)'),
    ('sd_v12weich', 'v12_smooth2.wav', 'Speed Dreams: Italienischer V12, weich', 12, 1100, 8500, 0.25,
     'cheesepuff, Freesound 112075 (CC0)'),
]


def lesen(p):
    with wave.open(p, 'rb') as w:
        n, ch, sw, sr = w.getnframes(), w.getnchannels(), w.getsampwidth(), w.getframerate()
        roh = w.readframes(n)
    x = np.frombuffer(roh, dtype={1: np.uint8, 2: np.int16}[sw]).astype(np.float64)
    x = (x - 128) / 128 if sw == 1 else x / 32768
    return x.reshape(-1, ch).mean(axis=1), sr


def f0_hps(x, sr, fmin=30, fmax=700):
    n = 1 << 15
    seg = x[:n] if len(x) >= n else np.pad(x, (0, n - len(x)))
    spec = np.abs(np.fft.rfft(seg * np.hanning(n)))
    hps = spec.copy()
    for k in (2, 3, 4):
        d = spec[::k]
        hps[:len(d)] *= d
    f = np.fft.rfftfreq(n, 1 / sr)
    m = (f >= fmin) & (f <= fmax)
    return float(f[m][np.argmax(hps[m])])


def umlauf_rate(x, faktor):
    """Abspielrate `faktor` auf eine Schleife, ringfoermig - Anfang und Ende bleiben nahtlos."""
    n = len(x)
    m = max(64, int(round(n / faktor)))
    pos = np.arange(m) * (n / m)
    i = np.floor(pos).astype(int)
    fr = pos - i
    return x[i % n] * (1 - fr) + x[(i + 1) % n] * fr


def auf_rate(x, sr_ein, sr_aus):
    g = np.gcd(int(sr_ein), int(sr_aus))
    return signal.resample_poly(x, sr_aus // g, sr_ein // g)


def schreiben_ogg(x, pfad):
    x = np.clip(x, -0.99, 0.99)
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as t:
        tmp = t.name
    with wave.open(tmp, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR_OUT)
        w.writeframes((x * 32767).astype(np.int16).tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-c:a', 'libvorbis', '-q:a', '4', pfad], check=True)
    os.remove(tmp)


def leiter(lo, hi):
    """Drehzahlen der Baender von Leerlauf bis Begrenzer, kein Abstand groesser BAND_FAKTOR."""
    n = max(1, int(np.ceil(np.log(hi / lo) / np.log(BAND_FAKTOR))))
    return [int(round(lo * (hi / lo) ** (k / n))) for k in range(n + 1)]


# Effekte (nur CC0): Datei in Speed Dreams, Name in fx.json, Zieldatei, Lautstaerke (RMS), Laenge (s)
EFFEKTE = [
    ('grass_ride.wav', 'offroad', 'sd_offroad.ogg', 0.08, 6.0, 'Bidone, Freesound 66048 (CC0)'),
]


def effekte(snd):
    fx_p = os.path.join(AUDIO, 'fx.json')
    fx = json.load(open(fx_p, encoding='utf-8'))
    for datei, schl, ziel, rms, laenge, herkunft in EFFEKTE:
        x, sr = lesen(os.path.join(snd, datei))
        x = auf_rate(x - np.mean(x), sr, SR_OUT)[:int(laenge * SR_OUT)]
        # Nahtlos: die letzten 0,3 s ueber den Anfang blenden.
        k = int(0.3 * SR_OUT)
        rampe = np.linspace(0, 1, k)
        x[:k] = x[:k] * rampe + x[-k:] * (1 - rampe)
        x = x[:-k]
        x *= rms / max(1e-6, np.sqrt(np.mean(x ** 2)))
        schreiben_ogg(x, os.path.join(AUDIO, ziel))
        fx[schl] = {'file': ziel, 'loop': True, 'seconds': round(len(x) / SR_OUT, 3),
                    'source': 'Speed Dreams 2.4 data/sound/%s: %s' % (datei, herkunft)}
        print('Effekt %-8s <- %s' % (schl, datei))
    json.dump(fx, open(fx_p, 'w', encoding='utf-8', newline='\n'), indent=1)


def main(quelle):
    snd = quelle
    for kand in (os.path.join(quelle, 'data', 'sound'), os.path.join(quelle, 'sound')):
        if os.path.isdir(kand):
            snd = kand
    manifest_p = os.path.join(AUDIO, 'loops.json')
    manifest = json.load(open(manifest_p, encoding='utf-8'))
    ref, ref_sr = None, None
    with tempfile.TemporaryDirectory() as td:
        tmp = os.path.join(td, 'ref.wav')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', os.path.join(AUDIO, 'mustang_mid.ogg'), '-ac', '1', tmp], check=True)
        ref, ref_sr = lesen(tmp)
    ziel_rms = float(np.sqrt(np.mean(ref ** 2)))
    # Dieselben Bandnamen wie die gerechneten Motoren (die Klang-Doku und ihr Selbsttest
    # kennen genau diese): 4 Stufen idle/low/mid/high, 5 Stufen mit low2 dazwischen.
    namen4 = ['idle', 'low', 'mid', 'high']
    namen5 = ['idle', 'low', 'low2', 'mid', 'high']
    for mid, datei, label, zyl, leer, begr, knall, herkunft in MOTOREN:
        x, sr = lesen(os.path.join(snd, datei))
        x = x - np.mean(x)
        f0 = f0_hps(x, sr)
        auf_rpm = f0 * 60 * 2 / zyl
        x = auf_rate(x, sr, SR_OUT)
        x *= ziel_rms / max(1e-6, np.sqrt(np.mean(x ** 2)))
        stufen = leiter(leer, begr)
        loops = {}
        for k, rpm in enumerate(stufen):
            if len(stufen) == 4:
                band = namen4[k]
            elif len(stufen) == 5:
                band = namen5[k]
            else:
                raise SystemExit('%s: %d Stufen, Bandnamen fehlen' % (mid, len(stufen)))
            y = umlauf_rate(x, rpm / auf_rpm)
            datei_aus = '%s_%s.ogg' % (mid, band)
            schreiben_ogg(y, os.path.join(AUDIO, datei_aus))
            loops[band] = {'file': datei_aus, 'baseRpm': rpm, 'firingHz': round(rpm / 60 * zyl / 2, 1),
                           'seconds': round(len(y) / SR_OUT, 4), 'load': 1.0}
        # Schub: die Mittelstufe gedaempft und abgedunkelt.
        mitte = stufen[len(stufen) // 2]
        b, a = signal.butter(2, 1200 / (SR_OUT / 2))
        y = signal.filtfilt(b, a, umlauf_rate(x, mitte / auf_rpm)) * 0.6
        schreiben_ogg(y, os.path.join(AUDIO, '%s_over.ogg' % mid))
        loops['over'] = {'file': '%s_over.ogg' % mid, 'baseRpm': mitte, 'firingHz': round(mitte / 60 * zyl / 2, 1),
                         'seconds': round(len(y) / SR_OUT, 4), 'load': 0.0}
        manifest[mid] = {'label': label, 'cylinders': zyl,
                         'source': 'Aufnahme aus Speed Dreams 2.4 (data/sound/%s): %s' % (datei, herkunft),
                         'crackle': knall, 'turbo': False, 'loops': loops,
                         'idleRpm': leer, 'limiterRpm': begr}
        print('%-12s f0 %6.1f Hz -> Aufnahme bei ~%5d U/min, Baender %s' % (mid, f0, auf_rpm, stufen))
    json.dump(manifest, open(manifest_p, 'w', encoding='utf-8', newline='\n'), indent=1)
    effekte(snd)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
