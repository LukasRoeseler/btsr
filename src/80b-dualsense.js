  // ============================== DUALSENSE-TRIGGER (v1.1.3, WIP) ==============================
  //
  // BESTELLT: "Wenn ABS an ist, ein DualSense-Triggereffekt auf dem linken Trigger (falls er
  // zugewiesen ist)." Die Gamepad-API erreicht die adaptiven Trigger nicht (siehe triggerRuettle in
  // 40-physics.js). Der einzige Weg im Browser ist WebHID: Chrome/Edge am Rechner, mit einmaliger
  // Freigabe ueber den Knopf in Optionen > Allgemein. In der APK (WebView) gibt es kein WebHID.
  //
  // Der Ausgabebericht des DualSense (offen dokumentiert, z. B. im Linux-Treiber hid-playstation):
  //   USB:       Bericht 0x02, 47 Byte: [0] valid_flag0 (0x04 rechter, 0x08 linker Trigger), ...,
  //              [10..20] Effekt rechter Trigger, [21..31] Effekt linker Trigger.
  //   Bluetooth: Bericht 0x31, 77 Byte: [0] Folge<<4, [1] 0x10, dann dieselben 47 Byte, am Ende
  //              CRC-32 (Startbyte 0xA2, dann Berichtskennung und Daten), little endian.
  // Effekt "Vibration" (0x26): Zonen ab Position aktiv, Staerke je Zone (3 Bit), Frequenz in Hz.
  // "Aus" ist 0x05 mit Nullen. Ohne Geraet am Tisch geschrieben - deshalb WIP.
  const DS_VENDOR = 0x054c, DS_PRODUKTE = [0x0ce6, 0x0df2];
  const DS_ABS = { position: 2, staerke: 6, frequenz: 28 };
  let dsGeraet = null, dsBt = false, dsFolge = 0, dsZustand = null, dsFehler = '';

  function dsVibration(position, staerke, frequenz) {
    const e = new Uint8Array(11);
    let zonen = 0, staerken = 0;
    const s = Math.max(0, Math.min(7, staerke - 1));
    for (let i = Math.max(0, Math.min(9, position)); i < 10; i++) { zonen |= 1 << i; staerken |= s << (3 * i); }
    e[0] = 0x26;
    e[1] = zonen & 0xff; e[2] = (zonen >> 8) & 0xff;
    e[3] = staerken & 0xff; e[4] = (staerken >>> 8) & 0xff; e[5] = (staerken >>> 16) & 0xff; e[6] = (staerken >>> 24) & 0xff;
    e[9] = frequenz & 0xff;
    return e;
  }
  function dsAus() { const e = new Uint8Array(11); e[0] = 0x05; return e; }
  // v1.5.29: WIDERSTAND ueber den Weg (Effekt "Feedback" 0x21, dieselbe Packung wie die Vibration ohne Frequenz):
  // ab Zone start (0..9) waechst die Staerke von s0 bis s1 (1..8). So wird ein Pedal nach unten fester.
  function dsWiderstand(start, s0, s1) {
    const e = new Uint8Array(11);
    let zonen = 0, staerken = 0;
    const a = Math.max(0, Math.min(9, start));
    for (let i = a; i < 10; i++) {
      const k = a === 9 ? 1 : (i - a) / (9 - a);
      const st = Math.max(0, Math.min(7, Math.round(s0 + (s1 - s0) * k) - 1));
      zonen |= 1 << i; staerken |= st << (3 * i);
    }
    e[0] = 0x21;
    e[1] = zonen & 0xff; e[2] = (zonen >> 8) & 0xff;
    e[3] = staerken & 0xff; e[4] = (staerken >>> 8) & 0xff; e[5] = (staerken >>> 16) & 0xff; e[6] = (staerken >>> 24) & 0xff;
    return e;
  }
  // ---- TRIGGER WIE BEI LIBRECORSA (v1.5.29, WIP) -----------------------------------------------------
  // BESTELLT: "Die Trigger-Effekte vom DualSense sollten, wenn sie gehen, immer so wie die bei LibreCorsa sein."
  // Nach der Beschreibung dort (kein Code uebernommen): L2 ist das Bremspedal, ein Widerstand, der ueber den Weg
  // fester wird; regelt das ABS, vibriert er (20 Hz), blockiert ein Rad (12 Hz); ohne ABS nahe der Haftgrenze ein
  // leichtes Summen (40 Hz). R2 ist das Gas: leichter Widerstand; drehen die Hinterraeder durch, vibriert er (35 Hz),
  // regelt die Traktionskontrolle (18 Hz); ohne TC nahe der Grenze ein schwaches Summen (40 Hz). Ein Effekt bleibt
  // DS_HALTE_MS stehen, damit ein Signal, das nur ein Bild flackert, nicht zwischen den Arten springt.
  // Gilt in allen Fahrgefuehlen mit Physik, echt und virtuell. RC (ohne Physik): Trigger aus.
  const DS_HZ = { abs: 20, block: 12, tc: 18, spin: 35, grenze: 40 };
  const DS_HALTE_MS = 150;
  // Rein, fuer den Selbsttest: aus dem Zustand die Art je Trigger. e: { physik, bremse (0..1), gas (0..1), abs (bool),
  // absAn (Hilfe aktiv), tcAn, nutzV, nutzH (Ausnutzung der Haftung vorn/hinten, 1 = Grenze), kmh }.
  function dsTriggerArt(e) {
    if (!e || !e.physik) return { links: 'aus', rechts: 'aus' };
    let links = 'pedal', rechts = 'gas';
    if (e.bremse > 0.05) {
      if (e.abs) links = 'abs';
      else if (!e.absAn && e.nutzV > 1.05 && e.kmh > 5) links = 'block';
      else if (!e.absAn && e.nutzV > 0.9) links = 'grenze';
    }
    if (e.gas > 0.4) {
      if (e.nutzH > 1.0) rechts = e.tcAn ? 'tc' : 'spin';
      else if (!e.tcAn && e.nutzH > 0.9) rechts = 'grenze';
    }
    return { links, rechts };
  }
  function dsEffekt(art, links) {
    switch (art) {
      case 'pedal': return dsWiderstand(1, 2, 7);           // Bremse: wird nach unten fester
      case 'gas': return dsWiderstand(1, 2, 3);             // Gas: leicht
      case 'abs': return dsVibration(2, 6, DS_HZ.abs);
      case 'block': return dsVibration(2, 7, DS_HZ.block);
      case 'tc': return dsVibration(1, 5, DS_HZ.tc);
      case 'spin': return dsVibration(1, 6, DS_HZ.spin);
      case 'grenze': return dsVibration(links ? 3 : 2, 2, DS_HZ.grenze);
      default: return dsAus();
    }
  }
  const dsHalt = { links: { art: 'aus', bis: 0 }, rechts: { art: 'aus', bis: 0 } };
  // Haelt eine Vibration DS_HALTE_MS fest: eine neue Art gilt sofort, das Zurueckfallen auf den Grundzustand erst danach.
  function dsHalten(seite, art, jetzt) {
    const h = dsHalt[seite];
    const grund = art === 'pedal' || art === 'gas' || art === 'aus';
    if (!grund) { h.art = art; h.bis = jetzt + DS_HALTE_MS; return art; }
    if (h.bis > jetzt && h.art !== 'aus' && h.art !== 'pedal' && h.art !== 'gas') return h.art;
    h.art = art; h.bis = 0;
    return art;
  }
  // Die 47 Byte, die USB und Bluetooth gemeinsam haben.
  function dsGemeinsam(links, rechts) {
    const c = new Uint8Array(47);
    c[0] = 0x0C;                 // linker (0x08) + rechter (0x04) Trigger
    if (rechts) c.set(rechts, 10);
    if (links) c.set(links, 21);
    return c;
  }
  let dsCrcTab = null;
  function dsCrc32(bytes) {
    if (!dsCrcTab) {
      dsCrcTab = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        dsCrcTab[n] = c >>> 0;
      }
    }
    let crc = 0xffffffff;
    for (const b of bytes) crc = dsCrcTab[(crc ^ b) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  // Rein, fuer den Selbsttest: die Bytes eines Berichts (ohne Berichtskennung) und die Kennung.
  function dsBericht(links, rechts, bt, folge) {
    const c = dsGemeinsam(links, rechts);
    if (!bt) return { id: 0x02, daten: c };
    const d = new Uint8Array(77);
    d[0] = (folge & 0x0f) << 4;
    d[1] = 0x10;
    d.set(c, 2);
    const fuerCrc = new Uint8Array(1 + 1 + 73);
    fuerCrc[0] = 0xa2; fuerCrc[1] = 0x31; fuerCrc.set(d.subarray(0, 73), 2);
    const crc = dsCrc32(fuerCrc);
    d[73] = crc & 0xff; d[74] = (crc >>> 8) & 0xff; d[75] = (crc >>> 16) & 0xff; d[76] = (crc >>> 24) & 0xff;
    return { id: 0x31, daten: d };
  }
  async function dsSenden(links, rechts) {
    if (!dsGeraet) return;
    const b = dsBericht(links, rechts, dsBt, dsFolge);
    dsFolge = (dsFolge + 1) & 0x0f;
    try { await dsGeraet.sendReport(b.id, b.daten); dsFehler = ''; }
    catch (e) { dsFehler = e.message || String(e); }
    dsLageZeigen();
  }
  function dsLageZeigen() {
    const el = $('ds-lage');
    if (!el) return;
    el.textContent = !('hid' in navigator) ? t('Nur in Chrome/Edge am Rechner (WebHID)')
      : !dsGeraet ? t('nicht verbunden')
      : (dsGeraet.productName || 'DualSense') + (dsBt ? ' · Bluetooth' : ' · USB') + (dsFehler ? ' · ' + dsFehler : '');
  }
  async function dsVerbinden() {
    if (!('hid' in navigator)) { dsLageZeigen(); return; }
    try {
      const liste = await navigator.hid.requestDevice({ filters: DS_PRODUKTE.map((p) => ({ vendorId: DS_VENDOR, productId: p })) });
      const g = liste && liste[0];
      if (!g) return;
      if (!g.opened) await g.open();
      dsGeraet = g;
      // Ueber Bluetooth meldet der DualSense den Ausgabebericht 0x31, ueber USB 0x02.
      dsBt = (g.collections || []).some((c) => (c.outputReports || []).some((r) => r.reportId === 0x31));
      dsZustand = null;
      dsLageZeigen();
      await dsSenden(dsAus(), dsAus());
    } catch (e) { dsFehler = e.message || String(e); dsLageZeigen(); }
  }
  // Der linke Trigger ist die Bremse, wenn sie auf Knopf 6 liegt (Vorgabe).
  function dsBremseLinks() {
    return !!(typeof bindings !== 'undefined' && bindings.brake && bindings.brake.type === 'button' && bindings.brake.index === 6);
  }
  // Der rechte Trigger ist das Gas, wenn es auf Knopf 7 liegt (Vorgabe).
  function dsGasRechts() {
    return !!(typeof bindings !== 'undefined' && bindings.throttle && bindings.throttle.type === 'button' && bindings.throttle.index === 7);
  }
  // v1.5.29: der Drehzahl-Hinweis auf dem Gas (v1.3.107) entfaellt; LibreCorsa zeigt die Drehzahl am Leuchtbalken,
  // nicht am Trigger, und ein summendes Gas stoerte beim echten Fahren die feine Dosierung.
  function dsEingang() {
    const st = physEngine && physEngine.state;
    const an = !!($('vib-trigger') ? $('vib-trigger').checked : true);
    if (!an || !physicsEnabled || !st) return { physik: false };
    return {
      physik: true,
      bremse: dsBremseLinks() ? Math.max(0, -(st.longUse || 0)) : 0,
      gas: dsGasRechts() ? Math.max(0, st.longUse || 0) : 0,
      abs: !!st.absActive && !!($('vib-abs') ? $('vib-abs').checked : true),
      absAn: true,
      tcAn: (st.setupTc || 0) > 0,
      nutzV: st.pacNutzV || 0, nutzH: st.pacNutzH || 0,
      kmh: Math.abs(st.speedKmh || 0),
    };
  }
  function dsTick() {
    if (!dsGeraet) return;
    const jetzt = performance.now();
    const a = dsTriggerArt(dsEingang());
    const l = dsBremseLinks() ? dsHalten('links', a.links, jetzt) : 'aus';
    const r = dsGasRechts() ? dsHalten('rechts', a.rechts, jetzt) : 'aus';
    const schluessel = l + '|' + r;
    if (schluessel === dsZustand) return;
    dsZustand = schluessel;
    dsSenden(dsEffekt(l, true), dsEffekt(r, false));
  }
  setInterval(dsTick, 60);
  if ($('ds-verbinden')) $('ds-verbinden').addEventListener('click', dsVerbinden);

  // ---- v1.5 (WIP, Plan Paket 6): TRIGGER UEBER USB IN DER ANDROID-APP, Stufe 1: Pruefknopf ----------------
  // Die WebView hat kein WebHID. OmegaDsUsbPlugin.java schreibt denselben USB-Bericht (0x02, 63 Bytes: Kennung,
  // die 47 Bytes aus dsGemeinsam, Rest 0) ueber die USB-Host-API. Erst wenn der Nutzer meldet, dass die Trigger
  // reagieren UND die Tasten danach noch gehen, wird daraus der Dauerbetrieb im Fahren.
  function dsUsbApp() { const C = window.Capacitor; return !!(C && C.isNativePlatform && C.isNativePlatform()); }
  function dsUsbPlugin() { const C = window.Capacitor; return dsUsbApp() && C.isPluginAvailable && C.isPluginAvailable('OmegaDsUsb'); }
  function dsUsbBericht(links, rechts) {
    const b = dsBericht(links, rechts, false, 0);
    const out = new Uint8Array(63);
    out[0] = b.id;
    out.set(b.daten, 1);
    return out;
  }
  function dsUsbBase64(bytes) { let s = ''; bytes.forEach((x) => { s += String.fromCharCode(x); }); return btoa(s); }
  // Die Probe: 3 s Widerstand (beide fest), 2 s Vibration (links ABS, rechts durchdrehend), aus.
  function dsUsbFolge() {
    return [
      { bericht: dsUsbBase64(dsUsbBericht(dsWiderstand(1, 8, 8), dsWiderstand(1, 8, 8))), ms: 3000 },
      { bericht: dsUsbBase64(dsUsbBericht(dsVibration(2, 7, DS_HZ.abs), dsVibration(1, 6, DS_HZ.spin))), ms: 2000 },
      { bericht: dsUsbBase64(dsUsbBericht(dsAus(), dsAus())), ms: 0 },
    ];
  }
  function dsUsbLage(text) { const el = $('ds-usb-lage'); if (el) el.textContent = text; }
  async function dsUsbTest() {
    if (!dsUsbPlugin()) { dsUsbLage(t('Braucht die neue APK.')); return; }
    const C = window.Capacitor;
    dsUsbLage(t('Läuft …'));
    try {
      const r = await C.nativePromise('OmegaDsUsb', 'test', { folge: dsUsbFolge() });
      log('DualSense USB-Probe:\n' + ((r && r.protokoll) || ''), r && r.ok ? 'ok' : 'err');
      dsUsbLage(r && r.ok ? t('Gesendet ({w}). Haben die Trigger reagiert?').replace('{w}', r.weg || '?') : t('Fehler, siehe Live-Log.'));
    } catch (e) {
      log('DualSense USB-Probe: ' + ((e && e.message) || e), 'err');
      dsUsbLage((e && e.message) || String(e));
    }
  }
  if ($('ds-usb-zeile')) $('ds-usb-zeile').hidden = !dsUsbApp();
  if ($('ds-usb-test')) $('ds-usb-test').addEventListener('click', dsUsbTest);
  if ('hid' in navigator) {
    navigator.hid.addEventListener('disconnect', (e) => { if (e.device === dsGeraet) { dsGeraet = null; dsLageZeigen(); } });
  }
  dsLageZeigen();
