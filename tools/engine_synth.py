#!/usr/bin/env python3
"""Generate engine loops from scratch — no recordings involved at any point.

Modelled on the approach of ange-yaghi/engine-sim (MIT): the sound of a piston engine is
a train of combustion pressure pulses, shaped by the resonance of the exhaust it leaves
through. What distinguishes engines is therefore not pitch but the PATTERN of those
pulses: an even-firing straight/flat six produces a smooth scream, while a cross-plane V8
fires at uneven intervals within each bank, and that irregularity is the burble everyone
recognises as an American V8.

Two consequences of generating rather than sampling, both of which the sample route could
not give us:

  * The loop is seamless by construction. Loop length is set to a whole number of 720-degree
    engine cycles and every filter is applied as a CIRCULAR convolution, so the waveform
    wraps exactly. No crossfade, no click, nothing to measure and hope about.
  * Nothing from any recording is reproduced, so there is no licensing question at all.

Usage:  python engine_synth.py
"""

import json
import zlib
import os
import subprocess

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', 'btsr-repo'))
OUT = os.path.join(REPO, 'audio')
WORK = os.path.join(REPO, 'audio-work')
SR = 22050


def even_firing(n_cyl):
    """Evenly spaced firing angles over one 720-degree cycle, as a single bank."""
    step = 720.0 / n_cyl
    return [[i * step for i in range(n_cyl)]]


SPEED_OF_SOUND = 343.0     # m/s, 20 C


def res_from_primary(inches):
    """Quarter-wave resonance of the header primary, in Hz.

    A header primary is a tube open at one end, so it rings at c / (4L). This replaces
    three hand-tuned res_hz values with one physical relation, and the numbers those hand
    tunings had landed on turn out to correspond to 22.8, 22.5 and 35.5 inch primaries —
    plausible lengths, which is a small validation of both. New engines are now derived
    from a LENGTH taken off the reference engine definitions in engine-sim rather than
    from a frequency someone liked the sound of.
    """
    return SPEED_OF_SOUND / (4.0 * (inches * 0.0254))


def even_v_banks(n_cyl):
    """An even-firing V, split into its two banks.

    Cylinders alternate banks in firing order, so each bank fires evenly at twice the
    engine's firing interval. That evenness is exactly why a flat-plane V8 screams where a
    cross-plane one burbles — same eight cylinders, different bank pattern.
    """
    step = 720.0 / n_cyl
    left = [i * 2 * step for i in range(n_cyl // 2)]
    right = [step + i * 2 * step for i in range(n_cyl // 2)]
    return [left, right]


def cross_plane_v8():
    """Firing order 1-5-4-8-6-3-7-2 at 90-degree intervals, split into its two banks.

    Bank L (cyl 1,2,3,4) ends up firing at 0/180/450/630 degrees and bank R at
    90/270/360/540 — both UNEVEN. Each bank has its own exhaust manifold, so each carries
    a lumpy pulse train, and mixing the two is what produces the burble. A flat-plane V8
    would give 180-degree spacing in both banks and sound like a Ferrari instead.
    """
    order = [1, 5, 4, 8, 6, 3, 7, 2]
    angle = {cyl: i * 90.0 for i, cyl in enumerate(order)}
    left = sorted(angle[c] for c in (1, 2, 3, 4))
    right = sorted(angle[c] for c in (5, 6, 7, 8))
    return [left, right]


# Per-car character. Mostly modelling choices, but the ones that CAN be grounded now are:
# `primary_in` is the header primary length in inches, and res_hz is derived from it (see
# res_from_primary). Lengths and redlines for the new engines are read off the reference
# engine definitions shipped with ange-yaghi/engine-sim (MIT), extracted in tools/ref:
#
#   05_honda_vtec.mr       I4   redline 8400  primary 10"   crank 0/180/180/0
#   07_gm_ls.mr            V8   redline 6500  primary 29"   crank 0/270/90/180  (cross-plane)
#   08_ferrari_f136_v8.mr  V8   redline 9000  primary 29"   crank 0/180/180/0   (flat-plane)
#   10_lfa_v10.mr          V10  redline 9000  primary 50"
#   12_ferrari_412_t2.mr   V12  redline 18000 primary 20"   crank 0/120/240/240/120/0
#
# The three original engines keep the sound they had: their primary_in is set to whatever
# reproduces the res_hz that was tuned by ear, so nothing regresses.
CARS = {
    'porsche': {
        'label': 'Porsche 992 GT3 (Boxer-6, Saugmotor)',
        'banks': even_firing(6), 'cylinders': 6,
        'rpms': {'idle': 1500, 'mid': 4500, 'high': 8200},
        # Pitched well down from 210Hz: at that resonance the flat-six was simply shrill.
        # 22.81 inch reproduces the 148 Hz that was tuned by ear.
        'primary_in': 22.81, 'res_q': 6.0, 'partials': 6, 'ir_ms': 40.0,
        'pulse_ms': 2.8, 'bright': 0.62, 'noise': 0.06, 'noise_hz': 2600.0,
        'clatter': 0.16, 'clatter_hz': 3100.0, 'drive': 2.4,
        'scatter_t': 0.006, 'scatter_g': 0.05, 'crackle': 0.35,
    },
    'bmw': {
        'label': 'BMW M4 GT3 (Reihen-6, Turbo)',
        'banks': even_firing(6), 'cylinders': 6,
        'rpms': {'idle': 1400, 'mid': 4200, 'high': 7200},
        # Turbochargers sit in the exhaust path and act as a muffler: the top end is
        # softened and there is more induction hiss than on the naturally aspirated six.
        'primary_in': 22.51, 'res_q': 4.5, 'partials': 4, 'ir_ms': 46.0,
        'pulse_ms': 3.4, 'bright': 0.45, 'noise': 0.12, 'noise_hz': 2200.0,
        'clatter': 0.11, 'clatter_hz': 2600.0, 'drive': 1.9,
        'scatter_t': 0.005, 'scatter_g': 0.04, 'crackle': 0.55,
    },
    'mustang': {
        'label': 'Ford Mustang GT3 (V8, Cross-Plane)',
        'banks': cross_plane_v8(), 'cylinders': 8,
        'rpms': {'idle': 1200, 'mid': 3900, 'high': 7000},
        'primary_in': 35.54, 'res_q': 6.0, 'partials': 6, 'ir_ms': 60.0,
        'pulse_ms': 4.0, 'bright': 0.55, 'noise': 0.07, 'noise_hz': 1500.0,
        'clatter': 0.20, 'clatter_hz': 2200.0, 'drive': 3.0,
        'scatter_t': 0.008, 'scatter_g': 0.07, 'crackle': 0.45,
    },
    # ---- New engines ----
    'gt3v8': {
        'label': 'GT3 V8, Flat-Plane (nach Ferrari F136)',
        # Same eight cylinders as the Mustang, EVEN banks instead of uneven. The whole
        # difference between a burble and a scream is in this one line.
        'banks': even_v_banks(8), 'cylinders': 8,
        'rpms': {'idle': 1300, 'mid': 5200, 'high': 8800},
        'primary_in': 29.0, 'res_q': 8.0, 'partials': 7, 'ir_ms': 44.0,
        'pulse_ms': 2.4, 'bright': 0.70, 'noise': 0.05, 'noise_hz': 3200.0,
        'clatter': 0.14, 'clatter_hz': 3400.0, 'drive': 2.6,
        'scatter_t': 0.004, 'scatter_g': 0.035, 'crackle': 0.60,
    },
    'gt3v10': {
        'label': 'GT3 V10 (nach Lexus LFA)',
        'banks': even_v_banks(10), 'cylinders': 10,
        'rpms': {'idle': 1400, 'mid': 5400, 'high': 8900},
        'primary_in': 50.0, 'res_q': 9.0, 'partials': 8, 'ir_ms': 52.0,
        'pulse_ms': 2.0, 'bright': 0.74, 'noise': 0.05, 'noise_hz': 3600.0,
        'clatter': 0.12, 'clatter_hz': 3800.0, 'drive': 2.3,
        'scatter_t': 0.0035, 'scatter_g': 0.03, 'crackle': 0.50,
    },
    'bmax': {
        'label': 'Ford B-Max 1.0 EcoBoost (Reihen-3, Turbo)',
        # A triple fires every 240 degrees, which is why it thrums rather than hums, and a
        # small turbo sits in the exhaust and takes the edge off the top end.
        'banks': even_firing(3), 'cylinders': 3,
        'rpms': {'idle': 850, 'mid': 3200, 'high': 6000},
        'primary_in': 10.0, 'res_q': 3.5, 'partials': 4, 'ir_ms': 34.0,
        'pulse_ms': 4.2, 'bright': 0.38, 'noise': 0.18, 'noise_hz': 1800.0,
        'clatter': 0.22, 'clatter_hz': 2400.0, 'drive': 1.6,
        'scatter_t': 0.010, 'scatter_g': 0.09, 'crackle': 0.30,
    },
    'f1': {
        'label': 'F1 V12, 18 000/min (nach Ferrari 412 T2)',
        'banks': even_v_banks(12), 'cylinders': 12,
        'rpms': {'idle': 4000, 'mid': 11000, 'high': 17500},
        'primary_in': 20.0, 'res_q': 11.0, 'partials': 9, 'ir_ms': 30.0,
        'pulse_ms': 1.1, 'bright': 0.82, 'noise': 0.04, 'noise_hz': 5000.0,
        'clatter': 0.08, 'clatter_hz': 4600.0, 'drive': 2.0,
        'scatter_t': 0.002, 'scatter_g': 0.02, 'crackle': 0.25,
    },
}


def car_res_hz(cfg):
    """Resonance of this engine's header, from its length unless one is pinned."""
    return cfg.get('res_hz') or res_from_primary(cfg['primary_in'])


def circular_noise(n, cutoff_hz, rng):
    """Noise that wraps perfectly: build it in the frequency domain with random phase.

    Ordinary time-domain noise cannot loop — its two ends never match. Synthesising it as
    an inverse FFT makes it inherently circular.
    """
    spec = np.zeros(n // 2 + 1, dtype=complex)
    freqs = np.fft.rfftfreq(n, 1.0 / SR)
    shape = 1.0 / (1.0 + (freqs / max(cutoff_hz, 1.0)) ** 2)
    phase = rng.uniform(0, 2 * np.pi, len(spec))
    spec = shape * np.exp(1j * phase)
    spec[0] = 0
    y = np.fft.irfft(spec, n)
    return (y / (np.max(np.abs(y)) + 1e-9)).astype(np.float32)


def exhaust_ir(n, cfg, rng):
    """Impulse response of one exhaust bank: decaying partials of the pipe resonance.

    A header is a tube, so it rings at its resonance and multiples of it. Longer pipe =
    lower resonance and slower decay, which is why the V8 gets 60ms and 95Hz while the
    high-revving flat six gets 34ms and 210Hz.
    """
    ln = int(cfg['ir_ms'] * 0.001 * SR)
    t = np.arange(ln) / SR
    ir = np.zeros(n, dtype=np.float32)
    body = np.zeros(ln, dtype=np.float32)
    res = car_res_hz(cfg)
    for k in range(1, cfg['partials'] + 1):
        f = res * k
        if f > SR * 0.45:
            break
        decay = np.exp(-t * (f / cfg['res_q']) * 2.0)
        amp = (cfg['bright'] ** (k - 1)) / k
        body += (amp * decay * np.sin(2 * np.pi * f * t + rng.uniform(0, 2 * np.pi))).astype(np.float32)
    body[:8] += np.linspace(1.0, 0.0, 8)  # the initial crack of the pulse itself
    ir[:ln] = body / (np.max(np.abs(body)) + 1e-9)
    return ir


def saturate(x, drive):
    """Soft clipping. A perfectly clean waveform is most of what makes synthesis sound
    synthetic; pushing it through a tanh adds the odd harmonics a real exhaust has and
    takes the polish off."""
    if drive <= 0:
        return x
    return (np.tanh(x * drive) / np.tanh(drive)).astype(np.float32)


def metal_tick(n_samples, hz, rng):
    """One short, bright, inharmonic click: a valve seating or a chain slapping."""
    t = np.arange(n_samples) / SR
    y = np.zeros(n_samples, dtype=np.float32)
    for mult, amp in ((1.0, 1.0), (1.53, 0.6), (2.31, 0.35)):  # inharmonic on purpose
        y += (amp * np.exp(-t * 900.0) * np.sin(2 * np.pi * hz * mult * t
                                                + rng.uniform(0, 6.28))).astype(np.float32)
    return y / (np.max(np.abs(y)) + 1e-9)


def circ_conv(x, ir):
    n = len(x)
    return np.fft.irfft(np.fft.rfft(x) * np.fft.rfft(ir), n).astype(np.float32)


def cylinder_scatter(cfg, n_events, seed):
    """Per-cylinder timing and strength offsets, FIXED for the engine.

    The loop already jittered every firing event independently, which is wrong in a
    revealing way: it makes an engine sound noisy rather than characterful. A real engine's
    cylinders differ CONSISTENTLY — one always fills a little better, one always fires a
    degree early — so the same pattern repeats every cycle and the ear learns it. Random
    per-event jitter can never produce that, however much of it you add.
    """
    r = np.random.default_rng(seed ^ 0x5EED)
    return (r.normal(0, cfg.get('scatter_t', 0.005), n_events),
            1.0 + r.normal(0, cfg.get('scatter_g', 0.05), n_events))


def intake_path(n, cfg, rpm, rng, load):
    """Induction noise as its own path, not hiss mixed into the exhaust.

    The intake is a second, physically separate opening: broader band, far less resonant,
    and it grows with throttle rather than with engine speed. Previously this was a single
    noise term gated by the exhaust envelope, which tied it to the wrong thing entirely —
    on a closed throttle the old version still hissed in step with every firing pulse.
    """
    if cfg['noise'] <= 0 or load <= 0.01:
        return np.zeros(n, dtype=np.float32)
    base = circular_noise(n, cfg['noise_hz'], rng)
    # A short, low-Q resonance: an airbox has a note, but a vague one.
    ln = max(8, int(0.008 * SR))
    t = np.arange(ln) / SR
    f0 = cfg['noise_hz'] * 0.35
    body = (np.exp(-t * f0 / 2.5) * np.sin(2 * np.pi * f0 * t)).astype(np.float32)
    ir = np.zeros(n, dtype=np.float32)
    ir[:ln] = body / (np.max(np.abs(body)) + 1e-9)
    x = circ_conv(base, ir)
    return (cfg['noise'] * load * x / (np.max(np.abs(x)) + 1e-9)).astype(np.float32)


def overrun_crackle(n, cfg, cycle_s, cycles, rng):
    """Off-throttle pops: unburnt mixture igniting in a hot exhaust.

    Deliberately sparse and irregular. Evenly spaced pops sound like a rhythm section; the
    real thing is scattered, which is why the positions are drawn rather than placed.
    """
    amt = cfg.get('crackle', 0.0)
    if amt <= 0:
        return np.zeros(n, dtype=np.float32)
    out = np.zeros(n, dtype=np.float32)
    count = max(1, int(cycles * amt * 1.4))
    ln = max(8, int(0.020 * SR))
    t = np.arange(ln) / SR
    for _ in range(count):
        i = int(rng.random() * n)
        f = rng.uniform(90.0, 260.0)
        pop = (np.exp(-t * 90.0) * np.sin(2 * np.pi * f * t)).astype(np.float32)
        pop += 0.6 * np.exp(-t * 300.0) * rng.normal(0, 1, ln).astype(np.float32)
        idx = (np.arange(ln) + i) % n
        np.add.at(out, idx, pop * rng.uniform(0.4, 1.0))
    return (amt * out / (np.max(np.abs(out)) + 1e-9)).astype(np.float32)


def synth_loop(cfg, rpm, seed, load=1.0):
    """One seamless loop at a fixed RPM.

    `load` is the throttle state the loop represents: 1.0 on the power, 0.0 on a closed
    throttle. It is not a volume control — a closed throttle changes the SOUND, because
    there is little pressure to release and what is heard instead is the mechanism plus
    whatever pops in the exhaust. That difference is the single largest realism gap the
    generator had, since the app could previously only turn the same timbre down.
    """
    rng = np.random.default_rng(seed)
    cycle_s = 120.0 / rpm                       # 720 degrees of crank
    cycles = max(1, int(round(2.0 / cycle_s)))  # aim for ~2s, land on a whole number
    dur = cycles * cycle_s
    n = int(round(dur * SR))

    # A closed throttle means a weak, shorter pressure pulse: less to burn, less to let out.
    pulse_ms = cfg['pulse_ms'] * (0.55 + 0.45 * load)
    pulse_len = max(4, int(pulse_ms * 0.001 * SR))
    pt = np.arange(pulse_len) / SR
    # Fast attack, exponential decay: a combustion pulse, not a tone.
    pulse = (np.exp(-pt * (1000.0 / pulse_ms)) *
             (1.0 - np.exp(-pt * 8000.0))).astype(np.float32)
    pulse /= np.max(np.abs(pulse)) + 1e-9

    out = np.zeros(n, dtype=np.float32)
    for bi, bank_angles in enumerate(cfg['banks']):
        # Fixed per-cylinder character for this bank, plus a small random wobble on top.
        dt_cyl, g_cyl = cylinder_scatter(cfg, len(bank_angles), seed + bi * 977)
        train = np.zeros(n, dtype=np.float32)
        for c in range(cycles):
            for j, ang in enumerate(bank_angles):
                # Position of this firing event within the loop, wrapped circularly.
                t = (c * cycle_s) + (ang / 720.0) * cycle_s
                # Two kinds of irregularity: the cylinder's OWN, constant offset (learned
                # by the ear as character) and a much smaller cycle-to-cycle wobble.
                t += (dt_cyl[j] + rng.normal(0, 0.0015)) * cycle_s
                i = int(round(t * SR)) % n
                gain = g_cyl[j] * (1.0 + rng.normal(0, 0.02)) * (0.30 + 0.70 * load)
                idx = (np.arange(pulse_len) + i) % n
                np.add.at(train, idx, pulse * gain)
        out += circ_conv(train, exhaust_ir(n, cfg, rng))

    # Valvetrain: ticks at CAMSHAFT rate (half the crank), offset from the firing events.
    # This is the mechanical layer that was missing entirely, and its absence is a large
    # part of why the engines sounded like an oscillator rather than machinery.
    if cfg.get('clatter', 0) > 0:
        tick = metal_tick(max(8, int(0.010 * SR)), cfg['clatter_hz'], rng)
        clat = np.zeros(n, dtype=np.float32)
        per_cycle = max(2, cfg['cylinders'] // 2)
        for c in range(cycles):
            for k in range(per_cycle):
                t = (c + (k + 0.35) / per_cycle) * cycle_s
                t += rng.normal(0, 0.01) * cycle_s
                i = int(round(t * SR)) % n
                idx = (np.arange(len(tick)) + i) % n
                np.add.at(clat, idx, tick * (0.7 + 0.6 * rng.random()))
        # Off the power the mechanism is a LARGER share of what is left, because the
        # combustion it normally hides behind has gone quiet.
        out += cfg['clatter'] * (1.0 + 1.6 * (1.0 - load)) * clat / (np.max(np.abs(clat)) + 1e-9)

    out += intake_path(n, cfg, rpm, rng, load)
    if load < 0.5:
        out += overrun_crackle(n, cfg, cycle_s, cycles, rng) * (1.0 - 2 * load if load < 0.5 else 0)

    # Remove the DC offset BEFORE normalising. Measured, not assumed: the strongest
    # spectral component of six of the twenty-eight loops was sitting at ~0.5 Hz, i.e. a
    # constant offset, which steals headroom from the actual sound and can click at the
    # loop seam. It creeps in because a pulse train is one-sided and neither the circular
    # convolution nor the soft clipping is required to be zero-mean.
    out = out - float(np.mean(out))
    out = out / (np.max(np.abs(out)) + 1e-9)
    # Less pressure, less saturation: the soft clipping is a consequence of level, so it
    # cannot stay constant while the level changes.
    out = saturate(out, cfg.get('drive', 2.0) * (0.5 + 0.5 * load))
    out = out - float(np.mean(out))     # saturation is not symmetric either
    out = out / (np.max(np.abs(out)) + 1e-9) * 0.89
    return out.astype(np.float32), dur


def write_wav(path, x):
    import wave
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())


# A note so nobody chases this twice: hashing the .ogg files is NOT a reproducibility
# check. libvorbis stamps a random Ogg bitstream serial number into every stream, so two
# encodes of identical audio differ in the container while the samples match exactly. Check
# audio-work/synth_*.wav instead - those are written straight from the arrays.
def encode_drift(src, ogg):
    """How far the DECODED ogg has moved away from the array that was encoded.

    This replaces two generations of "seam jump" metric, both of which measured nothing.
    They compared the last sample of the loop to the first one - but the loop is built
    circularly, so that step IS part of the waveform and repeats identically on every pass.
    There is no discontinuity there to find, and the numbers were just reporting whether
    the loop happened to start on a pulse onset.

    What can actually click is the codec. Vorbis is block-based: it pads the signal, and the
    decoder hands back a slightly different number of samples than went in. The browser then
    loops THAT, so any added or missing samples land exactly on the wrap. So two things are
    measured, and neither is a matter of taste:

      dn    surplus samples after the round trip. Every one of them is silence or garbage
            inserted into the loop period, which both detunes the loop and can tick.
      err   worst absolute deviation over the overlapping part, full scale = 1.0. Says
            whether the waveform itself survived, separately from the length.
    """
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', ogg, '-f', 'f32le',
                          '-ac', '1', '-ar', str(SR), '-'],
                         stdout=subprocess.PIPE, check=True).stdout
    dec = np.frombuffer(raw, dtype='<f4')
    dn = len(dec) - len(src)
    m = min(len(dec), len(src))
    err = float(np.max(np.abs(dec[:m] - src[:m]))) if m else 1.0
    return dn, err


def cycle_lock(x, rpm):
    """Check that the waveform is periodic at the engine CYCLE rate, and how much energy
    sits at the firing rate itself.

    Two earlier attempts at this check were both wrong, in instructive ways.

      1. "loudest peak must equal the firing rate" - it does not, and need not. Which
         harmonic is loudest depends on how sharp the pulses are and on how the two banks
         of a V interleave. A flat six at 8200 rpm came out at a third of its firing rate;
         nothing was broken.
      2. "autocorrelate the envelope" - the envelope of an engine has ripples everywhere,
         and picking the first local maximum above a threshold returned arbitrary numbers,
         worse than attempt 1.

    What IS invariant: the loop is built to be exactly periodic over whole 720-degree
    cycles, so ALL spectral energy must land on integer multiples of rpm/120. If the peak
    is not such a multiple, the construction is broken. And separately, there should be
    real energy AT the firing rate, since that is what a firing event train produces.
    """
    cyc = rpm / 120.0                       # one full 720-degree cycle, in Hz
    fire = rpm / 60.0                       # will be scaled by cylinders/2 by the caller
    spec = np.abs(np.fft.rfft(x * np.hanning(len(x))))
    freqs = np.fft.rfftfreq(len(x), 1.0 / SR)
    # From 20 Hz up. Below that there is nothing an engine produces and nothing anyone
    # hears, and letting DC win the argmax is how the offset above stayed hidden.
    lo = int(np.searchsorted(freqs, 20.0))
    peak_hz = float(freqs[int(np.argmax(spec[lo:])) + lo])
    k = peak_hz / cyc if cyc > 0 else 0.0
    lock = abs(k - round(k)) / max(1.0, round(k))    # relative distance to the nearest multiple
    return peak_hz, k, lock


def band_energy(x, f0, width_hz=8.0):
    """Share of total energy within +-width of f0. Says whether a component is really there."""
    spec = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2
    freqs = np.fft.rfftfreq(len(x), 1.0 / SR)
    tot = spec[1:].sum() + 1e-12
    m = (freqs > f0 - width_hz) & (freqs < f0 + width_hz)
    return float(spec[m].sum() / tot)


def dominant_hz(x):
    m = np.abs(np.fft.rfft(x * np.hanning(len(x))))
    f = np.fft.rfftfreq(len(x), 1.0 / SR)
    lo = np.searchsorted(f, 30.0)
    return float(f[lo + int(np.argmax(m[lo:]))])


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(WORK, exist_ok=True)
    manifest = {}
    for key, cfg in CARS.items():
        manifest[key] = {'label': cfg['label'], 'cylinders': cfg['cylinders'],
                         'source': 'vollständig synthetisiert (Modell nach engine-sim, MIT)',
                         'loops': {}}
        # One extra loop per engine for the closed throttle, at the mid band. The app
        # scales it by rpm like any other, and crossfades it in as load drops — one file per
        # engine instead of a whole parallel set, which is enough to hear the difference.
        bands = list(cfg['rpms'].items()) + [('over', cfg['rpms']['mid'])]
        for band, rpm in bands:
            load = 0.0 if band == 'over' else 1.0
            # zlib.crc32, NOT hash(). Python randomises hash() for strings once per
            # process (PYTHONHASHSEED), so the previous line drew a different seed on
            # every run: the committed .ogg files could never be regenerated, and a
            # regression in the synthesis would have been indistinguishable from the seed
            # having moved. crc32 over the same name is stable forever.
            seed = zlib.crc32(('%s/%s' % (key, band)).encode()) % (2 ** 31)
            x, dur = synth_loop(cfg, rpm, seed=seed, load=load)
            wav = os.path.join(WORK, 'synth_%s_%s.wav' % (key, band))
            write_wav(wav, x)
            name = '%s_%s.ogg' % (key, band)
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav,
                            '-c:a', 'libvorbis', '-q:a', '4', '-ac', '1',
                            os.path.join(OUT, name)], check=True)
            # Expected firing rate: a 4-stroke fires cylinders/2 times per revolution.
            expect = rpm / 60.0 * cfg['cylinders'] / 2.0
            manifest[key]['loops'][band] = {
                'file': name, 'baseRpm': rpm, 'firingHz': round(expect, 1),
                'seconds': round(dur, 4), 'load': load,
            }
            peak_hz, k, lock = cycle_lock(x, rpm)
            dc = abs(float(np.mean(x)))
            dn, err = encode_drift(x, os.path.join(OUT, name))
            e_fire = band_energy(x, expect)
            ok = 'ok' if lock < 0.02 else 'BRUCH'
            print('%-8s %-5s rpm=%-5d  Zuendrate %7.1f Hz  Peak %7.1f Hz = %6.2f x '
                  'Zyklusrate [%s]  E@Zuend %5.2f %%  DC %.5f  dn %+5d  err %.3f  %d KB'
                  % (key, band, rpm, expect, peak_hz, k, ok, e_fire * 100, dc,
                     dn, err, os.path.getsize(os.path.join(OUT, name)) // 1024))
    # MERGE, do not overwrite. The manifest also lists the Corvette, whose loops are cut
    # from a recording and are not produced here. Writing this file from scratch silently
    # deleted that entry, and since the app has 'corvette' in SAMPLE_CARS the profile simply
    # stopped working. Same mistake as the CREDITS.md one below, found the same way: by
    # reading the file the generator had just written instead of assuming.
    path = os.path.join(OUT, 'loops.json')
    merged = {}
    if os.path.exists(path):
        with open(path) as f:
            merged = json.load(f)
    for key, entry in manifest.items():
        # Keep any band already in the file that this run did not regenerate.
        old = merged.get(key, {}).get('loops', {})
        old.update(entry['loops'])
        entry['loops'] = old
        merged[key] = entry
    kept = [k for k in merged if k not in manifest]
    with open(path, 'w') as f:
        json.dump(merged, f, indent=1)
    if kept:
        print('')
        print('Unangetastet uebernommen (nicht von diesem Skript erzeugt): ' + ', '.join(kept))
    # CREDITS.md is NOT written here any more. This generator only knows about the engines
    # it produces, and it used to overwrite the file with "everything is fully synthetic" —
    # which is false for the Corvette and the ambience beds (Pixabay recordings) and would
    # silently undo a correction that had to be made by hand. A generator must not claim
    # more than it made.
    print('')
    print('Hinweis: audio/CREDITS.md wird NICHT ueberschrieben - dort stehen auch die')
    print('Pixabay-Anteile, von denen dieses Skript nichts weiss.')


if __name__ == '__main__':
    main()
