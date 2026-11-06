#!/usr/bin/env python3
"""Porsche 911 (992) GT3R aus dem Sketchfab-FBX fuer die virtuelle Fahrt umwandeln.

    python tools/porsche_model.py [--dry]

BESTELLT: "Put the porsche in: eine niedrig-poly OBJ/glTF aus Sketchfab (oder Blender) mit
erhaltenen UVs, plus die vollstaendigen Texturen."

Quelle: sketchfab/porsche-911-992-gt3r/ (FBX, CC BY 4.0). Der FBX enthaelt das Auto zweimal
(Kopie A: Meshes 0-48, Kopie B: Meshes 49-95); es wird nur Kopie A verwendet. Der Innenraum
(INT_*, BELT) und das Weltgitter (WorldGrid) werden weggelassen, der Vorderreifen links wird
als ein Rad herausgeloest (Mitte auf 0, normiert auf Radius 0,5 und Breite 1,0 - so skaliert
die App es mit reifen.vorn.radius/breite wieder zurueck).

Geschrieben wird nach img/autos/porsche/:
  auto.bin   alle Ecken (Float32: x y z nx ny nz u v) und danach alle Indizes (Uint16)
  auto.json  Teile (Rolle, Textur, Bereiche), Lichter, Fahrzeugdaten
  *.png      die Texturen (Kopien + einfarbige Flaechen fuer Materialien ohne Textur)

KOORDINATEN: Im FBX zeigt +z nach vorn, +y nach oben, +x nach links (das Lenkrad liegt bei
+x, der Porsche ist linksgesteuert). Die App rechnet genauso: m; +x links, +y oben, +z vorn.
Also keine Drehung noetig. Die UVs bleiben unveraendert (OpenGL-Konvention, v unten).
"""

import json
import math
import os
import struct
import sys

import numpy as np
import pyassimp
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
FBX = os.path.join(REPO, 'sketchfab', 'porsche-911-992-gt3r', 'source', '992 GT3R.fbx')
TEX_SRC = os.path.join(REPO, 'sketchfab', 'porsche-911-992-gt3r', 'textures')
OUT = os.path.join(REPO, 'img', 'autos', 'porsche')

# Materialindex -> (Rolle, Gruppe).  Rolle steuert die Darstellung in vfModellZeichnen.
ROLLEN = {
    0: ('scheinwerferglas', 'auto'), 1: ('karosserie', 'auto'), 2: ('karosserie', 'auto'),
    3: ('karosserie', 'auto'), 4: ('karosserie', 'auto'), 5: ('karosserie', 'auto'),
    6: ('glas', 'auto'), 7: ('karosserie', 'auto'), 8: ('scheinwerfer', 'auto'),
    9: ('ruecklicht', 'auto'), 10: ('glas', 'auto'), 11: ('glas', 'auto'),
    12: ('karosserie', 'auto'), 13: ('karosserie', 'auto'), 14: ('karosserie', 'auto'),
    15: ('scheinwerferglas', 'auto'), 16: ('karosserie', 'auto'), 17: ('karosserie', 'auto'),
    22: ('karosserie', 'auto'), 23: ('karosserie', 'auto'), 46: ('karosserie', 'auto'),
    47: ('scheinwerfer', 'auto'),
}
WHEEL_MATS = (18, 19, 20, 21)          # Reifen links, Felge, Bremsscheibe, Reifen rechts
TYRE_MATS = (18, 21)                   # Reifen (Textur)
METAL_MATS = (19, 20)                  # Felge + Bremsscheibe (einfarbig)

# Materialindex -> Texturdatei (Kopie aus sketchfab/textures). Ohne Eintrag: einfarbig.
TEXTUREN = {
    0: 'ext_glass_headlight.png', 15: 'ext_glass_headlight.png',
    1: 'body_carbon.png',
    47: 'lights_aux.png',
}
TEX_QUELLE = {
    'ext_glass_headlight.png': 'AnyConv.com__ext_glass_headlight.png',
    'body_carbon.png': 'AnyConv.com__Body_Carbon.png',
    'lights_aux.png': 'AnyConv.com__Lights_Aux_Colour.png',
    'tyre.png': 'AnyConv.com__Tyre_Dry_Colour.png',
}

# Einfarbige Materialien: Materialindex -> (r, g, b) 0-255. Wertet die diffuse Farbe des
# Materials, ergaenzt um Werte, die auf einem Rennwagen sinnvoll sind.
FARBEN = {
    1: (110, 110, 112), 2: (35, 35, 38), 3: (25, 25, 28), 4: (18, 18, 18), 5: (230, 230, 230),
    6: (140, 150, 160), 7: (200, 200, 205), 8: (255, 255, 255), 9: (200, 30, 20),
    10: (30, 34, 40), 11: (120, 20, 20), 12: (22, 22, 24), 13: (120, 122, 128),
    14: (15, 15, 15), 16: (90, 90, 95), 17: (40, 40, 44), 22: (170, 175, 180),
    23: (235, 235, 230), 46: (50, 50, 55), 47: (255, 210, 130),
}
WHEEL_METAL_FARBE = (140, 142, 148)
WHEEL_DISC_FARBE = (70, 70, 75)

# Zielgroesse: Gesamtzahl Dreiecke der Karosserie (ohne Raeder) nach der Vereinfachung.
# BESTELLT (2026-11-06): "Porsche soll aussehen wie der 3D-Render von Sketchfab. Mach eine
# Ausnahme, wo das auf Mobilgeraeten schlecht laufen darf." Also volle Aufloesung, keine
# Vereinfachung: ZIEL so gross setzen, dass nichts decimiert wird. Die Indizes laufen dann
# ueber 65535 Ecken und werden als Uint32 geschrieben (siehe unten).
ZIEL_DREIECKE = 5000000
# Zielgroessen fuer das (4x wiederverwendete) Rad (ebenfalls volle Aufloesung).
ZIEL_RAD_TYRE = 200000
ZIEL_RAD_METAL = 200000


def lade_geometrie(scene):
    """Material -> {ecken, normalen, uv, dreiecke} aus Kopie A (Meshes 0-48)."""
    mat = {}
    for m in scene.meshes[0:49]:
        mi = int(m.materialindex)
        v = np.array(m.vertices, dtype=np.float32)
        if len(v) == 0:
            continue
        n = np.array(m.normals, dtype=np.float32) if m.normals is not None else np.zeros_like(v)
        tc = m.texturecoords[0] if (m.texturecoords is not None and m.texturecoords[0] is not None) else None
        uv = np.array(tc, dtype=np.float32)[:, :2] if tc is not None else np.zeros((len(v), 2), np.float32)
        faces = np.array(m.faces, dtype=np.int64).reshape(-1, 3)
        d = mat.setdefault(mi, {'ecken': [], 'normalen': [], 'uv': [], 'dreiecke': [], 'basis': 0})
        basis = len(d['ecken'])
        d['ecken'].append(v)
        d['normalen'].append(n)
        d['uv'].append(uv)
        d['dreiecke'].append(faces + basis)
    out = {}
    for mi, d in mat.items():
        out[mi] = {
            'ecken': np.concatenate(d['ecken']),
            'normalen': np.concatenate(d['normalen']),
            'uv': np.concatenate(d['uv']),
            'dreiecke': np.concatenate(d['dreiecke']),
        }
    return out


def weld(ecken, normalen, uv, dreiecke):
    """Ecken, die sich in Lage, Normale und UV gleichen, zusammenfuehren (Nahte bleiben getrennt)."""
    k = np.concatenate([np.round(ecken, 4), np.round(normalen, 4), np.round(uv, 4)], axis=1)
    _, idx, inv = np.unique(k, axis=0, return_index=True, return_inverse=True)
    return ecken[idx], normalen[idx], uv[idx], inv.reshape(-1)[dreiecke]


def glatte_normalen(ecken, dreiecke):
    """Flaechig gewichtete, geglaettete Ecken-Normalen aus der Geometrie.

    Die decimierte Oberflaeche erbt sonst die Normale einer einzelnen Original-Ecke; benachbarte
    Dreiecke schattieren dann uneinheitlich und die Flaechen wirken facettiert. Diese Funktion
    mittelt die Flaechentripel (Gewicht = Flaecheninhalt) und liefert glatte, einheitliche
    Normalen, die zur neuen Geometrie passen.
    """
    a = ecken[dreiecke[:, 1]] - ecken[dreiecke[:, 0]]
    b = ecken[dreiecke[:, 2]] - ecken[dreiecke[:, 0]]
    n = np.cross(a, b)
    acc = np.zeros_like(ecken)
    for i in range(3):
        np.add.at(acc, dreiecke[:, i], n)
    ln = np.linalg.norm(acc, axis=1, keepdims=True)
    out = acc / np.maximum(ln, 1e-9)
    # Ecken, deren Flaechen sich zu null aufheben (degenerierte Dreiecke), bekommen die
    # Normale eines nicht-degenerierten Dreiecks, sonst nach oben - sonst erschienen sie schwarz.
    tot = ln.ravel() < 1e-9
    if tot.any():
        flaeche = n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
        rest = tot.copy()
        for k, face in enumerate(dreiecke):
            if not np.any(rest[face]):
                continue
            if np.linalg.norm(n[k]) < 1e-6:
                continue
            fn = flaeche[k]
            for j in range(3):
                v = face[j]
                if rest[v]:
                    out[v] = fn
                    rest[v] = False
        out[rest] = [0, 1, 0]
    return out


def vereinfachen(ecken, normalen, uv, dreiecke, ziel):
    """Ecken/Dreiecke auf ziel Dreiecke vereinfachen, UVs erhalten.

    Zuerst werden doppelte Ecken (Lage+Normale+UV) zusammengefuehrt, dann wird mit der
    QEM-Simplifizierung (fast_simplification) vereinfacht. Die Zusammenfall-Kette wird mit
    replay_simplification abgespielt: die decimierten Punkte liegen dann auf den optimalen
    QEM-Stellen (glatte Oberflaeche statt zackiger Original-Stuetzstellen). Die Indizierung
    (indice_mapping) ordnet jeder decimierten Ecke ihre Original-UVs zu; die Normalen werden
    danach aus der neuen Geometrie geglaettet, damit keine Facetten sichtbar sind.
    Faellt replay aus, wird auf die Union-Find-Rekonstruktion mit Original-Stuetzstellen
    zurueckgegriffen.
    """
    ecken, normalen, uv, dreiecke = weld(ecken, normalen, uv, dreiecke)
    if len(dreiecke) <= ziel or ziel <= 0:
        return ecken, normalen, uv, dreiecke
    from fast_simplification import simplify, replay_simplification
    pts = np.ascontiguousarray(ecken, dtype=np.float32)
    tris = np.ascontiguousarray(dreiecke, dtype=np.int32)
    try:
        _, _, collapses = simplify(pts, tris, target_count=int(ziel), agg=7, return_collapses=True)
        dec_pts, dec_faces, imap = replay_simplification(pts, tris, collapses)
        # indice_mapping[i] = j: Original-Ecke i -> decimierte Ecke j (-1 = isoliert, entfernt).
        # Fuer jede decimierte Ecke die Original-Ecke ermitteln (die zuletzt hineingefallene).
        valid = imap >= 0
        dec_orig = np.full(len(dec_pts), -1, dtype=np.int64)
        dec_orig[imap[valid]] = np.nonzero(valid)[0]
        if (dec_orig >= 0).all() and len(dec_faces) > 0:
            dec_pts = dec_pts.astype(np.float32)
            return dec_pts, glatte_normalen(dec_pts, dec_faces.astype(np.int64)), uv[dec_orig], dec_faces.astype(np.int64)
    except Exception:
        pass
    # Fallback: Original-Stuetzstellen beibehalten (Union-Find ueber die Zusammenfall-Kette).
    from fast_simplification import simplify
    _, _, collapses = simplify(pts, tris, target_count=int(ziel), agg=7, return_collapses=True)
    n = len(ecken)
    parent = np.arange(n, dtype=np.int64)

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for i0, i1 in collapses:
        r0 = find(int(i0))
        r1 = find(int(i1))
        if r0 != r1:
            parent[r1] = r0
    roots = np.array([find(i) for i in range(n)], dtype=np.int64)
    surv = np.unique(roots)
    nidx = {int(s): k for k, s in enumerate(surv)}
    nt = roots[dreiecke]
    mapped = np.vectorize(lambda x: nidx[int(x)], otypes=[np.int64])(nt)
    keep = (mapped[:, 0] != mapped[:, 1]) & (mapped[:, 1] != mapped[:, 2]) & (mapped[:, 0] != mapped[:, 2])
    return ecken[surv], normalen[surv], uv[surv], mapped[keep]


def textur_farbe(datei, farbe, ziel):
    """Einfarbige kleine Textur schreiben; gibt den Dateinamen zurueck."""
    b = Image.new('RGBA', (8, 8), tuple(farbe) + (255,))
    b.save(os.path.join(ziel, datei), optimize=True)
    return datei


def uv_norm(uv):
    """UVs des Teils auf [0,1] bringen.

    Der Sketchfab-FBX legt die UVs als winzige Dreiecke ueber einen riesigen Atlas (u bis ~350,
    v bis ~700). Jedes Dreieck bleibt dabei zusammen, aber der Massstab passt nicht zu den
    gelieferten Texturen. Die Min-Max-Normierung stuelt das nicht-ueberlappende Layout in
    [0,1], sodass die Textur kohaerent abgetastet wird.
    """
    mn = uv.min(axis=0)
    mx = uv.max(axis=0)
    span = mx - mn
    span[span < 1e-6] = 1.0
    return (uv - mn) / span


def schreibe_teil(teile, name, rolle, gruppe, tex, ecken, normalen, uv, dreiecke):
    """Einen Teil (mit eigenen, zusammenhängenden Ecken) an die Teileliste anhaengen."""
    if len(dreiecke) == 0:
        return 0
    # Ecken, die nicht in Dreiecken vorkommen, entfernen und Indizes umschreiben.
    benutzt = np.unique(dreiecke)
    umap = np.full(len(ecken), -1, dtype=np.int64)
    umap[benutzt] = np.arange(len(benutzt))
    ecken = ecken[benutzt]
    normalen = normalen[benutzt]
    uv = uv[benutzt]
    dreiecke = umap[dreiecke]
    basis = teile['ecken']
    teile['teile'].append({
        'name': name, 'rolle': rolle, 'gruppe': gruppe, 'tex': tex,
        'ecke0': basis, 'ecken': len(ecken), 'index0': len(teile['indizes']), 'indizes': len(dreiecke) * 3,
    })
    teile['eckenlist'].append(ecken)
    teile['normalenlist'].append(normalen)
    teile['uvlist'].append(uv_norm(uv))
    teile['indizes'].extend(dreiecke.reshape(-1).tolist())
    teile['ecken'] += len(ecken)
    return len(dreiecke)


def kanten_licht(geo, mi):
    """Schwerpunkt (x, y, z) der vorderen/rueckwaertigen Leuchtmaterialien fuer die Lichterliste."""
    d = geo[mi]
    c = d['ecken'].mean(axis=0)
    return c


def python_wert(x):
    """numpy-Skalare in native Python-Typen umwandeln (fuer json.dump)."""
    if isinstance(x, np.generic):
        return x.item()
    if isinstance(x, float):
        return x
    if isinstance(x, (list, tuple)):
        return [python_wert(v) for v in x]
    if isinstance(x, dict):
        return {k: python_wert(v) for k, v in x.items()}
    return x


def main():
    dry = '--dry' in sys.argv
    os.makedirs(OUT, exist_ok=True)
    with pyassimp.load(FBX) as scene:
        geo = lade_geometrie(scene)

    # ---- Raeder: vorderes linkes Rad herausloesen (x>0, z>0) und normieren -----------------
    def rad_quadrant(materialien):
        """Ecken/Dreiecke der vorderen linken Raeder aus den gegebenen Materialien sammeln."""
        vv, nn, uu, ff, base = [], [], [], [], 0
        for mi in materialien:
            d = geo.get(mi)
            if d is None:
                continue
            cent = d['ecken'][d['dreiecke']].mean(axis=1)
            sel = (cent[:, 0] > 0) & (cent[:, 2] > 0)
            tris = d['dreiecke'][sel]
            if len(tris) == 0:
                continue
            vv.append(d['ecken']); nn.append(d['normalen']); uu.append(d['uv'])
            ff.append(tris + base)
            base += len(d['ecken'])
        if not ff:
            return None
        v = np.concatenate(vv); n = np.concatenate(nn); u = np.concatenate(uu); f = np.concatenate(ff)
        v, n, u, f = weld(v, n, u, f)
        benutzt = np.unique(f)
        remap = np.full(len(v), -1, np.int64)
        remap[benutzt] = np.arange(len(benutzt))
        return v[benutzt], n[benutzt], u[benutzt], remap[f]

    rad_tyre = rad_quadrant((18,))          # linker Reifen
    rad_metal = rad_quadrant((19, 20))      # Felge + Bremsscheibe
    if rad_tyre is None or rad_metal is None:
        raise SystemExit('kein Rad gefunden')
    # Das Rad ist hochpoly (viele Speichen, flacher Reifen); auf vertretbare Groesse vereinfachen.
    rad_tyre = vereinfachen(rad_tyre[0], rad_tyre[1], rad_tyre[2], rad_tyre[3], ZIEL_RAD_TYRE)
    rad_metal = vereinfachen(rad_metal[0], rad_metal[1], rad_metal[2], rad_metal[3], ZIEL_RAD_METAL)
    # Gemeinsame Normierung aus der Gesamtgroesse beider Teile.
    alle = np.concatenate([rad_tyre[0], rad_metal[0]])
    zentrum = (alle.min(0) + alle.max(0)) / 2.0
    groesse = alle.max(0) - alle.min(0)
    radius = groesse[2] / 2.0
    breite = groesse[0]

    def norm(teil):
        v, n, u, f = teil
        v = (v - zentrum) / np.array([breite, 2 * radius, 2 * radius])
        # Bei nicht-uniformer Skalierung drehen sich Normalen mit der Inversen-Transponierten
        # der Skalierung; hier speichern wir die Normale im Einheits-Radframe.
        n = n * np.array([breite, 2 * radius, 2 * radius])
        laenge = np.linalg.norm(n, axis=1, keepdims=True)
        n = n / np.maximum(laenge, 1e-8)
        return v, n, u, f

    rad_tyre = norm(rad_tyre)
    rad_metal = norm(rad_metal)
    textur_tyre = 'tyre.png'
    textur_metal = 'wheel_metal.png'
    if not dry:
        textur_farbe(textur_metal, WHEEL_METAL_FARBE, OUT)

    # ---- Karosserie: jedes Material einzeln vereinfachen, damit die Teile zusammenhängen ----
    # Vorab die Original-Dreieckszahl der Karosserie bestimmen, um die Reduktion zu waehlen.
    karo_faces = 0
    for mi, rolle_gruppe in ROLLEN.items():
        if mi in geo:
            karo_faces += len(geo[mi]['dreiecke'])
    faktor = min(1.0, ZIEL_DREIECKE / max(1, karo_faces))
    print('Karosserie-Dreiecke original: %d (Faktor %.3f)' % (karo_faces, faktor))

    teile = {'teile': [], 'eckenlist': [], 'normalenlist': [], 'uvlist': [], 'ecken': 0, 'indizes': []}
    liste = []           # Liste der Teile-Infos fuer den Report
    for mi, (rolle, gruppe) in sorted(ROLLEN.items()):
        if mi not in geo:
            continue
        d = geo[mi]
        ziel = max(30, int(round(len(d['dreiecke']) * faktor)))
        e, n, u, t = vereinfachen(d['ecken'], d['normalen'], d['uv'], d['dreiecke'], ziel)
        if mi in TEXTUREN:
            tex = TEXTUREN[mi]
        else:
            farbe = FARBEN.get(mi, (120, 120, 120))
            tex = 'solid_%d.png' % mi
            if not dry:
                textur_farbe(tex, farbe, OUT)
        anzahl = schreibe_teil(teile, 'porsche_%d' % mi, rolle, gruppe, tex, e, n, u, t)
        liste.append((mi, rolle, tex, len(d['dreiecke']), anzahl))

    # ---- Raeder als Teile (gruppe 'rad') anhaengen ------------------------------------------
    def rad_teil(name, teil, tex):
        v, n, u, f = teil
        if len(f) == 0:
            return 0
        basis = teile['ecken']
        teile['teile'].append({
            'name': name, 'rolle': 'rad', 'gruppe': 'rad', 'tex': tex,
            'ecke0': basis, 'ecken': len(v), 'index0': len(teile['indizes']), 'indizes': len(f) * 3,
        })
        teile['eckenlist'].append(v)
        teile['normalenlist'].append(n)
        teile['uvlist'].append(uv_norm(u))
        teile['indizes'].extend(f.reshape(-1).tolist())
        teile['ecken'] += len(v)
        return len(f)

    rad_tyre_n = rad_teil('rad_tyre', rad_tyre, textur_tyre)
    rad_metal_n = rad_teil('rad_metal', rad_metal, textur_metal)

    # ---- auto.bin schreiben ------------------------------------------------------------------
    ecken = np.concatenate(teile['eckenlist'])
    normalen = np.concatenate(teile['normalenlist'])
    uv = np.concatenate(teile['uvlist'])
    # Indizes als Uint32 (das Modell hat mehr als 65535 Ecken; die App liest den Typ aus meta).
    roh = np.zeros((len(ecken), 8), np.float32)
    roh[:, 0:3] = ecken
    roh[:, 3:6] = normalen
    roh[:, 6:8] = uv
    buf = roh.tobytes()
    pad = (-len(buf)) % 4
    buf += b'\0' * pad
    index_ab = len(buf)
    buf += np.asarray(teile['indizes'], dtype=np.uint32).tobytes()
    if not dry:
        open(os.path.join(OUT, 'auto.bin'), 'wb').write(buf)

    # ---- Texturen kopieren --------------------------------------------------------------------
    if not dry:
        for ziel_name, quelle in TEX_QUELLE.items():
            src = os.path.join(TEX_SRC, quelle)
            if os.path.exists(src):
                import shutil
                shutil.copyfile(src, os.path.join(OUT, ziel_name))

    # ---- Fahrzeugdaten ------------------------------------------------------------------------
    physik = {
        'masse': 1260.0, 'schwerpunktHoehe': 0.45, 'radstand': 2.516,
        'a': 1.225, 'b': 1.291, 'vorderachse': 1.225, 'hinterachse': -1.291,
        'laenge': 4.768, 'breite': 2.049, 'hoehe': 1.253, 'massenVerteilung': 0.6,
        'lenkGrad': 17.0, 'bremsVorn': 0.62, 'cx': 0.34, 'stirnflaeche': 2.0,
        'auftriebVorn': 0.0, 'auftriebHinten': 0.0,
        'fluegelVorn': 0.10, 'fluegelHinten': 0.45,
        'leerlauf': 1000.0, 'begrenzer': 9000.0,
        'reifen': {
            'vorn': {'radius': round(radius, 4), 'breite': round(breite, 4), 'spur': 1.704,
                     'bodenfreiheit': 0.08, 'mu': 1.2},
            'hinten': {'radius': 0.352, 'breite': 0.325, 'spur': 1.672,
                       'bodenfreiheit': 0.09, 'mu': 1.25},
        },
        'feder': {
            'vorn': {'k': 170000.0, 'druck': 15000.0, 'zug': 22000.0, 'weg': 0.1, 'stab': 75000.0},
            'hinten': {'k': 130000.0, 'druck': 10000.0, 'zug': 20000.0, 'weg': 0.1, 'stab': 25000.0},
        },
        'gefedert': 1150.0,
    }
    # Lichter: vorn aus den Frontleuchten, hinten aus den Rueckleuchten, Bremslicht hinten.
    lichter = {'brems': [], 'rueck': [], 'front': []}
    if 8 in geo:
        c = kanten_licht(geo, 8)
        lichter['front'] = [[0.55, c[1], c[2], 0.14], [-0.55, c[1], c[2], 0.14]]
    if 9 in geo:
        c = kanten_licht(geo, 9)
        lichter['rueck'] = [[0.55, c[1], c[2], 0.16], [-0.55, c[1], c[2], 0.16]]
        lichter['brems'] = [[0.55, c[1], c[2], 0.16], [-0.55, c[1], c[2], 0.16]]

    meta = {
        'name': 'Porsche 911 (992) GT3R', 'kennung': 'porsche',
        'quelle': 'Sketchfab (CC BY 4.0), 992 GT3R',
        'lizenz': 'CC BY 4.0 (kevin, sohyalebret); Modell vereinfacht mit tools/porsche_model.py',
        'koordinaten': 'm; +x links, +y oben, +z vorn',
        'ecken': len(ecken), 'indizes': len(teile['indizes']), 'indexAb': index_ab, 'schritt': 32,
        'indizesTyp': 32,
        'teile': teile['teile'], 'schatten': None, 'lichter': lichter, 'physik': physik,
    }
    if not dry:
        meta = python_wert(meta)
        json.dump(meta, open(os.path.join(OUT, 'auto.json'), 'w', encoding='utf-8', newline='\n'),
                  ensure_ascii=False, indent=1)
        open(os.path.join(OUT, 'LIZENZ.txt'), 'w', encoding='utf-8', newline='\n').write(
            'Porsche 911 (992) GT3R.\n\nModell und Texturen: Sketchfab, CC BY 4.0 (Autoren "kevin", '
            '"sohyalebret").\nQuelle: sketchfab.com (porsche-911-992-gt3r), heruntergeladen als FBX.\n'
            'Umgewandelt mit tools/porsche_model.py: Innenraum entfernt, vorderes linkes Rad '
            'herausgeloest und normiert, Ecken verschweisst, UVs erhalten, Texturen kopiert.\n'
            'https://creativecommons.org/licenses/by/4.0/\n')

    print('--- Teile ---')
    for (mi, rolle, tex, orig, neu) in liste:
        print('  mat %2d %-18s %-22s %6d -> %6d' % (mi, rolle, tex, orig, neu))
    print('  Rad-Reifen %6d Dreiecke, Rad-Metall %6d Dreiecke' % (rad_tyre_n, rad_metal_n))
    print('Gesamt: %d Ecken, %d Dreiecke, auto.bin %d KB, Radradius %.3f, Radbreite %.3f'
          % (len(ecken), len(teile['indizes']) // 3, len(buf) // 1024, radius, breite))


if __name__ == '__main__':
    main()
