  // Rundenzeitbereinigung: nur lokale gespeicherte Daten, keine laufenden Rennen.
  // Eine falsche Zeit beweist NICHT, dass die gefahrenen Kilometer falsch sind.
  function statCleanExtraGueltig(extra) {
    if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return false;
    return Object.entries(extra).every(([key, p]) =>
      [BESTZEIT_STORE, TELE_STORE].includes(key) && p &&
      (p.vorher === null || typeof p.vorher === 'string') &&
      (p.nachher === null || typeof p.nachher === 'string'));
  }
  function statCleanExtraAktuell(extra, seite) {
    if (!statCleanExtraGueltig(extra)) throw new Error('Ungültige zusätzliche Statistikablage.');
    for (const [key, p] of Object.entries(extra)) {
      if (localStorage.getItem(key) !== p[seite]) throw new Error(statCleanText(
        'Bestzeit- oder Telemetriedaten haben sich geändert. Bitte Auswahl erneuern.',
        'Time-attack or telemetry data have changed. Please renew the selection.'));
    }
  }
  function statCleanSchreiben(paare, seite) {
    const vorher = {};
    for (const key of Object.keys(paare)) vorher[key] = localStorage.getItem(key);
    function schreiben(key, text) {
      if (text === null) localStorage.removeItem(key);
      else localStorage.setItem(key, text);
      if (localStorage.getItem(key) !== text) throw new Error('Statistik nicht geschrieben: ' + key);
    }
    try {
      for (const [key, p] of Object.entries(paare)) schreiben(key, p[seite]);
    } catch (e) {
      // localStorage besitzt keine Mehrfach-Transaktion. Bei erkannten Schreibfehlern
      // bereits geschriebene Ablagen zuruecknehmen; Sicherung bleibt fuer Notfaelle.
      const fehler = [];
      for (const [key, text] of Object.entries(vorher)) {
        try { if (localStorage.getItem(key) !== text) schreiben(key, text); }
        catch (r) { fehler.push(key); }
      }
      if (fehler.length) throw new Error(statCleanText(
        'Speicherfehler; Rücknahme unvollständig. Lokale Sicherung als JSON exportieren: ',
        'Storage error; rollback incomplete. Export the local backup as JSON: ') + fehler.join(', '));
      throw e;
    }
  }
  function statCleanAblage(key) {
    const raw = localStorage.getItem(key);
    const o = JSON.parse(raw || '{}');
    if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('Ungültige Ablage: ' + key);
    return { raw, o };
  }
  function statCleanStreckenKey(code) {
    const c = String(code || '').trim().toUpperCase();
    if (!c) return '';
    try {
      const parsed = codeToTrack(c);
      const tiles = parsed && parsed.tiles;
      if (tiles && tiles.length > 1) return bestzeitSchluessel(tiles);
    } catch (e) { /* unbekannte Altcodes bleiben exakt unterscheidbar */ }
    return c;
  }
  function statCleanGrenze(wert) {
    const s = String(wert).trim().replace(',', '.');
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)) throw new Error(statCleanText(
      'Bitte eine positive Sekundenzahl eingeben.', 'Please enter a positive number of seconds.'));
    const ms = Number(s) * 1000;
    if (!Number.isFinite(ms) || ms <= 0) throw new Error('Ungültiger Zeitgrenzwert.');
    return ms;
  }
  function statCleanZeitenPlan(o, code, grenze, bzRaw, teleRaw) {
    if (!o || !Array.isArray(o.sessions) || !o.cars || Array.isArray(o.cars)) throw new Error('Ungültige Statistikdaten.');
    const key = statCleanStreckenKey(code);
    if (!key || !Number.isFinite(grenze) || grenze <= 0) throw new Error('Strecke oder Grenzwert fehlt.');
    const neu = statCleanKopie(o), bz = JSON.parse(bzRaw || '{}'), tele = JSON.parse(teleRaw || '{}');
    for (const d of [bz, tele]) if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('Ungültige Zeitablage.');
    const b = { runden: 0, sitzungen: 0, rekorde: 0, spuren: 0, besteUnbekannt: 0, treffer: [] };
    const beruehrt = new Set();
    const kurz = ms => typeof ms === 'number' && Number.isFinite(ms) && ms < grenze;
    const spurKurz = sp => sp && kurz(sp.ms);
    for (let si = 0; si < neu.sessions.length; si++) {
      const s = neu.sessions[si];
      if (statCleanStreckenKey(s.strecke) !== key) continue;
      let betroffen = false;
      for (const a of (s.autos || [])) {
        const laps = Array.isArray(a.laps) ? a.laps : [], weg = [];
        laps.forEach((ms, i) => { if (kurz(ms)) weg.push(i); });
        if (!weg.length) continue;
        betroffen = true; b.runden += weg.length;
        const id = statCleanAutoKey(a, o), c = neu.cars[id];
        b.treffer.push({ art: 'runde', name: a.name || id, zeit: s.zeit,
          runden: weg.map(i => i + 1), ms: weg.map(i => laps[i]) });
        const behalten = new Set(laps.map((_, i) => i).filter(i => !weg.includes(i)));
        a.laps = laps.filter((_, i) => behalten.has(i));
        if (Array.isArray(a.ereignisse)) a.ereignisse = a.laps.map((_, j) => {
          const alt = [...behalten][j]; return a.ereignisse[alt] || {};
        });
        if (a.statistikBuchung) a.statistikBuchung.runden = a.laps.length;
        if (c) {
          c.runden = Math.max(0, (Number(c.runden) || 0) - weg.length);
          if (weg.some(i => laps[i] === c.besteMs)) beruehrt.add(id);
        }
        if (a.rolle === 'player') s.fahrstil = null;
      }
      if (betroffen) b.sitzungen++;
    }
    for (const id of beruehrt) {
      const c = neu.cars[id]; let anzahl = 0; const rest = [];
      for (const s of neu.sessions) for (const a of (s.autos || [])) {
        if (statCleanAutoKey(a, o) !== id) continue;
        anzahl++;
        for (const ms of (a.laps || [])) if (statCleanZahl(ms) && ms > 0) rest.push(ms);
      }
      if (Number(c.sitzungen) === anzahl) c.besteMs = rest.length ? Math.min(...rest) : null;
      else { c.besteMs = null; c.besteSeitBereinigung = new Date().toISOString(); b.besteUnbekannt++; }
    }
    for (const [k, e] of Object.entries(bz)) {
      if (statCleanStreckenKey(k) !== key || !e || !e.fahrer) continue;
      for (const [id, f] of Object.entries(e.fahrer)) {
        if (!f || !kurz(f.beste)) continue;
        b.rekorde++; b.treffer.push({ art: 'rekord', name: f.name || id, ms: [f.beste] });
        f.beste = null; f.medaille = 0; delete f.datum;
        f.besteSeitBereinigung = new Date().toISOString();
        // Keine zweitbeste Historie in dieser Ablage: kein erfundener Ersatzrekord.
      }
    }
    for (const [k, e] of Object.entries(tele)) {
      if (statCleanStreckenKey(k) !== key || !e || !e.fahrer) continue;
      for (const [id, f] of Object.entries(e.fahrer)) {
        // Fremde/online geteilte Telemetrie wird nicht lokal umgeschrieben.
        if (!f || id.startsWith('fremd:')) continue;
        for (const art of ['beste', 'letzte']) if (spurKurz(f[art])) {
          b.spuren++; b.treffer.push({ art: 'tele', name: f[art].name || id, ms: [f[art].ms] });
          delete f[art];
        }
        if (f.fahrt && Array.isArray(f.fahrt.runden)) {
          const weg = f.fahrt.runden.filter(spurKurz);
          b.spuren += weg.length;
          if (weg.length) b.treffer.push({ art: 'tele', name: id, ms: weg.map(sp => sp.ms) });
          f.fahrt.runden = f.fahrt.runden.filter(sp => !spurKurz(sp));
        }
      }
    }
    const extra = {
      [BESTZEIT_STORE]: { vorher: bzRaw, nachher: b.rekorde ? JSON.stringify(bz) : bzRaw },
      [TELE_STORE]: { vorher: teleRaw, nachher: b.spuren ? JSON.stringify(tele) : teleRaw }
    };
    return { neu, bericht: b, extra, key, grenze };
  }
  function statCleanZeitenBericht(plan) {
    const b = plan.bericht, txt = statCleanText;
    return b.runden + txt(' Runde(n) in ', ' lap(s) in ') + b.sitzungen + txt(' Sitzung(en), ', ' session(s), ')
      + b.rekorde + txt(' Bestzeit-Rekord(e), ', ' time-attack record(s), ') + b.spuren
      + txt(' lokale Telemetrie-Einträge. Nur Zeiten strikt unter ', ' local telemetry entries. Only times strictly below ')
      + (plan.grenze / 1000) + txt(' Sekunden auf dieser Strecke (einschließlich gespiegeltem Layout). ',
        ' seconds on this track (including its mirrored layout). ')
      + txt('Sitzungen und Kilometer bleiben erhalten. Rundenereignisse werden mit entfernt. ',
        'Sessions and distances are preserved. Corresponding lap events are removed too. ')
      + (b.rekorde ? txt('Ungültige separate Rekorde und ihre Medaillen werden zurückgesetzt; keine zweitbeste Historie vorhanden. ',
        'Invalid separate records and their medals are reset; no second-best history is available. ') : '')
      + (b.besteUnbekannt ? txt('Fahrzeugrekorde ohne vollständige Historie werden ab der nächsten Fahrt neu geführt.',
        'Car records without a complete history are tracked anew from the next drive.') : '');
  }
  function statCleanZeitenHtml(o) {
    const txt = statCleanText, esc = statCleanEsc, keys = new Set();
    const zeit = ms => typeof ms === 'number' && Number.isFinite(ms);
    for (const s of o.sessions) if (s.strecke && (s.autos || []).some(a =>
      (a.laps || []).some(zeit))) keys.add(statCleanStreckenKey(s.strecke));
    try {
      for (const [k, e] of Object.entries(statCleanAblage(BESTZEIT_STORE).o)) {
        if (e && e.fahrer && Object.values(e.fahrer).some(f => f && zeit(f.beste)))
          keys.add(statCleanStreckenKey(k));
      }
      for (const [k, e] of Object.entries(statCleanAblage(TELE_STORE).o)) {
        if (e && e.fahrer && Object.entries(e.fahrer).some(([id, f]) => !id.startsWith('fremd:') && f &&
          ([f.beste, f.letzte, ...((f.fahrt && f.fahrt.runden) || [])].some(sp => sp && zeit(sp.ms)))))
          keys.add(statCleanStreckenKey(k));
      }
    } catch (e) { /* Vorschau zeigt Parse-/Speicherfehler ohne Daten zu loeschen */ }
    return '<hr><label for="stat-clean-track">' + esc(txt('Zu kurze Zeiten je Strecke löschen', 'Delete short times for one track'))
      + '</label><select id="stat-clean-track"><option value="">' + esc(txt('Strecke auswählen …', 'Select track …')) + '</option>'
      + [...keys].filter(Boolean).sort().map(k => '<option value="' + esc(k) + '">' + esc(k) + '</option>').join('')
      + '</select><label for="stat-clean-seconds">' + esc(txt('Zeiten unter … Sekunden', 'Times below … seconds'))
      + '</label><input type="text" inputmode="decimal" id="stat-clean-seconds" value="5" autocomplete="off"'
      + ' style="width:100%;box-sizing:border-box;min-height:40px">'
      + '<p class="stat-clean-preview" id="stat-clean-times-preview" aria-live="polite"></p>'
      + '<details id="stat-clean-times-hits"><summary>' + esc(txt('Treffer ansehen', 'View matches')) + '</summary>'
      + '<ul id="stat-clean-times-list"></ul></details>'
      + '<button type="button" class="stat-clean-danger" id="stat-clean-times-delete" disabled>'
      + esc(txt('Zeiten unter Grenzwert löschen', 'Delete times below threshold')) + '</button>';
  }
  function statCleanZeitenVerdrahten(o, raw, zustand = {}) {
    const track = $('stat-clean-track'), input = $('stat-clean-seconds'), preview = $('stat-clean-times-preview');
    const button = $('stat-clean-times-delete'), liste = $('stat-clean-times-list');
    if (!track || !input || !preview || !button || !liste) return;
    let plan = null;
    function vorschau() {
      plan = null; button.disabled = true; preview.textContent = ''; liste.innerHTML = '';
      if (!track.value) return;
      try {
        const bz = statCleanAblage(BESTZEIT_STORE), tele = statCleanAblage(TELE_STORE);
        plan = statCleanZeitenPlan(o, track.value, statCleanGrenze(input.value), bz.raw, tele.raw);
        preview.textContent = statCleanZeitenBericht(plan);
        liste.innerHTML = plan.bericht.treffer.map(z => '<li>' + statCleanEsc(
          (z.art === 'runde' ? (z.zeit || '?') + ' · ' : z.art === 'rekord' ? 'Time Attack · ' : 'Telemetrie · ')
          + z.name + (z.runden ? ' · ' + statCleanText('Runde ', 'Lap ') + z.runden.join(', ') : '')
          + ' · ' + z.ms.map(sessionFmt).join(', ')) + '</li>').join('');
        button.disabled = statCleanGesperrt() || !(plan.bericht.runden + plan.bericht.rekorde + plan.bericht.spuren);
      } catch (e) { preview.textContent = e.message || String(e); }
    }
    track.addEventListener('change', vorschau); input.addEventListener('input', vorschau);
    button.addEventListener('click', async () => {
      if (!plan || button.disabled) return;
      try {
        statCleanAktuell(raw); statCleanExtraAktuell(plan.extra, 'vorher');
        if (!confirm(statCleanText('Diese Zeiten wirklich löschen? Strecke: ', 'Really delete these times? Track: ')
          + plan.key + '\n\n' + statCleanZeitenBericht(plan) + '\n\n'
          + statCleanText('Der vorherige Stand wird lokal gesichert.', 'The previous state will be backed up locally.'))) return;
        const b = plan.bericht;
        await statCleanAnwenden(raw, plan, 'Zeiten < ' + plan.grenze / 1000 + 's: ' + plan.key,
          statCleanText('Zeiten gelöscht: ', 'Times deleted: ') + b.runden
          + statCleanText(' Runde(n), ', ' lap(s), ') + b.rekorde
          + statCleanText(' Bestzeit-Rekord(e), ', ' time-attack record(s), ') + b.spuren
          + statCleanText(' Telemetrie-Einträge. Lokale Sicherung erstellt.', ' telemetry entries. Local backup created.'));
      } catch (e) { statCleanFehler(e); }
    });
    // Nach Loeschen/Undo gleiche Strecke und eigene Grenze sofort erneut auswerten.
    input.value = typeof zustand.seconds === 'string' ? zustand.seconds : '5';
    if ([...track.options].some(option => option.value === zustand.track)) track.value = zustand.track;
    if ($('stat-clean-times-hits')) $('stat-clean-times-hits').open = !!zustand.trefferOffen;
    vorschau();
    if (zustand.track && !track.value) preview.textContent = statCleanText(
      'Für die zuvor gewählte Strecke sind keine gespeicherten Zeiten mehr vorhanden. Sie wurde aus der Auswahl entfernt.',
      'No stored times remain for the previously selected track. It has been removed from the selection.');
  }
