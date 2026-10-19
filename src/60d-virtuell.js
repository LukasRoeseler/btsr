  // ============================== VIRTUELLE FAHRT (v1.1.3, WIP) ==============================
  //
  // BESTELLT: "Modus 'virtuell' neben 'auf Bahn' und 'frei': virtuelles Auto auf der Editor-Strecke
  // mit Verfolgerkamera, Rueckfall Balkonia, 3D-Auto nach der Physik, mit Motorsound, erst einmal
  // ohne NPCs, nur Zeitnahme." Und auf Nachfrage: "frei fahren" (nicht in der Spur gefuehrt).
  //
  // DER KNIFF: Das virtuelle Auto ist ein Garagenauto ohne Bluetooth. Es meldet dieselben Pakete wie
  // ein echtes (Byte 11 Teilezaehler, Byte 12 Teilecode, 0x00 neben der Bahn) ueber onCarNotify. Damit
  // laufen Rundenzeit, Sektoren, Rennen, Time Attack, Telemetrie und Motorsound ohne zweite
  // Zeitnahme. Gesendet wird an eine Attrappe (rx), die nichts tut.
  //
  // FAHREN: Tempo aus der Physik (physEngine, also das gewaehlte Fahrgefuehl), Richtung aus dem
  // uebertragenen Lenkwinkel (outputs.servoAngle) nach dem Einspurmodell mit Haftgrenze: bei hohem
  // Tempo dreht das Auto nicht enger, als die Reifen tragen. Neben der Bahn bremst der Teppich; wer
  // laenger als VF_ABSEITS_ZURUECK_MS daneben steht, wird zurueckgesetzt (wie von Hand).
  //
  // BILD: eigener, kleiner WebGL-Renderer (keine Bibliothek): Boden, Fahrbahn aus der Mittellinie des
  // Editors (trackCenterline/trackNormals), Randsteine wie im Editor (links blau-weiss, rechts
  // rot-weiss), Teilegrenzen, Start/Ziel, das Auto als Kasten in seiner Farbe, Verfolgerkamera.
  const VF_RAD_GRAD = 26;           // groesster Radeinschlag bei vollem Lenkbefehl
  const VF_ACHSE = 7.0;             // Radstand in Streckeneinheiten (~7,5 cm)
  const VF_MU = 1.0;                // Haftbeiwert auf trockener Bahn (mal gripScale fuer Regen)
  const VF_ABSEITS_BREMSE = 3.0;    // Tempoverlust neben der Bahn je Sekunde (exponentiell)
  const VF_ABSEITS_ZURUECK_MS = 2500;
  const VF_TAKT_MS = 45;            // Paketfolge wie ein echtes Auto
  const VF_AUTO = { L: 9.6, B: 4.4, H: 2.4 };
  const VF = { aktiv: false, car: null, vorherRolle: null, vorherSpieler: null, schicht: null, cv: null, hud: null,
               gl: null, prog: null, bahn: null, auto: null, pts: null, nrm: null, tiles: null, zu: false,
               x: 0, y: 0, h: 0, idx: 0, zaehler: 0, kachel: -2, abseits: false, abseitsSeit: 0, raf: 0, takt: 0,
               letzt: 0, kam: null, rundeAb: 0, letzte: null, beste: null, trackModeVorher: null };

  // v1.1.3 GEMELDET: "Ich kann das virtuelle Auto mit Pfeiltasten nicht steuern." Die Menuefuehrung
  // (50b-menu-nav.js) nahm die Pfeiltasten, sobald auf der Seite bedienbare Zeilen lagen, und das Pad
  // fuhr im Menue-Zustand nicht. Waehrend der virtuellen Fahrt fahren Pfeiltasten und Pad IMMER:
  // menuNavActive() und konsoleMenue() fragen das hier ab. Als Funktionsdeklaration und mit try, weil
  // sie schon gerufen werden kann, bevor VF angelegt ist.
  function vfAktiv() { try { return !!VF.aktiv; } catch (e) { return false; } }
  function vfTilesWaehlen() {
    if (currentTrackTiles && currentTrackTiles.length >= 3) return currentTrackTiles;
    const b = (typeof CH_DAUER !== 'undefined') ? CH_DAUER.find((d) => d.id === 'dauer-balkonia') : null;
    const p = b ? codeToTrack(b.code) : null;
    if (p && p.tiles && p.tiles.length >= 3) {
      currentTrackTiles = p.tiles;
      if (typeof refreshTrackPreview === 'function') refreshTrackPreview();
      showHudToast(t('Keine Strecke im Editor - es geht auf Balkonia'));
      return p.tiles;
    }
    return null;
  }
  // Kartentyp -> gemeldeter Code (auf der Schiene).
  function vfCode(typ) {
    if (typ === TILE_TYPE.START) return START_CODE_RAIL;
    if (typ === TILE_TYPE.PIT) return 0x07;
    if (typ === TILE_TYPE.ENGE) return 0x0a;
    return typ & 0xff;
  }

  // ---- WebGL ------------------------------------------------------------------------------
  function vfShader(gl, typ, quelle) {
    const s = gl.createShader(typ);
    gl.shaderSource(s, quelle); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function vfProgramm(gl) {
    const p = gl.createProgram();
    gl.attachShader(p, vfShader(gl, gl.VERTEX_SHADER,
      'attribute vec3 p; attribute vec3 c; uniform mat4 m; uniform mat4 w; varying vec3 vc; varying float vd;'
      + 'void main(){ vec4 q = w * vec4(p, 1.0); gl_Position = m * q; vc = c; vd = gl_Position.w; }'));
    gl.attachShader(p, vfShader(gl, gl.FRAGMENT_SHADER,
      'precision mediump float; varying vec3 vc; varying float vd; uniform vec3 nebel;'
      + 'void main(){ float f = clamp((vd - 250.0) / 900.0, 0.0, 1.0); gl_FragColor = vec4(mix(vc, nebel, f), 1.0); }'));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  function vfPuffer(gl, daten) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(daten), gl.STATIC_DRAW);
    return { b, n: daten.length / 6 };
  }
  function vfHex(hex) {
    const h = String(hex || '#888888').replace('#', '');
    const v = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
    return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
  }
  // Ein Viereck (zwei Dreiecke) in der Ebene y.
  function vfQuad(a, p1, p2, p3, p4, y, f) {
    [p1, p2, p3, p1, p3, p4].forEach((p) => a.push(p[0], y, p[1], f[0], f[1], f[2]));
  }
  // Die Fahrbahn aus der Mittellinie. Koordinaten: x = Karten-x, z = Karten-y, y nach oben.
  function vfBahnBauen(gl, pts, nrm, tiles) {
    const a = [];
    const half = TRACK_HALF_W, rand = TRACK_HALF_W * 2 * 0.095;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pts.forEach((p) => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
    const m = 600;
    vfQuad(a, [minX - m, minY - m], [maxX + m, minY - m], [maxX + m, maxY + m], [minX - m, maxY + m], -0.05, [0.17, 0.19, 0.22]);
    const off = (i, d) => [pts[i].x + nrm[i].x * d, pts[i].y + nrm[i].y * d];
    for (let i = 0; i < pts.length - 1; i++) {
      vfQuad(a, off(i, half), off(i + 1, half), off(i + 1, -half), off(i, -half), 0, [0.07, 0.08, 0.10]);
      const weiss = Math.floor(i / 2) % 2 === 0;
      vfQuad(a, off(i, half + rand), off(i + 1, half + rand), off(i + 1, half), off(i, half), 0.02, weiss ? [0.93, 0.94, 0.96] : [0.10, 0.45, 0.95]);
      vfQuad(a, off(i, -half), off(i + 1, -half), off(i + 1, -half - rand), off(i, -half - rand), 0.02, weiss ? [0.93, 0.94, 0.96] : [0.88, 0.12, 0.14]);
      // Teilegrenze: duenner weisser Strich quer ueber die Bahn
      if (pts[i + 1].tile !== pts[i].tile) {
        const t0 = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y) || 1;
        const tx = (pts[i + 1].x - pts[i].x) / t0 * 0.35, ty = (pts[i + 1].y - pts[i].y) / t0 * 0.35;
        const p = off(i + 1, half), q = off(i + 1, -half);
        const istStart = tiles[pts[i + 1].tile] && tiles[pts[i + 1].tile].type === TILE_TYPE.START;
        const w = istStart ? 6 : 1;
        vfQuad(a, [p[0] - tx * w, p[1] - ty * w], [p[0] + tx * w, p[1] + ty * w], [q[0] + tx * w, q[1] + ty * w], [q[0] - tx * w, q[1] - ty * w], 0.03,
          istStart ? [0.95, 0.95, 0.95] : [0.55, 0.57, 0.62]);
      }
    }
    return vfPuffer(gl, a);
  }
  // Das Auto: Unterbau, Kabine, vier Raeder, um den Ursprung, vorn = +z.
  function vfAutoBauen(gl, farbe) {
    const a = [];
    const box = (x0, x1, y0, y1, z0, z1, f) => {
      const s = (k) => [f[0] * k, f[1] * k, f[2] * k];
      const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
      const fl = [[4, 5, 6, 7, 1.0], [1, 0, 3, 2, 0.55], [0, 4, 7, 3, 0.75], [5, 1, 2, 6, 0.75], [3, 7, 6, 2, 1.15], [0, 1, 5, 4, 0.4]];
      fl.forEach(([p, q, r, u, k]) => [p, q, r, p, r, u].forEach((i) => a.push(v[i][0], v[i][1], v[i][2], ...s(k))));
    };
    const L = VF_AUTO.L, B = VF_AUTO.B, H = VF_AUTO.H;
    box(-B / 2, B / 2, 0.6, H * 0.75, -L / 2, L / 2, farbe);
    box(-B * 0.36, B * 0.36, H * 0.75, H * 1.25, -L * 0.22, L * 0.15, [0.10, 0.12, 0.16]);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) =>
      box(sx * B / 2 - 0.5, sx * B / 2 + 0.5, 0, 1.6, sz * L * 0.32 - 1.0, sz * L * 0.32 + 1.0, [0.05, 0.05, 0.06]));
    return vfPuffer(gl, a);
  }
  // Matrizen (spaltenweise, wie WebGL sie will).
  function vfPerspektive(fovy, asp, n, f) {
    const t = 1 / Math.tan(fovy / 2);
    return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0];
  }
  function vfBlick(e, z, u) {
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const kreuz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const f = norm(sub(z, e)), s = norm(kreuz(f, u)), v = kreuz(s, f);
    return [s[0], v[0], -f[0], 0, s[1], v[1], -f[1], 0, s[2], v[2], -f[2], 0,
            -(s[0] * e[0] + s[1] * e[1] + s[2] * e[2]), -(v[0] * e[0] + v[1] * e[1] + v[2] * e[2]), f[0] * e[0] + f[1] * e[1] + f[2] * e[2], 1];
  }
  function vfMal(a, b) {
    const o = new Array(16).fill(0);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
    return o;
  }
  // Weltlage des Autos: Drehung um y, sodass lokal +z in Fahrtrichtung (sin h, -cos h) zeigt.
  function vfLage(x, y, h) {
    const th = Math.PI - h * Math.PI / 180, c = Math.cos(th), s = Math.sin(th);
    return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, x, 0, y, 1];
  }
  const VF_EINS = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

  // ---- Fahren (rein, fuer den Selbsttest ohne Bild) -------------------------------------------
  // Ein Schritt: Tempo (Anzeige-km/h), Lenkbefehl (-1..1), dt (s). Liefert die neue Lage.
  function vfSchritt(lage, kmh, lenk, dt, grip) {
    const v = Math.abs(kmh) / REAL_SCALE / 3.6 * 100 * TRACK_UNITS_PER_CM * Math.sign(kmh || 1);   // Einheiten/s
    const delta = Math.max(-1, Math.min(1, lenk)) * VF_RAD_GRAD * Math.PI / 180;
    let w = Math.abs(v) > 1e-6 ? v * Math.tan(delta) / VF_ACHSE : 0;               // rad/s (Einspurmodell)
    const aMax = VF_MU * (grip === undefined ? 1 : grip) * 9.81 * 100 * TRACK_UNITS_PER_CM;   // Einheiten/s^2
    const wMax = Math.abs(v) > 1 ? aMax / Math.abs(v) : Infinity;                 // Haftgrenze
    w = Math.max(-wMax, Math.min(wMax, w));
    const h = lage.h + w * dt * 180 / Math.PI;
    const r = h * Math.PI / 180;
    return { x: lage.x + Math.sin(r) * v * dt, y: lage.y - Math.cos(r) * v * dt, h, w };
  }
  // Naechster Mittellinienpunkt in einem Fenster um den letzten (die Strecke kann sich kreuzen).
  function vfOrt(pts, nrm, x, y, idx) {
    const n = pts.length;
    let best = idx, bd = Infinity;
    for (let k = -12; k <= 40; k++) {
      const i = ((idx + k) % n + n) % n;
      const d = (pts[i].x - x) * (pts[i].x - x) + (pts[i].y - y) * (pts[i].y - y);
      if (d < bd) { bd = d; best = i; }
    }
    const quer = (x - pts[best].x) * nrm[best].x + (y - pts[best].y) * nrm[best].y;
    return { idx: best, quer, abstand: Math.sqrt(bd) };
  }

  // ---- Takt: Pakete wie ein echtes Auto --------------------------------------------------------
  function vfPaket() {
    if (!VF.aktiv || !VF.car) return;
    const tile = Math.max(0, VF.pts[VF.idx].tile);
    if (tile !== VF.kachel) {
      if (VF.kachel !== -2) VF.zaehler = (VF.zaehler + 1) & 0xff;
      const vorher = VF.kachel;
      VF.kachel = tile;
      // Eigene Rundenanzeige fuer die Kopfzeile (die Zeitnahme selbst laeuft in der App).
      if (vorher !== -2 && VF.tiles[tile] && VF.tiles[tile].type === TILE_TYPE.START && !VF.abseits) {
        const jetzt = Date.now();
        if (VF.rundeAb) {
          VF.letzte = jetzt - VF.rundeAb;
          if (VF.beste === null || VF.letzte < VF.beste) VF.beste = VF.letzte;
        }
        VF.rundeAb = jetzt;
      }
    }
    const b = new Uint8Array(19);
    b[0] = 0xaf; b[2] = 0x9c; b[10] = 100;
    b[11] = VF.zaehler;
    b[12] = VF.abseits ? TILE_OFFTRACK : vfCode(VF.tiles[tile] ? VF.tiles[tile].type : TILE_TYPE.STRAIGHT);
    b[15] = VF.abseits ? 0 : 0x08;
    try { onCarNotify(VF.car, { target: { value: new DataView(b.buffer) } }); } catch (e) { /* weiter */ }
  }

  function vfBild(now) {
    if (!VF.aktiv) return;
    VF.raf = requestAnimationFrame(vfBild);
    const dt = VF.letzt ? Math.min(0.05, (now - VF.letzt) / 1000) : 0.016;
    VF.letzt = now;
    const st = physEngine.state;
    const lenk = physEngine.outputs ? physEngine.outputs.servoAngle || 0 : 0;
    const neu = vfSchritt(VF, st.speedKmh || 0, lenk, dt, physEngine.config.gripScale);
    VF.x = neu.x; VF.y = neu.y; VF.h = neu.h;
    const o = vfOrt(VF.pts, VF.nrm, VF.x, VF.y, VF.idx);
    VF.idx = o.idx;
    const ab = Math.abs(o.quer) > TRACK_HALF_W * 1.19 + VF_AUTO.B * 0.3;
    if (ab && !VF.abseits) VF.abseitsSeit = Date.now();
    VF.abseits = ab;
    if (ab) {
      st.speedKmh *= Math.exp(-VF_ABSEITS_BREMSE * dt);
      if (Date.now() - VF.abseitsSeit > VF_ABSEITS_ZURUECK_MS) vfZuruecksetzen();
    }
    vfMalen();
    vfHud();
  }
  function vfZuruecksetzen() {
    const p = VF.pts[VF.idx];
    VF.x = p.x; VF.y = p.y; VF.h = p.heading;
    physEngine.state.speedKmh = 0;
    VF.abseits = false;
    showHudToast(t('Zurück auf die Bahn gesetzt'));
  }
  function vfMalen() {
    const gl = VF.gl, cv = VF.cv;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.55, 0.66, 0.78, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const r = VF.h * Math.PI / 180, fx = Math.sin(r), fz = -Math.cos(r);
    const auge = [VF.x - fx * 30, 13, VF.y - fz * 30];
    VF.kam = VF.kam ? VF.kam.map((k, i) => k + (auge[i] - k) * 0.18) : auge;
    const ziel = [VF.x + fx * 14, 1.5, VF.y + fz * 14];
    const pv = vfMal(vfPerspektive(62 * Math.PI / 180, w / Math.max(1, h), 0.5, 3000), vfBlick(VF.kam, ziel, [0, 1, 0]));
    gl.useProgram(VF.prog);
    gl.uniformMatrix4fv(gl.getUniformLocation(VF.prog, 'm'), false, new Float32Array(pv));
    gl.uniform3f(gl.getUniformLocation(VF.prog, 'nebel'), 0.55, 0.66, 0.78);
    const zeichne = (pu, welt) => {
      gl.uniformMatrix4fv(gl.getUniformLocation(VF.prog, 'w'), false, new Float32Array(welt));
      gl.bindBuffer(gl.ARRAY_BUFFER, pu.b);
      const ap = gl.getAttribLocation(VF.prog, 'p'), ac = gl.getAttribLocation(VF.prog, 'c');
      gl.enableVertexAttribArray(ap); gl.enableVertexAttribArray(ac);
      gl.vertexAttribPointer(ap, 3, gl.FLOAT, false, 24, 0);
      gl.vertexAttribPointer(ac, 3, gl.FLOAT, false, 24, 12);
      gl.drawArrays(gl.TRIANGLES, 0, pu.n);
    };
    zeichne(VF.bahn, VF_EINS);
    zeichne(VF.auto, vfLage(VF.x, VF.y, VF.h));
  }
  function vfZeit(ms) { return ms === null || ms === undefined ? '–' : (ms / 1000).toFixed(2) + ' s'; }
  function vfHud() {
    const el = VF.hud;
    if (!el) return;
    const kmh = Math.round(Math.abs(physEngine.state.speedKmh || 0));
    const lauf = VF.rundeAb ? Date.now() - VF.rundeAb : null;
    el.querySelector('.vf-tempo').textContent = kmh + ' km/h';
    el.querySelector('.vf-runde').textContent = t('Runde') + ' ' + vfZeit(lauf);
    el.querySelector('.vf-zeiten').textContent = t('Letzte') + ' ' + vfZeit(VF.letzte) + ' · ' + t('Beste') + ' ' + vfZeit(VF.beste);
    el.querySelector('.vf-abseits').hidden = !VF.abseits;
  }

  // ---- Starten und Beenden ------------------------------------------------------------------
  function virtuellStarten() {
    if (VF.aktiv) return;
    if (!physicsEnabled) { showHudToast(t('Virtuell braucht ein Fahrgefühl mit Physik (nicht RC)')); return; }
    const tiles = vfTilesWaehlen();
    if (!tiles) { showHudToast(t('Erst eine Strecke bauen')); return; }
    const schicht = document.createElement('div');
    schicht.className = 'vf-schicht';
    schicht.innerHTML = '<canvas class="vf-bild"></canvas><div class="vf-hud" data-i18n-skip>'
      + '<b class="vf-tempo"></b><span class="vf-runde"></span><span class="vf-zeiten"></span>'
      + '<span class="vf-abseits" hidden>' + t('Neben der Bahn') + '</span></div>'
      + '<div class="vf-knoepfe"><button type="button" data-vf="reset">' + t('Zurücksetzen') + '</button>'
      + '<button type="button" data-vf="zu" aria-label="' + t('Beenden') + '">&#10005;</button></div>'
      + '<span class="vf-wip">' + t('Virtuell') + ' <span class="wip-tag">WIP</span></span>';
    document.body.appendChild(schicht);
    const cv = schicht.querySelector('canvas');
    const gl = cv.getContext('webgl', { antialias: true }) || cv.getContext('experimental-webgl');
    if (!gl) { schicht.remove(); showHudToast(t('Dieses Gerät kann kein WebGL')); return; }
    try {
      VF.prog = vfProgramm(gl);
    } catch (e) { schicht.remove(); showHudToast('WebGL: ' + e.message); return; }
    gl.enable(gl.DEPTH_TEST);
    VF.gl = gl; VF.cv = cv; VF.schicht = schicht; VF.hud = schicht.querySelector('.vf-hud');
    VF.tiles = tiles;
    VF.pts = trackCenterline(tiles);
    VF.nrm = trackNormals(VF.pts);
    VF.bahn = vfBahnBauen(gl, VF.pts, VF.nrm, tiles);
    // Das Auto: ein Garagenauto ohne Funk. Ein gesteuertes Auto gibt seine Rolle so lange ab.
    VF.vorherSpieler = playerCar;
    VF.vorherRolle = playerCar ? playerCar.role : null;
    VF.trackModeVorher = trackMode;
    trackMode = 'on';
    const rx = { properties: { writeWithoutResponse: true }, writeValueWithoutResponse: async () => {}, writeValueWithResponse: async () => {} };
    const car = { device: { id: 'virtuell', name: 'Virtuell' }, server: null, rx, tx: null, role: 'none', writeInFlight: false,
                  blinking: false, tileCode: 0xff, tileCount: null, lastCodeAt: 0, yaw: 0, ghost: null, timer: null,
                  trennend: false, virtuell: true, alias: t('Virtuell') };
    garage.push(car);
    carAssign(car);
    if (playerCar) setCarRole(playerCar, 'none');
    setCarRole(car, 'player');
    VF.car = car;
    VF.auto = vfAutoBauen(gl, vfHex(carColor(car).hex));
    // Start eine halbe Kachel vor Start/Ziel, in Fahrtrichtung.
    const s = Math.max(0, VF.pts.findIndex((p) => p.tile >= 0 && tiles[p.tile] && tiles[p.tile].type === TILE_TYPE.START));
    const start = ((s - Math.round(TRACK_SAMPLES_PER_TILE / 2)) % VF.pts.length + VF.pts.length) % VF.pts.length;
    Object.assign(VF, { x: VF.pts[start].x, y: VF.pts[start].y, h: VF.pts[start].heading, idx: start, zaehler: 0, kachel: -2,
                        abseits: false, letzt: 0, kam: null, rundeAb: 0, letzte: null, beste: null, aktiv: true });
    physEngine.state.speedKmh = 0;
    schicht.addEventListener('click', (e) => {
      const b = e.target.closest('[data-vf]');
      if (!b) return;
      if (b.dataset.vf === 'zu') virtuellBeenden();
      else if (b.dataset.vf === 'reset') vfZuruecksetzen();
    });
    if (typeof showTab === 'function') showTab('race');
    VF.takt = setInterval(vfPaket, VF_TAKT_MS);
    VF.raf = requestAnimationFrame(vfBild);
    showHudToast(t('Virtuelle Fahrt: frei fahren, ✕ beendet'));
  }
  function virtuellBeenden() {
    if (!VF.aktiv) return;
    VF.aktiv = false;
    cancelAnimationFrame(VF.raf);
    clearInterval(VF.takt);
    const car = VF.car;
    VF.car = null;
    if (car) removeCar(car);
    if (VF.vorherSpieler && garage.indexOf(VF.vorherSpieler) >= 0 && VF.vorherRolle) setCarRole(VF.vorherSpieler, VF.vorherRolle);
    trackMode = VF.trackModeVorher || trackMode;
    if (VF.schicht) VF.schicht.remove();
    VF.schicht = null; VF.gl = null;
    renderGarage();
  }
  window.addEventListener('keydown', (e) => { if (VF.aktiv && e.key === 'Escape') { e.stopImmediatePropagation(); virtuellBeenden(); } }, true);
