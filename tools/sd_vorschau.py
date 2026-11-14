#!/usr/bin/env python3
"""Render the car models in img/autos/<kennung>/ to a preview image on a dark grey
floor and background, for the garage preview of the virtual driving.

    python tools/sd_vorschau.py            # all cars
    python tools/sd_vorschau.py v5r        # only some

Written as img/autos/<kennung>/vorschau.png (dark grey floor + background, soft
shadow under the car, perspective 3/4 view from the front-right).
"""
import json
import math
import os
import struct
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
AUTOS = os.path.join(REPO, 'img', 'autos')

# Camera: a 3/4 view from the front-right, slightly above. The model is in
# metres (+x left, +y up, +z front), so a simple perspective works.
GRUND = (0.30, 0.30, 0.31)      # floor grey
HINTERGRUND = (0.22, 0.22, 0.23)  # background grey
SICHT = (0.9, 0.9, 0.95)        # soft daylight


def lade_modelle(kennung):
    ordner = os.path.join(AUTOS, kennung)
    meta = json.load(open(os.path.join(ordner, 'auto.json'), encoding='utf-8'))
    bin_ = open(os.path.join(ordner, 'auto.bin'), 'rb').read()
    ecken = np.frombuffer(bin_, dtype=np.float32, count=meta['ecken'] * 8,
                          offset=0).reshape(-1, 8).astype(np.float64)
    indizes = np.frombuffer(bin_, dtype=np.uint16, count=meta['indizes'],
                            offset=meta['indexAb']).astype(np.int64)
    return ordner, meta, ecken, indizes


def textur(ordner, name):
    p = os.path.join(ordner, name)
    return Image.open(p).convert('RGB')


def projizieren(ecken, kamm):
    # Kamera: Blickrichtung +z (vorn), +x links. Kamm = (a, b, f, cx, cy).
    # f = Brennweite in Pixeln, die Kamera sitzt im Ursprung (Abstand via Brennweite).
    a, b, f, cx, cy = kamm
    x = ecken[:, 0]
    y = ecken[:, 1]
    z = ecken[:, 2]
    # Blick von vorn-rechts-oben: drehen um z (Gieren) und x (Neigung).
    # yaw = a: nach links sehen (Auto dreht nach links, wir sehen rechte Seite).
    ca, sa = math.cos(a), math.sin(a)
    x1 = x * ca - z * sa
    z1 = x * sa + z * ca
    cb, sb = math.cos(b), math.sin(b)
    y1 = y * cb - z1 * sb
    z2 = y * sb + z1 * cb
    # Kamera in Blickrichtung um d zurueck: Welt z2 -> Kamera d - z2 (z2 nach vorn).
    d = 11.0
    tiefe = d - z2
    ok = tiefe > 1e-6
    sx = (cx + (x1 * f / np.maximum(tiefe, 1e-6)))
    sy = (cy - (y1 * f / np.maximum(tiefe, 1e-6)))
    return sx, sy, tiefe, ok


def rendern(ecken, indizes, teile, texturen, W, H, kamm):
    sx, sy, tiefe, ok = projizieren(ecken, kamm)
    # Z-Buffer und Farbpuffer (Hintergrund).
    zbuf = np.full((H, W), 1e30)
    farbe = np.empty((H, W, 3), dtype=np.float64)
    farbe[:] = np.array(HINTERGRUND)
    # Bodenebene y=0: grosses Quadrat in Weltkoordinaten, perspektivisch.
    ecken_boden = np.array([[-30, 0, 30], [30, 0, 30], [30, 0, -30], [-30, 0, -30]])
    bsx, bsy, btiefe, bok = projizieren(ecken_boden, kamm)
    _raster_viereck(farbe, zbuf, bsx, bsy, btiefe, np.array(GRUND), W, H)

    for t in teile:
        tex = texturen[t['tex']]
        tw, th = tex.size
        arr = np.asarray(tex, dtype=np.float64) / 255.0
        tri = indizes[t['index0']:t['index0'] + t['indizes']].reshape(-1, 3)
        for tt in tri:
            if not ok[tt].all():
                continue
            p = tt
            x0, y0, d0 = sx[p], sy[p], tiefe[p]
            u0, v0 = ecken[p, 6], ecken[p, 7]
            n0 = ecken[p, 3:6]
            _raster_dreieck(farbe, zbuf, x0, y0, d0, u0, v0, arr, tw, th, n0, W, H)
    # Weicher Schatten unter dem Auto (Ellipse auf dem Boden).
    _schatten(farbe, zbuf, kamm, W, H)
    out = np.clip(farbe, 0, 1)
    return Image.fromarray((out * 255).astype(np.uint8))


def _raster_viereck(farbe, zbuf, sx, sy, tiefe, col, W, H):
    # Zwei Dreiecke.
    for tri in ((0, 1, 2), (0, 2, 3)):
        _fill_tri(farbe, zbuf, sx[list(tri)], sy[list(tri)], tiefe[list(tri)],
                  col, W, H, flat=True)


def _raster_dreieck(farbe, zbuf, x, y, d, u, v, arr, tw, th, n0, W, H):
    # Flaches Shading aus der mittleren Normalen; Textur wird geholt.
    nx, ny, nz = n0.mean(axis=0)
    nl = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
    nx, ny, nz = nx / nl, ny / nl, nz / nl
    # Licht von oben-vorn. Diffus, etwas Ambiente.
    lx, ly, lz = 0.3, 0.9, 0.4
    ll = math.sqrt(lx * lx + ly * ly + lz * lz)
    dif = max(0.0, (nx * lx + ny * ly + nz * lz) / ll)
    hell = 0.35 + 0.75 * dif
    _fill_tri(farbe, zbuf, x, y, d, None, W, H, flat=False,
              uv=(u, v), arr=arr, tw=tw, th=th, hell=hell)


def _fill_tri(farbe, zbuf, x, y, d, col, W, H, flat, uv=None, arr=None,
              tw=1, th=1, hell=1.0):
    x0, x1, x2 = x
    y0, y1, y2 = y
    d0, d1, d2 = d
    minx = max(0, int(math.floor(min(x0, x1, x2))))
    maxx = min(W - 1, int(math.ceil(max(x0, x1, x2))))
    miny = max(0, int(math.floor(min(y0, y1, y2))))
    maxy = min(H - 1, int(math.ceil(max(y0, y1, y2))))
    if minx > maxx or miny > maxy:
        return
    den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
    if abs(den) < 1e-9:
        return
    xs = np.arange(minx, maxx + 1)
    ys = np.arange(miny, maxy + 1)
    XX, YY = np.meshgrid(xs, ys)
    w0 = ((y1 - y2) * (XX - x2) + (x2 - x1) * (YY - y2)) / den
    w1 = ((y2 - y0) * (XX - x2) + (x0 - x2) * (YY - y2)) / den
    w2 = 1 - w0 - w1
    innen = (w0 >= -0.001) & (w1 >= -0.001) & (w2 >= -0.001)
    if not innen.any():
        return
    zz = w0 * d0 + w1 * d1 + w2 * d2
    sub = farbe[miny:maxy + 1, minx:maxx + 1]
    zsub = zbuf[miny:maxy + 1, minx:maxx + 1]
    m = innen & (zz < zsub)
    if not m.any():
        return
    if flat:
        sub[m] = np.array(col)
    else:
        uu = w0 * uv[0][0] + w1 * uv[0][1] + w2 * uv[0][2]
        vv = w0 * uv[1][0] + w1 * uv[1][1] + w2 * uv[1][2]
        uu = np.clip((uu % 1.0) * (tw - 1), 0, tw - 1).astype(np.int64)
        vv = np.clip((vv % 1.0) * (th - 1), 0, th - 1).astype(np.int64)
        px = arr[vv, uu] * hell
        sub[m] = px[m]
    zsub[m] = zz[m]


def _schatten(farbe, zbuf, kamm, W, H):
    # Dunkle, weiche Ellipse unter dem Auto auf dem Boden (y=0, rund um den Nullpunkt).
    a, b, d, cx, cy = kamm
    n = 40
    px, py = [], []
    for i in range(n):
        th = i / n * 2 * math.pi
        ex = math.cos(th) * 2.2
        ez = math.sin(th) * 4.6
        p = np.array([[ex, 0, ez]])
        sx, sy, tiefe, ok = projizieren(p, kamm)
        if ok[0]:
            px.append(sx[0]); py.append(sy[0])
    if len(px) < 3:
        return
    px = np.array(px); py = np.array(py)
    minx = max(0, int(px.min())); maxx = min(W - 1, int(px.max()))
    miny = max(0, int(py.min())); maxy = min(H - 1, int(py.max()))
    if minx > maxx or miny > maxy:
        return
    xs = np.arange(minx, maxx + 1); ys = np.arange(miny, maxy + 1)
    XX, YY = np.meshgrid(xs, ys)
    cx0, cy0 = (px.min() + px.max()) / 2, (py.min() + py.max()) / 2
    rx = max(1e-6, (px.max() - px.min()) / 2)
    ry = max(1e-6, (py.max() - py.min()) / 2)
    rr = ((XX - cx0) / rx) ** 2 + ((YY - cy0) / ry) ** 2
    m = rr <= 1.0
    sub = farbe[miny:maxy + 1, minx:maxx + 1]
    al = np.clip(1 - np.sqrt(rr), 0, 1) * 0.45
    sub[m] = sub[m] * (1 - al[m][:, None])
    farbe[miny:maxy + 1, minx:maxx + 1] = sub


def vorschau(kennung):
    ordner, meta, ecken, indizes = lade_modelle(kennung)
    texturen = {}
    for t in meta['teile']:
        if t['tex'] not in texturen:
            texturen[t['tex']] = textur(ordner, t['tex'])
    W, H = 640, 360
    kamm = (math.radians(28), math.radians(14), 420.0, W / 2, H * 0.62)
    img = rendern(ecken, indizes, meta['teile'], texturen, W, H, kamm)
    ziel = os.path.join(ordner, 'vorschau.png')
    img.save(ziel)
    print('%s -> %s (%d Teile)' % (kennung, ziel, len(meta['teile'])))


if __name__ == '__main__':
    if len(sys.argv) > 1:
        for k in sys.argv[1:]:
            vorschau(k)
    else:
        for k in sorted(os.listdir(AUTOS)):
            if os.path.isdir(os.path.join(AUTOS, k)):
                vorschau(k)
