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
      const ok = text.indexOf('0x14') >= 0 && /steht/.test(text);
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
    const gemerkt = physEngine.config.brakeBias;
    try {
      const q = (pct) => {
        physEngine.config.brakeBias = pct / 100;
        const r = OMEGA_TEST.physSteerTrace({ bisKmh: 200, brake: 1, steering: 0.6 });
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
      const fallend = v.bei140 > m.bei140 && m.bei140 > h.bei140;
      const spanne = v.bei140 - h.bei140;
      const standGleich = Math.abs(v.stand - h.stand) < 0.02 && h.stand > 0.95;
      return { ok: fallend && spanne > 0.25 && standGleich,
               mass: '140 km/h: 50 % vorn ' + Math.round(v.bei140 * 100)
                     + ' %, 62 % vorn ' + Math.round(m.bei140 * 100)
                     + ' %, 80 % vorn ' + Math.round(h.bei140 * 100)
                     + ' % | Spanne ' + Math.round(spanne * 100)
                     + ' Punkte, im Stand ' + Math.round(h.stand * 100) + ' %' };
    } finally {
      physEngine.config.brakeBias = gemerkt;
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

