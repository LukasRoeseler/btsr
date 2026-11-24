  // ==================================================================================================
  // MARKER-AR (v1.6.67, WIP, Prototyp) - AR ohne ARCore
  // ==================================================================================================
  // BESTELLT: "Meine Android-Version ist nicht kompatibel mit AR. Kannst du es fuer die .apk mit sceneview oder einer
  // anderen Open-Source-Software bauen?" (Samsung Galaxy A16/A41: kein ARCore - SceneView baut auf ARCore und faellt
  // damit aus.) Statt der Bodenerkennung von ARCore erkennt die App einen ausgedruckten ArUco-Marker im Kamerabild
  // (js-aruco2, lib/js-aruco2, MIT/BSD/LGPL-3, siehe LICENSE.txt dort) und berechnet daraus je Bild Lage und Neigung der
  // Kamera (POSIT). Die Strecke liegt mittig auf dem Marker; man kann um sie herumgehen, solange der Marker im Bild ist.
  // Laeuft in der App (Android-WebView, getUserMedia wie die Onboard-Kamera) und im Browser, ohne neue APK.
  //
  // Aufbau: <video> mit der Rueckkamera als Hintergrund der Schicht, darueber die durchsichtige Leinwand der virtuellen
  // Fahrt. Je Bild: Ausschnitt des Videos verkleinert (VF_MK.erkennBreite) erkennen, Pose glaetten, Projektion aus
  // dem Bildwinkel der Kamera (VF_MK.bildwinkel) passend zum angezeigten Ausschnitt (object-fit: cover), Szene zeichnen
  // (vfSzeneMalen). Marker: ar-marker-a4.svg (ARUCO_MIP_36h12 Nummer 0, schwarzes Quadrat 160 mm).
  // v1.6.71 GEMELDET: "Es funktioniert nicht. Ganz selten ploppt die Strecke als weisse Textur auf, aber ohne Auto. Sie
  // reagiert dann zu langsam, zu zuckend, und meistens wird der Marker nicht erkannt." Geaendert:
  //   - Erkennung in einem Web Worker (vfMkWorker) mit 720 statt 480 Pixeln Breite - das Bild wartet nicht mehr darauf;
  //   - das Kamerabild ist eine Textur im 3D-Bild (vfMkHintergrund), die Leinwand undurchsichtig - vorher war sie
  //     durchsichtig, und jede Flaeche mit Alpha unter 1 wurde ueber dem Video weisslich;
  //   - der Marker ist Start/Ziel (vorher die Mitte der Strecke - das Auto stand oft ausserhalb des Bildes);
  //   - von den zwei Loesungen der Lage (Kippmehrdeutigkeit bei ebenen Markern) die, die zur vorigen passt; Glaettung
  //     je nach Bewegung (ruhig: stark, schnell: schwach), Aussetzer bis 1,5 s ueberbrueckt.
  // v1.6.73 GEMELDET: "Die Strecke poppt immer noch nur ganz selten auf und ist dann eine weisse Textur. Ich sehe kein
  // Auto." Verdacht: Falscherkennungen - die Bibliothek nimmt beim Woerterbuch ARUCO_MIP_36h12 bis zu 11 falsche von 36
  // Bits hin, zufaellige Kanten im Bild galten dann als Marker 0 mit unsinniger Lage (Kamera mitten in der Strecke: weisse
  // Randsteine und Linien ganz nah, kein Auto). Jetzt hoechstens 2 falsche Bits (hamming), unplausible Lagen verworfen
  // (Marker hinter der Kamera, von hinten/kantig, naeher als 5 cm oder weiter als 8 m), Erkennung abwechselnd mit 640
  // und 400 Pixeln Breite (breiten), und eine Diagnosezeile im Bild mit gruenen Punkten an den erkannten Ecken.
  const VF_MK = { id: 0, mm: 160, bildwinkel: 63, breiten: [640, 400], hamming: 3, verlorenMs: 1500 };
  const VF_MK_MASSSTAB_STORE = 'omegasim-vf-ar-massstab';
  const VF_MK_MASSSTAEBE = [1, 0.5, 0.25];
  function vfMkMassstab() { try { const v = +localStorage.getItem(VF_MK_MASSSTAB_STORE); return VF_MK_MASSSTAEBE.indexOf(v) >= 0 ? v : 0.5; } catch (e) { return 0.5; } }
  let vfMkLibs = null;
  function vfMkLibsLaden() {
    if (vfMkLibs) return vfMkLibs;
    const lade = (f) => new Promise((ok, nein) => {
      const s = document.createElement('script');
      s.src = 'lib/js-aruco2/' + f; s.async = false;
      s.onload = ok; s.onerror = () => nein(new Error(f + ' nicht geladen'));
      document.head.appendChild(s);
    });
    vfMkLibs = lade('cv.js').then(() => lade('aruco.js')).then(() => lade('svd.js')).then(() => lade('posit1.js')).then(() => {
      if (!(window.AR && window.AR.Detector && window.POS && window.POS.Posit)) throw new Error('js-aruco2 unvollstaendig');
    });
    vfMkLibs.catch(() => { vfMkLibs = null; });
    return vfMkLibs;
  }

  let vfMkLaeuft = false;
  async function vfMarkerStarten() {
    if (VF.aktiv || vfMkLaeuft) return;
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
      vfArMeldung(t('AR konnte nicht starten'), t('Dieses Gerät gibt kein Kamerabild an die Seite.'));
      return;
    }
    vfMkLaeuft = true;
    vfArKnopf(t('AR startet …'));
    let stream = null;
    try {
      await vfMkLibsLaden();
      stream = await navigator.mediaDevices.getUserMedia({ audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
    } catch (e) {
      vfMkLaeuft = false; vfArKnopf('');
      if (stream) stream.getTracks().forEach((tr) => tr.stop());
      vfArMeldung(t('AR konnte nicht starten'), ((e && e.name) ? e.name + ': ' : '') + ((e && e.message) || String(e)) + '\n\n'
        + t('Die Kamera muss für OmegaSim erlaubt sein (Android-Einstellungen > Apps > OmegaSim bzw. Chrome > Berechtigungen > Kamera).'));
      return;
    }
    const video = document.createElement('video');
    video.className = 'vf-mk-video';
    video.playsInline = true; video.muted = true; video.autoplay = true;
    video.setAttribute('playsinline', '');
    video.srcObject = stream;
    const mk = { video, stream, det: null, posit: null, cnv: document.createElement('canvas'),
                 pose: null, zuletzt: 0, gesehen: 0, bilder: 0, worker: null, wartet: false, n: 0 };
    vfMkWorkerStarten(mk);
    mk.ctx = mk.cnv.getContext('2d', { willReadFrequently: true });
    let ok = false;
    try { ok = virtuellStarten({ marker: mk }); } catch (e) { log('Marker-AR: ' + e.message, 'warn'); }
    vfArKnopf('');
    vfMkLaeuft = false;
    if (!ok) { stream.getTracks().forEach((tr) => tr.stop()); return; }
    if (VF.schicht) VF.schicht.insertBefore(video, VF.schicht.firstChild);
    video.play().catch(() => { /* autoplay: muted, sollte gehen */ });
    vfMkOberflaeche();
  }
  // Hinweis, Massstab und "Marker drucken" in der Schicht.
  function vfMkOberflaeche() {
    const sch = VF.schicht;
    if (!sch || !VF.marker) return;
    let h = sch.querySelector('.vf-ar-hinweis');
    if (!h) { h = document.createElement('div'); h.className = 'vf-ar-hinweis'; sch.appendChild(h); }
    h.textContent = t('Kamera auf den ausgedruckten Marker richten (ar-marker-a4.svg, in Originalgröße drucken). Der Marker ist Start/Ziel, die Strecke geht nach oben auf dem Blatt los.');
    let leiste = sch.querySelector('.vf-mk-leiste');
    if (!leiste) {
      leiste = document.createElement('div'); leiste.className = 'vf-mk-leiste';
      const ms = document.createElement('button'); ms.type = 'button'; ms.className = 'vf-mk-massstab';
      const msText = () => { ms.textContent = t('Maßstab') + ' 1:' + Math.round(1 / vfMkMassstab()); };
      ms.onclick = (e) => {
        e.stopPropagation();
        const i = VF_MK_MASSSTAEBE.indexOf(vfMkMassstab());
        try { localStorage.setItem(VF_MK_MASSSTAB_STORE, String(VF_MK_MASSSTAEBE[(i + 1) % VF_MK_MASSSTAEBE.length])); } catch (err) { /* egal */ }
        msText();
      };
      msText();
      const dr = document.createElement('a'); dr.className = 'vf-mk-drucken'; dr.href = 'ar-marker-a4.svg'; dr.target = '_blank'; dr.rel = 'noopener';
      dr.textContent = t('Marker drucken');
      leiste.appendChild(ms); leiste.appendChild(dr);
      sch.appendChild(leiste);
    }
  }
  function vfMkAufraeumen(mk) {
    if (!mk) return;
    try { if (mk.worker) mk.worker.terminate(); } catch (e) { /* egal */ }
    try { mk.stream.getTracks().forEach((tr) => tr.stop()); } catch (e) { /* egal */ }
    try { mk.video.remove(); } catch (e) { /* egal */ }
  }

  // Projektion fuer den angezeigten Ausschnitt des Videos (object-fit: cover) und die Brennweite in Pixeln des Videos.
  function vfMkProjektion(mk, W, H, nah, fern) {
    const vw = mk.video.videoWidth || 1280, vh = mk.video.videoHeight || 720;
    const fV = (vw / 2) / Math.tan(VF_MK.bildwinkel * Math.PI / 360);
    const s = Math.max(W / vw, H / vh), f = fV * s;
    return [2 * f / W, 0, 0, 0, 0, 2 * f / H, 0, 0, 0, 0, (fern + nah) / (nah - fern), -1, 0, 0, 2 * fern * nah / (nah - fern), 0];
  }
  // Erkennung im Web Worker: die Bibliothek per importScripts, je Auftrag ein Bild (RGBA, uebertragen, nicht kopiert),
  // Antwort beide Loesungen der Lage. Ohne Worker (alte WebView) im Hauptthread wie in 1.6.68.
  function vfMkWorkerStarten(mk) {
    try {
      const u = (f) => new URL('lib/js-aruco2/' + f, location.href).href;
      const code = 'importScripts(' + ['cv.js', 'aruco.js', 'svd.js', 'posit1.js'].map((f) => JSON.stringify(u(f))).join(',') + ');\n'
        + 'var det = new AR.Detector({ dictionaryName: "ARUCO_MIP_36h12", maxHammingDistance: ' + VF_MK.hamming + ' }), pos = null, pf = 0;\n'
        + 'onmessage = function (e) { var d = e.data, r = { n: d.n, ok: false, buf: d.buf, w: d.w, h: d.h }, t0 = Date.now();\n'
        + '  try { if (!pos || pf !== d.f) { pos = new POS.Posit(d.mm, d.f); pf = d.f; }\n'
        + '    var ms = det.detect({ width: d.w, height: d.h, data: new Uint8ClampedArray(d.buf) }) || [], m = null;\n'
        + '    for (var i = 0; i < ms.length; i++) if (ms[i].id === d.id) m = ms[i];\n'
        + '    r.kand = ms.length; r.ms = Date.now() - t0;\n'
        + '    if (m) { r.ecken = m.corners.map(function (c) { return [c.x / d.w, c.y / d.h]; }); var ec = m.corners.map(function (c) { return { x: c.x - d.w / 2, y: d.h / 2 - c.y }; }); var p = pos.pose(ec);\n'
        + '      r.ok = true; r.r1 = p.bestRotation; r.t1 = p.bestTranslation; r.e1 = p.bestError; r.r2 = p.alternativeRotation; r.t2 = p.alternativeTranslation; r.e2 = p.alternativeError; }\n'
        + '  } catch (err) { r.fehler = String(err); }\n'
        + '  postMessage(r, [r.buf]); };\n';
      const w = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
      w.onmessage = (e) => { mk.wartet = false; vfMkAntwort(mk, e.data); };
      w.onerror = (e) => { log('Marker-AR: Worker ' + (e.message || 'Fehler') + ' - Erkennung im Hauptthread', 'warn'); try { w.terminate(); } catch (err) { /* egal */ } mk.worker = null; mk.wartet = false; };
      mk.worker = w;
    } catch (e) { mk.worker = null; }
  }
  // POSIT -> GL (Kamera <- Marker, mm): POSIT x rechts, y oben, z nach vorn; GL z zum Betrachter -> F = diag(1, 1, -1) links.
  // v1.6.73: die dritte Achse aus dem Kreuzprodukt. POSIT liefert sie mit wechselndem Vorzeichen (mal Drehung, mal
  // Spiegelung, Determinante -1) - gespiegelt war die Welt "von innen" gezeichnet: Auto kaum sichtbar (Rueckseiten
  // weggeschnitten), Licht verkehrt (zu hell), und der Wechsel zwischen beiden liess die Strecke zittern.
  function vfMkGl(R, T) {
    const x = [R[0][0], R[1][0], -R[2][0]], y = [R[0][1], R[1][1], -R[2][1]];
    const z = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
    return [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, T[0], T[1], -T[2], 1];
  }
  function vfMkAntwort(mk, r) {
    const S = mk.stat || (mk.stat = { gesendet: 0, erkannt: 0, verworfen: 0, ms: 0, dist: 0, w: 0, h: 0, kand: 0 });
    if (r) { if (r.ms !== undefined) S.ms = r.ms; if (r.w) { S.w = r.w; S.h = r.h; } if (r.kand !== undefined) S.kand = r.kand; }
    if (!r || !r.ok || !r.r1 || !r.t1) { if (r && r.fehler && !mk.fehler) { mk.fehler = r.fehler; log('Marker-AR: ' + r.fehler, 'warn'); } return; }
    const jetzt = performance.now();
    let M = vfMkGl(r.r1, r.t1);
    // Plausibel? Vor der Kamera (GL z negativ), 5 cm bis 8 m, Papier zur Kamera gewandt (Normale mit +z-Anteil).
    const plausibel = (Q) => Q[14] < -50 && Q[14] > -8000 && Q[10] > 0.08;
    if (!plausibel(M) && r.r2 && r.t2) { const M2 = vfMkGl(r.r2, r.t2); if (plausibel(M2)) M = M2; }
    if (!plausibel(M)) { S.verworfen++; S.zuletztVerworfen = [M[10], M[14]].map((x) => Math.round(x * 1000) / 1000); return; }
    S.erkannt++; S.dist = Math.round(-M[14]);
    mk.ecken = r.ecken || null; mk.eckenAt = jetzt;
    // Kippmehrdeutigkeit: passt die zweite Loesung besser zur vorigen Lage (Normale), und ist ihr Fehler nicht viel
    // groesser, die zweite nehmen - sonst springt die Strecke zwischen zwei Neigungen.
    const vor = mk.pose && jetzt - mk.zuletzt < VF_MK.verlorenMs ? mk.pose : null;
    if (vor && r.r2 && r.t2 && isFinite(r.e2) && r.e2 >= 0 && r.e2 < Math.max(3, (r.e1 || 0) * 3)) {
      const M2 = vfMkGl(r.r2, r.t2);
      const d1 = M[8] * vor[8] + M[9] * vor[9] + M[10] * vor[10], d2 = M2[8] * vor[8] + M2[9] * vor[9] + M2[10] * vor[10];
      if (d2 > d1 + 0.05) M = M2;
    }
    // Glaettung je nach Bewegung: kleine Aenderung stark glaetten (Zittern), grosse fast sofort uebernehmen.
    if (vor) {
      const dt = Math.hypot(M[12] - vor[12], M[13] - vor[13], M[14] - vor[14]);
      const dr = 1 - (M[8] * vor[8] + M[9] * vor[9] + M[10] * vor[10]);
      const a = Math.max(0.15, Math.min(1, 0.15 + dt / 60 + dr * 15));   // v1.6.73: ruhiger (vorher 0,25 + dt/40)
      for (let i = 0; i < 16; i++) mk.pose[i] += (M[i] - mk.pose[i]) * a;
      vfMkOrtho(mk.pose);
    } else mk.pose = M;
    mk.zuletzt = jetzt;
    mk.gesehen++;
  }
  // Je Bild: hat der Worker frei, das aktuelle Videobild verkleinert hinschicken (ohne Worker: hier erkennen).
  function vfMkErkennen(mk) {
    const v = mk.video;
    if (!(v.readyState >= 2 && v.videoWidth)) return;
    mk.stufe = ((mk.stufe || 0) + 1) % VF_MK.breiten.length;
    const dw = Math.min(VF_MK.breiten[mk.stufe], v.videoWidth), dh = Math.round(dw * v.videoHeight / v.videoWidth);
    const f = (dw / 2) / Math.tan(VF_MK.bildwinkel * Math.PI / 360);
    if (mk.worker) {
      if (mk.wartet) return;
      if (mk.cnv.width !== dw || mk.cnv.height !== dh) { mk.cnv.width = dw; mk.cnv.height = dh; }
      const S = mk.stat || (mk.stat = { gesendet: 0, erkannt: 0, verworfen: 0, ms: 0, dist: 0, w: 0, h: 0, kand: 0 });
      S.gesendet++;
      mk.ctx.drawImage(v, 0, 0, dw, dh);
      const bild = mk.ctx.getImageData(0, 0, dw, dh);
      mk.wartet = true; mk.bilder++;
      mk.worker.postMessage({ n: ++mk.n, w: dw, h: dh, f, mm: VF_MK.mm, id: VF_MK.id, buf: bild.data.buffer }, [bild.data.buffer]);
      return;
    }
    // Rueckfall ohne Worker
    if (!mk.det) mk.det = new window.AR.Detector({ dictionaryName: 'ARUCO_MIP_36h12', maxHammingDistance: VF_MK.hamming });
    if (mk.cnv.width !== dw || mk.cnv.height !== dh) { mk.cnv.width = dw; mk.cnv.height = dh; mk.posit = null; }
    if (!mk.posit) mk.posit = new window.POS.Posit(VF_MK.mm, f);
    mk.ctx.drawImage(v, 0, 0, dw, dh);
    const liste = mk.det.detect(mk.ctx.getImageData(0, 0, dw, dh)) || [];
    mk.bilder++;
    const m = liste.find((x) => x.id === VF_MK.id);
    if (!m) return;
    const p = mk.posit.pose(m.corners.map((c) => ({ x: c.x - dw / 2, y: dh / 2 - c.y })));
    vfMkAntwort(mk, { ok: true, w: dw, h: dh, ecken: m.corners.map((c) => [c.x / dw, c.y / dh]), r1: p.bestRotation, t1: p.bestTranslation, e1: p.bestError, r2: p.alternativeRotation, t2: p.alternativeTranslation, e2: p.alternativeError });
  }
  // Drehteil wieder orthonormal machen (Gram-Schmidt auf den Spalten).
  function vfMkOrtho(M) {
    const n = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const x = n([M[0], M[1], M[2]]);
    let y = [M[4], M[5], M[6]];
    const d = x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
    y = n([y[0] - d * x[0], y[1] - d * x[1], y[2] - d * x[2]]);
    const z = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
    M[0] = x[0]; M[1] = x[1]; M[2] = x[2]; M[4] = y[0]; M[5] = y[1]; M[6] = y[2]; M[8] = z[0]; M[9] = z[1]; M[10] = z[2];
  }
  // Welt der Fahrt -> Marker (mm): Marker-x = Welt-x, Marker-z (aus dem Papier, nach oben) = Welt-Hoehe, Marker-y = -Welt-z;
  // Massstab: Einheiten -> mm (echte Carrera-Groesse) mal Massstab. v1.6.71: der Startpunkt liegt auf dem Marker, die
  // Fahrtrichtung am Start zeigt zur Oberkante des Blatts (Ry(h) dreht die Startrichtung auf Welt -z = Blatt-oben).
  function vfMkWelt() {
    const sx = VF.startX !== undefined ? VF.startX : (VF.pts && VF.pts[0] ? VF.pts[0].x : 0);
    const sy = VF.startY !== undefined ? VF.startY : (VF.pts && VF.pts[0] ? VF.pts[0].y : 0);
    const sh = (VF.startH || 0) * Math.PI / 180;
    const s = 10 / TRACK_UNITS_PER_CM * vfMkMassstab();
    const A = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1];
    return vfKette(A, vfS(s, s, s), vfRy(sh), vfT(-sx, 0, -sy));
  }
  // Das Kamerabild als Hintergrund (Textur, Ausschnitt wie object-fit: cover), ohne Tiefe.
  function vfMkHintergrund(gl, mk, W, H) {
    const v = mk.video;
    if (!(v.readyState >= 2 && v.videoWidth)) return;
    if (!mk.hg) {
      const vs = 'attribute vec2 p; uniform vec4 c; varying vec2 uv; void main() { vec2 t = p * 0.5 + 0.5; uv = vec2(c.x + t.x * (c.z - c.x), c.w - t.y * (c.w - c.y)); gl_Position = vec4(p, 0.0, 1.0); }';
      const fs = 'precision mediump float; uniform sampler2D tx; varying vec2 uv; void main() { gl_FragColor = vec4(texture2D(tx, uv).rgb, 1.0); }';
      const sh = (typ, q) => { const o = gl.createShader(typ); gl.shaderSource(o, q); gl.compileShader(o); return o; };
      const pr = gl.createProgram();
      gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr);
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
      const tx = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tx);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      mk.hg = { pr, b, tx, ap: gl.getAttribLocation(pr, 'p'), c: gl.getUniformLocation(pr, 'c'), t: gl.getUniformLocation(pr, 'tx') };
    }
    const g = mk.hg;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, g.tx);
    const flip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL), pre = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, v); } catch (e) { /* Bild noch nicht bereit */ }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flip); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, pre);
    const vw = v.videoWidth, vh = v.videoHeight, sc = Math.max(W / vw, H / vh);
    const du = (1 - (W / sc) / vw) / 2, dv = (1 - (H / sc) / vh) / 2;
    gl.useProgram(g.pr);
    gl.uniform4f(g.c, du, dv, 1 - du, 1 - dv);
    gl.uniform1i(g.t, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, g.b);
    gl.enableVertexAttribArray(g.ap);
    gl.vertexAttribPointer(g.ap, 2, gl.FLOAT, false, 8, 0);
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.depthMask(true);
    gl.disableVertexAttribArray(g.ap);
  }
  // Ein Bild: durchsichtig loeschen, Marker suchen, Szene von der Kamera aus zeichnen.
  function vfMkMalen() {
    const gl = VF.gl, cv = VF.cv, mk = VF.marker;
    const dpr = Math.min(navigator.maxTouchPoints > 0 ? 1.25 : 1.5, window.devicePixelRatio || 1);
    const W = cv.clientWidth, H = cv.clientHeight;
    const w = Math.round(W * dpr), h = Math.round(H * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const jetzt = performance.now();
    try { vfMkHintergrund(gl, mk, W, H); } catch (e) { if (!mk.hgFehler) { mk.hgFehler = e; log('Marker-AR Hintergrund: ' + e.message, 'warn'); } }
    try { vfMkErkennen(mk); } catch (e) { if (!mk.fehler) { mk.fehler = e; log('Marker-AR: ' + e.message, 'warn'); } }
    const sichtbar = !!(mk.pose && jetzt - mk.zuletzt < VF_MK.verlorenMs);
    const h2 = VF.schicht && VF.schicht.querySelector('.vf-ar-hinweis');
    if (h2) h2.hidden = sichtbar;
    vfMkDiagnose(mk, W, H, jetzt);
    if (!sichtbar) return;
    gl.enable(gl.DEPTH_TEST);
    const blick = vfMal(mk.pose, vfMkWelt());
    const pv = vfMal(vfMkProjektion(mk, W, H, 20, 60000), blick);
    VF.augeJetzt = vfMkAuge(blick);
    vfSzeneMalen(gl, pv, blick, VF.augeJetzt);
  }
  // Kameraposition in der Welt der Fahrt: Inverse der starren Abbildung (Drehung mal Massstab plus Verschiebung).
  function vfMkAuge(B) {
    const s2 = B[0] * B[0] + B[1] * B[1] + B[2] * B[2] || 1;   // Massstab^2 der ersten Spalte
    const t = [B[12], B[13], B[14]];
    return [-(B[0] * t[0] + B[1] * t[1] + B[2] * t[2]) / s2, -(B[4] * t[0] + B[5] * t[1] + B[6] * t[2]) / s2, -(B[8] * t[0] + B[9] * t[1] + B[10] * t[2]) / s2];
  }

  // v1.6.73: Diagnose im Bild (WIP, bis die Marker-AR am Geraet sicher laeuft): Zahlen und gruene Punkte an den Ecken.
  function vfMkDiagnose(mk, W, H, jetzt) {
    const sch = VF.schicht;
    if (!sch) return;
    let d = sch.querySelector('.vf-mk-diag');
    if (!d) { d = document.createElement('div'); d.className = 'vf-mk-diag'; sch.appendChild(d); }
    if (!mk.diagAt || jetzt - mk.diagAt > 250) {
      mk.diagAt = jetzt;
      const S = mk.stat || {}, v = mk.video;
      d.textContent = t('Kamera') + ' ' + (v.videoWidth || 0) + '×' + (v.videoHeight || 0) + ' · ' + t('erkannt') + ' ' + (S.erkannt || 0) + '/' + (S.gesendet || mk.bilder || 0)
        + ' · ' + t('verworfen') + ' ' + (S.verworfen || 0) + ' · ' + t('Kandidaten') + ' ' + (S.kand || 0) + ' · ' + (S.ms || 0) + ' ms · '
        + (S.dist ? Math.round(S.dist / 10) + ' cm' : '–') + ' · ' + (mk.worker ? 'Worker' : t('Hauptthread')) + (mk.fehler ? ' · ⚠ ' + String(mk.fehler).slice(0, 60) : '');
    }
    // Ecken: aus Bildanteilen (0..1 des Videos) in Schirmpixel (Ausschnitt wie object-fit: cover).
    let punkte = sch.querySelectorAll('.vf-mk-punkt');
    if (punkte.length < 4) { for (let i = punkte.length; i < 4; i++) { const p = document.createElement('i'); p.className = 'vf-mk-punkt'; sch.appendChild(p); } punkte = sch.querySelectorAll('.vf-mk-punkt'); }
    const zeigen = !!(mk.ecken && jetzt - (mk.eckenAt || 0) < 400 && mk.video.videoWidth);
    const vw = mk.video.videoWidth || 1, vh = mk.video.videoHeight || 1, sc = Math.max(W / vw, H / vh);
    punkte.forEach((p, i) => {
      p.hidden = !zeigen;
      if (!zeigen) return;
      const c = mk.ecken[i];
      p.style.left = (W / 2 + (c[0] - 0.5) * vw * sc) + 'px';
      p.style.top = (H / 2 + (c[1] - 0.5) * vh * sc) + 'px';
    });
  }
