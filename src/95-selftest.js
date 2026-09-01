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
  // Geprueft wird die ZUORDNUNG der beiden Lesearten, nicht eine Wunschstellung.
  //
  // Vorher hiess diese Pruefung "Sensor an" und verlangte Bit 5 an und Bit 7 aus. Seit dem
  // 26.08. ist gemessen, dass beides gleichwertige Lesearten sind: Bit 5 liest die Schiene,
  // Bit 7 liest gedruckte Muster. Die alte Fassung haette also rot gemeldet, sobald jemand
  // in den Ausdruck-Modus schaltet - genau dann, wenn alles richtig ist.
  //
  // Die pruefbare Zusicherung ist stattdessen: der Schalter setzt in beide Richtungen genau
  // EIN der beiden Bits, nie beide und nie keins, und die Pruefsumme stimmt in beiden
  // Stellungen.
  stAdd('Protokoll: Byte 14 waehlt genau eine Leseart', () => {
    const sw = $('setting-ontrack');
    if (!sw) return { skip: true, mass: 'Schalter nicht im Dokument' };
    const gemerkt = sw.checked;
    try {
      const lies = () => {
        const p = buildCommandPacket(0, 0);
        return { b: p[14], crc: crc8(p.slice(0, 19)) === p[19] };
      };
      sw.checked = true; sw.dispatchEvent(new Event('change', { bubbles: true }));
      const schiene = lies();
      sw.checked = false; sw.dispatchEvent(new Event('change', { bubbles: true }));
      const druck = lies();
      const nurEins = (b) => (((b & 0x20) ? 1 : 0) + ((b & 0x80) ? 1 : 0)) === 1;
      // Die Bits ABLESEN und nicht behaupten: die erste Fassung schrieb "(Bit 7)" auch
      // dahin, wo 0x22 stand, und hat damit den Fehler beschriftet statt ihn zu zeigen.
      const bits = (b) => '(' + [(b & 0x20) ? 'Bit 5' : null, (b & 0x80) ? 'Bit 7' : null]
        .filter(Boolean).join(' + ') + ')' || '(kein Modusbit)';
      const ok = (schiene.b & 0x20) !== 0 && (schiene.b & 0x80) === 0
                 && (druck.b & 0x80) !== 0 && (druck.b & 0x20) === 0
                 && nurEins(schiene.b) && nurEins(druck.b)
                 && schiene.crc && druck.crc;
      return { ok,
               mass: 'Schiene 0x' + schiene.b.toString(16) + ' ' + bits(schiene.b)
                     + ', Ausdruck 0x' + druck.b.toString(16) + ' ' + bits(druck.b)
                     + ', Pruefsumme beide '
                     + (schiene.crc && druck.crc ? 'ok' : 'FALSCH') };
    } finally {
      sw.checked = gemerkt;
      sw.dispatchEvent(new Event('change', { bubbles: true }));
    }
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

  // ---- Cockpit-Anzeigen reagieren aufs Fahren ----
  //
  // DIESER TEST HAETTE EINEN ECHTEN FEHLER GEFUNDEN. Beim Umbau der Reifenkachel auf vier
  // Reifen wurde die Bremstemperatur-Anzeige mitgeloescht: das Element blieb im Dokument,
  // geschrieben hat es niemand mehr. Gemeldet wurde es als "die Temperatur reagiert nicht auf
  // mein Fahren" - und kein vorhandener Test konnte es melden. Der Bauschritt prueft
  // Zugriffe ins LEERE, aber ein Element, das DA ist und das niemand beschreibt, ist keiner.
  //
  // Deshalb geht dieser Test den Weg der Beschwerde: er faehrt und sieht nach, ob sich die
  // Anzeigen dabei aendern.
  stAdd('Cockpit-Anzeigen reagieren aufs Fahren', () => {
    const st = physEngine.state, cfg = physEngine.config;
    const lesen = () => ({
      tempo: ($('race-speed') || {}).textContent,
      reifen: ($('race-tyre-temp') || {}).textContent,
      gang: ($('race-gear') || {}).textContent,
      // Die Scheibe ist seit v0.5 ein EIGENES Rechteck an der Innenseite und kein Ring im
      // Reifen mehr. Gelesen wird ihre Fuellfarbe, denn die traegt die Temperatur.
      scheibeV: ($('race-disc-fl') ? $('race-disc-fl').style.background : null),
      profil: ($('race-tyre-fl') && $('race-tyre-fl').firstChild
               ? $('race-tyre-fl').firstChild.style.height : null),
    });
    const merkState = OMEGA_TEST.zustandKopie(st);
    const merkCfg = Object.assign({}, cfg);
    try {
      // Kalter, langsamer Ausgangszustand - und die drei Modelle sicher AN, damit der Test
      // nicht davon abhaengt, welche Voreinstellung gerade gilt.
      cfg.tyreEffect = 1; cfg.brakeFadeEffect = 1; cfg.tyreAsymEffect = 1;
      st.speedKmh = 0; st.currentGear = 0; st.driveMode = 'forward';
      st.tyreTempC = cfg.tyreAmbientC; st.tyreWear = 0;
      st.tyreWearL = 0; st.tyreWearR = 0;
      st.brakeTempF = cfg.brakeAmbientC; st.brakeTempR = cfg.brakeAmbientC;
      st.brakeFade = 0; st.longUse = 0; st.loadFront = 0.5;
      updateDashboard(physEngine.update({ throttle: 0, brake: 0, steering: 0 }, 0.02));
      const vorher = lesen();

      // Und jetzt fahren: beschleunigen, lenken, dann hart bremsen. Genau die drei Sachen,
      // die Tempo, Reifen und Scheiben bewegen muessen.
      for (let i = 0; i < 240; i++) {
        st.speedKmh = 180 / REAL_SCALE;      // Fahrt halten, damit die Arbeit gross bleibt
        physEngine.update({ throttle: 0.6, brake: 0, steering: 0.8 }, 0.02);
      }
      for (let i = 0; i < 240; i++) {
        st.speedKmh = 180 / REAL_SCALE;
        physEngine.update({ throttle: 0, brake: 1, steering: 0.2 }, 0.02);
      }
      updateDashboard(physEngine.update({ throttle: 0, brake: 1, steering: 0.2 }, 0.02));
      const nachher = lesen();

      const stumm = [];
      for (const k of Object.keys(vorher)) {
        if (vorher[k] === nachher[k]) stumm.push(k);
      }
      return {
        ok: stumm.length === 0,
        mass: 'Reifen "' + vorher.reifen + '" -> "' + nachher.reifen + '"'
            + ' | Profil ' + vorher.profil + ' -> ' + nachher.profil
            + ' | Scheibe ' + (vorher.scheibeV || '-') + ' -> ' + (nachher.scheibeV || '-')
            + (stumm.length ? ' | STUMM: ' + stumm.join(', ') : ''),
      };
    } finally {
      Object.assign(cfg, merkCfg);
      physEngine.calibrateAccel();
      OMEGA_TEST.zustandZurueck(st, merkState);
    }
  });

  // ---- Block 4.1: Bremstemperatur und Fading ----
  //
  // ZWEI BEDINGUNGEN, und die erste ist die, die schiefgehen kann ohne aufzufallen: eine
  // EINZELNE Vollbremsung aus kalten Scheiben darf nicht faden. Die gefittete Bremstabelle
  // (RMSE 3,1 %) ist an genau dieser Bremsung gemessen; wuerde sie faden, waere nicht die
  // Simulation tiefer, sondern die Kalibrierung kaputt.
  //
  // Die zweite: mehrere hintereinander MUESSEN faden, sonst ist der Zusatz Zierde. Dieser
  // Test hat einen echten Fehler gefunden - die erste Fassung der Kuehlung war um den Faktor
  // 100 zu stark, und fuenf Vollbremsungen aus 250 km/h erreichten 111 statt 601 Grad.
  stAdd('Bremsfading: eine Bremsung nicht, acht schon', () => {
    if (!window.OMEGA_TEST || !OMEGA_TEST.physBrakeHeat) {
      return { skip: true, mass: 'physBrakeHeat nicht vorhanden' };
    }
    const eine = OMEGA_TEST.physBrakeHeat({ kmh: 250, wiederholungen: 1 });
    const acht = OMEGA_TEST.physBrakeHeat({ kmh: 250, wiederholungen: 8 });
    const aus = OMEGA_TEST.physBrakeHeat({ kmh: 250, wiederholungen: 8,
                                          cfg: { brakeFadeEffect: 0 } });
    const laenger = (acht.letzterWeg - eine.letzterWeg) / eine.letzterWeg;
    const ok = eine.maxFade === 0            // eine Bremsung fadet nicht
      && acht.maxFade > 0.05                 // acht schon
      && laenger > 0.08                      // und das kostet Bremsweg
      && Math.abs(aus.letzterWeg - eine.letzterWeg) < 3;  // mit Regler aus: kein Unterschied
    return { ok,
      mass: '1x: ' + eine.tempF + '\u00b0 vorn, Fading ' + (eine.maxFade * 100).toFixed(1)
          + ' %, ' + eine.letzterWeg + ' m | 8x: ' + acht.tempF + '\u00b0, '
          + (acht.maxFade * 100).toFixed(1) + ' %, ' + acht.letzterWeg + ' m ('
          + (laenger * 100).toFixed(0) + ' % laenger) | Regler aus: ' + aus.letzterWeg + ' m' };
  });

  // ---- Block 4.3: asymmetrischer Reifenverschleiss ----
  //
  // Die richtige Seite muss mehr abnutzen - eine Rechtskurve die LINKE. Und der MITTELWERT
  // muss derselbe bleiben wie ohne Asymmetrie: sonst waere der Schalter auch ein
  // Verschleiss-Regler, und dann liesse sich nicht messen, was er tut.
  stAdd('Reifen links/rechts: richtige Seite, gleicher Mittelwert', () => {
    if (!window.OMEGA_TEST || !OMEGA_TEST.physTyreAsym) {
      return { skip: true, mass: 'physTyreAsym nicht vorhanden' };
    }
    const re = OMEGA_TEST.physTyreAsym({ steering: 0.7, sekunden: 40 });
    const li = OMEGA_TEST.physTyreAsym({ steering: -0.7, sekunden: 40 });
    const sy = OMEGA_TEST.physTyreAsym({ steering: 0.7, sekunden: 40,
                                         cfg: { tyreAsymEffect: 0 } });
    const ok = re.wearL > re.wearR * 2          // Rechtskurve nutzt links deutlich mehr
      && li.wearR > li.wearL * 2                // Linkskurve gespiegelt
      && Math.abs(re.mittel - sy.mittel) < 1e-4  // Mittelwert unveraendert
      && Math.abs(li.mittel - sy.mittel) < 1e-4
      && re.pull > 0 && li.pull < 0;             // und der Zug folgt dem Vorzeichen
    return { ok,
      mass: 'rechts L/R ' + re.wearL.toFixed(3) + '/' + re.wearR.toFixed(3)
          + ', links L/R ' + li.wearL.toFixed(3) + '/' + li.wearR.toFixed(3)
          + ' | Mittel ' + re.mittel.toFixed(5) + ' gegen symmetrisch '
          + sy.mittel.toFixed(5) + ' | Zug ' + re.pull.toFixed(4) };
  });

  // ---- Vierradverlagerung: Richtung, Normierung, Spiegelung ----
  //
  // DREI Aussagen in einem Test, weil sie nur zusammen etwas heissen: eine Verlagerung, die
  // in die richtige Richtung geht, aber im Mittel Last erfindet, wuerde das Auto insgesamt
  // griffiger machen - und das waere kein Reifenmodell, sondern ein versteckter Griffregler.
  stAdd('Radlasten: richtige Ecke, Mittel 1,0, gespiegelt', () => {
    if (!window.OMEGA_TEST || !OMEGA_TEST.physSteerGrip) {
      return { skip: true, mass: 'physSteerGrip nicht vorhanden' };
    }
    const mit = a => (a[0] + a[1] + a[2] + a[3]) / 4;
    const re = OMEGA_TEST.physSteerGrip({ kmh: 180, throttle: 0, brake: 1, steering: 0.8 });
    const li = OMEGA_TEST.physSteerGrip({ kmh: 180, throttle: 0, brake: 1, steering: -0.8 });
    const gas = OMEGA_TEST.physSteerGrip({ kmh: 180, throttle: 1, brake: 0, steering: 0.8 });
    if (!re.load4 || !li.load4 || !gas.load4) {
      return { skip: true, mass: 'load4 nicht vorhanden' };
    }
    const L = re.load4;
    const ok =
      // Rechtskurve unter Bremsen: vorne links traegt am meisten, hinten rechts am wenigsten.
      L[0] > L[1] && L[0] > L[2] && L[0] > L[3] && L[3] < L[1] && L[3] < L[2]
      // Bremsen verlagert nach vorn, Gas nach hinten.
      && (L[0] + L[1]) > (L[2] + L[3])
      && (gas.load4[2] + gas.load4[3]) > (gas.load4[0] + gas.load4[1])
      // Die Linkskurve ist die exakte Spiegelung: VL gegen VR und HL gegen HR.
      && Math.abs(L[0] - li.load4[1]) < 1e-9 && Math.abs(L[2] - li.load4[3]) < 1e-9
      // Und im Mittel genau 1,0 - in ALLEN drei Faellen.
      && Math.abs(mit(L) - 1) < 1e-9 && Math.abs(mit(li.load4) - 1) < 1e-9
      && Math.abs(mit(gas.load4) - 1) < 1e-9;
    return { ok, mass: 'Rechtskurve+Bremse VL/VR/HL/HR '
      + L.map(x => x.toFixed(2)).join('/') + ' | Mittel ' + mit(L).toFixed(6)
      + ' | Gas hinten ' + (gas.load4[2] + gas.load4[3]).toFixed(2) };
  });

  // Die Bremsscheiben nehmen den REINEN Seitenanteil und nicht die ganze Radlast. Der Grund
  // ist ein Fehler, der genau so schon drinstand: load4 enthaelt die Achsaufteilung, und die
  // Bremsbalance enthaelt sie auch. Beides multipliziert kam vorne-innen kaelter heraus als
  // hinten-aussen - und vorne bremst immer mehr.
  stAdd('Bremsscheiben: Achse aus der Balance, Seite aus der Verlagerung', () => {
    if (!window.OMEGA_TEST || !OMEGA_TEST.physSteerGrip) {
      return { skip: true, mass: 'physSteerGrip nicht vorhanden' };
    }
    const re = OMEGA_TEST.physSteerGrip({ kmh: 180, throttle: 0, brake: 1, steering: 0.8 });
    const ger = OMEGA_TEST.physSteerGrip({ kmh: 180, throttle: 0, brake: 1, steering: 0 });
    if (!re.lat4 || !ger.lat4) return { skip: true, mass: 'lat4 nicht vorhanden' };
    const bias = physEngine.config.brakeBias;
    const heiz = (lat) => [0, 1, 2, 3].map(i =>
      2 * (i < 2 ? bias : 1 - bias) * (1 + (lat[i] - 1) * 0.5));
    const h = heiz(re.lat4), hg = heiz(ger.lat4);
    const ok =
      // Der Seitenanteil traegt KEINE Achsaufteilung: vorne links und hinten links gleich.
      Math.abs(re.lat4[0] - re.lat4[2]) < 1e-9 && Math.abs(re.lat4[1] - re.lat4[3]) < 1e-9
      && Math.abs((re.lat4[0] + re.lat4[1] + re.lat4[2] + re.lat4[3]) / 4 - 1) < 1e-9
      // Geradeaus entscheidet allein die Bremsbalance, und vorne ist mehr.
      && Math.abs(hg[0] - hg[1]) < 1e-9 && hg[0] > hg[2]
      // Und der Achsmittelwert bleibt in der Kurve derselbe: die Seite verschiebt nur.
      && Math.abs((h[0] + h[1]) / 2 - hg[0]) < 1e-9
      && Math.abs((h[2] + h[3]) / 2 - hg[2]) < 1e-9;
    return { ok, mass: 'Kurve VL/VR/HL/HR ' + h.map(x => x.toFixed(2)).join('/')
      + ' | geradeaus vorn ' + hg[0].toFixed(2) + ' hinten ' + hg[2].toFixed(2) };
  });

  // Vier Reifen, vier Temperaturen - und mit abgeschalteter Asymmetrie muessen alle VIER
  // gleich sein. Der Mittelwert allein genuegt als Pruefung nicht: er stimmt auch, wenn zwei
  // Raeder vertauscht sind.
  stAdd('Vier Reifen: einzeln verschieden, symmetrisch alle gleich', () => {
    if (!window.OMEGA_TEST || !OMEGA_TEST.physTyreAsym) {
      return { skip: true, mass: 'physTyreAsym nicht vorhanden' };
    }
    const a = OMEGA_TEST.physTyreAsym({ steering: 0.8, sekunden: 20 });
    const sy = OMEGA_TEST.physTyreAsym({ steering: 0.8, sekunden: 20,
                                         cfg: { tyreAsymEffect: 0 } });
    if (!a.temp4 || !sy.temp4) return { skip: true, mass: 'temp4 nicht vorhanden' };
    const mit = x => (x[0] + x[1] + x[2] + x[3]) / 4;
    const ok =
      // Mit Asymmetrie: das belastete Rad ist waermer und staerker abgenutzt.
      a.temp4[0] > a.temp4[1] && a.temp4[2] > a.temp4[3]
      && a.wear4[0] > a.wear4[1] && a.wear4[2] > a.wear4[3]
      // Ohne: alle vier gleich.
      && Math.max.apply(null, sy.temp4) - Math.min.apply(null, sy.temp4) < 1e-6
      && Math.max.apply(null, sy.wear4) - Math.min.apply(null, sy.wear4) < 1e-9
      // Und der Verschleissmittelwert ist derselbe - die Verlagerung verschiebt nur.
      && Math.abs(mit(a.wear4) - mit(sy.wear4)) < 1e-6;
    return { ok, mass: 'Temp ' + a.temp4.map(x => x.toFixed(0)).join('/')
      + ' | Versch ' + a.wear4.map(x => (x * 100).toFixed(1)).join('/')
      + ' | Mittel ' + (mit(a.wear4) * 100).toFixed(4) + '% gegen '
      + (mit(sy.wear4) * 100).toFixed(4) + '%' };
  });

  // DER wichtigste der vier, und er prueft nicht die Physik, sondern den Messaufbau: ein
  // Messaufruf darf den echten Fahrzustand nicht veraendern. Genau das war kaputt, seit der
  // Zustand Arrays fuehrt - Object.assign auf ein leeres Objekt ist flach, also wurden die
  // Vierer-Felder als Referenz gesichert und im finally auf sich selbst zurueckgeschrieben.
  // Gezeigt hat es sich nur zufaellig, an Werten, die zwischen zwei Laeufen gestiegen sind.
  stAdd('Messaufbau: ein Messaufruf laesst den Fahrzustand unberuehrt', () => {
    if (!window.OMEGA_TEST || !OMEGA_TEST.physTyreAsym) {
      return { skip: true, mass: 'physTyreAsym nicht vorhanden' };
    }
    const st = physEngine.state;
    // Erkennbare Werte hineinschreiben, damit eine Veraenderung auffaellt.
    const marke = { tyreWear4: [0.11, 0.22, 0.33, 0.44],
                    tyreTemp4: [61, 62, 63, 64],
                    brakeTemp4: [71, 72, 73, 74] };
    const vorher = {};
    for (const k of Object.keys(marke)) {
      if (!Array.isArray(st[k])) return { skip: true, mass: k + ' nicht vorhanden' };
      vorher[k] = st[k].slice();
      for (let i = 0; i < 4; i++) st[k][i] = marke[k][i];
    }
    let ok = true;
    const meld = [];
    try {
      OMEGA_TEST.physTyreAsym({ steering: 0.8, sekunden: 5 });
      OMEGA_TEST.physSteerGrip({ kmh: 180, throttle: 0, brake: 1, steering: 0.8 });
      for (const k of Object.keys(marke)) {
        for (let i = 0; i < 4; i++) {
          if (Math.abs(st[k][i] - marke[k][i]) > 1e-9) {
            ok = false;
            meld.push(k + ' ' + i + ': ' + marke[k][i] + ' wurde ' + st[k][i].toFixed(3));
          }
        }
      }
      // Und die Wiederholbarkeit, die aus demselben Fehler fiel.
      const p = OMEGA_TEST.physTyreAsym({ steering: 0.8, sekunden: 10 });
      const q = OMEGA_TEST.physTyreAsym({ steering: 0.8, sekunden: 10 });
      if (JSON.stringify(p.temp4) !== JSON.stringify(q.temp4)) {
        ok = false;
        meld.push('nicht wiederholbar: ' + p.temp4 + ' gegen ' + q.temp4);
      }
    } finally {
      for (const k of Object.keys(vorher)) {
        for (let i = 0; i < 4; i++) st[k][i] = vorher[k][i];
      }
    }
    return { ok, mass: ok ? 'unberuehrt und wiederholbar' : meld.join('; ') };
  });

  // ---- Boxenstopp: vier Raeder, vier Toene, kein Losfahren ----
  //
  // Der letzte Teil ist der, auf den es beim Fahren ankommt: ohne Raeder kann man nicht
  // losfahren. Die Sperre stand schon da, aber eine Sperre, auf die man sich verlaesst, ohne
  // sie zu messen, ist keine - und sie haengt an drei Bedingungen zugleich (Zustand, Plan,
  // Fertigmeldung), von denen jede einzeln kippen kann.
  stAdd('Radwechsel: vier Raeder der Reihe nach, Gas gesperrt', () => {
    if (!window.OMEGA_TEST || !OMEGA_TEST.pitWheelTimeline) {
      return { skip: true, mass: 'pitWheelTimeline nicht vorhanden' };
    }
    const r = OMEGA_TEST.pitWheelTimeline({ dauer: 4.0, schritt: 0.05 });
    if (!r) return { skip: true, mass: 'pitWheelOff nicht vorhanden' };
    // Die Abschnitte zusammenfassen: aus 80 Abtastungen werden die Wechselpunkte.
    const ab = [];
    for (const p of r.reihe) {
      const l = ab[ab.length - 1];
      if (!l || l.rad !== p.rad) ab.push({ rad: p.rad, von: p.t, bis: p.t });
      else l.bis = p.t;
    }
    const folge = ab.filter(a => a.rad >= 0).map(a => a.rad);
    const ok =
      // Genau vier Ausfaelle, und jedes Rad genau einmal.
      folge.length === 4 && new Set(folge).size === 4
      // Kein Rad fehlt vor dem ersten oder nach dem letzten Ton.
      && r.danach.rad === -1
      // Und das Entscheidende: solange gewechselt wird, ist das Gas gesperrt, danach frei.
      && r.reihe.every(p => p.gas === true)
      && r.danach.gas === false;
    const N = ['VL', 'VR', 'HL', 'HR'];
    return { ok, mass: folge.map(i => N[i]).join(' \u2192 ')
      + ' | Gas gesperrt ' + (r.reihe.every(p => p.gas) ? 'durchgehend' : 'LUECKE')
      + ', danach ' + (r.danach.gas ? 'NOCH GESPERRT' : 'frei') };
  });

  // ---- Uebersetzung: kein Deutsch im englischen Modus ----
  //
  // Gesucht wird nach Woertern, die es im ENGLISCHEN nicht gibt, plus Umlauten. Ein erstes
  // Muster enthielt "also" und "die" und meldete damit englische Saetze als deutsch - ein
  // Test, der Rauschen meldet, wird abgeschaltet.
  //
  // Und es wird NICHT durch die Reiter geklickt: alle liegen gleichzeitig im Dokument, und
  // ein klickender Durchgang oeffnet die Unterseiten nicht. Genau dort lagen drei von vier
  // Befunden, als diese Pruefung zum ersten Mal lief.
  stAdd('Uebersetzung: kein Deutsch im englischen Modus', () => {
    const knopf = $('lang-toggle');
    if (!knopf) return { skip: true, mass: 'kein Sprachumschalter' };
    const vorher = document.documentElement.getAttribute('lang');
    const warEnglisch = vorher === 'en';
    try {
      if (!warEnglisch) knopf.click();
      if (document.documentElement.getAttribute('lang') !== 'en') {
        return { skip: true, mass: 'Umschalten auf Englisch hat nicht gegriffen' };
      }
      const DE = /(?:^|[\s(])(?:werden|wurde|wird|nicht|damit|deshalb|jedoch|welche|meldet|liegt|steht|braucht|dieselbe|derselbe|jedes|jeder|Werte|Blatt|Aufnahmen|Strecken|gespeichert|Ausdruck|Reifen|Bremse|Lenkung|Boxengasse)(?:[\s.,;:!?)]|$)|[\u00e4\u00f6\u00fc\u00df\u00c4\u00d6\u00dc]/;
      const gehen = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const treffer = [];
      let n;
      while ((n = gehen.nextNode())) {
        const el = n.parentElement;
        if (!el) continue;
        // Die Doku ist ausdruecklich nur deutsch; das Protokoll und die Testtabelle
        // enthalten Laufzeittexte und keine Oberflaeche.
        if (el.closest('#tab-doc, #log, script, style, template, #st-rows')) continue;
        const t = n.nodeValue.trim().replace(/\s+/g, ' ');
        if (t.length < 10 || !DE.test(t)) continue;
        const wo = el.closest('[id^="tab-"]');
        treffer.push((wo ? wo.id : '?') + ': ' + t.slice(0, 50));
      }
      return { ok: treffer.length === 0,
               mass: treffer.length === 0 ? 'kein deutscher Text gefunden'
                                          : treffer.length + ' Stellen \u2013 ' + treffer.slice(0, 3).join(' | ') };
    } finally {
      // Die Sprache MUSS zurueck: ein Test, der die Oberflaeche umstellt und so stehen
      // laesst, ist selbst der naechste Fehlerbericht.
      if (!warEnglisch && document.documentElement.getAttribute('lang') === 'en') knopf.click();
    }
  });

  // ---- Lenkwinkel-Kalibrierung ----
  //
  // DREI Aussagen, und die erste ist die wichtigste: der Deckel muss halten. Byte 7 traegt
  // round(winkel * 127) in einem VORZEICHENBEHAFTETEN Byte - ein Winkel ueber 1,0 wuerde
  // beim Umbruch als Einschlag in die ANDERE Richtung ankommen. Ein Regler, der das Auto in
  // die falsche Richtung lenken kann, ist schlimmer als kein Regler.
  stAdd('Lenkkalibrierung: gedeckelt, monoton, bei 1,0 wirkungslos', () => {
    if (!window.OMEGA_TEST || !OMEGA_TEST.physSteerGrip) {
      return { skip: true, mass: 'physSteerGrip nicht vorhanden' };
    }
    const messe = (kalib, lenk) => OMEGA_TEST.physSteerGrip({
      kmh: 60, throttle: 0, brake: 1, steering: lenk, patch: { steerCalib: kalib } });
    const proben = [1, 1.5, 2, 2.5, 3].map(k => messe(k, 1));
    if (proben[0].winkel === undefined) return { skip: true, mass: 'winkel nicht herausgegeben' };
    let gedeckelt = true, monoton = true;
    for (let i = 0; i < proben.length; i++) {
      if (Math.abs(proben[i].winkel) > 1 + 1e-9) gedeckelt = false;
      if (i && proben[i].winkel < proben[i - 1].winkel - 1e-9) monoton = false;
    }
    // Bei 1,0 muss der uebertragene Winkel genau der Wunsch sein - kein stiller Aufschlag.
    const neutral = Math.abs(proben[0].winkel - proben[0].wunsch) < 1e-9;
    // Und die Kalibrierung muss WIRKEN: bei 60 km/h unter Bremsen beschneidet der Reibkreis
    // auf etwa 35 Grad, und 2,0 muss den vollen Anschlag zurueckholen.
    const holt = proben[0].grad < 44 && messe(2, 1).grad === 45;
    // Auch in der Gegenrichtung, und mit demselben Betrag: eine Kalibrierung, die nur nach
    // einer Seite wirkt, waere ein Lenkoffset.
    const links = messe(2, -1);
    const spiegel = Math.abs(links.winkel + messe(2, 1).winkel) < 1e-9;
    const ok = gedeckelt && monoton && neutral && holt && spiegel;
    return { ok, mass: proben.map((p, i) => [1, 1.5, 2, 2.5, 3][i].toFixed(1) + 'x '
      + p.grad + '\u00b0').join('  ')
      + ' | Wunsch ' + proben[0].wunsch.toFixed(3)
      + (gedeckelt ? '' : ' | DECKEL OFFEN') + (monoton ? '' : ' | NICHT MONOTON')
      + (neutral ? '' : ' | 1,0 NICHT NEUTRAL') + (holt ? '' : ' | HOLT NICHTS ZURUECK')
      + (spiegel ? '' : ' | NICHT GESPIEGELT') };
  });

  // ---- Die Markup-Vorgaben MUESSEN die Voreinstellung Pro sein ----
  //
  // Pro ist die Vorgabe. Steht ein Regler beim Laden anders, zeigt die Legende "eigene
  // Abstimmung", ohne dass jemand etwas verstellt hat - und gefahren wird eine Mischung, die
  // in keiner Voreinstellung steht.
  //
  // Das ist genau einmal passiert, und zwar unbemerkt: das Markup stand Wert fuer Wert auf
  // dem ALTEN Pro, siebzehn Abweichungen. Zwei Orte fuer eine Aussage laufen auseinander,
  // sobald einer nachgezogen wird - und ein Vorgabewert sagt beim Ansehen nicht, aus welcher
  // Voreinstellung er stammt.
  stAdd('Markup-Vorgaben sind die Voreinstellung Pro', () => {
    if (!window.__presetValues) return { skip: true, mass: 'presetValues nicht erreichbar' };
    const soll = window.__presetValues('pro');
    if (!soll) return { skip: true, mass: 'Voreinstellung pro nicht vorhanden' };
    const ab = [];
    for (const k of Object.keys(soll)) {
      const el = $(k);
      if (!el) { ab.push(k + ': nicht im Dokument'); continue; }
      // Der VORGABEWERT und nicht der aktuelle: defaultValue und defaultChecked stehen fuer
      // das, was im Markup steht. el.value waere der Stand nach jedem Reglerzug dieser
      // Sitzung, und der Test wuerde dann messen, was der Nutzer gerade tut.
      if (el.type === 'checkbox') {
        if (el.defaultChecked !== !!soll[k]) {
          ab.push(k + ': Markup ' + el.defaultChecked + ', Pro ' + soll[k]);
        }
      } else if (Math.abs(parseFloat(el.defaultValue) - parseFloat(soll[k])) > 1e-9) {
        ab.push(k + ': Markup ' + el.defaultValue + ', Pro ' + soll[k]);
      }
    }
    return { ok: ab.length === 0,
             mass: ab.length === 0 ? Object.keys(soll).length + ' Vorgaben stimmen mit Pro'
                                   : ab.length + ' Abweichungen \u2013 ' + ab.slice(0, 3).join('; ') };
  });

  // ---- Ziffernversatz: nur bei WECHSEL, nicht in jedem Frame ----
  stAdd('Ziffernversatz feuert nicht bei unveraendertem Wert', async () => {
    const el = $('race-gear-n') || $('race-gear');
    if (!el) return { skip: true, mass: 'Gangfeld nicht im Dokument' };
    let treffer = 0;
    const beob = new MutationObserver(muts => {
      for (const m of muts) {
        if (m.attributeName === 'class' && el.classList.contains('gt3-tick')) treffer++;
      }
    });
    beob.observe(el, { attributes: true, attributeFilter: ['class'] });
    const vorher = el.textContent;
    await new Promise(r => setTimeout(r, 600));
    beob.disconnect();
    const geblieben = el.textContent === vorher;
    if (!geblieben) {
      // Der Gang HAT sich geaendert - dann sagt der Test nichts, und das ist ehrlicher als
      // ein Urteil auf einer Messung, deren Voraussetzung nicht galt.
      return { skip: true, mass: 'Gang wechselte waehrend der Messung (' + vorher
                                 + ' -> ' + el.textContent + ')' };
    }
    return { ok: treffer === 0,
             mass: geblieben ? 'Gang "' + vorher + '" unveraendert, ' + treffer
                               + ' Versatz-Auslösungen in 600 ms'
                             : 'Gang wechselte' };
  });

  // ---- Deckglas und Einschaltrampe fangen keine Tipps ab ----
  //
  // Fast jede Kachel im Cockpit ist antippbar. Eine Scheibe ohne pointer-events: none macht
  // die ganze Anzeige toter als vorher - und auf einem Bildschirmfoto sieht man das nicht.
  stAdd('Deckglas und Einschaltrampe sind klickdurchlaessig', () => {
    const g = document.querySelector('.gt3');
    if (!g) return { skip: true, mass: 'Cockpit nicht im Dokument' };
    const schichten = [['::before', 'Einschaltrampe'], ['::after', 'Deckglas']];
    const schlecht = [];
    for (const [pseudo, name] of schichten) {
      const cs = getComputedStyle(g, pseudo);
      if (cs.content === 'none') { schlecht.push(name + ': nicht vorhanden'); continue; }
      if (cs.pointerEvents !== 'none') schlecht.push(name + ': pointerEvents ' + cs.pointerEvents);
    }
    // Und der Blendreflex ueber der Lichtreihe, in derselben Ecke wie der Vollbildknopf.
    const sh = document.querySelector('.gt3-shift');
    if (sh) {
      const cs = getComputedStyle(sh, '::after');
      if (cs.content !== 'none' && cs.pointerEvents !== 'none') {
        schlecht.push('Blendreflex: pointerEvents ' + cs.pointerEvents);
      }
    }
    return { ok: schlecht.length === 0,
             mass: schlecht.length === 0 ? 'alle drei Schichten durchlaessig'
                                         : schlecht.join('; ') };
  });

  // ---- Ghosts: eigene Spuren ----
  //
  // Am Auto ist das NICHT messbar - kein Byte meldet die Querlage, und deshalb steht in der
  // Option auch "blind". Pruefbar ist die Rechnung, und drei Aussagen daran sind es wert:
  // die Spuren muessen VERSCHIEDEN sein (sonst faehrt das Feld weiter in einer Reihe), sie
  // muessen die ganze Breite ausnutzen, und ihre Summe muss null sein - ein Feld, das im
  // Mittel zur Seite versetzt ist, faehrt nicht auf verschiedenen Linien, sondern schief.
  stAdd('Ghost-Spuren: verschieden, volle Breite, im Mittel null', () => {
    if (!window.OMEGA_TEST || !OMEGA_TEST.ghostLanes) {
      return { skip: true, mass: 'ghostLanes nicht vorhanden' };
    }
    const echt = OMEGA_TEST.ghostLanes();
    // Die Rechnung selbst pruefen, unabhaengig davon, wieviele Ghosts gerade in der Garage
    // stehen: das ist der Teil, der immer gilt.
    const spuren = (n) => {
      if (n < 2) return [0];
      const out = [];
      for (let k = 0; k < n; k++) out.push((2 * k) / (n - 1) - 1);
      return out;
    };
    const schlecht = [];
    for (const n of [2, 3, 4, 5, 8]) {
      const sp = spuren(n);
      if (new Set(sp.map(x => x.toFixed(4))).size !== n) {
        schlecht.push(n + ' Ghosts: nicht alle Spuren verschieden');
      }
      if (Math.abs(sp[0] + 1) > 1e-9 || Math.abs(sp[n - 1] - 1) > 1e-9) {
        schlecht.push(n + ' Ghosts: Breite nicht ausgenutzt (' + sp[0] + ' bis ' + sp[n - 1] + ')');
      }
      const summe = sp.reduce((a, b) => a + b, 0);
      if (Math.abs(summe) > 1e-9) schlecht.push(n + ' Ghosts: Summe ' + summe.toFixed(4));
    }
    // Ein einzelner Ghost faehrt die Mitte: ein Versatz waere dort ein Lenkfehler und keine
    // Linie.
    if (spuren(1)[0] !== 0) schlecht.push('ein Ghost fährt nicht die Mitte');
    // Und was das laufende Feld sagt, mitgemeldet - auch wenn es leer ist.
    const jetzt = echt.length
      ? echt.map(g => g.name + ' ' + g.spur.toFixed(2)).join(', ')
      : 'keine Ghosts in der Garage';
    return { ok: !schlecht.length,
             mass: '2 Ghosts ' + spuren(2).join('/') + ' | 3 ' + spuren(3).join('/')
                   + ' | 5 ' + spuren(5).map(x => x.toFixed(1)).join('/')
                   + ' || aktuell: ' + jetzt
                   + (schlecht.length ? ' || ' + schlecht.join('; ') : '') };
  });

  // ---- Reifenwaermer ----
  //
  // ZWEI Aussagen, und die zweite ist die, auf die es beim Fahren ankommt: die Temperatur
  // muss stimmen UND sie muss sich als Grip auswirken. Nur die Temperatur zu pruefen liesse
  // den Fall durch, in dem resetTyres richtig setzt und die Griffrechnung sie ignoriert -
  // genau so ist die Bremsscheibenanzeige durchgekommen: die Physik lief, und die Anzeige
  // hing an einem anderen Schalter.
  //
  // Die VIER Raeder einzeln, nicht der Mittelwert: der stimmt auch, wenn zwei Raeder kalt
  // und zwei zu heiss sind.
  stAdd('Reifenwaermer: warme Reifen beim Start, und sie greifen', () => {
    const schalter = $('setting-tyre-blankets');
    if (!schalter) return { skip: true, mass: 'Schalter nicht im Dokument' };
    if (!window.OMEGA_TEST || !OMEGA_TEST.zustandKopie) {
      return { skip: true, mass: 'zustandKopie nicht vorhanden' };
    }
    const cfg = physEngine.config, st = physEngine.state;
    const merkState = OMEGA_TEST.zustandKopie(st);
    const merkCfg = { bl: cfg.tyreBlankets, te: cfg.tyreEffect };
    const schlecht = [], teile = [];
    try {
      // tyreEffect ausdruecklich AN, sonst prueft der Test eine abgeschaltete Simulation -
      // und ein gruener Test auf einer abgeschalteten Simulation ist schlimmer als keiner.
      cfg.tyreEffect = 1;
      const griff = {};
      for (const an of [false, true]) {
        cfg.tyreBlankets = an;
        resetTyres();
        const soll = an ? cfg.tyreOptimalC : cfg.tyreAmbientC;
        const ab = st.tyreTemp4.filter(x => Math.abs(x - soll) > 1e-9).length;
        teile.push((an ? 'an' : 'aus') + ': ' + st.tyreTemp4.map(x => Math.round(x)).join('/')
                   + '\u00b0');
        if (ab) schlecht.push((an ? 'an' : 'aus') + ': ' + ab + ' von 4 Raedern falsch');
        if (Math.abs(st.tyreTempC - soll) > 1e-9) {
          schlecht.push((an ? 'an' : 'aus') + ': Mittelwert ' + st.tyreTempC.toFixed(1));
        }
        // EIN Takt echte Physik, kein Messaufbau dazwischen: tyreGrip wird in update()
        // aus st.tyreTempC gerechnet, und genau diese Kette soll geprueft werden.
        st.speedKmh = 60 / REAL_SCALE;
        st.driveMode = 'forward';
        physEngine.update({ throttle: 0.2, brake: 0, steering: 0 }, 0.02);
        griff[an ? 'warm' : 'kalt'] = st.tyreGrip;
      }
      teile.push('tyreGrip kalt ' + griff.kalt.toFixed(3) + ' gegen warm '
                 + griff.warm.toFixed(3));
      // Warme Reifen MUESSEN mehr Griff haben. Ein Waermer, der die Temperatur setzt und
      // sonst nichts tut, waere eine Anzeige und keine Einstellung.
      if (!(griff.kalt < griff.warm - 1e-6)) {
        schlecht.push('warme Reifen greifen nicht besser (' + griff.kalt.toFixed(4)
                      + ' gegen ' + griff.warm.toFixed(4) + ')');
      }
      // Und das Feld MUSS in calibRef stehen, sonst meldet physConfigDiff auf frischem
      // Laden eine Abweichung - diese Fehlerklasse hat in v0.4 dreimal Zeit gekostet.
      if (physEngine.calibRef && !('tyreBlankets' in physEngine.calibRef)) {
        schlecht.push('tyreBlankets fehlt in calibRef');
      }
      return { ok: !schlecht.length,
               mass: teile.join(' | ') + (schlecht.length ? ' || ' + schlecht.join('; ') : '') };
    } finally {
      cfg.tyreBlankets = merkCfg.bl;
      cfg.tyreEffect = merkCfg.te;
      OMEGA_TEST.zustandZurueck(st, merkState);
    }
  });

  // ---- Controller: eine Taste, eine Bedeutung ----
  //
  // Gemeldet als "LB hat noch irgendeine weitere Belegung". Die Ursache war eine Migration,
  // die nur greift, wenn ZWEI Belegungen zugleich noch auf ihren alten Vorgaben liegen: wer in
  // v0.4 gefahren ist, hatte trackview auf LB gespeichert und racestart gar nicht, also lief
  // sie nicht - und LB schaltete die Leseart UND die Streckenansicht, die das Cockpit und
  // damit das Vollbild verlaesst.
  //
  // Geprueft werden BEIDE Richtungen, und die zweite ist die, die ich beim ersten Anlauf
  // kaputtgemacht habe: X traegt ab Werk absichtlich zwei Aktionen (Tippen schaltet runter,
  // Halten loest die gelbe Flagge). Ein Aufloeser, der stur Kollisionen bricht, gibt dort das
  // Runterschalten frei - eine Verschlechterung, die als Aufraeumen aussieht.
  stAdd('Controller: Kollisionen aufgeloest, gewollte Doppelbelegung bleibt', () => {
    if (!window.OMEGA_TEST || !OMEGA_TEST.padResolve) {
      return { skip: true, mass: 'padResolve nicht vorhanden' };
    }
    const vorgabe = OMEGA_TEST.padDefaults();
    const schluessel = (x) => (x && x.type && x.type !== 'none') ? x.type + ':' + x.index : null;
    const schlecht = [], teile = [];

    // 1. Der gemeldete Fall: ein v0.4-Speicher mit trackview auf LB.
    const a = OMEGA_TEST.padResolve({
      pitstop: { type: 'button', index: 9, label: 'Start / Options' },
      trackview: { type: 'button', index: 4, label: 'LB / L1' } });
    teile.push('gepflanzt: scanmode ' + a.scanmode.label + ', trackview ' + a.trackview.label);
    if (schluessel(a.scanmode) !== schluessel(vorgabe.scanmode)) {
      schlecht.push('scanmode nicht mehr auf LB');
    }
    if (schluessel(a.trackview) === schluessel(a.scanmode)) {
      schlecht.push('trackview liegt weiter auf LB');
    }
    if (!a.__kollisionen || !a.__kollisionen.length) schlecht.push('Kollision nicht gemeldet');

    // 2. Die GEWOLLTE Doppelbelegung: X traegt Runterschalten und die gelbe Flagge. Ein
    //    unveraenderter Speicher darf daran nichts aendern.
    const b = OMEGA_TEST.padResolve({});
    for (const n of Object.keys(vorgabe)) {
      if (schluessel(b[n]) !== schluessel(vorgabe[n])) {
        schlecht.push(n + ': ohne Anlass verschoben (' + (b[n] && b[n].label) + ')');
      }
    }
    if (b.__kollisionen) schlecht.push('meldet Kollisionen in den eigenen Vorgaben');
    teile.push('Vorgaben unveraendert: ' + (b.__kollisionen ? 'NEIN' : 'ja')
               + ' (Kreuz ' + (b.yellowflag && b.yellowflag.index === 0 ? 'traegt die Flagge'
                                : 'traegt sie NICHT') + ')');

    // 3. Und die Vorgaben selbst: ausser dem X-Paar darf nichts doppelt liegen. Eine
    //    unbeabsichtigte Doppelbelegung ab Werk waere derselbe Fehler, nur von Anfang an.
    const zaehler = new Map();
    for (const n of Object.keys(vorgabe)) {
      const k = schluessel(vorgabe[n]);
      if (!k) continue;
      zaehler.set(k, (zaehler.get(k) || []).concat(n));
    }
    // KEINE Ausnahme mehr. Bis v0.5.1 lagen Runterschalten und gelbe Flagge gemeinsam auf
    // Quadrat, unterschieden nur durch die Haltedauer - das war so gebaut und stand hier als
    // erlaubtes Paar. Gemeint war es nicht: die gelbe Flagge liegt jetzt auf Kreuz, und
    // damit traegt jede Taste genau eine Bedeutung. Der Test ist dadurch strenger und
    // einfacher, und eine Ausnahmeliste, die man pflegen muss, faellt weg.
    for (const [k, ns] of zaehler) {
      if (ns.length > 1) schlecht.push('Vorgaben: ' + ns.join(' und ') + ' beide auf ' + k);
    }

    return { ok: !schlecht.length,
             mass: teile.join(' | ') + (schlecht.length ? ' || ' + schlecht.join('; ') : '') };
  });

  // ---- Rundenzeit-Plot: die Zahlen im Bild passen zu den Daten ----
  //
  // Nicht wie er AUSSIEHT - das entscheidet das Auge -, sondern dass er keine Runde
  // verschluckt und die Markierungen an der richtigen Runde sitzen. Ein Plot, der einen
  // Boxenstopp eine Runde zu spaet malt, sieht vollkommen richtig aus.
  stAdd('Rundenzeit-Plot: Balken, Markierungen und Fussnote stimmen', () => {
    if (!window.OMEGA_TEST || !OMEGA_TEST.plotZeichnen) {
      return { skip: true, mass: 'plotZeichnen nicht vorhanden' };
    }
    const merk = $('sess-plot') ? $('sess-plot').innerHTML : null;
    const merkNote = $('sess-plot-note') ? $('sess-plot-note').textContent : null;
    try {
      const sitzung = { zeit: '2026-01-01T00:00:00.000Z', strafeS: 7,
        autos: [{ name: 'Pruefwagen', rolle: 'player',
                  laps: [12000, 11500, 19000, 11800, 12200],
                  ereignisse: [{ pit: 0, crash: 0 }, { pit: 0, crash: 0 },
                               { pit: 1, crash: 0 }, { pit: 0, crash: 2 },
                               { pit: 0, crash: 0 }] }] };
      const r = OMEGA_TEST.plotZeichnen(sitzung, 'Pruefwagen');
      const schlecht = [];
      // Fuenf Runden, fuenf Balken. Genau einer gelb (die Runde mit dem Stopp), genau ein
      // Blitz (die Runde mit den zwei Abgaengen - zwei Abgaenge, EIN Symbol mit Zahl).
      if (r.balken !== 5) schlecht.push(r.balken + ' Balken statt 5');
      if (r.gelb !== 1) schlecht.push(r.gelb + ' gelbe statt 1');
      if (r.blitze !== 1) schlecht.push(r.blitze + ' Blitze statt 1');
      // Die Fussnote nennt die Summen und die Strafe.
      for (const soll of ['5 ', '11.50s', '1 ', '2 ', '7 ']) {
        if (r.fussnote.indexOf(soll) < 0) schlecht.push('Fussnote ohne "' + soll.trim() + '"');
      }
      // Und eine Sitzung OHNE Ereignisse darf keine Markierungen erfinden.
      const alt = OMEGA_TEST.plotZeichnen({ zeit: '2026-01-01T00:00:00.000Z',
        autos: [{ name: 'Alt', rolle: 'player', laps: [12000, 12100], ereignisse: [] }] }, 'Alt');
      if (alt.gelb !== 0 || alt.blitze !== 0) {
        schlecht.push('alte Sitzung erfindet Markierungen');
      }
      return { ok: !schlecht.length,
               mass: r.balken + ' Balken, ' + r.gelb + ' gelb, ' + r.blitze + ' Blitz | '
                     + r.fussnote.slice(0, 70)
                     + (schlecht.length ? ' || ' + schlecht.join('; ') : '') };
    } finally {
      if (merk !== null && $('sess-plot')) $('sess-plot').innerHTML = merk;
      if (merkNote !== null && $('sess-plot-note')) $('sess-plot-note').textContent = merkNote;
    }
  });

  // ---- Als App installierbar: Manifest, Symbole, Cacheversion ----
  //
  // Die dritte Aussage ist die wichtigste und die einzige, die man nicht sehen kann: bleibt
  // der Cachename ueber einen Build gleich, liefert der Service Worker die ALTE Fassung aus.
  // Der Fehlerbericht heisst dann "die Behebung ist nicht drin", und man sucht im Code statt
  // im Cache.
  stAdd('Als App installierbar: Manifest, Symbole, Cacheversion', async () => {
    const link = document.querySelector('link[rel=manifest]');
    if (!link) return { ok: false, mass: 'kein <link rel=manifest> im Dokument' };
    if (location.protocol === 'file:') {
      // Von der Platte laesst sich das Manifest nicht holen (fetch auf file:// ist
      // gesperrt), und ein Service Worker gibt es dort ohnehin nicht.
      return { skip: true, mass: 'von der Platte geladen, Manifest nicht abrufbar' };
    }
    const teile = [], schlecht = [];
    let man = null;
    try {
      man = await (await fetch(link.getAttribute('href'), { cache: 'no-store' })).json();
    } catch (e) {
      return { ok: false, mass: 'Manifest nicht lesbar: ' + (e && e.message ? e.message : e) };
    }
    for (const feld of ['name', 'short_name', 'start_url', 'scope', 'display', 'icons']) {
      if (!man[feld]) schlecht.push('Feld ' + feld + ' fehlt');
    }
    // RELATIV. Ein fuehrender Schraegstrich zeigt auf GitHub Pages auf die Wurzel der Domain
    // und nicht auf /btsr/ - und auf localhost faellt das nicht auf.
    for (const [feld, wert] of [['start_url', man.start_url], ['scope', man.scope]]) {
      if (typeof wert === 'string' && wert.charAt(0) === '/') {
        schlecht.push(feld + ' ist absolut (' + wert + '), bricht unter einem Unterpfad');
      }
    }
    const symbole = man.icons || [];
    if (!symbole.some(i => (i.purpose || 'any').indexOf('maskable') >= 0)) {
      schlecht.push('kein maskable-Symbol');
    }
    // Jedes Symbol wirklich holen. Der Build prueft nur Markup, nicht diese JSON-Datei.
    let geladen = 0;
    for (const ic of symbole) {
      if (typeof ic.src === 'string' && ic.src.charAt(0) === '/') {
        schlecht.push('Symbolpfad absolut: ' + ic.src);
      }
      try {
        const r = await fetch(new URL(ic.src, link.href).href, { cache: 'no-store' });
        if (r.ok) geladen++; else schlecht.push(ic.src + ': ' + r.status);
      } catch (e) { schlecht.push(ic.src + ' nicht abrufbar'); }
    }
    teile.push(geladen + ' von ' + symbole.length + ' Symbolen geladen');

    // Der Cachename gegen die angezeigte Version.
    const v = ($('app-version') || {}).textContent;
    let swText = null;
    try { swText = await (await fetch('sw.js', { cache: 'no-store' })).text(); } catch (e) { }
    if (swText === null) {
      teile.push('sw.js nicht abrufbar');
      schlecht.push('sw.js fehlt');
    } else {
      if (swText.indexOf('SW_VERSION_PLATZHALTER') >= 0) {
        schlecht.push('sw.js traegt noch den Platzhalter, der Build hat ihn nicht ersetzt');
      } else if (v && swText.indexOf("'" + String(v).trim() + "'") < 0) {
        schlecht.push('Cacheversion in sw.js passt nicht zu ' + v);
      } else {
        teile.push('Cacheversion ' + String(v).trim());
      }
    }
    return { ok: !schlecht.length,
             mass: teile.join(' | ') + (schlecht.length ? ' || ' + schlecht.join('; ') : '') };
  });

  // ---- Fahrzeuglayout: gerechnete Nickgrenzen ----
  //
  // DIE ZUSICHERUNG, DIE DIE KALIBRIERUNG SCHUETZT. loadFrontOnPower und loadFrontOnBrake
  // standen bis v0.5 als eigene Konfigurationsfelder da und waren 0,5 -/+ transferK -
  // dieselbe Geometrie an einem zweiten Ort. rearGrip ist auf loadFrontOnPower normiert,
  // ausdruecklich damit die gemessene Anfahrzeit so bleibt, wie kalibriert. Wuerden die
  // Grenzen unabhaengig gehalten, verschoebe jede Layout-Wahl still diese Messung.
  stAdd('Layout: Nickgrenzen werden gerechnet, nicht gehalten', () => {
    if (!window.OMEGA_TEST || !OMEGA_TEST.physLayouts) {
      return { skip: true, mass: 'physLayouts nicht vorhanden' };
    }
    const tab = OMEGA_TEST.physLayouts();
    const tk = physEngine.config.transferK;
    const schlecht = [], teile = [];
    for (const [name, v] of Object.entries(tab)) {
      if (Math.abs(v.gas - (v.vorn - tk)) > 1e-9) {
        schlecht.push(name + ': Gas ' + v.gas + ' statt ' + (v.vorn - tk).toFixed(4));
      }
      if (Math.abs(v.bremse - (v.vorn + tk)) > 1e-9) {
        schlecht.push(name + ': Bremse ' + v.bremse + ' statt ' + (v.vorn + tk).toFixed(4));
      }
      // Der Ruhewert der Achslast MUSS dem Layout folgen, sonst zeigt die Radlastanzeige
      // beim ersten Takt ein anderes Auto und springt dann.
      if (Math.abs(v.ruhelast - v.vorn) > 1e-9) {
        schlecht.push(name + ': Ruhelast ' + v.ruhelast + ' statt ' + v.vorn);
      }
      teile.push(name + ' ' + Math.round(v.vorn * 100) + '/'
                 + Math.round(v.gas * 100) + '/' + Math.round(v.bremse * 100));
    }
    // Und die alten Felder duerfen NICHT mehr existieren: solange sie da sind, kann jemand
    // sie lesen und bekommt einen Wert, der nicht zum Layout passt.
    for (const alt of ['loadFrontOnPower', 'loadFrontOnBrake']) {
      if (alt in physEngine.config) schlecht.push(alt + ' steht noch in der Konfiguration');
    }
    return { ok: !schlecht.length,
             mass: 'vorn/Gas/Bremse in %: ' + teile.join('  ')
                   + (schlecht.length ? ' || ' + schlecht.join('; ') : '') };
  });

  // ---- Layout: Neutral laesst die Kalibrierung unberuehrt ----
  //
  // Die Aenderung soll rein additiv sein: wer nichts umstellt, merkt nichts. Geprueft wird es
  // an der Stelle, an der eine Verschiebung auffiele - physConfigDiff() nennt jede Abweichung
  // vom Kalibrierbezug, und kein LAYOUT-Feld darf darin stehen, solange Neutral gilt.
  stAdd('Layout: Neutral weicht nicht vom Kalibrierbezug ab', () => {
    if (!window.OMEGA_TEST || !OMEGA_TEST.physConfigDiff || !OMEGA_TEST.physLayouts) {
      return { skip: true, mass: 'Messaufbau nicht vorhanden' };
    }
    const merk = physEngine.layoutName || 'neutral';
    const FELDER = ['loadFrontStatic', 'wheelbaseM', 'yawInertia', 'steerRatePerS'];
    try {
      physEngine.applyLayout('neutral');
      const diff = OMEGA_TEST.physConfigDiff() || {};
      const drin = FELDER.filter(f => f in diff);
      // Und die Gegenprobe: ein ANDERES Layout MUSS auftauchen. Ein Test, der nur die
      // Abwesenheit prueft, ist auch gruen, wenn physConfigDiff gar nichts meldet.
      physEngine.applyLayout('gt3rear');
      const diff2 = OMEGA_TEST.physConfigDiff() || {};
      const drin2 = FELDER.filter(f => f in diff2);
      const ok = drin.length === 0 && drin2.length >= 2;
      return { ok, mass: 'Neutral: ' + (drin.length ? drin.join(', ') : 'keine Abweichung')
                         + ' | GT3 Heck: ' + (drin2.length ? drin2.join(', ') : 'KEINE')
                         + (ok ? '' : ' || Gegenprobe fehlgeschlagen') };
    } finally {
      physEngine.applyLayout(merk);
    }
  });

  // ---- Layout: die fuenf unterscheiden sich, geordnet, und keiner klebt am Notboden ----
  //
  // Der zweite Teil ist der, der eine Abstimmung von einer Klippe unterscheidet. Bei der
  // ersten Fassung (Achslast als physikalischer Exponent 0,85) lagen drei von fuenf Layouts
  // auf dem Notboden von 0,12 - unterscheidbar waren sie damit nicht, nur alle unfahrbar.
  stAdd('Layout: geordnet unterschiedlich, keiner am Notboden', () => {
    if (!window.OMEGA_TEST || !OMEGA_TEST.physLayoutDrive) {
      return { skip: true, mass: 'physLayoutDrive nicht vorhanden' };
    }
    const namen = ['neutral', 'gt3front', 'gt3mid', 'gt3rear', 'f1'];
    const werte = namen.map(n => {
      const r = OMEGA_TEST.physLayoutDrive(n, { kmh: 140, throttle: 0, brake: 1,
                                                steering: 1, patch: { steerCalib: 2.0 } });
      const v = OMEGA_TEST.physLayouts()[n];
      return { n, grad: r.grad, sg: r.steerGrip, vorn: v.vorn, rate: v.rate, iz: v.iz };
    });
    const schlecht = [];
    // 1. Keiner am Notboden. 0,12 ist die Trockenreserve; wer dort liegt, lenkt nicht mehr.
    for (const w of werte) {
      if (w.sg < 0.13) schlecht.push(w.n + ' liegt am Notboden (' + w.sg.toFixed(3) + ')');
    }
    // 2. Nach Vorderachslast geordnet: mehr Last vorn heisst mehr Lenkung unter Bremsen.
    const nachLast = werte.slice().sort((a, b) => b.vorn - a.vorn);
    for (let i = 1; i < nachLast.length; i++) {
      if (nachLast[i].grad > nachLast[i - 1].grad + 1) {
        schlecht.push(nachLast[i].n + ' lenkt mehr als das schwerere ' + nachLast[i - 1].n);
      }
    }
    // 3. Und sie muessen sich UEBERHAUPT unterscheiden. Genau daran ist der erste Anlauf
    //    gescheitert: alle fuenf gaben 26 Grad, weil uF auf 0,5 normiert und frontCap
    //    gedeckelt war.
    const spanne = Math.max.apply(null, werte.map(w => w.grad))
                 - Math.min.apply(null, werte.map(w => w.grad));
    if (spanne < 5) schlecht.push('Spanne nur ' + spanne + ' Grad, die Layouts wirken kaum');
    // 4. Die Lenkrate folgt dem Traegheitsmoment, gegenlaeufig.
    const nachIz = werte.slice().sort((a, b) => a.iz - b.iz);
    for (let i = 1; i < nachIz.length; i++) {
      if (nachIz[i].rate > nachIz[i - 1].rate + 1e-9) {
        schlecht.push('Lenkrate steigt mit dem Traegheitsmoment (' + nachIz[i].n + ')');
      }
    }
    return { ok: !schlecht.length,
             mass: werte.map(w => w.n + ' ' + w.grad + '\u00b0/' + w.rate.toFixed(1)).join('  ')
                   + ' | Spanne ' + spanne + '\u00b0'
                   + (schlecht.length ? ' || ' + schlecht.join('; ') : '') };
  });

  // ---- Layout: KEIN Preset-Schluessel ----
  //
  // Zwei Achsen, die getrennt bleiben muessen: welches Auto (Layout) und wie abgestimmt
  // (Voreinstellung). Ohne die Ausnahme wuerde ein Klick auf "GT3" das AUTO wechseln.
  //
  // Geprueft wird der VERTRAG und nicht die Wirkung: presetControls() darf den Waehler nicht
  // finden. Eine Voreinstellung anzuwenden waere invasiv und wuerde die Einstellungen des
  // Nutzers veraendern, nur um etwas zu pruefen, das strukturell entschieden ist.
  stAdd('Layout: nicht in den Voreinstellungen', () => {
    const el = $('setting-layout');
    if (!el) return { ok: false, mass: 'setting-layout fehlt' };
    if (typeof presetControls !== 'function') {
      return { skip: true, mass: 'presetControls nicht erreichbar' };
    }
    const ids = presetControls().map(x => x.id);
    const drin = ids.includes('setting-layout');
    // Gegenprobe: die Sammlung darf nicht einfach LEER sein, sonst ist der Test wertlos.
    const genug = ids.length > 30;
    // Und das Attribut muss am Element stehen, nicht nur zufaellig ausserhalb liegen.
    const markiert = el.hasAttribute('data-preset-skip');
    return { ok: !drin && genug && markiert,
             mass: ids.length + ' Bedienelemente in den Voreinstellungen, Layout '
                   + (drin ? 'IST DABEI' : 'nicht dabei')
                   + ', Attribut ' + (markiert ? 'gesetzt' : 'FEHLT') };
  });

  // ---- Einspurmodell, Probe 1: der Kleinwinkel-Grenzfall ----
  //
  // DIE STAERKSTE der drei, weil sie gegen eine Formel prueft, die man nicht bestreiten kann:
  // bei kleinem Winkel und niedrigem Tempo muss das Modell dasselbe sagen wie die reine
  // Geometrie, r = delta * v / L. Ein Modell, das im einfachsten Fall von der Schulformel
  // abweicht, ist an einer Stelle falsch, die man ohne diese Probe lange nicht findet.
  stAdd('Einspurmodell: Kleinwinkel trifft die Geometrie', () => {
    if (!window.OMEGA_TEST || !OMEGA_TEST.physYawGeometry) {
      return { skip: true, mass: 'physYawGeometry nicht vorhanden' };
    }
    const schlecht = [], teile = [];
    // Fuer JEDES Layout, denn der Radstand geht in die Formel ein.
    for (const layout of ['neutral', 'gt3front', 'gt3rear', 'f1']) {
      const r = OMEGA_TEST.physYawGeometry({ layout });
      teile.push(layout + ' ' + (r.abweichungProzent === null ? '?' : r.abweichungProzent + '%'));
      if (r.abweichungProzent === null || Math.abs(r.abweichungProzent) > 2) {
        schlecht.push(layout + ': ' + r.abweichungProzent + ' % gegen die Geometrie');
      }
    }
    return { ok: !schlecht.length,
             mass: 'Abweichung von delta*v/L: ' + teile.join('  ')
                   + (schlecht.length ? ' || ' + schlecht.join('; ') : '') };
  });

  // ---- Einspurmodell, Probe 2: der Sprungversuch ----
  //
  // Lenkwinkel schlagartig anlegen. Die Gierrate MUSS einschwingen und nicht aufschwingen -
  // und zwar im SENDETAKT von 45 ms, nicht in einem feinen Prueftakt. Genau dafuer ist der
  // Schritt halbimplizit: bei 45 ms und hoher Schraeglaufsteifigkeit wird explizites Euler
  // instabil.
  stAdd('Einspurmodell: Sprungversuch schwingt ein, nicht auf', () => {
    if (!window.OMEGA_TEST || !OMEGA_TEST.physYawStep) {
      return { skip: true, mass: 'physYawStep nicht vorhanden' };
    }
    const schlecht = [], teile = [];
    for (const layout of ['neutral', 'gt3rear', 'f1']) {
      // Auch mit einer ABSICHTLICH ueberhohen Steifigkeit: dort wuerde ein explizites
      // Verfahren aufschwingen, und nur so sagt der Test etwas ueber das Verfahren.
      for (const [name, cfg] of [['normal', {}], ['steif', { corneringStiffness: 600000 }]]) {
        const r = OMEGA_TEST.physYawStep({ layout, cfg });
        teile.push(layout + '/' + name + ' ' + r.ueberschwingen.toFixed(2));
        if (!r.endlich) schlecht.push(layout + '/' + name + ': nicht endlich');
        // 1,0 heisst monoton eingeschwungen. Bis 1,3 ist ein gedaempftes Ueberschwingen,
        // darueber schwingt es auf.
        if (r.ueberschwingen > 1.3) {
          schlecht.push(layout + '/' + name + ': Ueberschwingen '
                        + r.ueberschwingen.toFixed(2));
        }
      }
    }
    return { ok: !schlecht.length,
             mass: 'Spitze/Endwert: ' + teile.join('  ')
                   + (schlecht.length ? ' || ' + schlecht.join('; ') : '') };
  });

  // ---- Einspurmodell, Probe 3: der Eigenlenkgradient faellt heraus ----
  //
  // Aus zwei Punkten einer stationaeren Kreisfahrt: kU = (delta2-delta1)/(ay2-ay1). Der
  // herausgerechnete Wert muss den eingestellten treffen, sonst ist ein Vorzeichen oder eine
  // Achslast falsch.
  //
  // UND DAS VORZEICHEN JE LAYOUT, denn das ist die eigentliche Aussage: mehr Last hinten
  // heisst uebersteuernd, also kU negativ. Waeren die Achssteifigkeiten strikt proportional
  // zur Last, waere kU fuer JEDE Verteilung genau null - das Modell haette jedes Layout als
  // neutral gemeldet, und dieser Test faellt genau darauf.
  stAdd('Einspurmodell: Eigenlenkgradient stimmt und hat das richtige Vorzeichen', () => {
    if (!window.OMEGA_TEST || !OMEGA_TEST.physYawCircle || !OMEGA_TEST.physLayouts) {
      return { skip: true, mass: 'Messaufbau nicht vorhanden' };
    }
    const schlecht = [], teile = [];
    const tab = OMEGA_TEST.physLayouts();
    for (const layout of ['neutral', 'gt3front', 'gt3mid', 'gt3rear', 'f1']) {
      // Kleine Winkel und niedriges Tempo: dort ist das Modell im linearen Bereich, und nur
      // dort gilt die stationaere Gleichung, aus der kU herausfaellt.
      // KONSTANTER RADIUS und zwei Tempi - nur so kuerzt sich der geometrische Anteil L/R
      // aus dem Unterschied heraus. Mit festem Tempo und wechselndem Lenkwinkel meldete die
      // Probe 0,021 statt 0, und der Fehler lag in der Messung: L/R blieb im Unterschied
      // stehen. Nachgewiesen wurde es daran, dass delta und L*r/v auf 6*10^-5 zusammenfielen.
      const r = OMEGA_TEST.physYawCircle({ layout, radius: 40, tempi: [30, 55] });
      const vorn = tab[layout].vorn;
      teile.push(layout + ' ' + r.kuEingestellt.toFixed(4) + '/' + r.kuGemessen.toFixed(4));
      // Der herausgerechnete Wert gegen den eingestellten. Absolute Schranke, weil beide
      // klein sind und ein Verhaeltnis bei kU nahe null nichts sagt.
      //
      // 3*10^-4 und nicht 0,02: gemessen trifft die Probe auf 1 bis 2*10^-4, und eine
      // Schranke, die hundertfach darueber liegt, faengt nichts. Sie war zuerst so lose, weil
      // die MESSUNG falsch war (festes Tempo statt fester Radius) - eine weite Schranke um
      // einen Messfehler herum ist die Sorte Test, die spaeter nichts meldet.
      if (Math.abs(r.kuGemessen - r.kuEingestellt) > 3e-4) {
        schlecht.push(layout + ': gemessen ' + r.kuGemessen.toFixed(4)
                      + ' gegen eingestellt ' + r.kuEingestellt.toFixed(4));
      }
      // Das VORZEICHEN: mehr Last vorn heisst untersteuernd (kU > 0), mehr hinten
      // uebersteuernd (kU < 0), 50:50 neutral.
      if (Math.abs(vorn - 0.5) < 1e-9) {
        if (Math.abs(r.kuEingestellt) > 1e-6) schlecht.push(layout + ': 50:50 ist nicht neutral');
      } else if (vorn < 0.5 && !(r.kuEingestellt < 0)) {
        schlecht.push(layout + ': hecklastig, aber kU nicht negativ');
      } else if (vorn > 0.5 && !(r.kuEingestellt > 0)) {
        schlecht.push(layout + ': frontlastig, aber kU nicht positiv');
      }
    }
    // Und die Layouts muessen sich UEBERHAUPT unterscheiden - sonst prueft der Test nur, dass
    // alles null ist.
    const werte = ['neutral', 'gt3mid', 'gt3rear', 'f1'].map(l => tab[l].vorn);
    if (new Set(werte).size < 3) schlecht.push('zu wenige verschiedene Achslasten');
    return { ok: !schlecht.length,
             mass: 'kU eingestellt/gemessen: ' + teile.join('  ')
                   + (schlecht.length ? ' || ' + schlecht.join('; ') : '') };
  });

  // ---- Einspurmodell: abgeschaltet luegt es nicht ----
  //
  // yawModelEffect 0 muss ALLE Felder auf null setzen. Ein Modell, das abgeschaltet den
  // letzten Wert stehen laesst, zeigt eine Gierrate fuer ein Auto, das gerade steht - und das
  // ist schlimmer als keine Anzeige.
  stAdd('Einspurmodell: abgeschaltet bleibt alles null', () => {
    if (!window.OMEGA_TEST || !OMEGA_TEST.physYawStep) {
      return { skip: true, mass: 'physYawStep nicht vorhanden' };
    }
    const r = OMEGA_TEST.physYawStep({ cfg: { yawModelEffect: 0 } });
    const ok = r.ende === 0 && r.spitze === 0;
    return { ok, mass: ok ? 'Gierrate bleibt 0'
                          : 'Endwert ' + r.ende + ', Spitze ' + r.spitze };
  });

  // ---- Reifenquietschen am Grenzbereich ----
  //
  // DREI Aussagen, und die dritte ist die, die man nicht hoert: der Startwert der
  // Lautstaerke steht im CODE und im MARKUP. Zwei Orte fuer eine Zahl - genau diese Klasse
  // hat bei den Voreinstellungen siebzehn Abweichungen ergeben, und beim Bremsenquietschen
  // musste sie beim Halbieren an beiden Stellen nachgezogen werden.
  stAdd('Reifenquietschen: Treiber, Ton und Lautstaerke stimmen', async () => {
    if (!window.OMEGA_TEST || !OMEGA_TEST.sndVolumes) {
      return { skip: true, mass: 'sndVolumes nicht vorhanden' };
    }
    const schlecht = [], teile = [];

    // 1. Der TREIBER: latUse muss im Zustand stehen und mit der Lenkung steigen. Ohne ihn
    //    hat das Quietschen keine Groesse, an der es haengen kann.
    if (OMEGA_TEST.physSteerGrip) {
      const gerade = OMEGA_TEST.physSteerGrip({ kmh: 140, throttle: 0.3, brake: 0,
                                                steering: 0 });
      const kurve = OMEGA_TEST.physSteerGrip({ kmh: 140, throttle: 0.3, brake: 0,
                                               steering: 1 });
      const l0 = physEngine.state.latUse;
      teile.push('latUse ' + (l0 === undefined ? 'FEHLT' : 'vorhanden'));
      if (l0 === undefined) schlecht.push('latUse nicht im Zustand');
      if (!(gerade.steerGrip >= kurve.steerGrip)) {
        schlecht.push('Kurvenfahrt nimmt keinen Griff');
      }
    }

    // 2. Der TON: in fx.json eingetragen und abrufbar. Der Lader ist absichtlich duldsam -
    //    ein fehlender Eintrag faellt sonst still aus.
    if (location.protocol !== 'file:') {
      try {
        const fx = await (await fetch('audio/fx.json', { cache: 'no-store' })).json();
        if (!fx.tyre || !fx.tyre.file) {
          schlecht.push('kein tyre-Eintrag in fx.json');
        } else {
          const r = await fetch('audio/' + fx.tyre.file, { cache: 'no-store' });
          teile.push(fx.tyre.file + ' ' + (r.ok ? Math.round((await r.blob()).size / 1024)
                                                  + ' kB' : r.status));
          if (!r.ok) schlecht.push(fx.tyre.file + ': ' + r.status);
          if (!fx.tyre.loop) schlecht.push('tyre ist nicht als Schleife eingetragen');
        }
      } catch (e) {
        schlecht.push('fx.json nicht lesbar');
      }
    }

    // 3. Die LAUTSTAERKE: Code gegen Markup.
    const v = OMEGA_TEST.sndVolumes();
    const el = $('tyre-volume');
    if (!el) {
      schlecht.push('tyre-volume fehlt im Dokument');
    } else if (v.reifen === null) {
      schlecht.push('tyreVolume nicht erreichbar');
    } else {
      teile.push('Lautstaerke Code ' + v.reifen + ' / Markup ' + el.defaultValue);
      if (Math.abs(parseFloat(el.defaultValue) - v.reifen) > 1e-9) {
        schlecht.push('Startwert laeuft auseinander: Code ' + v.reifen
                      + ', Markup ' + el.defaultValue);
      }
    }
    // Und die Schwelle: sie muss SPAET liegen. Ein Quietschen ab 30 Prozent ist ein
    // Dauergeraeusch und keine Rueckmeldung.
    if (OMEGA_TEST.sndTyreSquealCurve) {
      const k = OMEGA_TEST.sndTyreSquealCurve();
      teile.push('Schwelle ' + k.schwelle);
      if (!(k.schwelle >= 0.7 && k.schwelle < 1)) {
        schlecht.push('Schwelle ' + k.schwelle + ' liegt nicht spaet');
      }
    }
    return { ok: !schlecht.length,
             mass: teile.join(' | ') + (schlecht.length ? ' || ' + schlecht.join('; ') : '') };
  });

  // ---- Block 4.4: Reifendruck ----
  // Monoton, ueber den ganzen Reglerbereich. Ein Regler, der in der Mitte umkehrt, ist keine
  // Abstimmung, sondern eine Falle.
  stAdd('Reifendruck: weniger Druck, waermer und mehr Verschleiss', () => {
    if (!window.OMEGA_TEST || !OMEGA_TEST.physTyreAsym) {
      return { skip: true, mass: 'physTyreAsym nicht vorhanden' };
    }
    const werte = [1.4, 1.6, 1.8, 2.0, 2.2].map(p => ({
      p, r: OMEGA_TEST.physTyreAsym({ steering: 0.3, sekunden: 40,
                                      cfg: { tyrePressureBar: p } }) }));
    let monoton = true;
    for (let i = 1; i < werte.length; i++) {
      if (werte[i].r.tempC >= werte[i - 1].r.tempC) monoton = false;
      if (werte[i].r.mittel >= werte[i - 1].r.mittel) monoton = false;
    }
    return { ok: monoton,
      mass: werte.map(w => w.p.toFixed(1) + ' bar: ' + w.r.tempC.toFixed(0) + '\u00b0, '
                         + (w.r.mittel * 100).toFixed(1) + ' %').join(' | ') };
  });

  // ---- Block 4.2: Windschatten ----
  //
  // Gemessen ueber physSteerGrip mit gesetztem st.dirtyAir und NICHT ueber die
  // Ghost-Verwaltung: die braeuchte ein Layout und zwei Autos, und dann prueft der Test die
  // Messung statt der Wirkung. Was hier zu pruefen ist: senkt der Wert den Kurvengrip, und
  // laesst der Regler ihn abschalten.
  stAdd('Windschatten senkt den Kurvengrip', () => {
    if (!window.OMEGA_TEST || !OMEGA_TEST.physSteerGrip) {
      return { skip: true, mass: 'physSteerGrip nicht vorhanden' };
    }
    const st = physEngine.state;
    const merk = st.dirtyAir;
    try {
      // tyreEffect AUF 0 in allen drei Aufrufen, und das ist der Punkt, an dem die erste
      // Fassung dieses Tests falsch war: physSteerGrip legt tyreTempC und tyreWear NICHT
      // zurueck, die Reifen wurden also von Aufruf zu Aufruf waermer. Gemessen kam
      // 0,595 -> 0,660 heraus, und das war die Aufwaermung und nicht der Windschatten -
      // der Test meldete einen Fehler, der in ihm selbst lag.
      const messen = (dirty, effekt) => {
        st.dirtyAir = dirty;
        return OMEGA_TEST.physSteerGrip({ kmh: 140, throttle: 0.3, brake: 0, steering: 0.5,
          patch: { dirtyAirEffect: effekt, tyreEffect: 0 } }).steerGrip;
      };
      const frei = messen(0, 1);
      const nah = messen(1, 1);
      const ausgeschaltet = messen(1, 0);
      const verlust = (frei - nah) / Math.max(1e-6, frei);
      return {
        ok: verlust > 0.05 && Math.abs(ausgeschaltet - frei) < 1e-6,
        mass: 'freie Luft ' + frei.toFixed(3) + ', dicht dahinter ' + nah.toFixed(3)
            + ' (' + (verlust * 100).toFixed(1) + ' % weniger), Regler aus '
            + ausgeschaltet.toFixed(3),
      };
    } finally { st.dirtyAir = merk; }
  });

  // ---- Abseits der Fahrbahn ----
  //
  // Die Bedingung, an der es schiefgeht, wenn sie jemand vergisst: die Drosselung darf NUR
  // im Bahn-Modus greifen. Im Ausdruck-Modus ist der Streckensensor abgeschaltet (gemessen
  // 0 Lesungen in 551 Fahrmeldungen), Byte 12 stuende dauernd auf 0x00, und das Auto waere
  // permanent auf 45 % gedeckelt - man wuerde den Fehler beim Motor suchen.
  //
  // Geprueft wird ausserdem die Entprellung: ein einzelnes 0x00 zwischen guten Lesungen ist
  // Rauschen und darf nichts ausloesen. Ohne sie zuckt das Gas mitten auf der Bahn.
  stAdd('Drosselung abseits nur auf der Bahn, und entprellt', () => {
    if (typeof offtrackMelden !== 'function' || typeof offtrackGilt !== 'function') {
      return { ok: null, mass: 'Funktionen nicht erreichbar' };
    }
    const merk = { mode: trackMode, effekt: !!($('setting-offtrack') || {}).checked };
    try {
      if ($('setting-offtrack')) $('setting-offtrack').checked = true;
      offtrackEffekt = true;

      // a) Ein einzelner Ausfall darf nichts tun.
      trackMode = 'on';
      offtrackMelden(false);
      offtrackMelden(true);
      const einzeln = offtrackGilt();

      // b) Durchgehend abseits, laenger als die Einschaltzeit: greift.
      const t0 = Date.now();
      while (Date.now() - t0 < 420) offtrackMelden(true);
      const dauer = offtrackGilt();

      // c) Dieselbe Lage im Ausdruck-Modus: greift NICHT.
      trackMode = 'off';
      offtrackMelden(true);
      const ausdruck = offtrackGilt();

      // d) Zurueck auf die Bahn: endet.
      trackMode = 'on';
      const t1 = Date.now();
      while (Date.now() - t1 < 220) offtrackMelden(false);
      const zurueck = offtrackGilt();

      return {
        ok: !einzeln && dauer && !ausdruck && !zurueck,
        mass: 'einzelner Ausfall ' + (einzeln ? 'greift (FALSCH)' : 'ignoriert')
            + ' | 420 ms abseits ' + (dauer ? 'greift' : 'greift NICHT (falsch)')
            + ' | Ausdruck-Modus ' + (ausdruck ? 'greift (FALSCH)' : 'greift nicht')
            + ' | zurueck ' + (zurueck ? 'greift weiter (FALSCH)' : 'beendet'),
      };
    } finally {
      trackMode = merk.mode;
      if ($('setting-offtrack')) $('setting-offtrack').checked = merk.effekt;
      offtrackEffekt = merk.effekt;
      // Zustand zuruecklegen, sonst steht der Streifen nach dem Test im Cockpit.
      const t2 = Date.now();
      while (Date.now() - t2 < 200) offtrackMelden(false);
    }
  });

  // ---- Alle fuenf Voreinstellungstexte haben eine englische Fassung ----
  //
  // WARUM DAS EINE EIGENE PRUEFUNG BRAUCHT: die Sprachpruefung liest das DOKUMENT, und die
  // Legende zeigt seit v0.5 nur noch die eingestellte Variante. Vier der fuenf Texte stehen
  // beim Pruefen also nicht da - ein geaenderter Arcade-Text bliebe unbemerkt deutsch, bis
  // jemand Arcade anklickt. Genau so ist es passiert: gemeldet wurden 2 von 5 Stellen.
  //
  // Eine Verbesserung an der Oberflaeche hat eine Pruefung blind gemacht. Diese hier geht
  // deshalb direkt an die Tabelle und nicht an das Dokument.
  stAdd('Alle Voreinstellungstexte sind uebersetzt', () => {
    const keys = window.__presetKeys ? window.__presetKeys() : [];
    if (!keys.length || !window.__presetTexts) {
      return { ok: null, mass: 'presetTexts nicht erreichbar' };
    }
    const fehlt = [];
    let geprueft = 0;
    for (const k of keys) {
      const t = window.__presetTexts(k);
      if (!t) { fehlt.push(k + ' fehlt'); continue; }
      for (const feld of ['label', 'kurz', 'text']) {
        geprueft++;
        // Der Name darf gleich bleiben (Arcade, GT3, F1 heissen auf Englisch genauso) -
        // geprueft wird, dass ein Eintrag EXISTIERT oder der Text gar nichts Deutsches hat.
        const de = t[feld];
        const en = i18nLookup(de);
        const hatDeutsch = /[\u00e4\u00f6\u00fc\u00df\u00c4\u00d6\u00dc]|\b(der|die|und|nicht|eine|mit|ist|wird|von|bei|zur|aus|dem|den)\b/.test(de);
        if (en === null && hatDeutsch) fehlt.push(k + '.' + feld);
      }
    }
    return { ok: fehlt.length === 0,
             mass: geprueft + ' Texte in ' + keys.length + ' Voreinstellungen'
                 + (fehlt.length ? ' | OHNE ENGLISCHE FASSUNG: ' + fehlt.join(', ')
                                 : ' | alle uebersetzt') };
  });

  // ---- Voreinstellungen gegen die Reglerraster ----
  //
  // Eine Voreinstellung darf nur Werte verlangen, die ihr Regler DARSTELLEN kann. Ein
  // Bereichsregler rastet still ein: setting-grip hatte Raster 0,05, GT3 verlangte 0,72,
  // gesetzt wurden 0,70. Vier solche Faelle gab es, und keiner war sichtbar, weil nach dem
  // Setzen nie verglichen wurde. Die Karte sagt "An einem echten GT3 kalibriert", und
  // gerade der kalibrierte Wert war nicht erreichbar.
  //
  // Geprueft wird das Raster und nicht das Ergebnis eines Klicks: so meldet der Test auch
  // eine Voreinstellung, die gar nicht angeklickt wurde.
  stAdd('Jede Voreinstellung passt aufs Reglerraster', () => {
    const keys = window.__presetKeys ? window.__presetKeys() : [];
    if (!keys.length) return { ok: null, mass: 'keine Voreinstellungen erreichbar' };
    const schlecht = [];
    let geprueft = 0;
    for (const k of keys) {
      const v = (window.__presetValues || (() => null))(k);
      if (!v) return { ok: null, mass: 'presetValues nicht erreichbar' };
      for (const [id, soll] of Object.entries(v)) {
        const el = $(id);
        if (!el) { schlecht.push(k + '/' + id + ' fehlt'); continue; }
        if (el.type !== 'range') continue;
        geprueft++;
        const mn = +el.min, st = +el.step || 1;
        const gerastert = mn + Math.round((+soll - mn) / st) * st;
        if (Math.abs(gerastert - +soll) > 1e-9) {
          schlecht.push(k + '/' + id + ' ' + soll + ' -> ' + (+gerastert.toFixed(6)));
        }
        if (+soll < mn - 1e-9 || +soll > +el.max + 1e-9) {
          schlecht.push(k + '/' + id + ' ' + soll + ' ausserhalb ' + el.min + '..' + el.max);
        }
      }
    }
    return { ok: schlecht.length === 0,
             mass: geprueft + ' Reglerwerte in ' + keys.length + ' Voreinstellungen'
                 + (schlecht.length ? ' | NICHT DARSTELLBAR: ' + schlecht.join(', ') : '') };
  });

  // ---- Motormenue gegen die Schleifenliste ----
  //
  // DIESER TEST HAETTE DEN PORSCHE GEFUNDEN. 'p992gt3r' stand im Menue und in
  // audio/loops.json, aber nicht in SAMPLE_CARS - und der Handler in 80-sound.js prueft
  // genau diese Liste. Er fand den Wert nicht und fiel STILL auf SOUND_PROFILES.v8
  // zurueck, einen Saegezahn mit 50 Hz. Zu hoeren war also nicht ein schlecht gerechneter
  // Boxer-6, sondern der grobe Ersatzmotor; vier Wochen lang.
  //
  // Dieselbe Fehlerklasse wie eine tote Element-id: ein Bedienelement, dessen Wert niemand
  // liest. Und wie dort ist der stille Rueckfall das Schlimmste daran.
  stAdd('Jeder Motor im Menue hat Schleifen', () => {
    const sel = $('sound-profile');
    if (!sel) return { ok: false, mass: 'kein #sound-profile' };
    const menue = Array.prototype.map.call(sel.options, o => o.value);
    const ohne = menue.filter(v => SAMPLE_CARS.indexOf(v) < 0);
    // Gegenrichtung: eine Schleife, die man nicht waehlen kann, ist kein Absturz, aber eine
    // unerreichbare Datei.
    const unerreichbar = SAMPLE_CARS.filter(v => menue.indexOf(v) < 0);
    return {
      ok: ohne.length === 0 && unerreichbar.length === 0,
      mass: menue.length + ' Eintraege, ' + SAMPLE_CARS.length + ' Schleifenmotoren'
          + (ohne.length ? ' | OHNE SCHLEIFEN: ' + ohne.join(', ') : '')
          + (unerreichbar.length ? ' | nicht waehlbar: ' + unerreichbar.join(', ') : ''),
    };
  });

  // ---- Lautsprecher-Knopf ----
  //
  // Er soll durch ALLE Eintraege schalten und beim ersten wieder ankommen. Ein Knopf, der
  // einen Eintrag ueberspringt, ist schwer zu bemerken: man merkt nur, dass ein Motor
  // "nicht dabei" ist.
  stAdd('Lautsprecher-Knopf schaltet einmal rundherum', () => {
    const knopf = $('race-act-sound'), sel = $('sound-profile');
    if (!knopf || !sel) return { ok: null, mass: 'kein Knopf oder kein Menue' };
    const gemerkt = sel.value;
    try {
      const gesehen = [];
      const n = sel.options.length;
      // n+1 Kliks: nach n Kliks muss der Anfangswert wieder stehen.
      for (let i = 0; i < n; i++) { knopf.click(); gesehen.push(sel.value); }
      const einmalig = new Set(gesehen);
      return {
        ok: einmalig.size === n && sel.value === gemerkt,
        mass: n + ' Eintraege, ' + einmalig.size + ' verschiedene gesehen, danach wieder '
            + (sel.value === gemerkt ? 'am Anfang' : 'bei "' + sel.value + '"'),
      };
    } finally {
      if (sel.value !== gemerkt) {
        sel.value = gemerkt;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
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

  // ---- Autokennung: Farbe, Buchstabe, Name ----
  // Mit erfundenen Autos, weil echte eine Bluetooth-Verbindung brauchen. Geprueft wird die
  // Logik, nicht die Funkstrecke: dass keine Farbe zweimal vergeben wird, dass die
  // Buchstaben der Reihenfolge folgen und nach einem Abgang aufruecken, und dass der
  // eingetragene Name Vorrang vor allem anderen hat.
  stAdd('Autokennung: Farbe, Buchstabe, Name', () => {
    const gemerkt = garage.slice();
    // Auch die ANZEIGE zuruecklegen: ein Test, der die Oberflaeche anfasst, muss sie
    // aufraeumen. Ohne genau das blieb hier schon einmal Text stehen, den die
    // Sprachpruefung dann zu Recht gemeldet hat.
    const listeVorher = $('gar-list') ? $('gar-list').innerHTML : null;
    const zahlVorher = $('gar-count') ? $('gar-count').textContent : null;
    try {
      garage.length = 0;
      const mach = (id, name) => ({ device: { id, name }, role: 'none' });
      const drei = [mach('t-1', 'Carrera A'), mach('t-2', 'Carrera B'),
                    mach('t-3', 'Carrera C')];
      for (const c of drei) { garage.push(c); carAssign(c); }
      const farben = drei.map(c => c.colorId);
      const doppelt = farben.length !== new Set(farben).size;
      const tags = drei.map(c => c.tag);
      // Ein Auto aus der Mitte trennen: die dahinter muessen aufruecken.
      garage.splice(1, 1);
      carRetag();
      const nachAbgang = garage.map(c => c.tag);
      // Namensvorrang: eingetragener Name schlaegt Buchstaben schlaegt Geraetenamen.
      const a = garage[0];
      const ohne = garageLabel(a);
      a.alias = 'Testfahrer';
      const mit = garageLabel(a);
      const ok = !doppelt
                 && tags.join(',') === 'Alpha,Beta,Gamma'
                 && nachAbgang.join(',') === 'Alpha,Beta'
                 && ohne === 'Alpha' && mit === 'Testfahrer';
      return { ok,
               mass: 'Farben ' + farben.join('/') + (doppelt ? ' DOPPELT' : ' verschieden')
                     + ', Buchstaben ' + tags.join('/')
                     + ', nach Abgang ' + nachAbgang.join('/')
                     + ', Name "' + ohne + '" -> "' + mit + '"' };
    } finally {
      garage.length = 0;
      gemerkt.forEach(c => garage.push(c));
      carRetag();
      if (listeVorher !== null) $('gar-list').innerHTML = listeVorher;
      if (zahlVorher !== null) $('gar-count').textContent = zahlVorher;
    }
  });

  // ---- Reagieren die Werkstattbilder? ----
  // Jeder Regler von Anschlag zu Anschlag, und geprueft wird, WELCHE Bilder sich dabei
  // aendern. Die Erwartung steht in der Tabelle und folgt aus dem Modell:
  //
  //   Rohr      Impuls und Resonanz  (Rohrlaenge geht in die Impulsantwort und die Spitze)
  //   Impuls    nur Impuls           (die Breite des Druckstosses)
  //   Abfall    Impuls und Resonanz  (Laenge der Impulsantwort, damit ihre Guete)
  //   Saettigung nur Impuls          (steckt in keinem Frequenzbild)
  //   Drehzahl  nur Resonanz         (die rote Marke; ZuendWINKEL haengen nicht an ihr)
  //   Zylinder  Zuendfolge und Resonanz
  //
  // Ein Bild, das auf seinen Regler NICHT reagiert, ist der Fehler, den es hier zweimal
  // gegeben hat: gezeichnet, plausibel, und in Wahrheit eine Nulllinie.
  stAdd('Werkstattbilder reagieren auf ihre Regler', () => {
    const soll = {
      pipe: 'pulse,spec', pulse: 'pulse', decay: 'pulse,spec',
      drive: 'pulse', rpm: 'spec', cyl: 'fire,spec',
    };
    const bild = (k) => {
      const e = document.getElementById('mw-chart-' + k);
      const svg = e && e.querySelector('svg');
      return svg ? svg.innerHTML : '';
    };
    const alle = () => ({ fire: bild('fire'), pulse: bild('pulse'), spec: bild('spec') });
    if (!alle().pulse) return { skip: true, mass: 'Werkstatt nicht im Dokument' };
    const ids = Object.keys(soll);
    const gemerkt = {};
    for (const id of ids) gemerkt[id] = document.getElementById('mw-' + id).value;
    const stelle = (id, v) => {
      const e = document.getElementById('mw-' + id);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
    };
    try {
      const falsch = [];
      const gemessen = [];
      for (const id of ids) {
        const e = document.getElementById('mw-' + id);
        stelle(id, e.min); const a = alle();
        stelle(id, e.max); const b = alle();
        stelle(id, gemerkt[id]);
        const anders = ['fire', 'pulse', 'spec'].filter(k => a[k] !== b[k]);
        const ist = anders.join(',');
        gemessen.push(id + '=' + (ist || 'nichts'));
        if (ist !== soll[id]) falsch.push(id + ': ' + (ist || 'nichts') + ' statt ' + soll[id]);
      }
      return { ok: !falsch.length,
               mass: gemessen.join(' ') + (falsch.length ? ' | FALSCH: ' + falsch.join('; ')
                                                         : ' | alle wie erwartet') };
    } finally {
      for (const id of ids) stelle(id, gemerkt[id]);
    }
  });

  // ---- Die zwei Linienmodelle ----
  // Gemessen wird die Zielgroesse des neuen Modells mit seinem eigenen Mass: die
  // Rundenzeit. Was hier NICHT geprueft wird, ist die Lage des Scheitels - sie verschiebt
  // sich messbar kaum (Mittel +0,045 der Kurvenlaenge ueber zwoelf Kurvenzuege), und eine
  // Pruefung auf einen Effekt, den es nicht gibt, waere eine Pruefung, die luegt.
  stAdd('Linienmodelle: Rundenzeit schlaegt Kruemmung', () => {
    const proben = ['SG2R2G2R2', 'SGR2GR2GRG', 'SHG4R4LG'];
    const zeilen = [];
    let schlimmster = 1;
    for (const code of proben) {
      const tiles = codeToTrack(code).tiles;
      const pts = trackCenterline(tiles);
      if (pts.length < 8) continue;
      const nrm = trackNormals(pts);
      const first = pts[0], last = pts[pts.length - 1];
      const closed = Math.hypot(last.x - first.x, last.y - first.y) < 2 * TRACK_UNITS_PER_CM;
      const km = idealLine(pts, nrm, { closed });
      const lt = lapTimeLine(pts, nrm, { closed });
      const bahn = (a) => pts.map((p, i) => [p.x + nrm[i].x * a[i], p.y + nrm[i].y * a[i]]);
      const tKm = lapTimeOf(bahn(km.alpha), closed, {}).time;
      const q = lt.lapTime / tKm;
      schlimmster = Math.min(schlimmster, 1 - q);
      // Und: die Linien muessen sich UNTERSCHEIDEN. Zwei Modelle, die dasselbe liefern,
      // sind ein Modell mit zwei Namen.
      let abw = 0;
      for (let i = 0; i < km.alpha.length; i++) {
        abw = Math.max(abw, Math.abs(km.alpha[i] - lt.alpha[i]));
      }
      zeilen.push(code + ' ' + ((1 - q) * 100).toFixed(1) + ' % schneller, '
                  + (abw / TRACK_UNITS_PER_CM).toFixed(1) + ' cm Abstand');
    }
    return { ok: schlimmster > 0.005,
             mass: zeilen.join(' | ') + ' (Modellzeit, nicht gefahren)' };
  });

  // ---- Die Annahmeregel des Lernens ----
  // Der Kern: eine SCHNELLERE Runde mit einem Abgang darf nicht angenommen werden. Wird das
  // je umgedreht, lernt das Verfahren, dass Abfliegen sich lohnt.
  stAdd('Ghost-Lernen nimmt keine Runde mit Abgang', () => {
    if (!window.OMEGA_TEST || !OMEGA_TEST.learnSim) {
      return { skip: true, mass: 'learnSim nicht vorhanden' };
    }
    // Drei heile Runden mit fallender Zeit, dann die schnellste Runde von allen MIT Abgang.
    const r = OMEGA_TEST.learnSim([
      { ms: 9000 }, { ms: 8600 }, { ms: 8400 },
      { ms: 6000, off: 1 },
      { ms: 8300 },
    ]);
    const nachAbgang = r.spur[3];
    const letzte = r.spur[4];
    // Die 6000 duerfen nirgends als Bestzeit stehen, und die Schrittweite muss nach dem
    // Abgang KLEINER geworden sein statt groesser.
    const bestNieDerAbflug = r.spur.every(z => z.best !== 6000);
    const vorsichtiger = nachAbgang.sigma < r.spur[2].sigma;
    const zurueckgenommen = nachAbgang.pace <= r.spur[2].pace
                            && nachAbgang.push <= r.spur[2].push;
    const laeuftWeiter = letzte.best === 8300;
    return { ok: bestNieDerAbflug && vorsichtiger && zurueckgenommen && laeuftWeiter,
             mass: 'Bestzeit nach 6000-ms-Abflug ' + nachAbgang.best
                   + ' (nicht 6000: ' + (bestNieDerAbflug ? 'ok' : 'FALSCH') + ')'
                   + ', Schrittweite ' + r.spur[2].sigma + ' auf ' + nachAbgang.sigma
                   + ', Tempo ' + r.spur[2].pace + ' auf ' + nachAbgang.pace
                   + ', danach wieder Bestzeit ' + letzte.best
                   + ', Lenkgrenze ' + r.cap.toFixed(2) };
  });

  // ---- Start/Ziel-Code zaehlt, Linkskurve nicht ----
  //
  // Am 25.08. gemessen: das Original-Startziel-Blatt meldet 0x0a. Vorher stand hier 0x01,
  // eine Annahme aus einem Foto - und die Rundenzaehlung prueft genau diesen Wert, hat auf
  // dem Originalblatt also nie ausgeloest. Der Fehler war doppelt unsichtbar: ohne
  // gedrucktes Blatt kommt ohnehin kein Code, und mit Blatt zaehlt niemand die Runden nach.
  //
  // Geprueft wird die WIRKUNG und nicht die Konstante. Eine Pruefung auf "START === 0x0a"
  // waere mit der Konstante zusammen falsch gewesen und haette nichts gemerkt.
  stAdd('Start/Ziel-Code zaehlt eine Runde', () => {
    const gemerkt = { state: raceState, laps: raceLapTimes.slice(),
                      start: raceLapStart, dash: dashLapStart, part: racePartialMs,
                      form: raceFormationLap };
    const anzeige = $('race-status') ? $('race-status').textContent : null;
    const echterSpieler = playerCar;
    try {
      // Ein Fahrpaket bauen und nur Byte 12 austauschen. Byte 11 ist der Kachelzaehler und
      // muss sich mitbewegen, sonst greift die Wiederholungssperre.
      const paket = (code, zaehler) => {
        const a = new Array(19).fill(0);
        a[11] = zaehler; a[12] = code; a[14] = 0x22;
        return a;
      };
      // Der Testwagen muss das Spielerauto SEIN, nicht bloss die Rolle tragen:
      // onCarNotify ruft die Schirmauswertung mit car === playerCar auf, und dort sitzt die
      // Rundenzaehlung. So laeuft die Pruefung durch dieselbe Kette wie eine echte Fahrt.
      const attrappe = { device: { id: 'st-lap', name: 'Pruefwagen' }, role: 'player',
                         rx: null, tx: null, tileCode: 0xff, tileCount: null,
                         lastCodeAt: 0, yaw: 0, ghost: null, timer: null, race: null };
      const zaehle = (code) => {
        raceState = 'racing';
        raceFormationLap = false;
        raceLapTimes = [];
        raceLapStart = Date.now() - 5000;
        dashLapStart = Date.now() - 5000;
        racePartialMs = null;
        // Den Erkenner zuruecksetzen, sonst laeuft die zweite Messung unter anderen
        // Bedingungen als die erste: dashLastTileCounter und die Wiederholungssperre sind
        // Modulzustand und bleiben sonst stehen.
        dashPendingCode = null; dashPendingSeen = 0;
        dashLastTileCounter = null;
        dashLastActedCode = null; dashLastActedAt = 0;
        playerCar = attrappe;
        // VIER Pakete, nicht zwei. Die Kette verlangt der Reihe nach: einmal vormerken,
        // einmal bestaetigen (dabei wird nur der Kachelzaehler gemerkt), und erst wenn der
        // Zaehler sich bewegt, wird gehandelt.
        for (let k = 1; k <= 4; k++) {
          OMEGA_TEST.feedNotify(paket(code, k), { car: attrappe });
        }
        return raceLapTimes.length;
      };
      const mit0a = zaehle(0x0a);
      const mit03 = zaehle(0x03);
      const mit01 = zaehle(0x01);
      const mit02 = zaehle(0x02);
      // 0x0a MUSS zaehlen, 0x03 (Linkskurve) und 0x02 (Gerade) duerfen nicht. 0x01 zaehlt
      // weiter, weil es als frueher angenommener Wert absichtlich gueltig geblieben ist.
      const ok = mit0a >= 1 && mit03 === 0 && mit02 === 0 && mit01 >= 1;
      return { ok,
               mass: '0x0a -> ' + mit0a + ' Runde(n), 0x03 Linkskurve -> ' + mit03
                     + ', 0x02 Gerade -> ' + mit02 + ', 0x01 alt -> ' + mit01 };
    } finally {
      raceState = gemerkt.state; raceLapTimes = gemerkt.laps;
      raceLapStart = gemerkt.start; dashLapStart = gemerkt.dash;
      racePartialMs = gemerkt.part; raceFormationLap = gemerkt.form;
      playerCar = echterSpieler;
      if (anzeige !== null) $('race-status').textContent = anzeige;
    }
  });

  // ---- Nasse Lenkung: langsam voll, schnell weniger ----
  // Gemeldet als "auf Slicks im Regen kann ich nur geradeaus fahren". Ursache war, dass die
  // Kapazitaet der Vorderachse bei JEDER Fahrt mit dem Nassfaktor multipliziert wurde, das
  // Motorbremsen aber nicht - der geschrumpfte Reibkreis war schon im Schritttempo leer.
  stAdd('Nasse Lenkung greift erst mit der Fahrt', () => {
    if (!window.OMEGA_TEST || !OMEGA_TEST.physSteerGrip) {
      return { skip: true, mass: 'physSteerGrip nicht vorhanden' };
    }
    const q = (kmh) => {
      const tr = OMEGA_TEST.physSteerGrip({ gripScale: 1.0, kmh }).steerGrip;
      const na = OMEGA_TEST.physSteerGrip({ gripScale: 0.45, kmh }).steerGrip;
      return na / Math.max(1e-9, tr);
    };
    const bei = {};
    for (const v of [25, 50, 120, 290]) bei[v] = q(v);
    // Bis 50 km/h muss Regen die Lenkung praktisch unberuehrt lassen, bei 290 muss der
    // Verlust wieder voll da sein - sonst waere aus dem Regen ein Schoenwetterregen
    // geworden, und das war nicht die Bitte.
    const ok = bei[25] > 0.98 && bei[50] > 0.98 && bei[120] < 0.85 && bei[290] < 0.6;
    return { ok,
             mass: [25, 50, 120, 290].map(v => v + ' km/h ' + Math.round(bei[v] * 100) + ' %')
                   .join(', ') + ' vom Trockenwert' };
  });

  // ---- Rueckwaertsgang in der Automatik ----
  stAdd('Automatik: Viereck legt R, nur langsam', () => {
    if (!window.OMEGA_TEST || !OMEGA_TEST.physShift) {
      return { skip: true, mass: 'physShift nicht vorhanden' };
    }
    const sh = OMEGA_TEST.physShift;
    const langsam = sh({ auto: true, von: 'forward', gang: 0, kmh: 5, richtung: -1 });
    const schnell = sh({ auto: true, von: 'forward', gang: 0, kmh: 30, richtung: -1 });
    const raus = sh({ auto: true, von: 'reverse', gang: 0, kmh: 0, richtung: 1 });
    // Die Handschaltung muss unberuehrt bleiben: dort fuehrt der Weg weiter ueber den
    // Leerlauf, und das ist Absicht - ein Handschalter soll den Zwischenschritt sehen.
    const hand1 = sh({ auto: false, von: 'forward', gang: 0, kmh: 0, richtung: -1 });
    const hand2 = sh({ auto: false, von: 'neutral', gang: 0, kmh: 0, richtung: -1 });
    const ok = langsam.driveMode === 'reverse' && schnell.driveMode === 'forward'
               && raus.driveMode === 'forward' && raus.gear === 0
               && hand1.driveMode === 'neutral' && hand2.driveMode === 'reverse';
    return { ok,
             mass: 'Automatik 5 km/h -> ' + langsam.driveMode + ', 30 km/h -> '
                   + schnell.driveMode + ', Kreis aus R -> ' + raus.driveMode
                   + ' Gang ' + raus.gear
                   + ' | Hand unveraendert: Gang 1 -> ' + hand1.driveMode
                   + ', Leerlauf -> ' + hand2.driveMode };
  });

  // ---- Der Rohcode zeigt auch ohne laufenden Kachelzaehler ----
  // Der Kern des Scannerfehlers: die Anzeige sass hinter vier Ruecksprungen, einer davon
  // verlangte, dass der Kachelzaehler des Autos weiterlaeuft. Ueber ein Blatt auf dem
  // Fussboden tut er das nicht, und dann wurde nie etwas angezeigt.
  stAdd('Musterprobe zeigt auch bei stehendem Kachelzaehler', () => {
    const feld = $('tile-probe');
    if (!feld || !window.OMEGA_TEST || !OMEGA_TEST.feedNotify) {
      return { skip: true, mass: 'Musterprobe nicht im Dokument' };
    }
    const vorher = feld.textContent;
    const echterSpieler = playerCar;
    const gemerkt = { p: dashPendingCode, s: dashPendingSeen, c: dashLastTileCounter };
    try {
      const attrappe = { device: { id: 'st-probe', name: 'Pruefwagen' }, role: 'player',
                         rx: null, tx: null, tileCode: 0xff, tileCount: null,
                         lastCodeAt: 0, yaw: 0, ghost: null, timer: null, race: null };
      playerCar = attrappe;
      dashPendingCode = null; dashPendingSeen = 0; dashLastTileCounter = null;
      const paket = (code, zaehler) => {
        const a = new Array(19).fill(0);
        a[11] = zaehler; a[12] = code; a[14] = 0x22;
        return a;
      };
      // Byte 11 bleibt FEST: genau der Fall, in dem vorher nichts angezeigt wurde.
      for (let k = 0; k < 3; k++) OMEGA_TEST.feedNotify(paket(0x14, 7), { car: attrappe });
      const text = feld.textContent;
      // BEIDE Sprachen nennen, denn dieser Test lief nur auf Deutsch. Aufgefallen ist es
      // erst, als der neue Uebersetzungstest die Oberflaeche auf Englisch gestellt hat: dann
      // steht dort "still" und dieser Test meldete einen Fehler, den es nicht gab. Ein Test,
      // der still von der Spracheinstellung abhaengt, ist schlimmer als keiner - er zeigt
      // rot fuer etwas, das funktioniert.
      //
      // Der Code selbst (0x14) ist sprachfrei und traegt die eigentliche Aussage; das Wort
      // dazu wird mitgeprueft, weil die Aussage "der Zaehler steht" der Punkt dieses Tests
      // ist. Kommt eine dritte Sprache dazu, faellt der Test auf - und das ist richtig so.
      const ok = text.indexOf('0x14') >= 0 && /steht|still/.test(text);
      return { ok, mass: 'angezeigt: "' + text + '"' };
    } finally {
      playerCar = echterSpieler;
      dashPendingCode = gemerkt.p; dashPendingSeen = gemerkt.s;
      dashLastTileCounter = gemerkt.c;
      feld.textContent = vorher;
    }
  });

  // ---- Die Automatik schaltet durch ----
  //
  // Diese Pruefung hat gefehlt, und ihr Fehlen hat einen Fehler durchgelassen: der
  // Rueckwaertsgang-Umbau hat den Automatikblock so gebaut, dass er auch die Aufrufe der
  // Automatik SELBST abfing - danach blieb das Auto im ersten Gang. Drei Pruefungen fuer die
  // drei neuen Faelle, keine fuer den alten, der bleiben sollte.
  //
  // Gemessen wird ueber update() aus dem Stand mit Vollgas, also durch dieselbe Kette wie
  // beim Fahren. Ein direkter Aufruf des Getriebes haette den Fehler nicht gefunden, denn er
  // lag im Weg dorthin.
  stAdd('Automatik schaltet aus dem Stand durch', () => {
    if (!window.OMEGA_TEST || !OMEGA_TEST.physAutoGears) {
      return { skip: true, mass: 'physAutoGears nicht vorhanden' };
    }
    const r = OMEGA_TEST.physAutoGears(14);
    const gaenge = r.folge.filter(x => x.gang > 0);
    // Mindestens bis in den vierten Gang, und die Gaenge muessen AUFSTEIGEN. Ein Feld, das
    // nur "1" enthaelt, ist genau der gemeldete Fehler.
    const aufsteigend = gaenge.every((x, i) => i === 0 || x.gang >= gaenge[i - 1].gang);
    const ok = r.hoechster >= 4 && aufsteigend && r.endKmh > 150;
    return { ok,
             mass: gaenge.map(x => x.gang + '. bei ' + x.kmh + ' km/h').join(', ')
                   + ' | Ende ' + r.endKmh + ' km/h' };
  });

  // ---- Fahrleistung gegen die GT3-Tabelle ----
  //
  // Gemessen ueber update(), also durch dieselbe Kette wie beim Fahren. Die vorhandene
  // Pruefung "Physik: 0 auf 100" vergleicht das VEREINFACHTE Modell mit seinem eigenen
  // Anker und ist damit blind fuer den Unterschied zwischen beiden - mit Anker 3,2 meldete
  // sie 3,195 s, waehrend update() 4,46 s brauchte. Sie bleibt, weil sie die Kalibrierung
  // selbst prueft; DIESE hier prueft, was das Auto tut.
  //
  // Die Grenze ist 20 % je Punkt und nicht 5 %: der Rest ist ein Formfehler in der
  // Drehmomentkurve, der mit den vier gefitteten Werten nicht wegzubekommen ist. Eine
  // Grenze, die der Bestand nicht haelt, ist keine Grenze, sondern ein Daueralarm.
  stAdd('Fahrleistung gegen die GT3-Tabelle', () => {
    if (!window.OMEGA_TEST || !OMEGA_TEST.physCurve) {
      return { skip: true, mass: 'physCurve nicht vorhanden' };
    }
    const ZA = { 50: 1.1, 100: 3.1, 150: 5.4, 200: 8.5 };
    const ZB = { 100: 2.1, 150: 3.2, 200: 4.2, 250: 5.6 };
    const c = OMEGA_TEST.physCurve({ marken: [50, 100, 150, 200],
                                     bremsAb: [100, 150, 200, 250] });
    const teile = [], schlecht = [];
    for (const k of [50, 100, 150, 200]) {
      const ist = c.beschleunigen[k];
      if (ist === undefined) { schlecht.push('0-' + k + ' nie erreicht'); continue; }
      const ab = (ist - ZA[k]) / ZA[k];
      teile.push('0-' + k + ' ' + ist.toFixed(2) + ' s (' + (ab * 100).toFixed(0) + ' %)');
      if (Math.abs(ab) > 0.20) schlecht.push('0-' + k);
    }
    for (const k of [100, 150, 200, 250]) {
      const b = c.bremsen[k];
      const ab = (b.s - ZB[k]) / ZB[k];
      teile.push(k + '-0 ' + b.s.toFixed(2) + ' s (' + (ab * 100).toFixed(0) + ' %)');
      if (Math.abs(ab) > 0.20) schlecht.push(k + '-0');
    }
    return { ok: !schlecht.length,
             mass: teile.join(', ')
                   + (schlecht.length ? ' | ueber 20 % ab: ' + schlecht.join(', ')
                                      : ' | alle innerhalb 20 %') };
  });

  // ---- Lenkung unter Last, ueber eine gefahrene Bremsung ----
  //
  // Die erste Fassung maass den DAUERZUSTAND: Vollbremsung bei festgehaltener Geschwindigkeit,
  // vierzig Takte lang. Diesen Betriebspunkt gibt es beim Fahren nicht - wer bei 150 km/h
  // voll bremst, ist eine Sekunde spaeter bei 100. Der statische Wert lag deshalb bei 12 %
  // (dem Notboden), waehrend die gefahrene Kurve an derselben Stelle 38 % zeigt. Eine
  // Pruefung, die einen unmoeglichen Betriebspunkt bewertet, misst nicht das Fahrgefuehl.
  //
  // Geprueft wird jetzt genau das, was gemeldet war: unter starkem Bremsen bei hoher Fahrt
  // deutlich weniger Lenkung, bei niedriger Fahrt wieder weitgehend da, im Stand ganz da.
  // Der letzte Punkt ist der wichtigste - "fast im Stand kann ich nicht mehr lenken" war der
  // Fehler, und eine Pruefung ohne ihn haette ihn wieder durchgelassen.
  stAdd('Lenkung ueber eine gefahrene Vollbremsung', () => {
    if (!window.OMEGA_TEST || !OMEGA_TEST.physSteerTrace) {
      return { skip: true, mass: 'physSteerTrace nicht vorhanden' };
    }
    const r = OMEGA_TEST.physSteerTrace({ bisKmh: 200, brake: 1, steering: 0.6 });
    const bei = (z) => {
      let b = null;
      for (const x of r.bremsspur) {
        if (!b || Math.abs(x.kmh - z) < Math.abs(b.kmh - z)) b = x;
      }
      return b;
    };
    const roll = r.rollen.winkel;
    const hoch = bei(140), mittel = bei(90), tief = bei(30);
    if (!hoch || !mittel || !tief) {
      return { skip: true, mass: 'Bremsspur zu kurz, nur '
                                 + r.bremsspur.length + ' Punkte' };
    }
    const q = (x) => x.winkel / Math.max(1e-6, roll);
    // Bei hoher Fahrt hoechstens 70 % - deutlich weniger, aber nicht null. Bei niedriger
    // Fahrt mindestens 85 %. Und im Stand mindestens 95 %: dort darf die Bremse gar keine
    // Rolle mehr spielen.
    const ok = q(hoch) < 0.70 && q(hoch) > 0.10
               && q(tief) > 0.85
               && r.imStand / Math.max(1e-6, roll) > 0.95;
    return { ok,
             mass: 'rollend ' + roll.toFixed(2) + ' | ' + hoch.kmh + ' km/h '
                   + Math.round(q(hoch) * 100) + ' %, ' + mittel.kmh + ' km/h '
                   + Math.round(q(mittel) * 100) + ' %, ' + tief.kmh + ' km/h '
                   + Math.round(q(tief) * 100) + ' %, Stand '
                   + Math.round(r.imStand / roll * 100) + ' %' };
  });

  // ---- Wiederholte Ueberfahrt im Ausdruck-Modus ----
  stAdd('Ausdruck-Modus zaehlt jede Ueberfahrt', () => {
    if (!window.OMEGA_TEST || !OMEGA_TEST.feedNotify) {
      return { skip: true, mass: 'feedNotify nicht vorhanden' };
    }
    const sw = $('setting-ontrack');
    const gemerkt = { state: raceState, laps: raceLapTimes.slice(), start: raceLapStart,
                      dash: dashLapStart, part: racePartialMs, form: raceFormationLap,
                      rail: sw ? sw.checked : true, sp: playerCar,
                      mp: dashMarkerPrev, ac: dashLastActedCode, aa: dashLastActedAt,
                      pc: dashPendingCode, ps: dashPendingSeen, lc: dashLastTileCounter };
    const anzeige = $('race-status') ? $('race-status').textContent : null;
    try {
      // In den Ausdruck-Modus, denn nur dort gilt die Flankenerkennung.
      if (sw) { sw.checked = false; sw.dispatchEvent(new Event('change', { bubbles: true })); }
      const attrappe = { device: { id: 'st-mark', name: 'Pruefwagen' }, role: 'player',
                         rx: null, tx: null, tileCode: 0xff, tileCount: null,
                         lastCodeAt: 0, yaw: 0, ghost: null, timer: null, race: null };
      playerCar = attrappe;
      raceState = 'racing'; raceFormationLap = false; raceLapTimes = [];
      raceLapStart = Date.now() - 5000; dashLapStart = Date.now() - 5000;
      racePartialMs = null;
      // Beide Erkennerwege zuruecksetzen, nicht nur den neuen: sonst zaehlt der Weg ueber
      // den Kachelzaehler aus einer frueheren Pruefung mit, und die erste Ueberfahrt kommt
      // doppelt. Genau daran ist der erste Anlauf dieser Pruefung gescheitert.
      dashMarkerPrev = false;
      dashLastActedCode = null; dashLastActedAt = 0;
      dashPendingCode = null; dashPendingSeen = 0; dashLastTileCounter = null;
      // Byte 12 bleibt 0x0a, Byte 11 bleibt 7: nur der Musterkontakt in Byte 15 wechselt.
      const paket = (kontakt) => {
        const a = new Array(19).fill(0);
        a[11] = 7; a[12] = 0x0a; a[14] = 0x82; a[15] = kontakt ? 0x08 : 0x00;
        return a;
      };
      const fahre = () => {
        // an, an, aus, aus - eine Ueberfahrt mit Ein- und Ausfahrt.
        for (const k of [true, true, false, false]) {
          OMEGA_TEST.feedNotify(paket(k), { car: attrappe });
        }
      };
      fahre();
      const nach1 = raceLapTimes.length;
      // Die Sperre gegen Doppelrunden zurueckstellen: eine echte zweite Runde liegt Sekunden
      // spaeter, und diese Pruefung soll die WIEDERHOLUNG zeigen und nicht die Sperre.
      // Die Sperre gilt fuer BEIDE Wege gemeinsam. Sie hier zurueckzustellen ist genau das,
      // was in Wirklichkeit die Zeit tut: eine echte zweite Runde liegt Sekunden spaeter.
      dashLastActedAt = 0;
      fahre();
      const nach2 = raceLapTimes.length;
      dashLastActedAt = 0;
      fahre();
      const nach3 = raceLapTimes.length;
      return { ok: nach1 === 1 && nach2 === 2 && nach3 === 3,
               mass: 'Runden nach drei Ueberfahrten: ' + nach1 + ', ' + nach2 + ', ' + nach3
                     + ' (Code und Kachelzaehler dabei unveraendert)' };
    } finally {
      raceState = gemerkt.state; raceLapTimes = gemerkt.laps;
      raceLapStart = gemerkt.start; dashLapStart = gemerkt.dash;
      racePartialMs = gemerkt.part; raceFormationLap = gemerkt.form;
      playerCar = gemerkt.sp;
      dashMarkerPrev = gemerkt.mp;
      dashLastActedCode = gemerkt.ac; dashLastActedAt = gemerkt.aa;
      dashPendingCode = gemerkt.pc; dashPendingSeen = gemerkt.ps;
      dashLastTileCounter = gemerkt.lc;
      if (sw && sw.checked !== gemerkt.rail) {
        sw.checked = gemerkt.rail;
        sw.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (anzeige !== null) $('race-status').textContent = anzeige;
    }
  });

  // ---- Ein Stoss erzeugt Schaden ----
  //
  // Diese Pruefung haette den Fehler gefunden: detectCrash war definiert und wurde nie
  // aufgerufen. Ein Merkmal, das nichts tut, sieht von aussen genauso aus wie ein Merkmal,
  // das nichts zu tun hat - deshalb wird hier nicht die Funktion aufgerufen, sondern der
  // WEG durch die Paketauswertung gegangen.
  stAdd('Ein Stoss erzeugt Schaden', () => {
    if (!window.OMEGA_TEST || !OMEGA_TEST.feedNotify) {
      return { skip: true, mass: 'feedNotify nicht vorhanden' };
    }
    const sw = $('setting-crash-damage');
    const gemerkt = { sp: playerCar, dmg: damage,
                      an: crashDetectionEnabled,
                      a1: crashRollingAvg1, a3: crashRollingAvg3, lt: lastCrashTime };
    try {
      crashDetectionEnabled = true;
      crashRollingAvg1 = null; crashRollingAvg3 = null; lastCrashTime = 0;
      damage = 0;
      const attrappe = { device: { id: 'st-crash', name: 'Pruefwagen' }, role: 'player',
                         rx: null, tx: null, tileCode: 0xff, tileCount: null,
                         lastCodeAt: 0, yaw: 0, ghost: null, timer: null, race: null };
      playerCar = attrappe;
      const paket = (b1, b3) => {
        const a = new Array(19).fill(0);
        a[1] = b1 & 0xff; a[3] = b3 & 0xff; a[14] = 0x22;
        return a;
      };
      // Erst ruhig, damit der Mittelwert steht.
      for (let i = 0; i < 12; i++) OMEGA_TEST.feedNotify(paket(4, 2), { car: attrappe });
      const ruhig = damage;
      // Dann ein Stoss: beide Achsen weit weg vom Mittelwert. CRASH_THRESHOLD ist 40, die
      // Abweichung hier ist deutlich darueber, damit die Pruefung nicht am Rand haengt.
      OMEGA_TEST.feedNotify(paket(100, 90), { car: attrappe });
      const nachStoss = damage;
      return { ok: ruhig === 0 && nachStoss > 0,
               mass: 'ruhig ' + ruhig.toFixed(1) + ' %, nach einem Stoss '
                     + nachStoss.toFixed(1) + ' % Schaden' };
    } finally {
      playerCar = gemerkt.sp; damage = gemerkt.dmg;
      crashDetectionEnabled = gemerkt.an;
      crashRollingAvg1 = gemerkt.a1; crashRollingAvg3 = gemerkt.a3;
      lastCrashTime = gemerkt.lt;
      updateDamageFuelUI();
    }
  });

  // ---- Die Bremsbalance wirkt, und in welcher Richtung ----
  //
  // Ihr Vorgaenger, ein Bonus auf maxSteerLimit, wurde im 1. Gang (gearFrac = 0, also
  // maxSteerLimit exakt 1,0) durch das folgende Math.min(1, ...) vollstaendig weggeschnitten
  // und war deshalb nicht spuerbar. Diese Pruefung faellt genau dann durch.
  //
  // Gemessen wird an der GEFAHRENEN Spur und nicht an einem Beharrungspunkt: eine fruehere
  // Messung bei festen 150 km/h mit Vollbremse ergab 12 %, die gefahrene Spur 38 %. Der
  // Zustand, an dem sie gemessen hatte, kommt im Fahrbetrieb nie vor.
  stAdd('Bremsbalance aendert die Lenkung beim Bremsen', () => {
    if (!window.OMEGA_TEST || !OMEGA_TEST.physSteerTrace) {
      return { skip: true, mass: 'physSteerTrace nicht vorhanden' };
    }
    // Die Balance geht als ABWEICHUNG in den Messaufbau, nicht als Zuweisung an die
    // Konfiguration davor: der Aufbau stellt seinen Kalibrierbezug her und wuerde eine
    // Zuweisung von aussen ueberschreiben. Genau daran ist diese Pruefung einmal
    // gescheitert - drei Messungen, dreimal derselbe Wert, Spanne 0.
    {
      const q = (pct) => {
        const r = OMEGA_TEST.physSteerTrace({ bisKmh: 200, brake: 1, steering: 0.6,
                                              cfg: { brakeBias: pct / 100 } });
        let b = null;
        for (const x of r.bremsspur) {
          if (!b || Math.abs(x.kmh - 140) < Math.abs(b.kmh - 140)) b = x;
        }
        if (!b) return null;
        return { bei140: b.winkel / Math.max(1e-6, r.rollen.winkel),
                 stand: r.imStand / Math.max(1e-6, r.rollen.winkel) };
      };
      const v = q(50), m = q(62), h = q(80);
      if (!v || !m || !h) return { skip: true, mass: 'Bremsspur zu kurz' };
      // Erstens streng fallend: mehr Bremse vorn heisst weniger Lenkung. Zweitens ein
      // deutlicher Abstand, sonst ist der Regler wieder nur nominell da. Und drittens darf
      // die Balance im STAND nichts aendern - dort spielt die Bremse keine Rolle, und das
      // war der Fehler, gegen den die Tempoabhaengigkeit ueberhaupt eingebaut wurde.
      // FALLEND, aber nur BIS ZUM NOTBODEN - und das ist keine Abschwaechung des Tests,
      // sondern die Berichtigung einer falschen Annahme. Der Reibkreis hat einen Boden von
      // 0,12 (eine Trockenreserve, damit das Auto nie voellig hilflos ist). Ist er erreicht,
      // aendert mehr Bremse vorn nichts mehr, und "streng fallend" kann dort nicht gelten.
      //
      // Seit der Reibkreis-Faktor auf 1,15 steht - der kleinste Wert, der bei Pros
      // Bremsbalance von 58 % ueberhaupt wirkt - liegen 66 % und mehr auf dem Boden. Der Test
      // verlangt deshalb: nicht steigend ueberall, streng fallend im nicht gesaettigten
      // Bereich, und wo es flach ist, MUSS es der Boden sein. Ein beliebiges Plateau waere
      // weiterhin ein Fehler.
      const nichtSteigend = v.bei140 >= m.bei140 - 1e-9 && m.bei140 >= h.bei140 - 1e-9;
      const strengOben = v.bei140 > m.bei140;
      const amBoden = h.bei140 < 0.2;
      const spanne = v.bei140 - h.bei140;
      const standGleich = Math.abs(v.stand - h.stand) < 0.02 && h.stand > 0.95;
      return { ok: nichtSteigend && strengOben && amBoden && spanne > 0.25 && standGleich,
               mass: '140 km/h: 50 % vorn ' + Math.round(v.bei140 * 100)
                     + ' %, 62 % vorn ' + Math.round(m.bei140 * 100)
                     + ' %, 80 % vorn ' + Math.round(h.bei140 * 100)
                     + ' % | Spanne ' + Math.round(spanne * 100)
                     + ' Punkte, im Stand ' + Math.round(h.stand * 100) + ' %'
                     + (h.bei140 < 0.2 ? ' | 80 % vorn liegt auf dem Notboden' : '') };
    }
  });

  // ---- Der Lichtschaden geht bei der Reparatur wieder weg ----
  //
  // Er wurde gesetzt und nie zurueckgenommen: es gab im ganzen Projekt keine Zuweisung
  // lightDamage.front = false. Boxenstopp-Reparatur, resetCarState() und die Taste R setzen
  // alle nur damage = 0, waehrend der Tooltip "Boxenstopp repariert" versprach.
  //
  // Geprueft wird der Zustand ueber updateDamageFuelUI(), also den Weg, den alle drei
  // Ruecksetzwege ohnehin nehmen - nicht syncLightDamage() direkt. Eine Pruefung, die die
  // Funktion selbst aufruft, prueft nur, dass die Funktion existiert.
  stAdd('Reparatur macht die Beleuchtung wieder heil', () => {
    const gemerkt = { d: damage, f: lightDamage.front, r: lightDamage.rear };
    try {
      damage = 80;
      lightDamage.front = true;
      lightDamage.rear = false;
      updateDamageFuelUI();
      const kaputt = lightDamage.front;
      // Ueber der Schwelle darf nichts passieren, sonst waere aus der Ableitung ein
      // Zuruecksetzen bei jedem Bild geworden.
      damage = LIGHT_DEAD_DAMAGE - 0.5;
      updateDamageFuelUI();
      const heil = !lightDamage.front && !lightDamage.rear;
      const text = ($('dash-light-dmg') || {}).textContent;
      return { ok: kaputt && heil && !text,
               mass: 'bei 80 % Schaden defekt: ' + (kaputt ? 'ja' : 'NEIN')
                     + ', unter ' + LIGHT_DEAD_DAMAGE + ' % heil: '
                     + (heil ? 'ja' : 'NEIN') + ', Anzeigetext "' + text + '"' };
    } finally {
      damage = gemerkt.d;
      lightDamage.front = gemerkt.f;
      lightDamage.rear = gemerkt.r;
      updateLightTellTales();
      updateDamageFuelUI();
    }
  });

  // ---- Autopilot waehrend der gelben Flagge ----
  //
  // Ein Merkmal, das das Auto von SELBST fahren laesst, gehoert geprueft - und zwar an der
  // Eigenschaft, die es gefaehrlich machen wuerde: dass es in der falschen Betriebsart
  // greift. In der Ausdruck-Stellung haelt sich das Auto nicht selbst auf der Bahn, und ein
  // Autopilot ohne Querregelung wuerde es geradeaus in die Bande fahren.
  //
  // Geprueft wird der Regler, nicht die Anzeige: der Rueckgabewert bei zu langsam muss Gas
  // sein, bei zu schnell Bremse, und bei richtigem Tempo beides nahe null. Ohne den letzten
  // Punkt waere ein Regler, der dauerhaft Vollgas gibt, ebenfalls "gruen".
  stAdd('Autopilot nur auf der Bahn, und er regelt', () => {
    if (typeof autopilotYellow !== 'function') {
      return { skip: true, mass: 'autopilotYellow nicht vorhanden' };
    }
    const merk = { flag: flagState, tm: trackMode, v: physEngine.state.speedKmh };
    try {
      const bei = (kmh) => {
        physEngine.state.speedKmh = kmh / REAL_SCALE;
        return autopilotYellow();
      };
      // 1. Gruen: gar kein Eingriff, egal wie schnell.
      flagState = 'green'; trackMode = 'on';
      const gruen = bei(20);
      // 2. Gelb, aber Ausdruck-Stellung: ebenfalls kein Eingriff.
      flagState = 'yellow'; trackMode = 'off';
      const ausdruck = bei(20);
      // 3. Gelb auf der Bahn: regeln. YELLOW_KMH ist das Ziel.
      trackMode = 'on';
      const langsam = bei(YELLOW_KMH * 0.4);
      const schnell = bei(YELLOW_KMH * 2.5);
      const passend = bei(YELLOW_KMH);
      if (!langsam || !schnell || !passend) {
        return { ok: false, mass: 'greift auf der Bahn nicht' };
      }
      const ok = gruen === null && ausdruck === null
                 && langsam.throttle > 0.2 && langsam.brake === 0
                 && schnell.brake > 0.2 && schnell.throttle === 0
                 && passend.throttle < 0.15 && passend.brake < 0.15;
      return { ok,
               mass: 'gruen ' + (gruen === null ? 'aus' : 'AN')
                     + ', Ausdruck ' + (ausdruck === null ? 'aus' : 'AN')
                     + ' | bei ' + Math.round(YELLOW_KMH * 0.4) + ' km/h Gas '
                     + langsam.throttle.toFixed(2)
                     + ', bei ' + Math.round(YELLOW_KMH * 2.5) + ' km/h Bremse '
                     + schnell.brake.toFixed(2)
                     + ', bei ' + YELLOW_KMH + ' km/h Gas ' + passend.throttle.toFixed(2)
                     + ' Bremse ' + passend.brake.toFixed(2) };
    } finally {
      flagState = merk.flag;
      trackMode = merk.tm;
      physEngine.state.speedKmh = merk.v;
    }
  });

  // ---- Der Tempo-Regler der Ghosts ----
  //
  // Vier Behauptungen, die vorher nur im Kommentar standen. Die erste ist die, die der
  // Benutzer gemeldet hat: nach dem Zurueckstellen eines abgeflogenen Autos wurde es ihm
  // mit Vollgas aus der Hand gerissen. Ursache war throttle = err * 4 bei v = 0.
  stAdd('Ghost-Regler: Rampe, Totband, Ratenbegrenzung', () => {
    if (!window.OMEGA_TEST || !OMEGA_TEST.ghostSpeedControl) {
      return { skip: true, mass: 'ghostSpeedControl nicht vorhanden' };
    }
    const C = OMEGA_TEST.ghostSpeedControl;
    const teile = [], schlecht = [];

    // 1. Erster Takt aus dem Stand: kein Vollgas. Die Ratenbegrenzung allein garantiert
    //    das, unabhaengig von der Rampe - deshalb ist es hier pruefbar.
    const g1 = {};
    const t1 = C(g1, 0.5, 0, 0.045).throttle;
    teile.push('erster Takt Gas ' + t1.toFixed(2));
    if (!(t1 < 0.15)) schlecht.push('erster Takt gibt ' + t1.toFixed(2) + ' Gas');

    // 2. Und nach einer Sekunde Takten ist es voll da - eine Begrenzung, die das Gas
    //    dauerhaft klein haelt, waere ein lahmes Auto und kein sanftes.
    const g2 = {};
    let t2 = 0;
    for (let i = 0; i < 25; i++) t2 = C(g2, 0.5, 0, 0.045).throttle;
    teile.push('nach 1,1 s ' + t2.toFixed(2));
    if (!(t2 > 0.9)) schlecht.push('kommt nicht auf Vollgas (' + t2.toFixed(2) + ')');

    // 3. Totband: am Ziel wird weder Gas gegeben noch gebremst. Ohne das pendelt der
    //    Regler, und ein pendelnder Ghost fuehlt sich kaputt an.
    const g3 = { lastThrottle: 0, lastBrake: 0 };
    const am = C(g3, 0.5, 0.5, 0.045);
    teile.push('am Ziel Gas ' + am.throttle.toFixed(2) + ' Bremse ' + am.brake.toFixed(2));
    if (am.throttle !== 0 || am.brake !== 0) schlecht.push('kein Totband am Ziel');

    // 4. Zu schnell: es wird gebremst, und zwar SCHNELLER als Gas aufgebaut wird. Gas nimmt
    //    man weich, gebremst wird entschlossen.
    const g4 = {};
    const b4 = C(g4, 0.3, 0.9, 0.045).brake;
    teile.push('zu schnell Bremse ' + b4.toFixed(2));
    if (!(b4 > t1)) schlecht.push('Bremse kommt nicht schneller als Gas');

    return { ok: !schlecht.length,
             mass: teile.join(', ') + (schlecht.length ? ' | ' + schlecht.join('; ') : '') };
  });

  // ---- Boxengasse per doppeltem Start-Ausdruck ----
  //
  // Die experimentelle Variante, und die einzige mit einer Zeitbedingung: zwei
  // Musterkontakte innerhalb von 3 s bei MINDESTENS 1 s Abstand sind eine Boxeneinfahrt.
  //
  // Geprueft werden drei Faelle, und der dritte ist der wichtige: ein einzelner Ausdruck
  // haelt bei Fahrt etwa eine Sekunde Kontakt, und ohne den Mindestabstand wuerde das
  // Flattern EINES Musters als Paar gelesen. Ein Test nur mit dem gueltigen Paar haette
  // genau diesen Fehler durchgelassen.
  //
  // Der Weg geht ueber feedNotify, also durch die echte Paketauswertung - playerLapCrossed
  // direkt zu rufen wuerde die Erkennung umgehen, die hier geprueft werden soll.
  stAdd('Boxengasse: doppelter Ausdruck nimmt die Runde zurueck', () => {
    if (!window.OMEGA_TEST || !OMEGA_TEST.feedNotify) {
      return { skip: true, mass: 'feedNotify nicht vorhanden' };
    }
    const merk = { sp: playerCar, tm: trackMode, pt: pitTrigger, ps: pitState,
                   rs: raceState, lt: raceLapTimes.slice(), ls: raceLapStart,
                   ple: pitLaneEnabled, pdf: pitDoubleFirstAt,
                   ac: dashLastActedCode, aa: dashLastActedAt };
    try {
      const attrappe = { device: { id: 'st-pit', name: 'Pruefwagen' }, role: 'player',
                         rx: null, tx: null, tileCode: 0xff, tileCount: null,
                         lastCodeAt: 0, yaw: 0, ghost: null, timer: null, race: null };
      playerCar = attrappe;
      trackMode = 'off';
      pitLaneEnabled = true;
      pitTrigger = 'double';
      raceState = 'racing';

      const paket = (marker) => {
        const a = new Array(19).fill(0);
        a[10] = 140; a[12] = 0x0a; a[14] = 0x80; a[15] = marker ? 0x08 : 0x00;
        return a;
      };
      // Ein Kontakt ist eine steigende FLANKE von Byte 15 Bit 3, also aus-an-aus.
      const kontakt = () => {
        dashLastActedCode = null;
        dashLastActedAt = 0;
        OMEGA_TEST.feedNotify(paket(false), { car: attrappe });
        OMEGA_TEST.feedNotify(paket(true), { car: attrappe });
        OMEGA_TEST.feedNotify(paket(false), { car: attrappe });
      };
      // Den gemerkten Zeitpunkt VORVERLEGEN, statt im Test zu warten.
      //
      // Und zwar VOR dem zweiten Kontakt und nicht danach - das war der Fehler im ersten
      // Anlauf dieser Pruefung. pitDoubleCheck() liest pitDoubleFirstAt IM Kontakt; ein
      // Verschieben danach kommt zu spaet, beide Kontakte liegen dann Millisekunden
      // auseinander, und die Untergrenze von 1 s verwirft das Paar. Die Pruefung meldete
      // also einen Fehler, der im Messaufbau lag.
      const alter = (ms) => { if (pitDoubleFirstAt) pitDoubleFirstAt -= ms; };

      const teile = [], schlecht = [];

      // 1. Ein Kontakt allein ist eine Runde.
      raceLapTimes.length = 0;
      raceLapStart = Date.now() - 5000;
      pitDoubleFirstAt = 0;
      setPitState('off');
      kontakt();
      const nachEins = raceLapTimes.length;
      teile.push('ein Kontakt: ' + nachEins + ' Runde');
      if (nachEins !== 1) schlecht.push('erster Kontakt zaehlt keine Runde');

      // 2. Zweiter Kontakt nach 1,5 s: Paar, Runde zurueck, Boxengasse aktiv.
      raceLapStart = Date.now() - 1500;
      alter(1500);
      kontakt();
      const nachZwei = raceLapTimes.length;
      teile.push('Paar nach 1,5 s: ' + nachZwei + ' Runden, pitState ' + pitState);
      // EINE Runde, nicht null - und das ist die richtige Erwartung, auch wenn der erste
      // Anlauf dieser Pruefung null forderte.
      //
      // Der doppelte Ausdruck ist EIN physisches Ding: zwei Blaetter 50 cm auseinander am
      // Boxeneingang. Darueber zu fahren erzeugt zwei Kontakte, ist aber eine Ueberfahrt.
      // Also gehoert genau eine Runde gezaehlt, und der zweite, unechte Kontakt wird
      // zurueckgenommen. Null zu fordern hiesse, dass eine Boxeneinfahrt die vorige Runde
      // mitloescht - die ist aber wirklich gefahren worden.
      if (nachZwei !== 1) schlecht.push('Paar laesst ' + nachZwei
                                        + ' Runden stehen statt einer');
      if (pitState !== 'limited') schlecht.push('Paar aktiviert die Boxengasse nicht');

      // 3. DER WICHTIGE FALL: zwei Kontakte zu SCHNELL hintereinander sind KEIN Paar.
      //    Ein einzelner Ausdruck haelt bei Fahrt rund eine Sekunde Kontakt.
      raceLapTimes.length = 0;
      raceLapStart = Date.now() - 5000;
      pitDoubleFirstAt = 0;
      setPitState('off');
      kontakt();
      raceLapStart = Date.now() - 300;
      alter(300);
      kontakt();
      const nachSchnell = raceLapTimes.length;
      teile.push('zwei Kontakte in 0,3 s: ' + nachSchnell + ' Runden, pitState ' + pitState);
      if (nachSchnell !== 2) schlecht.push('zu schnelles Paar wird als Einfahrt gelesen');
      if (pitState !== 'off') schlecht.push('zu schnelles Paar aktiviert die Boxengasse');

      return { ok: !schlecht.length,
               mass: teile.join(' | ') + (schlecht.length ? ' || ' + schlecht.join('; ') : '') };
    } finally {
      playerCar = merk.sp; trackMode = merk.tm; pitTrigger = merk.pt;
      pitLaneEnabled = merk.ple; pitDoubleFirstAt = merk.pdf;
      raceState = merk.rs; raceLapStart = merk.ls;
      raceLapTimes.length = 0;
      merk.lt.forEach(l => raceLapTimes.push(l));
      dashLastActedCode = merk.ac; dashLastActedAt = merk.aa;
      setPitState(merk.ps);
    }
  });

  // ---- Doppelter Start-Ausdruck auf dem KACHELZAEHLER-WEG ----
  //
  // Dies ist der zweite von zwei Wegen, auf denen der Spieler Start/Ziel ueberfaehrt, und
  // der gewoehnliche: sobald sich Byte 11 bewegt - also sobald das Auto ein Streckenteil
  // weiterfaehrt -, laeuft der Kontakt hier durch und nicht ueber den Ausdruck-Weg.
  //
  // Hier fehlte pitDoubleCheck(), und deshalb zaehlte ein Paar zwei Runden statt einer. Der
  // vorhandene Test daneben baut Byte 14 = 0x80 und ging nur ueber den anderen Weg - weil er
  // gruen war, sah die Sache geprueft aus. Ein Test, der einen von zwei Wegen prueft, sagt
  // nichts ueber den anderen.
  stAdd('Boxengasse: doppelter Ausdruck auch bei laufendem Kachelzaehler', () => {
    if (!window.OMEGA_TEST || !OMEGA_TEST.feedNotify) {
      return { skip: true, mass: 'feedNotify nicht vorhanden' };
    }
    const merk = { sp: playerCar, tm: trackMode, pt: pitTrigger, ps: pitState,
                   rs: raceState, lt: raceLapTimes.slice(), ls: raceLapStart,
                   ple: pitLaneEnabled, pdf: pitDoubleFirstAt, pdc: pitDoubleCountsLap,
                   ac: dashLastActedCode, aa: dashLastActedAt,
                   pc: dashPendingCode, pv: dashPendingSeen, tc: dashLastTileCounter };
    try {
      const attrappe = { device: { id: 'st-pit2', name: 'Pruefwagen' }, role: 'player',
                         rx: null, tx: null, tileCode: 0xff, tileCount: null,
                         lastCodeAt: 0, yaw: 0, ghost: null, timer: null, race: null };
      playerCar = attrappe;
      trackMode = 'off';
      pitLaneEnabled = true;
      pitTrigger = 'double';
      pitDoubleCountsLap = false;
      raceState = 'racing';

      // Byte 14 = 0x22: Bit 5 gesetzt, also BAHN-Modus - der Weg mit Kachelzaehler.
      const paket = (code, zaehler) => {
        const a = new Array(19).fill(0);
        a[10] = 140; a[11] = zaehler; a[12] = code; a[14] = 0x22;
        return a;
      };
      // Ein Kontakt braucht dreierlei, und alle drei sind Schutzmassnahmen aus v0.4:
      // denselben Code ZWEIMAL (kein Einzelpaket zaehlt), einen VERAENDERTEN Zaehler, und
      // keinen Sperrvermerk vom vorigen Kontakt.
      let zaehler = 0;
      const kontakt = () => {
        dashLastActedCode = null;
        dashLastActedAt = 0;
        dashPendingCode = null;
        dashPendingSeen = 0;
        OMEGA_TEST.feedNotify(paket(0x0a, zaehler), { car: attrappe });
        OMEGA_TEST.feedNotify(paket(0x0a, zaehler), { car: attrappe });
        zaehler += 1;
        OMEGA_TEST.feedNotify(paket(0x0a, zaehler), { car: attrappe });
      };
      const alter = (ms) => { if (pitDoubleFirstAt) pitDoubleFirstAt -= ms; };

      const teile = [], schlecht = [];

      // Erster Kontakt: eine Runde. Der Zaehler muss dabei EINMAL gesetzt worden sein,
      // sonst verwirft der erste Kontakt sich selbst - deshalb ein Vorlauf.
      dashLastTileCounter = null;
      raceLapTimes.length = 0;
      raceLapStart = Date.now() - 5000;
      pitDoubleFirstAt = 0;
      setPitState('off');
      kontakt();
      const nachEins = raceLapTimes.length;
      teile.push('ein Kontakt: ' + nachEins + ' Runde');
      if (nachEins !== 1) schlecht.push('erster Kontakt zaehlt ' + nachEins + ' statt 1');

      // Zweiter Kontakt 1,5 s spaeter: Paar. EINE Runde bleibt stehen, nicht zwei.
      raceLapStart = Date.now() - 1500;
      alter(1500);
      kontakt();
      const nachZwei = raceLapTimes.length;
      teile.push('Paar nach 1,5 s: ' + nachZwei + ' Runden, pitState ' + pitState);
      if (nachZwei !== 1) {
        schlecht.push('Paar laesst ' + nachZwei + ' Runden stehen statt einer');
      }
      if (pitState !== 'limited') schlecht.push('Paar aktiviert die Boxengasse nicht');

      return { ok: !schlecht.length,
               mass: teile.join(' | ') + (schlecht.length ? ' || ' + schlecht.join('; ') : '') };
    } finally {
      playerCar = merk.sp; trackMode = merk.tm; pitTrigger = merk.pt;
      pitLaneEnabled = merk.ple; pitDoubleFirstAt = merk.pdf;
      pitDoubleCountsLap = merk.pdc;
      raceState = merk.rs; raceLapStart = merk.ls;
      raceLapTimes.length = 0;
      merk.lt.forEach(l => raceLapTimes.push(l));
      dashLastActedCode = merk.ac; dashLastActedAt = merk.aa;
      dashPendingCode = merk.pc; dashPendingSeen = merk.pv;
      dashLastTileCounter = merk.tc;
      setPitState(merk.ps);
    }
  });

  // ---- Das Woerterbuch hat keine doppelten Schluessel ----
  //
  // Ein doppelter Schluessel in einem Objektliteral ist kein Syntaxfehler: der spaetere
  // gewinnt, still. Gefunden wurden vier, und bei einem davon ("Einstellungen") wichen die
  // Werte ab - "Settings" gegen "settings" -, der frueher gepflegte war also seit dem
  // Hinzufuegen des zweiten wirkungslos.
  //
  // Von aussen ist das unsichtbar: die Uebersetzung ERSCHEINT, nur eben die falsche. Eine
  // Pruefung dafuer kostet nichts, weil das Woerterbuch schon im Speicher liegt - was sie
  // nicht kann, ist die Quelldatei sehen, in der die Dopplung steht. Sie zaehlt deshalb die
  // Schluessel des OBJEKTS gegen die Zahl der Zeilen, die im gebauten Dokument danach
  // aussehen; weichen sie ab, wurde etwas ueberschrieben.
  stAdd('Woerterbuch ohne doppelte Schluessel', () => {
    const imObjekt = Object.keys(I18N_EN).length;
    // Die Quelle steht im eigenen <script>. Sie zu lesen ist billiger und ehrlicher als die
    // Dopplung zu erraten: das Objekt selbst kann sie per Definition nicht zeigen.
    let inQuelle = null;
    for (const sc of document.querySelectorAll('script')) {
      const txt = sc.textContent || '';
      const i = txt.indexOf('const I18N_EN');
      if (i < 0) continue;
      const zeilen = txt.slice(i).split(String.fromCharCode(10));
      let n = 0;
      for (let k = 1; k < zeilen.length; k++) {
        const z = zeilen[k].trim();
        if (z.startsWith('};')) break;
        // Nur SCHLUESSELzeilen, also solche mit einem Doppelpunkt hinter dem
        // abschliessenden Anfuehrungszeichen. Der erste Anlauf zaehlte jede Zeile, die mit
        // einem Anfuehrungszeichen beginnt - also auch die Fortsetzungszeilen mehrzeiliger
        // Eintraege, bei denen der Wert allein auf der naechsten Zeile steht. Es gibt 40
        // solche Eintraege, und genau 40 hat er zuviel gezaehlt: eine Pruefung, die ihren
        // eigenen Formatierungsstil nicht kennt, meldet ihn als Fehler.
        // "Hinter dem abschliessenden Anfuehrungszeichen kommt ein Doppelpunkt" - also
        // eine SCHLUESSELzeile und nicht die Fortsetzungszeile eines mehrzeiligen Eintrags.
        //
        // Als Zeichenschleife und ausdruecklich NICHT als Regexp. Der erste Anlauf benutzte
        // einen, und dessen Zeichenklasse verlor beim Schreiben durch die Werkzeugkette
        // einen Backslash - aus [^"\\] wurde [^"\], eine unabgeschlossene Zeichenklasse,
        // und die IIFE brach ab. Eine Pruefung, die den Aufbau kaputtmachen kann, ist keine.
        if (z.charAt(0) === '"') {
          let j = 1, ende = -1;
          while (j < z.length) {
            if (z.charCodeAt(j) === 92) { j += 2; continue; }   // 92 = Backslash
            if (z.charAt(j) === '"') { ende = j; break; }
            j++;
          }
          if (ende > 0 && z.slice(ende + 1).trim().charAt(0) === ':') n++;
        }
      }
      inQuelle = n;
      break;
    }
    if (inQuelle === null) {
      return { skip: true, mass: 'Quelle nicht lesbar (eigene Datei statt inline)' };
    }
    return { ok: inQuelle === imObjekt,
             mass: inQuelle + ' Zeilen in der Quelle, ' + imObjekt + ' Schluessel im Objekt'
                   + (inQuelle === imObjekt ? '' : ' – '
                      + (inQuelle - imObjekt) + ' still ueberschrieben') };
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

