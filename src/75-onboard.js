  // ============================== ONBOARD-KAMERA (FPV im Auto) ==============================
  //
  // BESTELLT: "kostenguenstig mit einem Carrera Hybrid Fahrzeug Streckenvideos erstellen,
  // Ausgabe moeglichst auf einem Bildschirm" - und als schoenste Fassung: "das Bild in
  // OmegaSim". Im Auto sitzt eine analoge FPV-Mikrokamera (5,8 GHz, Kamera + Sender in
  // einem, 3-5 g, eigener 1S-Akku), am Tablet/PC ein USB-Empfaenger (UVC). Der meldet sich
  // wie eine WEBCAM - also braucht es hier nichts als getUserMedia, keine eigene Hardware-
  // Schnittstelle wie bei der Startampel.
  //
  //   Garage -> Onboard-Kamera (v1.5)         Einschalten, Quelle (USB oder WLAN), Bild drehen
  //   (bei gnen54 unter Optionen -> AddOn; OmegaSim hat keine AddOn-Seite)
  //   Cockpit, Schirm "Onboard"               Livebild mit Runde, Zeit, km/h
  //   Aufnahme (Knopf oder Waehltaste X)      Video MIT Anzeige (Runde, Zeit, km/h, Ampel,
  //                                           Gelbe Flagge), gespeichert als MP4/WebM
  //   "Rennen automatisch aufnehmen"          vom Countdown bis kurz nach dem Ziel
  //
  // DIE AUFNAHME LAEUFT UEBER EIN CANVAS und nicht direkt am Kamerastrom: nur so kommen
  // Rundenzeit und Ampel ins Video. Der Kamerastrom selbst wird nie veraendert.
  //
  // v1.5 (WIP) ZWEITE QUELLE: M5Stack Timer Camera (ESP32 mit PSRAM) oder eine andere ESP32-Kamera
  // im WLAN, die ein MJPEG-Bild liefert (http://<adresse>/stream). Ein <img> zeigt den Strom; der
  // Rest (Schirm, Anzeige, Aufnahme) ist derselbe. Aufnehmen geht nur, wenn die Kamera CORS erlaubt
  // (Access-Control-Allow-Origin), sonst waere das Canvas "verschmutzt". Die Webseite ueber https darf
  // kein http-Bild laden; in der Android-App (allowMixedContent) und ueber localhost geht es.
  // Firmware-Hinweise: tools/onboard/README.md.
  //
  // ZUSTAND IN EINEM var, und das ist Absicht. 50-drive.js fragt beim Laden ueber
  // cockpitScreenGilt() -> onboardAktiv(), ob der Schirm blaetterbar ist - VOR dieser Datei.
  // Ein let/const hier stuende dann noch in der temporalen Todeszone, und der Lesezugriff
  // braeche die ganze IIFE ab (siehe tools/build.py). Ein var ist schon da, nur leer.
  var onbZ = null;
  function onbZustand() {
    if (!onbZ) {
      onbZ = { stream: null, an: false, fehler: '', rec: null, wache: null,
               zuletzt: 'idle', malTakt: 0, einst: null,
               m5: null, m5Cors: false, m5Neu: 0 };
    }
    return onbZ;
  }

  const ONB_STORE = 'omegasim-onboard';
  const ONB_VORGABE = { an: false, quelle: '', quelleName: '', drehen: false,
                        beimStart: true, autoRec: false, art: 'usb', m5: '' };
  // Wie lange eine Adresse fuer das erste Bild Zeit hat, und der Abstand der Neuversuche nach einem Abriss.
  const ONB_M5_WARTE_MS = 6000;
  const ONB_M5_NEU_MS = 4000;
  // Obergrenze einer Aufnahme: der Puffer liegt bis zum Speichern im Speicher des Tablets.
  // 15 min bei 3 Mbit/s sind rund 340 MB - mehr will man einem Tablet nicht zumuten.
  const ONB_MAX_MS = 15 * 60 * 1000;
  const ONB_BITRATE = 3000000;
  // Nach dem Ziel noch so lange weiter aufnehmen (Auslaufen, Zieldurchfahrt im Bild).
  const ONB_NACHLAUF_MS = 3000;

  function onbEinst() {
    const z = onbZustand();
    if (!z.einst) {
      z.einst = Object.assign({}, ONB_VORGABE);
      try {
        const s = JSON.parse(localStorage.getItem(ONB_STORE) || 'null');
        if (s && typeof s === 'object') Object.assign(z.einst, s);
      } catch (e) { /* privat oder kaputt: Vorgabe */ }
    }
    return z.einst;
  }
  function onbSpeichern() {
    try { localStorage.setItem(ONB_STORE, JSON.stringify(onbEinst())); } catch (e) { /* privat */ }
  }

  // Fuer 50-drive.js: den Schirm "Onboard" gibt es nur, solange ein Bild da ist.
  function onboardAktiv() {
    const z = onbZ;
    if (!z) return false;
    if (z.m5) {
      const img = $('onboard-bild');
      return !!(img && img.naturalWidth > 0);
    }
    if (!z.stream) return false;
    const tr = z.stream.getVideoTracks()[0];
    return !!(tr && tr.readyState === 'live');
  }

  // ---- WLAN-Kamera (M5Stack Timer Camera, ESP32) ----
  function onbApp() {
    const C = window.Capacitor;
    return !!(C && C.isNativePlatform && C.isNativePlatform());
  }
  // "192.168.1.50" -> http://192.168.1.50/stream; mit Pfad oder Schema bleibt es, wie es ist.
  function onbM5Url(adr) {
    let a = String(adr || '').trim();
    if (!a) return '';
    if (!/^https?:[/][/]/i.test(a)) a = 'http://' + a;
    try {
      const u = new URL(a);
      if (u.pathname === '/' || u.pathname === '') u.pathname = '/stream';
      return u.href;
    } catch (e) { return ''; }
  }
  // Die Kandidaten: die Adresse selbst; ohne Port und Pfad zusaetzlich Port 81 (so streamt das
  // Arduino-Beispiel CameraWebServer).
  function onbM5Kandidaten(adr) {
    const url = onbM5Url(adr);
    if (!url) return [];
    const liste = [url];
    const roh = String(adr || '').trim().replace(/^https?:[/][/]/i, '');
    if (!/[:/]/.test(roh)) {
      try { const u = new URL(url); u.port = '81'; liste.push(u.href); } catch (e) { /* nur die eine */ }
    }
    return liste;
  }
  // https-Seite und http-Bild: der Browser laedt es nicht (gemischte Inhalte). App und localhost duerfen.
  function onbM5Gesperrt(url) {
    if (onbApp() || !/^http:/i.test(url)) return false;
    return location.protocol === 'https:' && !/^(localhost|127[.]0[.]0[.]1|\[::1\])$/.test(location.hostname);
  }
  function onbM5Hinweis() {
    const h = $('onboard-m5-hinweis');
    if (!h) return;
    const url = onbM5Url(onbEinst().m5);
    const gesperrt = onbEinst().art === 'm5' && (url ? onbM5Gesperrt(url) : onbM5Gesperrt('http://x/'));
    h.hidden = !gesperrt;
    if (gesperrt) h.textContent = t('Diese Seite läuft über https und darf das http-Bild der Kamera nicht laden. In der Android-App oder über „Start OmegaSim.bat“ geht es.');
  }
  // Ein Versuch: das erste Bild abwarten (naturalWidth), Fehler oder Zeitablauf heisst: naechster Kandidat.
  function onbM5Versuch(img, url, cors) {
    return new Promise((ja) => {
      let fertig = false;
      const ende = (ok) => { if (fertig) return; fertig = true; clearInterval(takt); clearTimeout(uhr); img.onerror = null; ja(ok); };
      img.onerror = () => ende(false);
      if (cors) img.crossOrigin = 'anonymous'; else img.removeAttribute('crossorigin');
      img.src = url;
      const takt = setInterval(() => { if (img.naturalWidth > 0) ende(true); }, 150);
      const uhr = setTimeout(() => ende(false), ONB_M5_WARTE_MS);
    });
  }
  async function onbM5Starten() {
    const z = onbZustand();
    const e = onbEinst();
    const img = $('onboard-bild');
    const kand = onbM5Kandidaten(e.m5);
    if (!img) return false;
    if (!kand.length) { z.fehler = t('Erst die Adresse der Kamera eintragen.'); onbStatus(); return false; }
    if (onbM5Gesperrt(kand[0])) {
      z.fehler = t('Diese Seite läuft über https und darf das http-Bild der Kamera nicht laden. In der Android-App oder über „Start OmegaSim.bat“ geht es.');
      onbStatus(); return false;
    }
    onbStatus(t('Suche …'));
    const lauf = ++z.m5Neu;
    // Zuerst mit CORS (dann geht auch die Aufnahme), danach ohne (nur Bild).
    for (const cors of [true, false]) {
      for (const url of kand) {
        if (lauf !== z.m5Neu || !e.an) return false;
        z.m5 = { url, cors };
        if (await onbM5Versuch(img, url, cors)) {
          z.m5Cors = cors;
          img.hidden = false;
          const v = $('onboard-video'); if (v) v.hidden = true;
          img.onerror = () => {
            if (!z.m5 || z.m5.url !== url) return;
            log('Onboard-Kamera (WLAN) getrennt.', 'err');
            z.fehler = t('Kamera getrennt.');
            onbStoppen(true);
            // Von selbst weiter versuchen, solange sie eingeschaltet ist (Akku im Auto gewechselt).
            setTimeout(() => { if (onbEinst().an && onbEinst().art === 'm5' && !onboardAktiv()) onbStarten(); }, ONB_M5_NEU_MS);
          };
          log('Onboard-Kamera (WLAN) an: ' + url + (cors ? '' : ' (ohne CORS, keine Aufnahme)'), 'info');
          onbBildDrehen();
          onbWacheStellen();
          if (typeof cockpitPunkteMalen === 'function') cockpitPunkteMalen();
          onbStatus();
          return true;
        }
      }
    }
    z.m5 = null;
    img.removeAttribute('src');
    z.fehler = t('Kamera nicht erreichbar: {u}').replace('{u}', kand[0]);
    log('Onboard-Kamera (WLAN): ' + z.fehler, 'err');
    onbStatus();
    return false;
  }

  function onbStatus(text) {
    const z = onbZustand();
    const s = $('onboard-status');
    if (s) {
      let zeile;
      if (text) zeile = text;
      else if (onboardAktiv() && z.m5) {
        const img = $('onboard-bild');
        zeile = t('An: {n}').replace('{n}', 'WLAN ' + z.m5.url.replace(/^https?:[/][/]/i, ''))
          + ' · ' + img.naturalWidth + '×' + img.naturalHeight + (z.m5Cors ? '' : ' · ' + t('ohne Aufnahme (CORS)'));
      } else if (onboardAktiv()) {
        const tr = z.stream.getVideoTracks()[0];
        const v = $('onboard-video');
        const gr = v && v.videoWidth ? ' · ' + v.videoWidth + '×' + v.videoHeight : '';
        zeile = t('An: {n}').replace('{n}', (tr && tr.label) || t('Kamera')) + gr;
      } else if (z.fehler) zeile = '⚠ ' + z.fehler;
      else zeile = onbEinst().an ? t('Kamera nicht gefunden.') : t('Aus.');
      s.textContent = zeile;
    }
    const b = $('onboard-an');
    if (b) b.textContent = onbEinst().an ? t('Ausschalten') : t('Einschalten');
    const leer = $('onboard-leer');
    if (leer) leer.hidden = onboardAktiv();
    if (typeof konsoleFahrenGeraete === 'function') konsoleFahrenGeraete();
    const art = onbEinst().art === 'm5' ? 'm5' : 'usb';
    const zu = $('onboard-zeile-usb'), zm = $('onboard-zeile-m5');
    if (zu) zu.hidden = art !== 'usb';
    if (zm) zm.hidden = art !== 'm5';
    onbM5Hinweis();
  }

  // Die Auswahlliste. Namen gibt der Browser erst heraus, wenn die Kamera einmal erlaubt
  // wurde - vorher steht nur "Standard" drin.
  async function onbQuellenFuellen() {
    const sel = $('onboard-quelle');
    if (!sel || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    let geraete = [];
    try { geraete = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput'); }
    catch (e) { return; }
    const e = onbEinst();
    sel.innerHTML = '';
    const std = document.createElement('option');
    std.value = ''; std.textContent = t('Standard');
    sel.appendChild(std);
    geraete.forEach((d, i) => {
      if (!d.deviceId) return;
      const o = document.createElement('option');
      o.value = d.deviceId;
      o.textContent = d.label || (t('Kamera') + ' ' + (i + 1));
      sel.appendChild(o);
    });
    sel.value = [...sel.options].some((o) => o.value === e.quelle) ? e.quelle : '';
  }

  // Die gewaehlte Kamera wiederfinden. Die deviceId bleibt je Seite gleich, solange die
  // Erlaubnis besteht; nach dem Loeschen der Website-Daten aendert sie sich - dann hilft
  // der gemerkte Name (der USB-Empfaenger heisst immer gleich).
  async function onbQuelleSuchen() {
    const e = onbEinst();
    if (!e.quelle && !e.quelleName) return '';
    try {
      const liste = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
      if (liste.some((d) => d.deviceId === e.quelle)) return e.quelle;
      const nachName = liste.find((d) => d.label && d.label === e.quelleName);
      if (nachName) return nachName.deviceId;
    } catch (err) { /* dann eben die gemerkte */ }
    return e.quelle;
  }

  function onbStoppen() {
    onbVollbild(false);
    const z = onbZustand();
    if (z.rec) onbAufnahmeStopp(false);
    if (z.stream) z.stream.getTracks().forEach((tr) => { try { tr.stop(); } catch (e) { /* weg */ } });
    z.stream = null;
    const v = $('onboard-video');
    if (v) { v.srcObject = null; v.hidden = false; }
    z.m5Neu++;
    if (z.m5) {
      z.m5 = null;
      const img = $('onboard-bild');
      // Erst den Fehler-Haken weg, dann die Quelle: sonst meldete das Leeren einen Abriss.
      if (img) { img.onerror = null; img.removeAttribute('src'); img.hidden = true; }
    }
    onbWacheStellen();
    if (typeof cockpitScreenIst === 'function' && cockpitScreenIst().id === 'onboard') cockpitScreenZu('main');
    if (typeof cockpitPunkteMalen === 'function') cockpitPunkteMalen();
    onbStatus();
  }

  async function onbStarten() {
    const z = onbZustand();
    z.fehler = '';
    if (onbEinst().art === 'm5') {
      if (z.stream || z.m5) onbStoppen();
      return onbM5Starten();
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      z.fehler = t('Dieser Browser kann keine Kamera.');
      onbStatus();
      return false;
    }
    if (z.stream) onbStoppen();
    onbStatus(t('Suche …'));
    const id = await onbQuelleSuchen();
    const video = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: id ? Object.assign({ deviceId: { exact: id } }, video) : video, audio: false });
    } catch (err) {
      // Die gemerkte Kamera ist nicht da (Empfaenger abgesteckt): nicht still die Kamera des
      // Tablets nehmen - das Bild zeigte dann den Fahrer statt der Strecke.
      z.fehler = (err && err.name === 'NotAllowedError') ? t('Kamera nicht erlaubt.')
        : (err && (err.name === 'NotFoundError' || err.name === 'OverconstrainedError'))
          ? t('Kamera nicht gefunden.') : ((err && err.message) || String(err));
      log('Onboard-Kamera: ' + z.fehler, 'err');
      onbStatus();
      return false;
    }
    z.stream = stream;
    const tr = stream.getVideoTracks()[0];
    if (tr) {
      const e = onbEinst();
      const st = tr.getSettings ? tr.getSettings() : {};
      if (st.deviceId) { e.quelle = st.deviceId; e.quelleName = tr.label || e.quelleName; onbSpeichern(); }
      tr.addEventListener('ended', () => {
        if (z.stream !== stream) return;
        log('Onboard-Kamera getrennt.', 'err');
        z.fehler = t('Kamera getrennt.');
        onbStoppen();
      });
    }
    const v = $('onboard-video');
    if (v) {
      v.hidden = false;
      v.srcObject = stream;
      v.onloadedmetadata = () => onbStatus();
      try { await v.play(); } catch (e) { /* stumm und autoplay: spielt trotzdem */ }
    }
    log('Onboard-Kamera an: ' + ((tr && tr.label) || '?'), 'info');
    onbBildDrehen();
    onbQuellenFuellen();
    onbWacheStellen();
    if (typeof cockpitPunkteMalen === 'function') cockpitPunkteMalen();
    onbStatus();
    return true;
  }

  function onbBildDrehen() {
    const s = $('race-onboardscreen');
    if (s) s.classList.toggle('gedreht', !!onbEinst().drehen);
  }

  // ---- Die Anzeige im Bild ----
  //
  // GELESEN AUS DEM COCKPIT und nicht neu gerechnet: Runde, Zeit und Tempo stehen dort
  // schon, auch wenn der Onboard-Schirm sie verdeckt. Eine zweite Rechnung koennte nur
  // auseinanderlaufen.
  function onbWerte() {
    const txt = (id) => { const el = $(id); return el ? el.textContent.trim() : ''; };
    const lampen = [0, 0, 0, 0, 0];
    const gantry = $('race-gantry');
    const gantryAn = !!(gantry && gantry.classList.contains('on'));
    if (gantryAn) {
      gantry.querySelectorAll('.gantry-lamp[data-col]').forEach((l) => {
        const c = +l.dataset.col - 1;
        if (c < 0 || c > 4) return;
        if (l.classList.contains('red')) lampen[c] = 1;
        else if (l.classList.contains('green') && !lampen[c]) lampen[c] = 2;
      });
    }
    let gelb = false;
    try { gelb = typeof flagState !== 'undefined' && flagState !== 'green'; } catch (e) { /* noch nicht da */ }
    const posEl = $('race-pos');
    // v1.5.111: weitere Werte fuer die Seitenleisten (GT-Stil), ebenfalls aus dem Cockpit.
    const reifen = ['fl', 'fr', 'rl', 'rr'].map((k) => { const el = $('race-tyre-' + k); return el ? (el.style.background || el.style.backgroundColor || '') : ''; });
    const zustand = ['fl', 'fr', 'rl', 'rr'].map((k) => { const el = $('race-tyre-' + k); const b = el && el.querySelector('b'); return b ? b.textContent.trim() : ''; }).filter(Boolean);
    const deltaEl = $('race-lap-delta');
    const bar = $('race-batt-bar');
    let umin = 0, uminMax = 8000;
    try { umin = +txt('race-rpm') || 0; const b = sampleEngine.band[sampleEngine.car || $('sound-profile').value]; if (b && b.limiter > 0) uminMax = b.limiter; } catch (e) { /* ohne Ton */ }
    let licht = false;
    try { licht = !!headlightsOn; } catch (e) { /* noch nicht da */ }
    const schalt = $('race-shift');
    return { runde: txt('race-lap-count') || '0', zeit: txt('race-lap-now') || '–',
             letzte: txt('race-lap-last') || '–',
             beste: txt('race-lap-best') || '–', kmh: txt('race-speed') || '0',
             gang: txt('race-gear-n') || 'N', tank: txt('race-fuel') || '–',
             pos: posEl && !posEl.hidden ? posEl.textContent.trim() : '',
             delta: txt('race-lap-delta') || '–', deltaKlasse: deltaEl ? deltaEl.className : '',
             reifen, reifenTxt: txt('race-tyre-temp') || '–', zustand: zustand.length ? zustand.join(' · ') : '–',
             box: [txt('race-pit-tyre'), txt('race-pit-fuel')].filter(Boolean).join(' · ') || '–',
             akku: txt('race-batt') || '–', akkuBreite: bar ? (bar.style.width || '') : '',
             umin, uminMax, licht, schalt: !!(schalt && (schalt.classList.contains('on') || schalt.classList.contains('an'))),
             gantryAn, lampen, gelb };
  }
  // v1.5.111: Vollbild. Ein Elternelement des Cockpits verhindert position: fixed (eigener Bezugsrahmen), deshalb haengt
  // der Schirm, solange er gezeigt wird, direkt an body und kehrt danach an seinen Platz (Platzhalter) zurueck.
  function onbVollbild(an) {
    const s = $('race-onboardscreen');
    if (!s) return;
    const z = onbZustand();
    if (an && s.parentElement !== document.body) {
      if (!z.platz) { z.platz = document.createComment('onboard-platz'); }
      s.parentNode.insertBefore(z.platz, s);
      document.body.appendChild(s);
      s.classList.add('onb-voll');
    } else if (!an && s.parentElement === document.body && z.platz && z.platz.parentNode) {
      z.platz.parentNode.insertBefore(s, z.platz);
      z.platz.remove();
      s.classList.remove('onb-voll');
    }
  }
  function onbSchirmAktiv() { return typeof cockpitScreenIst === 'function' && cockpitScreenIst().id === 'onboard' && !!document.querySelector('#tab-race.active'); }
  // v1.5.111: Breite der schwarzen Raender neben dem Bild (contain) als CSS-Variable fuer die Seitenleisten.
  function onbRandSetzen() {
    const s = $('race-onboardscreen');
    if (!s) return;
    const W = s.clientWidth, H = s.clientHeight;
    const q = onbQuelleBild();
    const ar = q && q.w > 0 && q.h > 0 ? q.w / q.h : 4 / 3;
    const rand = Math.max(0, Math.round((W - H * ar) / 2));
    const z = onbZustand();
    if (z.rand !== rand) { z.rand = rand; s.style.setProperty('--onb-rand', rand + 'px'); }
  }
  // v1.5.111: Streckenlayout als weisse Linie (wie die Karte bei GT), einmal je Strecke; ohne Autoposition (Rechenzeit).
  function onbKarteSetzen() {
    const svg = $('onb-karte');
    const tiles = (typeof currentTrackTiles !== 'undefined' && currentTrackTiles) || [];
    const z = onbZustand();
    const schluessel = tiles.length ? tiles.map((x) => x.type).join(',') : '';
    if (!svg || z.karte === schluessel) return;
    z.karte = schluessel;
    if (tiles.length < 3 || typeof trackCenterline !== 'function') { svg.innerHTML = ''; return; }
    const pts = trackCenterline(tiles);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    pts.forEach((p) => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); });
    const k = 92 / Math.max(1, x1 - x0, y1 - y0), ox = (100 - (x1 - x0) * k) / 2, oy = (100 - (y1 - y0) * k) / 2;
    const P = (p) => ((p.x - x0) * k + ox).toFixed(1) + ' ' + ((p.y - y0) * k + oy).toFixed(1);
    const s0 = pts.find((p) => p.tile === 0) || pts[0];
    svg.innerHTML = '<path d="M ' + pts.map(P).join(' L ') + ' Z"/><circle cx="' + P(s0).split(' ')[0] + '" cy="' + P(s0).split(' ')[1] + '" r="3"/>';
  }

  function onbHudMalen() {
    const w = onbWerte();
    const set = (id, v) => { const el = $(id); if (el && el.textContent !== v) el.textContent = v; };
    const z = onbZustand();
    set('onb-runde', w.runde);
    set('onb-zeit', w.zeit);
    set('onb-letzte', w.letzte);
    set('onb-beste', w.beste);
    set('onb-kmh', w.kmh);
    set('onb-gang', w.gang);
    set('onb-tank', w.tank);
    // Position "P2/4" oder "2/4": grosse Zahl im Kasten, "/4" daneben (wie GT).
    const pm = /(\d+)\s*\/\s*(\d+)/.exec(w.pos || '');
    set('onb-pos-n', pm ? pm[1] : (w.pos || '–'));
    set('onb-pos-von', pm ? '/' + pm[2] : '');
    set('onb-delta', w.delta);
    const dEl = $('onb-delta');
    if (dEl) { const gut = /gut|good|neg|schneller/.test(w.deltaKlasse) || /^-/.test(w.delta), schlecht = /^\+/.test(w.delta);
      dEl.classList.toggle('gut', gut); dEl.classList.toggle('schlecht', !gut && schlecht); }
    set('onb-reifen-txt', w.reifenTxt); set('onb-zustand', w.zustand); set('onb-box', w.box); set('onb-akku', w.akku);
    w.reifen.forEach((c, i) => { const el = $('onb-r' + i); if (el && c && el.style.background !== c) el.style.background = c; });
    const ab = $('onb-akku-bar'); if (ab && w.akkuBreite && ab.style.width !== w.akkuBreite) ab.style.width = w.akkuBreite;
    set('onb-umin', String(Math.round(w.umin)));
    const rb = $('onb-rpm-bar'), proz = Math.max(0, Math.min(100, Math.round(w.umin / Math.max(1, w.uminMax) * 50) * 2)) + '%';
    if (rb && rb.style.width !== proz) rb.style.width = proz;
    const li = $('onb-licht'); if (li && li.classList.contains('an') !== w.licht) li.classList.toggle('an', w.licht);
    const sc = $('onb-schalt'); if (sc && sc.classList.contains('an') !== w.schalt) sc.classList.toggle('an', w.schalt);
    // Seltener Teil (Raender, Karte, Beschriftungen): hoechstens alle 500 ms.
    const jetzt = performance.now();
    if (!z.selten || jetzt - z.selten > 500) {
      z.selten = jetzt;
      onbVollbild(onbSchirmAktiv()); onbRandSetzen(); onbKarteSetzen();
      // Die Beschriftungen in der eingestellten Sprache (die Kacheln selbst sind data-i18n-skip).
      set('onb-l-runde', t('Runde')); set('onb-l-zeit', t('Zeit')); set('onb-l-letzte', t('Letzte'));
      set('onb-l-beste', t('Beste')); set('onb-l-tank', t('Tank')); set('onb-l-pos', t('Position'));
      set('onb-l-delta', t('Delta')); set('onb-l-reifen', t('Reifen')); set('onb-l-zustand', t('Reifenzustand'));
      set('onb-l-box', t('Boxenstopp')); set('onb-l-akku', t('Batterie'));
    }
    const s = $('race-onboardscreen');
    if (s) s.classList.toggle('gelb', w.gelb);
  }

  // Ein Bild in die Aufnahme: Kamera, darueber die Anzeige.
  // Die Bildquelle (Video vom USB-Empfaenger oder das MJPEG-Bild der WLAN-Kamera) mit Groesse.
  function onbQuelleBild() {
    const z = onbZustand();
    if (z.m5) {
      const img = $('onboard-bild');
      return img && img.naturalWidth > 0 ? { el: img, w: img.naturalWidth, h: img.naturalHeight } : null;
    }
    const v = $('onboard-video');
    return v && v.readyState >= 2 ? { el: v, w: v.videoWidth || 640, h: v.videoHeight || 480 } : null;
  }
  function onbCanvasMalen(rec) {
    const q = onbQuelleBild();
    const c = rec.canvas, g = rec.ctx;
    const W = c.width, H = c.height;
    g.save();
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    if (q) {
      if (onbEinst().drehen) { g.translate(W, H); g.rotate(Math.PI); }
      try { g.drawImage(q.el, 0, 0, W, H); } catch (e) { /* Bild gerade weg */ }
    }
    g.restore();
    const w = onbWerte();
    const u = H / 720;   // alles in "Punkten bei 720 Zeilen"
    // Gelbe Flagge: Rahmen ums ganze Bild.
    if (w.gelb) {
      g.lineWidth = 14 * u; g.strokeStyle = '#ffd400';
      g.strokeRect(7 * u, 7 * u, W - 14 * u, H - 14 * u);
    }
    // v1.5: Kacheln wie beim virtuellen Fahren (60d-virtuell.js .vf-hud/.vf-acc): fast schwarz,
    // schmale blaue Linie oben, kleine gesperrte Beschriftung, grosse Zahlen.
    const BLAU = '#00a3e0', GRUND = 'rgba(8,10,14,.8)', DIM = '#a3acbd';
    const kachel = (x, y, bw, bh) => {
      g.fillStyle = GRUND; g.fillRect(x, y, bw, bh);
      g.fillStyle = BLAU; g.fillRect(x, y, bw, 3 * u);
    };
    const lbl = (txt, x, y, ausr) => {
      g.textAlign = ausr; g.textBaseline = 'middle'; g.fillStyle = DIM;
      g.font = '600 ' + Math.round(15 * u) + 'px system-ui, sans-serif';
      g.fillText(String(txt).toUpperCase(), x, y);
    };
    const wert = (txt, x, y, ausr, gr) => {
      g.textAlign = ausr; g.textBaseline = 'middle'; g.fillStyle = '#f3f4f6';
      g.font = '700 ' + Math.round(gr * u) + 'px system-ui, sans-serif';
      g.fillText(String(txt), x, y);
    };
    // Zeiten oben links.
    const zx = 18 * u, zy = 18 * u, zb = 300 * u;
    const zeilen = [[t('Runde'), w.runde, 40], [t('Zeit'), w.zeit, 26], [t('Letzte'), w.letzte, 26], [t('Beste'), w.beste, 26]];
    const zh = (w.pos ? 34 * u : 0) + 58 * u + 3 * 40 * u + 10 * u;
    kachel(zx, zy, zb, zh);
    let y = zy + 3 * u;
    if (w.pos) {
      g.fillStyle = BLAU; g.fillRect(zx, y, zb, 30 * u);
      g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = '#04070c';
      g.font = '700 ' + Math.round(16 * u) + 'px system-ui, sans-serif';
      g.fillText(w.pos.toUpperCase(), zx + 14 * u, y + 15 * u);
      y += 34 * u;
    }
    zeilen.forEach(([l, v2, gr], i) => {
      const hz = i === 0 ? 58 * u : 40 * u;
      lbl(l, zx + 14 * u, y + hz / 2, 'left');
      wert(v2, zx + zb - 14 * u, y + hz / 2, 'right', gr);
      y += hz;
    });
    // Tempo | Gang | Tank unten Mitte.
    const kb = 380 * u, kh = 96 * u, kx = W / 2 - kb / 2, ky = H - kh - 18 * u;
    kachel(kx, ky, kb, kh);
    wert(w.kmh, kx + kb * 0.2, ky + kh * 0.45, 'center', 40);
    lbl('km/h', kx + kb * 0.2, ky + kh * 0.8, 'center');
    g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(kx + kb / 2 - 38 * u, ky + 10 * u, 76 * u, kh - 20 * u);
    g.fillStyle = BLAU; g.fillRect(kx + kb / 2 - 38 * u, ky + kh - 12 * u, 76 * u, 2 * u);
    wert(w.gang, kx + kb / 2, ky + kh * 0.5, 'center', 64);
    wert(w.tank, kx + kb * 0.8, ky + kh * 0.45, 'center', 30);
    lbl(t('Tank'), kx + kb * 0.8, ky + kh * 0.8, 'center');
    // Ampel oben in der Mitte, solange sie im Cockpit steht.
    if (w.gantryAn) {
      const r = 15 * u, abst = 40 * u, x0 = W / 2 - 2 * abst;
      g.fillStyle = 'rgba(5,7,10,.85)';
      g.fillRect(x0 - 28 * u, 0, 4 * abst + 56 * u, 50 * u);
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        g.arc(x0 + i * abst, 24 * u, r, 0, Math.PI * 2);
        g.fillStyle = w.lampen[i] === 1 ? '#ff2d3a' : w.lampen[i] === 2 ? '#2fe06a' : '#20232b';
        g.fill();
      }
    }
    // Kennung oben rechts, klein.
    g.textAlign = 'right'; g.textBaseline = 'top';
    g.font = '700 ' + Math.round(20 * u) + 'px system-ui, sans-serif';
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.fillText('OmegaSim', W - 22 * u, 18 * u);
  }

  // ---- Aufnahme ----
  function onbMime() {
    if (typeof MediaRecorder === 'undefined') return null;
    // MP4 zuerst: das spielt jedes Handy und jede Schnittsoftware ab (Chrome kann es seit
    // Version 126). Sonst WebM.
    // NUR MIT H.264: ein MP4 mit VP9 drin (das liefert 'video/mp4' allein in Chromium ohne
    // H.264) spielen viele Handys nicht ab - dann lieber ehrlich WebM.
    const kandidaten = ['video/mp4;codecs=avc1.42E01F', 'video/mp4;codecs=avc1',
                        'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    for (const k of kandidaten) {
      try { if (MediaRecorder.isTypeSupported(k)) return k; } catch (e) { /* weiter */ }
    }
    return '';
  }

  function onbAufnahmeStart(auto) {
    const z = onbZustand();
    if (z.rec || !onboardAktiv()) return false;
    const mime = onbMime();
    const q = onbQuelleBild();
    if (mime === null || !q) { showHudToast(t('Dieser Browser kann nicht aufnehmen.')); return false; }
    if (z.m5 && !z.m5Cors) { showHudToast(t('Aufnahme braucht CORS in der Kamera-Firmware (tools/onboard).')); return false; }
    const vw = q.w || 640, vh = q.h || 480;
    const H = 720, W = Math.round((H * vw / vh) / 2) * 2;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const rec = { canvas, ctx: canvas.getContext('2d'), teile: [], mime: mime || 'video/webm',
                  auto: !!auto, gefahren: false, beginn: Date.now(), stoppTimer: null,
                  verwerfen: false, rekorder: null };
    onbCanvasMalen(rec);
    let strom;
    try {
      strom = canvas.captureStream(30);
      rec.rekorder = new MediaRecorder(strom, mime ? { mimeType: mime, videoBitsPerSecond: ONB_BITRATE }
                                                   : { videoBitsPerSecond: ONB_BITRATE });
    } catch (e) {
      showHudToast(t('Aufnahme ging nicht') + ': ' + e.message);
      return false;
    }
    rec.rekorder.ondataavailable = (ev) => { if (ev.data && ev.data.size) rec.teile.push(ev.data); };
    rec.rekorder.onstop = () => {
      strom.getTracks().forEach((tr) => tr.stop());
      if (rec.verwerfen || !rec.teile.length) { log('Onboard-Aufnahme verworfen.', 'info'); return; }
      const blob = new Blob(rec.teile, { type: rec.mime.split(';')[0] });
      onbVideoSpeichern(blob, rec);
    };
    rec.rekorder.start(1000);
    z.rec = rec;
    log('Onboard-Aufnahme laeuft (' + W + '×' + H + ', ' + (mime || 'Standard') + ').', 'info');
    showHudToast(t('Aufnahme läuft'));
    onbRecKnopf();
    onbWacheStellen();
    return true;
  }

  // speichern=false: verwerfen (abgebrochener Start, Kamera weg vor dem Rennen).
  function onbAufnahmeStopp(speichern) {
    const z = onbZustand();
    const rec = z.rec;
    if (!rec) return;
    z.rec = null;
    clearTimeout(rec.stoppTimer);
    rec.verwerfen = speichern === false && rec.auto && !rec.gefahren;
    try { if (rec.rekorder.state !== 'inactive') rec.rekorder.stop(); } catch (e) { /* schon aus */ }
    onbRecKnopf();
    onbWacheStellen();
  }
  function onbAufnahmeUmschalten() {
    const z = onbZustand();
    if (z.rec) onbAufnahmeStopp(true);
    else onbAufnahmeStart(false);
  }

  function onbRecKnopf() {
    const z = onbZustand();
    const b = $('onboard-rec');
    if (!b) return;
    b.classList.toggle('an', !!z.rec);
    if (z.rec) {
      const s = Math.floor((Date.now() - z.rec.beginn) / 1000);
      b.textContent = '■ ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    } else {
      b.textContent = '● ' + t('Aufnahme');
    }
  }

  function onbDateiName(rec) {
    const d = new Date(rec.beginn);
    const zz = (n) => String(n).padStart(2, '0');
    const ext = rec.mime.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
    return { name: 'OmegaSim-Onboard-' + d.getFullYear() + '-' + zz(d.getMonth() + 1) + '-' + zz(d.getDate())
                   + '-' + zz(d.getHours()) + zz(d.getMinutes()) + zz(d.getSeconds()), ext };
  }

  function onbBlobBase64(blob) {
    return new Promise((ja, nein) => {
      const r = new FileReader();
      r.onload = () => ja(String(r.result).split(',')[1] || '');
      r.onerror = () => nein(r.error || new Error('lesen'));
      r.readAsDataURL(blob);
    });
  }

  // Speichern. Im Browser als Download; in der Android-App schreibt die App selbst nach
  // Filme/OmegaSim (die WebView laedt keine Blob-Downloads, siehe 60c-streckenbild.js).
  // In Stuecken, damit kein 300-MB-Text auf einmal ueber die Bruecke muss.
  async function onbVideoSpeichern(blob, rec) {
    const { name, ext } = onbDateiName(rec);
    const mb = (blob.size / 1048576).toFixed(1);
    const C = window.Capacitor;
    if (C && C.isNativePlatform && C.isNativePlatform() && C.isPluginAvailable && C.isPluginAvailable('OmegaSicherung')) {
      showHudToast(t('Video wird gespeichert …'));
      try {
        const STUECK = 3 * 1024 * 1024;   // durch 3 teilbar: jedes Stueck ist eigenes Base64
        for (let pos = 0; pos < blob.size; pos += STUECK) {
          const b64 = await onbBlobBase64(blob.slice(pos, pos + STUECK));
          await C.nativePromise('OmegaSicherung', 'videoTeil', { name: name + '.' + ext, base64: b64, erster: pos === 0 });
        }
        const r = await C.nativePromise('OmegaSicherung', 'videoFertig', { name: name + '.' + ext, mime: rec.mime.split(';')[0] });
        showHudToast(t('Video gespeichert') + ': ' + ((r && r.ort) || ''));
        log('Onboard-Video gespeichert: ' + (r && r.ort) + ' (' + mb + ' MB)', 'ok');
      } catch (e) {
        showHudToast(t('Video speichern braucht die neue APK'));
        log('Onboard-Video: ' + ((e && e.message) || e), 'err');
      }
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name + '.' + ext;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    showHudToast(t('Video gespeichert'));
    log('Onboard-Video: ' + name + '.' + ext + ' (' + mb + ' MB)', 'ok');
  }

  // ---- Takt: Anzeige, Aufnahme, Rennablauf ----
  //
  // NUR SOLANGE DIE KAMERA AN IST. Ohne Kamera kostet dieses Modul nichts.
  function onbWacheStellen() {
    const z = onbZustand();
    const noetig = onboardAktiv() || !!z.rec;
    if (noetig && !z.wache) {
      z.zuletzt = z.testZustand || ((typeof raceState !== 'undefined') ? raceState : 'idle');
      z.wache = setInterval(() => onbWache(), 250);
      const bild = () => {
        if (!z.wache) { z.malTakt = 0; return; }
        if (z.rec) onbCanvasMalen(z.rec);
        if (typeof cockpitScreenIst === 'function' && cockpitScreenIst().id === 'onboard') onbHudMalen();
        z.malTakt = requestAnimationFrame(bild);
      };
      z.malTakt = requestAnimationFrame(bild);
    } else if (!noetig && z.wache) {
      clearInterval(z.wache); z.wache = null;
      if (z.malTakt) cancelAnimationFrame(z.malTakt);
      z.malTakt = 0;
    }
  }

  // zustandTest: nur fuer den Selbsttest (OMEGA_TEST.onboardWache), sonst raceState.
  function onbWache(zustandTest) {
    if (!zustandTest) onbVollbild(onbSchirmAktiv());
    const z = onbZustand();
    const e = onbEinst();
    if (z.rec) {
      onbRecKnopf();
      if (Date.now() - z.rec.beginn > ONB_MAX_MS) {
        showHudToast(t('Aufnahme nach 15 min beendet'));
        onbAufnahmeStopp(true);
      }
    }
    // Der Selbsttest gibt den Rennzustand vor, bis er null schickt - sonst saehe der Takt
    // dazwischen das echte 'idle' und braeche die Testaufnahme ab.
    if (zustandTest !== undefined) z.testZustand = zustandTest;
    const jetzt = z.testZustand ? z.testZustand
      : (typeof raceState !== 'undefined') ? raceState : 'idle';
    const vorher = z.zuletzt;
    if (jetzt === vorher) return;
    z.zuletzt = jetzt;
    if (jetzt === 'countdown') {
      if (e.beimStart && onboardAktiv() && typeof cockpitScreenZu === 'function') cockpitScreenZu('onboard');
      if (e.autoRec && !z.rec) onbAufnahmeStart(true);
    }
    if ((jetzt === 'racing' || jetzt === 'finishing') && z.rec) z.rec.gefahren = true;
    if (z.rec && z.rec.auto) {
      if (jetzt === 'finished') {
        const rec = z.rec;
        clearTimeout(rec.stoppTimer);
        rec.stoppTimer = setTimeout(() => { if (z.rec === rec) onbAufnahmeStopp(true); }, ONB_NACHLAUF_MS);
      } else if (jetzt === 'idle') {
        // Abgebrochen. Vor dem Losfahren (Fruehstart, Abbruch im Countdown): verwerfen,
        // es ist kein Rennen drauf. Waehrend des Rennens abgebrochen: behalten.
        onbAufnahmeStopp(z.rec.gefahren);
      }
    }
  }

  // Waehltaste (X) auf dem Onboard-Schirm: Aufnahme an/aus.
  function onboardWaehlen() {
    if (!onboardAktiv()) return false;
    onbAufnahmeUmschalten();
    return true;
  }
  function onboardMalen() { onbHudMalen(); onbRecKnopf(); onbStatus(); }

  // ---- Bedienung in der Garage (Onboard-Kamera) ----
  if ($('onboard-an')) {
    $('onboard-an').addEventListener('click', async () => {
      const e = onbEinst();
      if (e.an) { e.an = false; onbSpeichern(); onbStoppen(); return; }
      e.an = true; onbSpeichern();
      await onbStarten();
    });
  }
  if ($('onboard-quelle')) {
    $('onboard-quelle').addEventListener('change', (ev) => {
      const e = onbEinst();
      const o = ev.target.selectedOptions[0];
      e.quelle = ev.target.value;
      e.quelleName = ev.target.value && o ? o.textContent : '';
      onbSpeichern();
      if (e.an) onbStarten();
    });
  }
  [['onboard-drehen', 'drehen'], ['onboard-beim-start', 'beimStart'], ['onboard-auto-rec', 'autoRec']]
    .forEach(([id, k]) => {
      const el = $(id);
      if (!el) return;
      el.checked = !!onbEinst()[k];
      el.addEventListener('change', () => {
        onbEinst()[k] = !!el.checked;
        onbSpeichern();
        if (k === 'drehen') onbBildDrehen();
      });
    });
  if ($('onboard-rec')) $('onboard-rec').addEventListener('click', onbAufnahmeUmschalten);
  { const w = $('onboard-weiter'); if (w) w.addEventListener('click', (e) => { e.stopPropagation(); const n = $('race-screen-next'); if (n) n.click(); }); }
  if ($('onboard-art')) {
    $('onboard-art').value = onbEinst().art === 'm5' ? 'm5' : 'usb';
    $('onboard-art').addEventListener('change', (ev) => {
      const e = onbEinst();
      e.art = ev.target.value === 'm5' ? 'm5' : 'usb';
      onbSpeichern();
      onbZustand().fehler = '';
      if (e.an) onbStarten(); else onbStatus();
    });
  }
  if ($('onboard-m5-adresse')) {
    $('onboard-m5-adresse').value = onbEinst().m5 || '';
    $('onboard-m5-adresse').addEventListener('change', (ev) => {
      const e = onbEinst();
      e.m5 = String(ev.target.value || '').trim();
      onbSpeichern();
      onbZustand().fehler = '';
      if (e.an && e.art === 'm5') onbStarten(); else onbStatus();
    });
  }

  // Empfaenger wieder eingesteckt: von selbst weiter.
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', () => {
      onbQuellenFuellen();
      if (onbEinst().an && onbEinst().art !== 'm5' && !onboardAktiv()) onbStarten();
    });
  }

  // Beim Laden: war die Kamera an und ist sie schon erlaubt, gleich wieder einschalten -
  // ohne Nachfrage. Sonst wartet sie auf den Knopf (kein Kamera-Dialog beim App-Start).
  (async () => {
    onbBildDrehen();
    onbRecKnopf();
    onbStatus();
    if (!onbEinst().an) return;
    // WLAN-Kamera: keine Erlaubnis noetig, gleich verbinden.
    if (onbEinst().art === 'm5') { onbStarten(); return; }
    if (!navigator.mediaDevices) return;
    let erlaubt = false;
    try {
      const p = await navigator.permissions.query({ name: 'camera' });
      erlaubt = p.state === 'granted';
    } catch (e) { /* die App-WebView kennt die Abfrage nicht */ }
    if (erlaubt) { onbStarten(); return; }
    // Nur fuer diese Sitzung aus (nicht gespeichert): der Knopf zeigt "Einschalten".
    onbEinst().an = false;
    onbStatus();
  })();
