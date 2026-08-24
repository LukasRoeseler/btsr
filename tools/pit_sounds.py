#!/usr/bin/env python3
"""Generate the two missing pit-stop LOOPS: refuelling and body repair.

Both are loops, not one-shots, because they run for as long as their job does — the
wrench (pit_wrench.ogg, from engine_fx.py) is already used that way. Loops must be built
CIRCULARLY or the seam clicks once a second; the frequency-domain construction used here
is exactly periodic by design, the same trick engine_synth.exhaust_ir and
engine_fx.resonant_noise rely on.

Usage:  python pit_sounds.py
"""

import json
import os
import subprocess
import wave

import numpy as np

from engine_synth import SR, OUT, WORK


def write_wav(path, x):
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())


def to_ogg(x, name, q='4'):
    os.makedirs(WORK, exist_ok=True)
    wav = os.path.join(WORK, 'fx_' + name + '.wav')
    write_wav(wav, x)
    ogg = os.path.join(OUT, name + '.ogg')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav,
                    '-c:a', 'libvorbis', '-q:a', q, '-ac', '1', ogg], check=True)
    return os.path.getsize(ogg)


def band_noise(n, lo, hi, rng, tilt=0.0):
    """Circular band-limited noise. `tilt` in dB/octave shapes it inside the band."""
    freqs = np.fft.rfftfreq(n, 1.0 / SR)
    gain = ((freqs >= lo) & (freqs <= hi)).astype(np.float64)
    # Soft edges: a brick wall rings, and the ring is audible on a short loop.
    edge = np.maximum(lo * 0.5, 1.0)
    gain *= 1.0 / (1.0 + ((freqs - lo) / edge) ** 2 * 0.0)  # keep flat inside
    roll = np.clip((freqs - hi) / max(hi * 0.5, 1.0), 0, None)
    gain *= np.exp(-roll * 3.0)
    roll_lo = np.clip((lo - freqs) / edge, 0, None)
    gain *= np.exp(-roll_lo * 3.0)
    if tilt:
        with np.errstate(divide='ignore'):
            oct_from_lo = np.log2(np.maximum(freqs, 1.0) / max(lo, 1.0))
        gain *= 10 ** (tilt * oct_from_lo / 20.0)
    spec = gain * np.exp(1j * rng.uniform(0, 2 * np.pi, len(freqs)))
    spec[0] = 0
    y = np.fft.irfft(spec, n)
    return (y / (np.max(np.abs(y)) + 1e-9)).astype(np.float32)


def refuel(seconds=2.0, seed=21):
    """Pressurised fuel through a hose: broadband rush plus a slow gurgle.

    The rush alone reads as wind or static. What makes it fuel is the low, irregular
    gurgle riding on top — liquid displacing air in the filler neck — and a faint
    resonance from the hose itself.
    """
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR

    rush = band_noise(n, 380.0, 5200.0, rng, tilt=-2.5) * 0.55
    # Gurgle: two slow, incommensurate modulations so it never sounds like a tremolo.
    g = (0.5 + 0.5 * np.sin(2 * np.pi * (2.0 / seconds) * t * seconds / seconds * 3.0)) \
        * (0.6 + 0.4 * np.sin(2 * np.pi * 2.0 * t + 1.1))
    gurgle = band_noise(n, 60.0, 240.0, np.random.default_rng(seed + 1)) * 0.42 * g
    # Hose resonance: a narrow band that gives the sound a fixed "place".
    hose = band_noise(n, 700.0, 820.0, np.random.default_rng(seed + 2)) * 0.18

    out = rush + gurgle + hose
    return (out / (np.max(np.abs(out)) + 1e-9) * 0.80).astype(np.float32)


def body_repair(seconds=2.4, seed=31):
    """Bodywork being worked on: irregular panel taps over a low rumble.

    Deliberately unlike the wrench, which is a fast even hammer train at ~26 Hz. This is
    slow and uneven — a few taps a second at varying pitch — so that with both playing at
    once (tyres and repair can overlap) the ear can still separate them.
    """
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    out = np.zeros(n, dtype=np.float32)

    # Panel taps. Positions are jittered rather than evenly spaced: an even train is what
    # makes the wrench sound mechanical, and this must not.
    n_taps = int(seconds * 5)
    for i in range(n_taps):
        pos = int(((i + rng.uniform(-0.35, 0.35)) / n_taps) * n) % n
        ln = min(n - pos, int(0.09 * SR))
        if ln <= 8:
            continue
        lt = np.arange(ln) / SR
        f0 = rng.uniform(230.0, 520.0)          # panel size varies, so does the note
        ring = np.zeros(ln, dtype=np.float32)
        for mult, amp in ((1.0, 1.0), (2.37, 0.42), (3.91, 0.2)):
            ring += (amp * np.exp(-lt * 46.0) * np.sin(2 * np.pi * f0 * mult * lt)).astype(np.float32)
        # A little contact noise at the strike, or it sounds like a tuned bell.
        ring += 0.35 * np.exp(-lt * 220.0) * rng.normal(0, 1, ln).astype(np.float32)
        out[pos:pos + ln] += ring * rng.uniform(0.55, 1.0)

    # Low rumble: the car on its jacks, tools on the floor.
    out += band_noise(n, 45.0, 190.0, np.random.default_rng(seed + 1)) * 0.30
    # Distant workshop air.
    out += band_noise(n, 900.0, 4200.0, np.random.default_rng(seed + 2)) * 0.07
    return (out / (np.max(np.abs(out)) + 1e-9) * 0.72).astype(np.float32)


def seam_jump(x):
    """How big the discontinuity at the loop point is, relative to the signal itself.

    A loop is only usable if this is small; printing it is the check, not the hope.
    """
    inner = np.mean(np.abs(np.diff(x)))
    return float(abs(x[0] - x[-1]) / (inner + 1e-9))


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = {}
    for name, fn, secs in (('pit_fuel', refuel, 2.0), ('pit_repair', body_repair, 2.4)):
        x = fn(seconds=secs)
        sz = to_ogg(x, name)
        manifest[name] = {'file': name + '.ogg', 'loop': True, 'seconds': secs}
        print('%-12s %4d KB  %.1fs  Nahtsprung %.2f (klein = loopbar)'
              % (name, sz // 1024, secs, seam_jump(x)))
    print('\nIn audio/fx.json einzutragen:')
    print(json.dumps(manifest, indent=1, ensure_ascii=False))


if __name__ == '__main__':
    main()
