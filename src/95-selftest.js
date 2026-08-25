  // ============================================================================
  // Selbsttest
  // ============================================================================
  // Dreizehn Messungen an der laufenden App, auf einen Knopfdruck. Bis hierher liess sich
  // an dieser Datei nichts pruefen, ausser von Hand in der Browserkonsole - und das kann
  // niemand ausser mir. Genau das war die groesste Luecke fuer Mitarbeit.
  //
  // Drei Entscheidungen, die den Unterschied machen:
  //
  // 1. Jede Zeile nennt ihr MASS, nicht nur ihr Urteil. Ein Test, der gruen oder rot sagt,
  //    ist beim naechsten Grenzfall wertlos, weil man nicht sieht, wie knapp es war.
  // 2. "nicht pruefbar" ist ein eigenes Ergebnis und kein Fehler. Ueber file:// verbietet
  //    der Browser fetch, also sind die Tonschleifen dort nicht ladbar - das als rot zu
  //    melden waere ein Alarm, der jedes Mal falsch ist, und nach dem dritten Mal schaut
  //    niemand mehr hin.
  // 3. Die Pruefungen benutzen dieselben Funktionen wie die App, nicht nachgebaute. Ein
  //    Test mit eigener Rechnung prueft seine eigene Rechnung.
  const ST_TESTS = [];

  function stAdd(name, fn) { ST_TESTS.push({ name, fn }); }

  // ---- 1. Ist der Aufbau durchgelaufen? ----
  // Wenn diese Zeile ueberhaupt laeuft, ist die IIFE nicht abgebrochen. Interessant ist
  // deshalb nicht das Ob, sondern wieviel: ein abgebrochener Aufbau hinterlaesst leere
  // Anzeigen, und die Zahlen unten waeren null.
  stAdd('Aufbau durchgelaufen', () => {
    const regler = presetControls().length;
    const woerter = Object.keys(I18N_EN).length;
    const ok = regler > 30 && woerter > 400 && $('preset-json').value.length > 100;
    return { ok, mass: regler + ' Regler, ' + woerter + ' Woerterbucheintraege' };
  });

  // ---- 2. Protokoll: die Pruefsumme ----
  // Das Leerlaufpaket der Original-App und seine aufgezeichnete Pruefsumme. Trifft crc8()
  // sie nicht, ist die Deutung von Byte 19 falsch, und das Auto verwirft jedes Paket.
  stAdd('Protokoll: CRC-8', () => {
    const orig = new Uint8Array([0xaf, 0, 0, 0, 0, 0, 0xdf, 0, 0x80, 0,
                                 0x60, 0, 1, 0, 0x82, 4, 0, 0, 0]);
    const got = crc8(orig);
    return { ok: got === 0x33,
             mass: '0x' + got.toString(16) + ' erwartet 0x33' };
  });

  // ---- 3. Protokoll: der Streckensensor ----
  // Bit 7 in Byte 14 schaltet den Sensor AB. Diese App hat es zwoelf Aufzeichnungen lang
  // gesendet, und niemand hat es gemerkt, weil nichts danach gesehen hat. Jetzt sieht
  // etwas danach.
  stAdd('Protokoll: Sensor an (Byte 14)', () => {
    const p = buildCommandPacket(0, 0);
    const b = p[14];
    const ok = (b & 0x20) !== 0 && (b & 0x80) === 0 && crc8(p.slice(0, 19)) === p[19];
    return { ok, mass: 'Byte 14 = 0x' + b.toString(16)
                       + ', Bit 5 ' + ((b & 0x20) ? 'an' : 'AUS')
                       + ', Bit 7 ' + ((b & 0x80) ? 'AN' : 'aus') };
  });

  // ---- 4. Streckencode hin und zurueck ----
  // Der Buchstabe J (Haarnadel links) fehlte einmal im Leser, obwohl der Schreiber ihn
  // erzeugt: jede Linkshaarnadel fiel beim Einlesen still heraus.
  stAdd('Streckencode hin und zurück', () => {
    const proben = ['SG2HG2J', 'SRLRL', 'SH', 'SG3', 'SR6', 'SHJ'];
    const schlecht = [];
    for (const c of proben) {
      const p = codeToTrack(c);
      if (!p) { schlecht.push(c + ' unlesbar'); continue; }
      const zurueck = trackToCode(p.tiles, 0);
      if (zurueck !== c) schlecht.push(c + ' -> ' + zurueck);
    }
    return { ok: !schlecht.length,
             mass: schlecht.length ? schlecht.join(', ')
                                   : proben.length + ' Codes unveraendert' };
  });

  // ---- 5. Ideallinie stetig ----
  // Die Abbildung (Kachel, Phase) -> Linie darf nichts hinzufuegen: ihr groesster Schritt
  // muss dem groessten Schritt der Linie selbst entsprechen. Zwei Fehler in meiner ersten
  // Fassung sind genau daran aufgefallen, keiner davon beim Lesen.
  stAdd('Ideallinie stetig', () => {
    const proben = ['SG2RG2L', 'SRRRLLL', 'SRL', 'SHJ', 'SG2H2G2J2'];
    let schlimmster = 0, wo = '';
    for (const c of proben) {
      const p = codeToTrack(c);
      const lc = window.OMEGA_TEST.lineOf(p.tiles);
      const rows = window.OMEGA_TEST.compareLines(p.tiles, 96);
      const a = rows.map(r => r.calc);
      let sprung = 0;
      for (let i = 0; i < a.length; i++) {
        sprung = Math.max(sprung, Math.abs(a[(i + 1) % a.length] - a[i]));
      }
      // Kleine Toleranz auf den Eigenschritt der Linie: die Abtastung liegt nicht genau auf
      // ihren Punkten, also darf sie ihn um ein paar Prozent verfehlen.
      const grenze = lc.maxStep * 1.15 + 0.01;
      if (sprung > grenze) { schlimmster = Math.max(schlimmster, sprung / grenze); wo = c; }
    }
    return { ok: !wo,
             mass: wo ? wo + ': ' + schlimmster.toFixed(2) + ' mal die Eigenschrittweite'
                      : proben.length + ' Layouts ohne Sprung' };
  });

  // ---- 6. Kachelphase ----
  // Eine Haarnadel ist dreimal so lang wie eine Gerade. Rechnet die Phase mit einer
  // mittleren Kacheldauer, steht sie dort nach einem Drittel auf 1 und der Linienversatz
  // springt am Kachelwechsel.
  // Und die Probe, die die Geometrie ueberhaupt festgelegt hat: SHG4R4LG dreht 360 Grad und
  // muss sich schliessen. Der Abstand zwischen Anfang und Ende ist eine exakte Zahl, keine
  // Ansichtssache - und sie hat die gerade Sektion der Haarnadel geloest.
  stAdd('Strecken schließen sich', () => {
    // Nur Strecken, die sich WIRKLICH schliessen. SR6, SL6 und SHGHG stehen hier
    // bewusst NICHT: bei ihnen fehlt genau eine Kachel, und der Editor hat sie nur
    // deshalb als geschlossen gemeldet, weil seine Toleranz 64,5 cm betrug.
    //
    // SHG4R4LG ist die aussagekraeftigste: sie reagiert auf die gerade Sektion der
    // Haarnadel, und aus ihr ist die Geometrie geloest. SHGH und SJGJ pruefen den Radius,
    // denn dort heben sich die geraden Sektionen gegenseitig auf.
    const proben = ['SHG4R4LG', 'SJG4L4RG', 'SHGH', 'SJGJ'];
    const keep = currentTrackTiles;
    const schlecht = [];
    let groesster = 0;
    try {
      for (const c of proben) {
        currentTrackTiles = codeToTrack(c).tiles;
        const pts = trackCenterline(currentTrackTiles);
        const a = pts[0], b = pts[pts.length - 1];
        const d = Math.hypot(b.x - a.x, b.y - a.y) / TRACK_UNITS_PER_CM;
        groesster = Math.max(groesster, d);
        if (d > 0.5) schlecht.push(c + ' ' + d.toFixed(2) + ' cm');
      }
    } finally { currentTrackTiles = keep; lineCache = null; }
    return { ok: !schlecht.length,
             mass: schlecht.length ? schlecht.join(', ')
                                   : proben.length + ' Runden, groesste Luecke '
                                     + groesster.toFixed(3) + ' cm' };
  });

  // Verglichen wird gegen die GEMESSENE Laenge des gezeichneten Wegs, nicht gegen dieselbe
  // Formel: sonst prueft der Test seine eigene Rechnung. Die Abtastpunkte der Mittellinie
  // aufsummiert ergeben die Weglaenge je Kachel, voellig unabhaengig von tileLength().
  //
  // Genau hier lag ein echter Fehler: ghostTileLenFactor rechnete mit der ZAHL der
  // Abtastpunkte, und die vergibt trackCenterline nach Drehwinkel. Eine Haarnadel dreht
  // dreimal so weit wie eine 60-Grad-Kurve, hat aber den halben Radius - ihr Bogen ist nur
  // eineinhalb mal so lang. Die Phase war damit auf JEDER Kurve falsch.
  stAdd('Kachellänge trifft den Weg', () => {
    const keep = currentTrackTiles;
    try {
      currentTrackTiles = codeToTrack('SGHR').tiles;
      const lc = ghostLine();
      const pts = trackCenterline(currentTrackTiles);
      // Weglaenge je Kachel aus den Abtastpunkten.
      const laenge = currentTrackTiles.map(() => 0);
      for (let i = 1; i < pts.length; i++) {
        const t = pts[i].tile;
        if (t < 0 || t >= laenge.length) continue;
        laenge[t] += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      }
      const summe = laenge.reduce((a, b) => a + b, 0);
      const mittel = summe / laenge.length;
      let schlimmster = 0, wo = -1;
      for (let i = 0; i < laenge.length; i++) {
        const soll = laenge[i] / mittel;
        const ist = ghostTileLenFactor(i);
        const abw = Math.abs(ist - soll) / Math.max(1e-9, soll);
        if (abw > schlimmster) { schlimmster = abw; wo = i; }
      }
      return { ok: schlimmster < 0.05,
               mass: 'groesste Abweichung ' + (schlimmster * 100).toFixed(1)
                     + ' % bei Kachel ' + wo + ' von ' + laenge.length };
    } finally { currentTrackTiles = keep; lineCache = null; }
  });

  // ---- 7. und 8. Physik ----
  //
  // Geprueft wird mit dem Integrator des Modells selbst (simulateLaunch, thrustAt,
  // resistAt), nicht mit einem eigenen Lauf durch update(). Mein erster Versuch tat genau
  // das und meldete 67 statt 295 km/h - weil ein Lauf durch update() ohne die uebrigen
  // Eingaben nicht schaltet. Ein Test mit eigener Rechnung prueft seine eigene Rechnung.
  stAdd('Physik: 0 auf 100', () => {
    const r = window.OMEGA_TEST.physLaunch();
    if (!r.erreicht) return { ok: false, mass: 'Ankergeschwindigkeit nie erreicht' };
    const abw = Math.abs(r.zeit - r.soll) / r.soll;
    return { ok: abw < 0.03,
             mass: r.zeit.toFixed(3) + ' s gegen ' + r.soll.toFixed(2) + ' s Vorgabe, '
                   + (abw * 100).toFixed(2) + ' % ab' };
  });

  // Die Deckelung in update() ist die bindende Grenze fuer die angezeigte
  // Hoechstgeschwindigkeit. Der Antrieb muss sie also ERREICHEN oder uebertreffen - sonst
  // waere der Regler ein Versprechen, das die Physik nicht halten kann. Gemessen liegt die
  // freie Endgeschwindigkeit 8,7 % darueber, und das ist richtig so.
  stAdd('Physik: Antrieb erreicht die Deckelung', () => {
    const r = window.OMEGA_TEST.physTopSpeed(90);
    return { ok: r.anteil >= 1.0,
             mass: 'frei ' + r.angezeigt.toFixed(0) + ' km/h, gedeckelt auf '
                   + r.sollAngezeigt.toFixed(0) + ', Reserve '
                   + ((r.anteil - 1) * 100).toFixed(1) + ' %' };
  });

  // ---- 9. Notlauf ----
  // Leerer Tank muss das Gas absenken, und zwar BEVOR es in die Physik geht. Genau dort
  // fehlte es einmal: die Anzeige zeigte 200 km/h mit leerem Tank.
  stAdd('Notlauf bei leerem Tank', () => {
    const gemerkt = fuel;
    try {
      fuel = 0;
      const leer = fuelDamageDerate(1);
      fuel = 100;
      const voll = fuelDamageDerate(1);
      return { ok: leer < voll * 0.8,
               mass: 'Gas ' + leer.toFixed(2) + ' leer gegen ' + voll.toFixed(2) + ' voll' };
    } finally { fuel = gemerkt; }
  });

  // ---- 10. Tonschleifen ----
  // Jede Schleife muss ladbar sein, ihr Gleichanteil klein und die Naht stetig: eine
  // Schleife mit Gleichanteil knackt beim Einsetzen, eine mit Naht klickt bei jeder
  // Wiederholung. Ueber file:// nicht pruefbar, und das ist kein Fehler.
  stAdd('Tonschleifen heil', async () => {
    if (location.protocol === 'file:') {
      return { skip: true, mass: 'file://, der Browser verbietet das Laden' };
    }
    let manifest;
    try { manifest = await (await fetch('audio/loops.json')).json(); }
    catch (e) { return { skip: true, mass: 'audio/loops.json nicht ladbar' }; }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const dateien = [];
    for (const prof of Object.values(manifest)) {
      for (const l of Object.values(prof.loops || {})) if (l && l.file) dateien.push(l.file);
    }
    let schlimmsterDc = 0, schlimmsteNaht = 0, geprueft = 0;
    const kaputt = [];
    for (const name of dateien.slice(0, 40)) {
      try {
        const buf = await ctx.decodeAudioData(
          await (await fetch('audio/' + name)).arrayBuffer());
        const d = buf.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < d.length; i++) sum += d[i];
        const dc = Math.abs(sum / d.length);
        // Naht: der Sprung von der letzten Probe zur ersten, gemessen an der typischen
        // Aenderung im Inneren. Ein absoluter Wert waere bei einem leisen Leerlauf zu
        // streng und bei Vollgas zu lasch.
        // Ueber die GANZE Datei mitteln, nicht ueber die ersten 4000 Proben. Beginnt eine
        // Schleife leise, ist der Innenschritt dort winzig, und das Verhaeltnis explodiert:
        // meine erste Fassung meldete 23 von 34 Schleifen als kaputt, mit einem Maximum von
        // 116 - ein Alarm, der fast immer falsch war.
        let mittel = 0;
        for (let i = 1; i < d.length; i++) mittel += Math.abs(d[i] - d[i - 1]);
        mittel /= Math.max(1, d.length - 1);
        const naht = Math.abs(d[0] - d[d.length - 1]) / Math.max(1e-9, mittel);
        schlimmsterDc = Math.max(schlimmsterDc, dc);
        schlimmsteNaht = Math.max(schlimmsteNaht, naht);
        // Nur der Gleichanteil ist ein Urteil. Die NAHT wird gemessen und berichtet, aber
        // nicht bewertet, und das hat einen Grund: diese Dateien sind Ogg Vorbis, und
        // Vorbis ist nicht probengenau. Der Dekoder setzt an Anfang und Ende
        // Fensterartefakte, also wird aus einer zirkular nahtlos gebauten WAV eine Ogg mit
        // Sprung an der Naht. Gemessen 0,17 bis 1,53 mal den Effektivwert - das sagt etwas
        // ueber den Kodierer und nichts ueber die Schleife. Wer die Naht wirklich pruefen
        // will, muss die WAVs in audio-work/ nehmen.
        if (dc > 0.01) kaputt.push(name + ' (Gleichanteil ' + dc.toFixed(4) + ')');
        geprueft++;
      } catch (e) { kaputt.push(name + ' (nicht dekodierbar)'); }
    }
    try { ctx.close(); } catch (e) { /* egal */ }
    return { ok: !kaputt.length,
             mass: geprueft + ' Schleifen, Gleichanteil max ' + schlimmsterDc.toFixed(4)
                   + ' (Grenze 0.01), Naht max ' + schlimmsteNaht.toFixed(1)
                   + ' mal der Innenschritt (gemessen, nicht bewertet: Ogg ist nicht'
                   + ' probengenau)'
                   + (kaputt.length ? ' | ' + kaputt.join(', ') : '') };
  });

  // ---- 11. Kontrast ----
  // Deckkraft richtig ueberlagern, sonst liest man rgba(255,255,255,.035) auf Schwarz als
  // Weiss und meldet 36 Knoepfe als Fehler, die keine sind. Genau das ist mir passiert.
  function stMix(vorder, hinter) {
    const a = vorder[3] === undefined ? 1 : vorder[3];
    return [0, 1, 2].map(i => vorder[i] * a + hinter[i] * (1 - a));
  }

  function stParse(c) {
    const m = String(c).match(/[\d.]+/g);
    if (!m) return null;
    const v = m.map(Number);
    return [v[0], v[1], v[2], v.length > 3 ? v[3] : 1];
  }

  function stLum(rgb) {
    const f = rgb.slice(0, 3).map(v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  }

  function stBackdrop(el) {
    // Von unten nach oben ueberlagern, bis eine deckende Flaeche kommt. Der erste
    // nicht-transparente Hintergrund allein genuegt nicht: eine halbdurchsichtige Flaeche
    // ueber Schwarz ist nicht ihre eigene Farbe.
    //
    // Und die Kette beginnt beim Element SELBST, nicht beim Elternteil. Ein Knopf traegt
    // seine eigene Flaeche, und der Text sitzt darauf. Meine erste Fassung fing beim
    // Elternteil an und meldete den gruenen Verbinden-Knopf mit 1,13:1 - gemessen gegen
    // die Karte hinter ihm statt gegen sein eigenes Gruen.
    const kette = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const bg = stParse(getComputedStyle(n).backgroundColor);
      if (bg && bg[3] > 0) kette.push(bg);
      if (bg && bg[3] >= 0.999) break;
    }
    let unten = [0, 0, 0];
    for (let i = kette.length - 1; i >= 0; i--) unten = stMix(kette[i], unten);
    return unten;
  }

  stAdd('Kontrast (WCAG)', () => {
    let schlimmster = 99, wo = '';
    let geprueft = 0;
    const sel = 'p, span, b, div.opt-label, label, h1, h2, h3, td, th, li, button';
    for (const el of document.querySelectorAll(sel)) {
      if (!el.textContent.trim()) continue;
      // Unsichtbares und Abgeschaltetes ist ausgenommen: 1.4.3 gilt nicht fuer
      // deaktivierte Bedienelemente, und was niemand sieht, muss nichts erfuellen.
      if (el.disabled || el.closest('[hidden]') || el.closest('.tabpage:not(.active)')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
      const vg = stParse(cs.color);
      if (!vg) continue;
      const hg = stBackdrop(el);
      const l1 = stLum(stMix(vg, hg)), l2 = stLum(hg);
      const k = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const gross = parseFloat(cs.fontSize) >= 24
                    || (parseFloat(cs.fontSize) >= 18.66 && +cs.fontWeight >= 700);
      const grenze = gross ? 3.0 : 4.5;
      geprueft++;
      if (k < grenze && k < schlimmster) {
        schlimmster = k;
        wo = (el.tagName.toLowerCase() + ' "' + el.textContent.trim().slice(0, 24) + '"');
      }
    }
    return { ok: !wo,
             mass: geprueft + ' sichtbare Textstellen'
                   + (wo ? ', schlechteste ' + schlimmster.toFixed(2) + ':1 bei ' + wo
                         : ', alle ueber dem Mindestwert') };
  });

  // ---- 12. Sprache ----
  // Im englischen Modus darf kein deutscher Satz stehen bleiben, ausser in der Doku und im
  // Arbeitsprotokoll. Jeder neue deutsche Text braucht einen Woerterbucheintrag, sonst
  // steigt diese Zahl - und genau dann faellt es auf.
  stAdd('Sprache: nichts Deutsches im Englischen', () => {
    const vorher = lang;
    try {
      if (lang !== 'en') setLang('en');
      const DE = /[äöüßÄÖÜ]|\b(der|die|und|nicht|eine|mit|für|ist|sind|wird|wenn|auch|über|nach|beim|dann|aber|noch|kann|muss|sich|dem|den|des|zum|zur|aus|bei|nur|schon|sehr)\b/;
      const rest = new Set();
      for (const root of i18nRoots()) {
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
          acceptNode(n) {
            const p = n.parentElement;
            if (!p) return NodeFilter.FILTER_REJECT;
            if (['SCRIPT', 'STYLE', 'CODE', 'KBD'].indexOf(p.tagName) >= 0) {
              return NodeFilter.FILTER_REJECT;
            }
            // Ausgenommen: die Doku (bleibt deutsch), das Arbeitsprotokoll, die
            // Meldungszeile im Schirm und die Messspalte DIESES Tests. Die letzten drei
            // sind Messwerte und Zustandsmeldungen, kein Oberflaechentext - der Test hat
            // sonst sich selbst gemeldet ("Byte 14 = 0x22, Bit 5 an, Bit 7 aus").
            // Der feste Text der Selbsttestseite wird weiter geprueft, er steht ausserhalb
            // von #st-rows.
            if (p.closest('[data-i18n-skip]') || p.closest('#tab-doc')
                || p.closest('#log') || p.closest('#st-rows') || p.closest('#hud-toast')
                || p.id === 'st-status') {
              return NodeFilter.FILTER_REJECT;
            }
            return n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
          },
        });
        let n;
        while ((n = w.nextNode())) {
          const t = n.nodeValue.replace(/\s+/g, ' ').trim();
          if (t.length >= 4 && DE.test(t)) rest.add(t);
        }
      }
      const bsp = [...rest][0];
      return { ok: rest.size === 0,
               mass: rest.size === 0 ? 'kein deutscher Text'
                                     : rest.size + ' Stellen, z. B. "' + bsp.slice(0, 46) + '"' };
    } finally { if (lang !== vorher) setLang(vorher); }
  });

  // ---- 13. Rundenzaehlung ----
  // Drei Ueberfahrten muessen drei Runden ergeben, und die Anzeige muss bei 0 anfangen. Die
  // Statuszeile zaehlte einmal die laufende Runde mit, der Zaehler im Cockpit nicht: zwei
  // Anzeigen derselben Sache, die sich um eins unterschieden.
  stAdd('Rundenzählung fängt bei 0 an', () => {
    // Auch die ANZEIGE merken, nicht nur die Variablen. Ohne das blieb
    // "Rennen laeuft, Runde 3" im Schirm stehen, und die Sprachpruefung des naechsten
    // Laufs meldete es als deutschen Text im englischen Modus - voellig zu Recht. Ein Test,
    // der die Oberflaeche anfasst, muss sie auch zuruecklegen.
    const anzeige = $('race-status') ? $('race-status').textContent : null;
    const gemerkt = { state: raceState, laps: raceLapTimes.slice(),
                      start: raceLapStart, dash: dashLapStart, part: racePartialMs };
    try {
      raceState = 'racing';
      raceLapTimes = [];
      raceLapStart = Date.now();
      dashLapStart = Date.now();
      racePartialMs = null;
      const bei0 = raceLapTimes.length;
      for (let i = 0; i < 3; i++) playerLapCrossed();
      return { ok: bei0 === 0 && raceLapTimes.length === 3,
               mass: 'Start ' + bei0 + ', nach drei Überfahrten '
                     + raceLapTimes.length };
    } finally {
      raceState = gemerkt.state; raceLapTimes = gemerkt.laps;
      raceLapStart = gemerkt.start; dashLapStart = gemerkt.dash;
      racePartialMs = gemerkt.part;
      if (anzeige !== null) $('race-status').textContent = anzeige;
    }
  });

  // ---- Ausfuehren und anzeigen ----
  async function runSelfTest() {
    const rows = $('st-rows');
    $('st-run').disabled = true;
    $('st-status').textContent = 'laeuft …';
    rows.innerHTML = ST_TESTS.map(t =>
      '<tr class="st-run"><td>' + t.name + '</td><td>…</td><td></td></tr>').join('');
    let gut = 0, schlecht = 0, offen = 0;
    for (let i = 0; i < ST_TESTS.length; i++) {
      const t = ST_TESTS[i];
      let r;
      try {
        r = await t.fn();
      } catch (e) {
        // Eine geworfene Ausnahme IST ein Ergebnis, und zwar das wichtigste: der Test
        // konnte nicht bis zu seinem Urteil kommen.
        r = { ok: false, mass: 'Ausnahme: ' + (e && e.message ? e.message : String(e)) };
      }
      const urteil = r.skip ? ['?', 'st-skip'] : r.ok ? ['ok', 'st-ok'] : ['FEHLER', 'st-bad'];
      if (r.skip) offen++; else if (r.ok) gut++; else schlecht++;
      const tr = rows.children[i];
      tr.className = '';
      tr.children[1].innerHTML = '<span class="' + urteil[1] + '">' + urteil[0] + '</span>';
      tr.children[2].textContent = r.mass || '';
      // Nach jedem Test dem Browser Luft lassen, sonst steht die Tabelle bis zum Ende leer
      // und man weiss nicht, ob noch etwas passiert.
      //
      // setTimeout und NICHT requestAnimationFrame: rAF feuert nur, wenn die Seite
      // tatsaechlich gezeichnet wird. In einem Hintergrundtab oder einem nicht angezeigten
      // Fenster kommt es nie, und der Testlauf bleibt nach der ersten Zeile stehen - genau
      // das ist mir beim Pruefen passiert, und es traefe jeden, der waehrend des Laufs den
      // Tab wechselt.
      await new Promise(res => setTimeout(res, 0));
    }
    $('st-run').disabled = false;
    $('st-status').textContent = gut + ' ok, ' + schlecht + ' Fehler'
                                + (offen ? ', ' + offen + ' nicht prüfbar' : '');
    log('Selbsttest: ' + gut + ' ok, ' + schlecht + ' Fehler'
        + (offen ? ', ' + offen + ' nicht pruefbar' : '') + '.',
        schlecht ? 'err' : 'info');
  }

  if ($('st-run')) $('st-run').addEventListener('click', runSelfTest);

