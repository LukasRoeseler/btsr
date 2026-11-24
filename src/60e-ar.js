  // ==================================================================================================
  // AUGMENTED REALITY (v1.6.60, WIP, Prototyp)
  // ==================================================================================================
  // BESTELLT: "For the chrome version, build an AR prototype that can be launched through the virtual garage. The aim
  // is for the virtual car to drive in my home and for the helicopter to fly in my home."
  //
  // WebXR "immersive-ar" (Chrome auf Android mit ARCore, ueber https - die GitHub-Pages-Fassung). In der App (Android-
  // WebView) gibt es WebXR nicht; der Knopf "AR" in der virtuellen Garage erscheint nur, wo der Browser es anbietet.
  //
  // Ablauf:
  //   1. Tipp auf "AR" (Nutzergeste): die AR-Sitzung wird SOFORT angefragt (hit-test, local; dom-overlay fuer HUD und
  //      Touch-Steuerung), dann startet die normale virtuelle Fahrt mit opts.ar (virtuellStarten): ihre Schicht liegt im
  //      Wurzelelement der Ueberlagerung, durchsichtig, die Leinwand unsichtbar; gezeichnet wird in die Ebene der Sitzung.
  //   2. Bodensuche: ein Kreis zeigt, wo der Strahl aus der Bildmitte den Boden trifft (hit-test). Ein Tipp setzt die
  //      Strecke dorthin, gedreht so, dass sie vom Betrachter wegfuehrt. "Neu platzieren" setzt sie wieder zurueck.
  //   3. Danach laeuft alles wie sonst (Fahren, Fliegen, Tore, Runden, HUD). Je Bild der Sitzung: Physik (vfBild) und
  //      je Auge die Szene (vfSzeneMalen) mit der Projektion der Kamera und Welt = Anker * Drehung * Massstab.
  //
  // MASSSTAB: Die Welt der virtuellen Fahrt ist die echte Carrera-Bahn (TRACK_UNITS_PER_CM Einheiten je cm), in AR also
  // 1:1 - die Strecke liegt in Originalgroesse auf dem Boden, Auto und Hubschrauber passen dazu (Hubschrauber ~5 cm,
  // Flughoehe bis ~2,8 m). VF_AR_MASSSTAB vergroessert bei Bedarf (z. B. 2 = doppelt so gross).
  const VF_AR_MASSSTAB = 1;
  let vfArUnterstuetzt = null;   // null = noch nicht geprueft
  function vfArMoeglich() { return vfArUnterstuetzt === true; }
  function vfArPruefen() {
    if (vfArUnterstuetzt !== null) return;
    vfArUnterstuetzt = false;
    try {
      if (navigator.xr && navigator.xr.isSessionSupported) {
        navigator.xr.isSessionSupported('immersive-ar').then((ja) => {
          vfArUnterstuetzt = !!ja;
          const k = document.querySelector('[data-vf="ar"]');
          if (k) k.hidden = !ja;
        }).catch(() => { vfArUnterstuetzt = false; });
      }
    } catch (e) { vfArUnterstuetzt = false; }
  }
  setTimeout(vfArPruefen, 0);

  function vfArStarten() {
    if (VF.aktiv) return;
    if (!(navigator.xr && navigator.xr.requestSession)) {
      showHudToast(t('AR geht hier nicht: sie braucht Chrome auf einem Android-Handy mit ARCore (nicht in der App, nicht am PC).'));
      return;
    }
    const wurzel = document.createElement('div');
    wurzel.className = 'vf-ar-wurzel';
    document.body.appendChild(wurzel);
    const ar = { session: null, wurzel, frame: null, ref: null, hitSrc: null, treffer: null, platz: null, kamera: null, layerOk: false };
    // Sofort anfragen (Nutzergeste), alles andere danach.
    navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test', 'local'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: wurzel },
    }).then((session) => {
      ar.session = session;
      session.addEventListener('end', () => {
        ar.beendet = true;
        if (VF.aktiv && VF.ar === ar) virtuellBeenden();
        else vfArAufraeumen(ar);
      });
      // Tipps auf Knoepfe der Ueberlagerung sind keine AR-Auswahl (Steuerung, Knopfleiste).
      wurzel.addEventListener('beforexrselect', (e) => { if (e.target && e.target.closest && e.target.closest('button, .vf-touch, .vf-knoepfe, input, select')) e.preventDefault(); });
      session.addEventListener('select', () => vfArPlatzieren(ar));
      if (!virtuellStarten({ ar })) { session.end().catch(() => {}); return; }
      vfArEbene(ar);
      session.requestReferenceSpace('local').then((ref) => {
        ar.ref = ref;
        return session.requestReferenceSpace('viewer');
      }).then((viewer) => session.requestHitTestSource({ space: viewer })).then((src) => { ar.hitSrc = src; })
        .catch((e) => { log('AR: Bodensuche nicht moeglich (' + e.message + ')', 'warn'); });
      vfArHinweis(ar);
    }).catch((e) => {
      wurzel.remove();
      showHudToast(t('AR konnte nicht starten') + ': ' + (e && e.message ? e.message : e));
      log('AR: Sitzung nicht gestartet (' + (e && e.message) + ')', 'warn');
    });
  }
  // Die AR-Ebene braucht den Grafikkontext der virtuellen Fahrt; bei einer freien Strecke entsteht er erst nach dem Laden.
  function vfArEbene(ar) {
    if (ar.beendet || ar.layerOk) return;
    if (!VF.gl || VF.ar !== ar) { setTimeout(() => vfArEbene(ar), 120); return; }
    const gl = VF.gl;
    const fertig = () => {
      if (ar.beendet) return;
      ar.session.updateRenderState({ baseLayer: new XRWebGLLayer(ar.session, gl) });
      ar.layerOk = true;
      VF.raf = ar.session.requestAnimationFrame(vfArBild);
    };
    (gl.makeXRCompatible ? gl.makeXRCompatible() : Promise.resolve()).then(fertig, (e) => {
      showHudToast(t('AR konnte nicht starten') + ': ' + e.message);
      ar.session.end().catch(() => {});
    });
  }
  // Ein Bild der AR-Sitzung: Physik und Anzeige wie sonst (vfBild), gezeichnet in vfArMalen.
  function vfArBild(zeit, frame) {
    const ar = VF.ar;
    if (!ar || !VF.aktiv) return;
    // Doppelte Anmeldungen (Start der Fahrt und Ebene fertig) im selben Bild: nur eine rechnet, die andere endet hier.
    if (ar.letzteZeit === zeit) return;
    ar.letzteZeit = zeit;
    ar.frame = frame;
    try { vfBild(zeit); } finally { ar.frame = null; }
    // Waehrend des Ladebilds zeichnet vfBild nichts: dann wenigstens die Bodensuche.
    if (VF.laedt && ar.layerOk) { ar.frame = frame; try { vfArMalen(frame); } finally { ar.frame = null; } }
  }

  // Strecke an die Trefferstelle setzen, gedreht vom Betrachter weg.
  function vfArPlatzieren(ar) {
    if (!ar.treffer || ar.platz) return;
    const m = ar.treffer;
    let yaw = 0;
    if (ar.kamera) { const f = [-ar.kamera[8], -ar.kamera[10]]; yaw = Math.atan2(-f[0], -f[1]); }
    // Mitte der Strecke (Mittellinie) in den Anker.
    let cx = 0, cy = 0;
    if (VF.pts && VF.pts.length) { VF.pts.forEach((p) => { cx += p.x; cy += p.y; }); cx /= VF.pts.length; cy /= VF.pts.length; }
    ar.platz = { x: m[12], y: m[13], z: m[14], yaw, cx, cy, s: VF_AR_MASSSTAB / (TRACK_UNITS_PER_CM * 100) };
    vfArHinweis(ar);
  }
  // Welt der virtuellen Fahrt -> Raum der AR-Sitzung (Meter): T(Anker) * Ry(yaw) * S(s) * T(-Mitte).
  function vfArWelt(p) {
    return vfKette(vfT(p.x, p.y, p.z), vfRy(p.yaw), vfS(p.s, p.s, p.s), vfT(-p.cx, 0, -p.cy));
  }
  // Ein Punkt der AR-Sitzung zurueck in die Welt der Fahrt (fuer Licht und Ton: das Auge).
  function vfArZurueck(p, q) {
    const dx = q[0] - p.x, dy = q[1] - p.y, dz = q[2] - p.z;
    const c = Math.cos(-p.yaw), s = Math.sin(-p.yaw);
    const rx = c * dx + s * dz, rz = -s * dx + c * dz;
    return [rx / p.s + p.cx, dy / p.s, rz / p.s + p.cy];
  }

  // Zielkreis fuer die Bodensuche (Ring in der x-z-Ebene, Radius 1, 6 Zahlen je Ecke wie die Farbmodelle).
  function vfArRingBauen(gl) {
    const a = [], n = 40, r0 = 0.8, r1 = 1;
    for (let i = 0; i < n; i++) {
      const w0 = i / n * Math.PI * 2, w1 = (i + 1) / n * Math.PI * 2;
      const p = (r, w) => [Math.cos(w) * r, 0.002, Math.sin(w) * r];
      const q = [p(r0, w0), p(r1, w0), p(r1, w1), p(r0, w0), p(r1, w1), p(r0, w1)];
      q.forEach((v) => a.push(v[0], v[1], v[2], 0.4, 1.6, 1.8));
    }
    return vfPuffer(gl, a);
  }
  function vfArFarbeMalen(gl, pv, pu, welt) {
    gl.useProgram(VF.prog);
    if (!VF.loc) VF.loc = { m: gl.getUniformLocation(VF.prog, 'm'), w: gl.getUniformLocation(VF.prog, 'w'), nebel: gl.getUniformLocation(VF.prog, 'nebel'), alf: gl.getUniformLocation(VF.prog, 'alf'), sonne: gl.getUniformLocation(VF.prog, 'sonne'),
                            dunst: gl.getUniformLocation(VF.prog, 'dunst'), aug: gl.getUniformLocation(VF.prog, 'aug'),
                            p: gl.getAttribLocation(VF.prog, 'p'), c: gl.getAttribLocation(VF.prog, 'c'), pv: new Float32Array(16), w16: new Float32Array(16) };
    const L = VF.loc;
    for (let i = 0; i < 16; i++) { L.pv[i] = pv[i]; L.w16[i] = welt[i]; }
    gl.uniformMatrix4fv(L.m, false, L.pv);
    gl.uniformMatrix4fv(L.w, false, L.w16);
    vfTzSetzen(gl, L);
    gl.uniform1f(L.alf, 1.0);
    gl.bindBuffer(gl.ARRAY_BUFFER, pu.b);
    gl.enableVertexAttribArray(L.p); gl.enableVertexAttribArray(L.c);
    gl.vertexAttribPointer(L.p, 3, gl.FLOAT, false, 24, 0);
    gl.vertexAttribPointer(L.c, 3, gl.FLOAT, false, 24, 12);
    gl.drawArrays(gl.TRIANGLES, 0, pu.n);
    gl.disableVertexAttribArray(L.p); gl.disableVertexAttribArray(L.c);
  }

  // Ein Bild in die AR-Ebene: Kamerabild kommt vom System (durchsichtig loeschen), darueber je Auge die Szene.
  function vfArMalen(frame) {
    const ar = VF.ar, gl = VF.gl;
    if (!ar || !ar.ref || !ar.layerOk || !gl) return;
    const pose = frame.getViewerPose(ar.ref);
    if (!pose) return;
    ar.kamera = pose.transform.matrix;
    if (!ar.platz && ar.hitSrc) {
      const h = frame.getHitTestResults(ar.hitSrc);
      const p = h.length ? h[0].getPose(ar.ref) : null;
      ar.treffer = p ? p.transform.matrix : null;
    }
    const layer = ar.session.renderState.baseLayer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    for (const view of pose.views) {
      const vp = layer.getViewport(view);
      gl.viewport(vp.x, vp.y, vp.width, vp.height);
      const proj = Array.from(view.projectionMatrix), sicht = Array.from(view.transform.inverse.matrix);
      if (!ar.platz) {
        if (ar.treffer) {
          if (!ar.ring) ar.ring = vfArRingBauen(gl);
          // Ring mit 15 cm Radius flach auf dem Treffer.
          const m = ar.treffer;
          vfArFarbeMalen(gl, vfMal(proj, sicht), ar.ring, vfKette(vfT(m[12], m[13], m[14]), vfS(0.15, 0.15, 0.15)));
        }
        continue;
      }
      const welt = vfArWelt(ar.platz);
      const blick = vfMal(sicht, welt);
      const pv = vfMal(proj, blick);
      const pos = view.transform.position;
      const auge = vfArZurueck(ar.platz, [pos.x, pos.y, pos.z]);
      VF.augeJetzt = auge;
      vfSzeneMalen(gl, pv, blick, auge);
    }
  }

  // Hinweis und Knopf "Neu platzieren" in der Ueberlagerung.
  function vfArHinweis(ar) {
    const sch = VF.schicht;
    if (!sch) return;
    let h = sch.querySelector('.vf-ar-hinweis');
    if (!h) { h = document.createElement('div'); h.className = 'vf-ar-hinweis'; sch.appendChild(h); }
    h.textContent = t('Handy langsam über den Boden bewegen, bis der Kreis erscheint, dann tippen: dort steht die Strecke.');
    h.hidden = !!ar.platz;
    let k = sch.querySelector('.vf-ar-neu');
    if (!k) {
      k = document.createElement('button');
      k.type = 'button'; k.className = 'vf-ar-neu';
      k.textContent = t('Neu platzieren');
      k.onclick = (e) => { e.stopPropagation(); ar.platz = null; vfArHinweis(ar); };
      sch.appendChild(k);
    }
    k.hidden = !ar.platz;
  }
  function vfArAufraeumen(ar) {
    if (!ar) return;
    try { if (ar.hitSrc) ar.hitSrc.cancel(); } catch (e) { /* egal */ }
    if (ar.session && !ar.beendet) { ar.beendet = true; ar.session.end().catch(() => {}); }
    if (ar.wurzel) ar.wurzel.remove();
  }
