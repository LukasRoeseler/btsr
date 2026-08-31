  // ============================== SITZUNGSDATEN ==============================
  //
  // Bis v0.4 ueberlebte KEINE einzige Rundenzeit ein Neuladen. raceLapTimes, dashLapTimes und
  // car.race.laps waren einfache Variablen im Modulbereich; in chc.cars.v1 standen nur Farbe
  // und Name. Ein Neuladen - oder auch nur ein Verbindungsabbruch, weil garage im Speicher
  // lebt - verlor alles, und der CSV-Export war der einzige Weg, etwas zu retten. Man musste
  // also VOR dem Fahren wissen, dass man exportieren will.
  //
  // Drei Entscheidungen, die den Aufbau bestimmen:
  //
  // 1. GESCHRIEBEN WIRD AM RENNENDE, nicht laufend. Ein Schreibvorgang je Runde waere bei
  //    einem Zwei-Minuten-Rennen ein Dutzend Zugriffe auf localStorage, und localStorage ist
  //    synchron - es blockiert den Faden, der den 45-ms-Sendetakt haelt. Genau dieser Takt
  //    war schon einmal die Ursache fuer ruckelndes Fahren.
  //
  // 2. DIE ZAHL DER SITZUNGEN IST BEGRENZT. localStorage hat je Ursprung ein paar Megabyte,
  //    und eine unbegrenzte Liste laeuft irgendwann dagegen - dann schlaegt der naechste
  //    Schreibvorgang fehl, und zwar der, der gerade wichtig war. 200 Sitzungen sind bei
  //    dieser Groesse reichlich und kosten nach oben nichts.
  //
  // 3. GESPEICHERT WIRD JE GERAET, wie schon bei Farbe und Name. Verbindet man in anderer
  //    Reihenfolge, gehoeren die Kilometer weiter zum richtigen Auto.
  const SESSION_STORE = 'chc.sessions.v1';
  const SESSION_MAX = 200;

  function sessionStore() {
    try {
      const o = JSON.parse(localStorage.getItem(SESSION_STORE) || '{}');
      return { cars: o.cars || {}, sessions: Array.isArray(o.sessions) ? o.sessions : [] };
    } catch (e) { return { cars: {}, sessions: [] }; }
  }

  function sessionSave(o) {
    try {
      if (o.sessions.length > SESSION_MAX) {
        o.sessions = o.sessions.slice(-SESSION_MAX);
      }
      localStorage.setItem(SESSION_STORE, JSON.stringify(o));
      return true;
    } catch (e) {
      // Ein voller Speicher ist kein Grund, das Rennen zu verlieren - aber er ist ein Grund,
      // es zu SAGEN. Still zu scheitern waere hier das Schlimmste: man faehrt weiter und
      // merkt es erst, wenn man die Zahlen sucht.
      log('Sitzung konnte nicht gespeichert werden: ' + e.message, 'err');
      showHudToast('SPEICHER VOLL');
      return false;
    }
  }

  // ---- Gefahrene Strecke -------------------------------------------------------------
  //
  // ZWEI Zahlen, und beide sind interessant, weil sie verschiedene Fragen beantworten:
  //
  //   simKm   die Strecke im MASSSTAB, also was der Tacho behauptet. Das ist die Zahl, die
  //           zu einer Rundenzeit passt: eine Runde in 8 s bei 200 km/h angezeigt sind
  //           440 simulierte Meter.
  //   realKm  die Strecke, die das Modellauto wirklich auf dem Teppich gefahren ist. Bei
  //           REAL_SCALE 73,75 ist das ein 74stel davon, und es ist die Zahl, die etwas
  //           ueber Reifen und Getriebe sagt.
  //
  // Nur eine von beiden zu speichern waere eine willkuerliche Wahl, und die jeweils andere
  // liesse sich nicht rekonstruieren, ohne REAL_SCALE zu kennen.
  let simMeters = 0;
  let realMeters = 0;

  // Aufgerufen aus physicsStep(), also im Fahrtakt. Absichtlich ohne jeden Speicherzugriff -
  // hier wird nur gezaehlt, geschrieben wird am Rennende.
  function trackDistance(kmh, dt) {
    if (!(dt > 0) || !isFinite(kmh)) return;
    const v = Math.abs(kmh);
    realMeters += v / 3.6 * dt;
    simMeters += v * REAL_SCALE / 3.6 * dt;
  }

  function distanceSnapshot() {
    return { simKm: +(simMeters / 1000).toFixed(3),
             realKm: +(realMeters / 1000).toFixed(4) };
  }

  // ---- Eine Sitzung ablegen ----------------------------------------------------------
  //
  // Der Aufruf steht in finishRace(), also an der einen Stelle, an der ein Rennen wirklich
  // vorbei ist. Er greift auf raceAllCars() zu, also auf dieselbe Funktion, aus der auch
  // die Ergebnistabelle und der CSV-Export lesen - damit gibt es keine zweite Wahrheit
  // darueber, wer welche Runden gefahren hat.
  function sessionRecord() {
    const autos = raceAllCars().filter(c => c.laps.length);
    if (!autos.length) return null;
    const o = sessionStore();
    const weg = distanceSnapshot();

    // Die Strecke als CODE und nicht als Name: ein Name kann sich aendern oder fehlen, der
    // Code beschreibt das Layout und laesst es auf einem anderen Geraet wieder aufbauen.
    let strecke = '';
    try {
      strecke = (typeof trackToCode === 'function' && currentTrackTiles.length > 1)
        ? trackToCode(currentTrackTiles) : '';
    } catch (e) { strecke = ''; }

    const eintrag = {
      // ISO, weil es sortierbar und zeitzonenfest ist. Der Anzeigetext wird daraus
      // gerechnet und nicht mitgespeichert - sonst haette man zwei Wahrheiten ueber ein
      // Datum, und die eine waere in der Sprache von damals.
      zeit: new Date().toISOString(),
      modus: raceMode,
      limit: raceLimit,
      strecke,
      wetter: typeof weather !== 'undefined' ? weather : null,
      simKm: weg.simKm,
      realKm: weg.realKm,
      autos: autos.map(c => ({
        name: c.name, kennung: c.kennung, rolle: c.role,
        // Nur die Millisekunden, nicht die ganzen Objekte: die Rundennummer ist der Index
        // plus eins, und sie zweimal zu speichern ist die Gelegenheit, dass sie
        // auseinanderlaufen.
        laps: c.laps.map(l => l.ms),
      })),
      // Die Abstimmung mit. Ohne sie ist eine Rundenzeit eine Zahl ohne Bedingungen, und
      // dann kann man zwei Sitzungen nicht vergleichen.
      einstellungen: (typeof presetRead === 'function') ? presetRead() : null,
    };
    o.sessions.push(eintrag);

    // Und die Summen je Auto. Sie stehen NEBEN den Sitzungen und werden nicht daraus
    // gerechnet: die Sitzungsliste ist begrenzt, die Summen sollen es nicht sein.
    for (const c of autos) {
      const auto = garage.find(g => garageLabel(g) === c.name);
      const id = auto ? String(auto.device.id) : ('name:' + c.name);
      const e = o.cars[id] || { name: c.name, km: 0, realKm: 0, runden: 0, besteMs: null,
                                sitzungen: 0 };
      e.name = c.name;
      e.runden += c.laps.length;
      e.sitzungen += 1;
      // Die Strecke wird auf ALLE Autos gebucht, weil nur das Fahrerauto eine Physik hat und
      // die Ghosts dieselbe Runde fahren. Das ist eine Naeherung, und sie steht hier als
      // solche: ein Ghost fuhr nicht genau dieselbe Linie.
      e.km = +(e.km + weg.simKm).toFixed(3);
      e.realKm = +(e.realKm + weg.realKm).toFixed(4);
      const beste = Math.min.apply(null, c.laps.map(l => l.ms));
      if (e.besteMs === null || beste < e.besteMs) e.besteMs = beste;
      o.cars[id] = e;
    }

    if (!sessionSave(o)) return null;
    simMeters = 0;
    realMeters = 0;
    log('Sitzung gespeichert: ' + autos.length + ' Auto'
        + (autos.length === 1 ? '' : 's') + ', '
        + autos.reduce((a, c) => a + c.laps.length, 0) + ' Runden, '
        + weg.simKm.toFixed(1) + ' km simuliert ('
        + (weg.realKm * 1000).toFixed(0) + ' m auf dem Teppich).', 'ok');
    return eintrag;
  }

  // ---- Anzeige -----------------------------------------------------------------------
  function sessionFmt(ms) { return (ms / 1000).toFixed(2) + 's'; }

  function renderSessions() {
    const host = $('sess-list');
    if (!host) return;
    const o = sessionStore();
    const autos = Object.values(o.cars);
    const kopf = $('sess-summary');
    if (kopf) {
      kopf.textContent = o.sessions.length
        ? o.sessions.length + ' Sitzung' + (o.sessions.length === 1 ? '' : 'en') + ', '
          + autos.reduce((a, c) => a + c.runden, 0) + ' Runden, '
          + autos.reduce((a, c) => a + c.km, 0).toFixed(1) + ' km simuliert'
        : 'noch nichts gespeichert';
    }
    if (!o.sessions.length) { host.innerHTML = ''; return; }

    // Nach TAG gruppiert, neueste zuerst. Eine flache Liste von 200 Zeilen ist keine
    // Uebersicht, und der Tag ist die Einheit, in der man sich erinnert ("letzten Samstag").
    const tage = {};
    for (const s of o.sessions) {
      const tag = (s.zeit || '').slice(0, 10);
      (tage[tag] = tage[tag] || []).push(s);
    }
    const teile = [];
    teile.push('<table class="doc-tab"><thead><tr><th>Auto</th><th>Runden</th>'
               + '<th>Beste</th><th>km sim</th><th>m echt</th></tr></thead><tbody>');
    for (const c of autos.sort((a, b) => b.runden - a.runden)) {
      teile.push('<tr><td>' + String(c.name).replace(/</g, '&lt;') + '</td><td>' + c.runden
                 + '</td><td>' + (c.besteMs === null ? '–' : sessionFmt(c.besteMs))
                 + '</td><td>' + c.km.toFixed(1) + '</td><td>'
                 + (c.realKm * 1000).toFixed(0) + '</td></tr>');
    }
    teile.push('</tbody></table>');

    for (const tag of Object.keys(tage).sort().reverse()) {
      const liste = tage[tag];
      teile.push('<h3 style="font-size:13px; margin:16px 0 5px 0">' + tag + ' &middot; '
                 + liste.length + ' Sitzung' + (liste.length === 1 ? '' : 'en') + '</h3>');
      for (const s of liste.slice().reverse()) {
        const zeit = (s.zeit || '').slice(11, 16);
        const runden = s.autos.reduce((a, c) => a + c.laps.length, 0);
        const alle = s.autos.reduce((a, c) => a.concat(c.laps), []);
        const beste = alle.length ? Math.min.apply(null, alle) : null;
        teile.push('<div class="sess-row"><b>' + zeit + '</b> '
                   + (RACE_MODES[s.modus] ? RACE_MODES[s.modus].label : s.modus)
                   + ' &middot; ' + runden + ' Runden'
                   + (beste !== null ? ' &middot; beste ' + sessionFmt(beste) : '')
                   + (s.strecke ? ' &middot; <code>' + s.strecke + '</code>' : '')
                   + ' &middot; ' + s.simKm.toFixed(1) + ' km</div>');
      }
    }
    host.innerHTML = teile.join('');
  }

  // ---- Export ------------------------------------------------------------------------
  //
  // Dasselbe Format wie der vorhandene Rennergebnis-Export: Semikolon, Komma als
  // Dezimaltrenner, BOM. Das ist nicht Geschmack, sondern was ein deutsches Excel ohne
  // Nachfrage richtig oeffnet - und ein Export, den man erst reparieren muss, ist keiner.
  function sessionCsv() {
    const o = sessionStore();
    const z = (x) => String(x === null || x === undefined ? '' : x)
      .replace(/[";\n]/g, ' ');
    const komma = (x) => String(x).replace('.', ',');
    const zeilen = ['Datum;Zeit;Modus;Strecke;Auto;Kennung;Rolle;Runde;Zeit (s);km sim;m echt'];
    for (const s of o.sessions) {
      const tag = (s.zeit || '').slice(0, 10);
      const uhr = (s.zeit || '').slice(11, 19);
      for (const c of s.autos) {
        c.laps.forEach((ms, i) => {
          zeilen.push([tag, uhr, z(s.modus), z(s.strecke), z(c.name), z(c.kennung),
                       z(c.rolle), i + 1, komma((ms / 1000).toFixed(3)),
                       komma(s.simKm.toFixed(3)), komma((s.realKm * 1000).toFixed(1))].join(';'));
        });
      }
    }
    zeilen.push('');
    zeilen.push('Summe je Auto');
    zeilen.push('Auto;Sitzungen;Runden;Beste (s);km sim;m echt');
    for (const c of Object.values(o.cars)) {
      zeilen.push([z(c.name), c.sitzungen, c.runden,
                   c.besteMs === null ? '' : komma((c.besteMs / 1000).toFixed(3)),
                   komma(c.km.toFixed(3)), komma((c.realKm * 1000).toFixed(1))].join(';'));
    }
    return '﻿' + zeilen.join('\r\n');
  }

  if ($('sess-export')) {
    $('sess-export').addEventListener('click', () => {
      const blob = new Blob([sessionCsv()], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'omegasim-sitzungen-' + new Date().toISOString().slice(0, 10) + '.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
  }

  if ($('sess-clear')) {
    $('sess-clear').addEventListener('click', () => {
      // Ohne Rueckfrage waere das die einzige Stelle in der App, an der ein Klick
      // unwiederbringlich Daten loescht. Und geloescht wird wirklich alles, auch die
      // Geraetekennungen - genau deshalb gibt es den Knopf.
      if (!confirm('Alle gespeicherten Sitzungen und Kilometerstände löschen? '
                   + 'Das lässt sich nicht zurücknehmen.')) return;
      try { localStorage.removeItem(SESSION_STORE); } catch (e) { /* privat */ }
      renderSessions();
      showHudToast('SITZUNGEN GELÖSCHT');
      log('Alle Sitzungsdaten gelöscht.', 'info');
    });
  }

  renderSessions();
