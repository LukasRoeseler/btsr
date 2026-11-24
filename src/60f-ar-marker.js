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
  const VF_MK = { id: 0, mm: 160, bildwinkel: 63, erkennBreite: 480, verlorenMs: 700 };
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
    const mk = { video, stream, det: new window.AR.Detector({ dictionaryName: 'ARUCO_MIP_36h12' }), posit: null, cnv: document.createElement('canvas'),
                 pose: null, zuletzt: 0, gesehen: 0, bilder: 0 };
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
    h.textContent = t('Kamera auf den ausgedruckten Marker richten (ar-marker-a4.svg, in Originalgröße drucken). Die Strecke liegt mittig auf dem Marker.');
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
  // Marker im Video suchen; Pose als Kamera <- Marker (GL-Achsen: x rechts, y oben, z zum Betrachter), Masse in mm.
  function vfMkErkennen(mk, jetzt) {
    const v = mk.video;
    if (!(v.readyState >= 2 && v.videoWidth)) return;
    const dw = VF_MK.erkennBreite, dh = Math.round(dw * v.videoHeight / v.videoWidth);
    if (mk.cnv.width !== dw || mk.cnv.height !== dh) { mk.cnv.width = dw; mk.cnv.height = dh; mk.posit = null; }
    if (!mk.posit) mk.posit = new window.POS.Posit(VF_MK.mm, (dw / 2) / Math.tan(VF_MK.bildwinkel * Math.PI / 360));
    mk.ctx.drawImage(v, 0, 0, dw, dh);
    const bild = mk.ctx.getImageData(0, 0, dw, dh);
    const liste = mk.det.detect(bild) || [];
    const m = liste.find((x) => x.id === VF_MK.id) || null;
    mk.bilder++;
    if (!m) return;
    const ecken = m.corners.map((c) => ({ x: c.x - dw / 2, y: dh / 2 - c.y }));
    const p = mk.posit.pose(ecken);
    if (!p || !p.bestRotation || !p.bestTranslation) return;
    const R = p.bestRotation, T = p.bestTranslation;
    // POSIT: Kamera x rechts, y oben, z nach vorn. GL: z zum Betrachter -> F = diag(1, 1, -1) links.
    const M = [R[0][0], R[1][0], -R[2][0], 0, R[0][1], R[1][1], -R[2][1], 0, R[0][2], R[1][2], -R[2][2], 0, T[0], T[1], -T[2], 1];
    // Glaetten: gegen Zittern halb zum neuen Wert, bei einem Sprung (Marker neu im Bild) sofort.
    if (mk.pose && jetzt - mk.zuletzt < 300) {
      const a = 0.5;
      for (let i = 0; i < 16; i++) mk.pose[i] += (M[i] - mk.pose[i]) * a;
      vfMkOrtho(mk.pose);
    } else mk.pose = M;
    mk.zuletzt = jetzt;
    mk.gesehen++;
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
  // Welt der Fahrt -> Marker (mm): Marker-x = Welt-x, Marker-z (aus dem Papier, nach oben) = Welt-Hoehe,
  // Marker-y = -Welt-z; Massstab: Einheiten -> mm (echte Carrera-Groesse) mal Massstab; Mitte der Strecke auf den Marker.
  function vfMkWelt() {
    let cx = 0, cy = 0;
    if (VF.pts && VF.pts.length) { VF.pts.forEach((p) => { cx += p.x; cy += p.y; }); cx /= VF.pts.length; cy /= VF.pts.length; }
    const s = 10 / TRACK_UNITS_PER_CM * vfMkMassstab();
    const A = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1];
    return vfKette(A, vfS(s, s, s), vfT(-cx, 0, -cy));
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
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const jetzt = performance.now();
    try { vfMkErkennen(mk, jetzt); } catch (e) { if (!mk.fehler) { mk.fehler = e; log('Marker-AR: ' + e.message, 'warn'); } }
    const sichtbar = !!(mk.pose && jetzt - mk.zuletzt < VF_MK.verlorenMs);
    const h2 = VF.schicht && VF.schicht.querySelector('.vf-ar-hinweis');
    if (h2) h2.hidden = sichtbar;
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
