  // =====================================================================================
  // RENNEN SIMULIEREN
  // =====================================================================================
  //
  // EIN RENNEN, DAS ABLAEUFT - kein gerechnetes Ergebnis. Man sieht die Autos fahren, die
  // Punkte auf der Karte wandern, die Rundenzeiten entstehen. Das war die Bestellung, und
  // sie ist der Grund fuer den ganzen Aufbau unten: eine Tabelle mit Endzeiten waere ein
  // Zehntel des Codes, und niemand koennte zusehen.
  //
  // WAS ECHT IST. Die Autos fahren mit DERSELBEN Logik wie am Fahrzeug: ghostTick() ist die
  // Funktion, die auch die Funkbefehle erzeugt - Ideallinie, Kurvendrosselung, Querversatz,
  // Feldstaffel, Ortungsabgleich und die zugeschalteten Wuerz-Bausteine laufen alle mit.
  // Nachgebaut ist nur das, was zwischen Funkbefehl und Position liegt:
  //
  //     ghostTick  ->  Gasbefehl  ->  Fahrzeugmodell  ->  Tempo  ->  Weg auf der Bahn
  //                                                                       |
  //                     Kachelzaehler und Kachelcode  <-------------------+
  //
  // Der Rueckweg ist der wichtige: die Autos bekommen ihren Kachelzaehler (Byte 11) und
  // ihren Kachelcode (Byte 12) aus der WIRKLICHEN Position im Modell, genau wie am Teppich
  // aus der wirklichen Position auf der Bahn. Der Ghost weiss also nicht mehr als sonst, und
  // der Ortungsabgleich muss sich hier genauso ausrichten - die Simulation prueft ihn mit.
  //
  // WAS FEHLT, und das gehoert genauso hin: Reibung auf Teppich gegen Parkett, Staub auf der
  // Bahn, ein Auto, das aus der Kurve fliegt, eine Schiene, die ein Auto nicht mehr haelt.
  // Wer hier vorne ist, ist es im Modell. Deshalb steht "experimentell" daran, und deshalb
  // sagt der Hilfetext denselben Satz.
  //
  // ---- Die Einheiten, und warum sie nachrechenbar sein muessen ------------------------
  //
  // Ohne diese Umrechnung waeren die Rundenzeiten Zahlen ohne Bedeutung:
  //
  //     physEngine/Ghost-Modell   speedKmh ist das MODELLTEMPO (Vollgas ~4 km/h);
  //                               die Anzeige multipliziert mit REAL_SCALE = 73,75
  //     Strecke                   TRACK_TILE_CM = 43 cm je Gerade, TRACK_STEP = 40
  //                               Zeichnungseinheiten, TRACK_UNITS_PER_CM = 0,930
  //
  // Also: km/h -> cm/s ist x 100000/3600 = x 27,78, und cm -> Einheiten ist
  // x TRACK_UNITS_PER_CM. Gegenprobe: halbes Gas sind rund 55 cm/s, eine 43-cm-Kachel
  // dauert damit 0,78 s - und genau in dieser Gegend liegen die aus den Mitschnitten
  // gemessenen Kacheldauern (420 bis 490 ms bei schnelleren Ghosts).
  const SIM_TAKT_MS = 45;             // derselbe Takt wie CONTROL_SEND_INTERVAL_MS
  const SIM_ZEIT_MAX_MS = 20 * 60000; // Notausstieg, damit nichts endlos laeuft
  const SIM_KMH_ZU_CM_S = 100000 / 3600;

  let simState = null;

  function simAn() { return !!simState; }

  function simEinheitenProSek(kmhModell) {
    return kmhModell * SIM_KMH_ZU_CM_S * TRACK_UNITS_PER_CM;
  }

  // ---- Ein Auto fuer die Simulation ---------------------------------------------------
  //
  // Es sieht fuer den Rest der App wie ein verbundenes Ghost-Auto aus, denn genau das muss
  // es: ghostLane(), ghostFeldStaffel() und ghostAhead() finden ihre Nachbarn ueber die
  // GARAGE, und ein Auto, das nicht darin steht, hat keine. Ohne Garage gaebe es also keine
  // Spuren, kein Ueberholen und keine Staffel - und damit kein Rennen.
  //
  // `sim: true` ist die Kennzeichnung, an der die Garagenanzeige es ueberspringt. Ein
  // Simulationsauto ist kein verbundenes Auto, und es in der Liste zu zeigen waere eine
  // Behauptung ueber die Bluetooth-Lage.
  function simAutoBauen(i) {
    const nr = i + 1;
    const car = {
      role: 'ghost', sim: true,
      alias: 'S' + nr,
      device: { name: 'Sim ' + nr, id: 'sim-' + nr },
      tag: 'S' + nr,
      writeInFlight: false,
      // Kein Kachelwissen zu Beginn - genau wie ein frisch hingestelltes Auto.
      tileCode: 0xff, tileCount: null, tileAt: 0, lastCodeAt: 0, yaw: 0,
      parked: null, modeBytes: null,
      // Der Funkkanal ist eine Senke. Die BEFEHLE landen trotzdem im Modell, aber nicht von
      // hier aus: ghostTick faehrt sein eigenes Fahrzeugmodell (g.engine) mit, und dessen
      // Tempo ist die Groesse, aus der unten der Weg wird. Diese Bytes hier waeren der
      // zweite Weg zur selben Zahl.
      rx: { properties: { writeWithoutResponse: true },
            writeValueWithoutResponse() { return Promise.resolve(); } },
      tx: null,
    };
    return car;
  }

  // ---- Der Weg auf der Bahn -----------------------------------------------------------
  //
  // s ist der zurueckgelegte Weg in Zeichnungseinheiten, gezaehlt ab Start/Ziel. Aus ihm
  // folgen Kachel und Phase, und beide braucht die Karte. Die Kachellaengen kommen aus
  // tileLength() - derselben Funktion, mit der auch die Ghosts rechnen.
  function simBahn(tiles) {
    const laengen = tiles.map((t) => tileLength(t.type));
    const kanten = [0];
    for (const l of laengen) kanten.push(kanten[kanten.length - 1] + l);
    return { laengen, kanten, runde: kanten[kanten.length - 1] };
  }

  // Kachel und Phase aus dem Weg. Der Weg ist immer schon auf eine Runde gekuerzt.
  function simOrtAus(bahn, sInRunde) {
    // Lineare Suche ueber hoechstens ein paar Dutzend Kacheln, einmal je Auto und Takt.
    // Eine Halbierung waere hier Aufwand ohne Wirkung.
    for (let i = 0; i < bahn.laengen.length; i++) {
      if (sInRunde < bahn.kanten[i + 1] || i === bahn.laengen.length - 1) {
        const in_ = sInRunde - bahn.kanten[i];
        return { kachel: i, phase: Math.max(0, Math.min(0.999999, in_ / bahn.laengen[i])) };
      }
    }
    return { kachel: 0, phase: 0 };
  }

  function simLage(text) {
    const el = $('sim-lage');
    if (el) el.textContent = text;
  }

  // =====================================================================================
  // Start
  // =====================================================================================
  function simStart() {
    if (simAn()) { simStop('neu gestartet'); }
    const tiles = currentTrackTiles;
    if (!tiles || tiles.length < 3) {
      simLage('Es ist keine Strecke eingetragen. Baue oder scanne erst eine.');
      showHudToast('KEINE STRECKE');
      return;
    }
    // NICHT WAEHREND EINES ECHTEN RENNENS. Die Simulation raeumt die Garage aus und faelscht
    // die Uhr; beides mitten in einem laufenden Rennen zu tun waere kein Fehler, den man
    // erklaeren koennte.
    if (raceState === 'racing' || raceState === 'finishing' || raceState === 'countdown') {
      simLage('Erst das laufende Rennen beenden.');
      return;
    }
    const anzahl = Math.max(2, Math.min(6, parseInt(($('sim-ghosts') || {}).value, 10) || 4));
    const runden = Math.max(1, Math.min(10, parseInt(($('sim-laps') || {}).value, 10) || 3));
    const doppelt = !!(($('sim-fast') || {}).checked);

    const bahn = simBahn(tiles);
    const uhrStart = Date.now();
    simState = {
      tiles, bahn, runden, doppelt,
      // Die eigene Uhr der Simulation. Sie laeuft mit der Wandzeit, bei doppelter
      // Geschwindigkeit eben doppelt - die RUNDENZEITEN kommen aus ihr, sind also die Zeiten
      // des Rennens und nicht die des Abspielens. "Abgespielt wird schneller, gefahren
      // nicht", wie es im Hilfetext steht.
      uhr: uhrStart,
      beginn: uhrStart,
      autos: [],
      merkGarage: garage.splice(0, garage.length),
      timer: null,
      karteSchluessel: null,
      karteGeo: null,
      fertig: 0,
    };

    for (let i = 0; i < anzahl; i++) {
      const car = simAutoBauen(i);
      garage.push(car);
      simState.autos.push({
        car, s: 0, laps: 0, kachelZuvor: null, zaehler: 0,
        rundenStart: uhrStart, zeiten: [], platz: i + 1,
      });
    }
    // Erst NACH dem Fuellen der Garage starten: startGhost() verteilt die Sendetakte ueber
    // alle fahrenden Ghosts (ghostPhasenSetzen), und das braucht die vollstaendige Liste.
    for (const a of simState.autos) {
      startGhost(a.car);
      // Der eigene Zeitgeber muss weg - hier wird von Hand getaktet, damit alle Autos
      // denselben Zeitschritt sehen. Zwei Uhren fuer ein Rennen ergaeben ein Rennen, in dem
      // die Reihenfolge vom Zufall der Zeitgeber abhaengt.
      ghostTaktLoeschen(a.car);
      a.car.ghost.freeRun = true;
    }
    if (typeof renderGarage === 'function') renderGarage();

    const stopKnopf = $('sim-stop');
    if (stopKnopf) stopKnopf.hidden = false;
    const startKnopf = $('sim-start');
    if (startKnopf) startKnopf.disabled = true;

    simState.timer = setInterval(simTakt, SIM_TAKT_MS);
    simLage(anzahl + ' Ghosts, ' + runden + (runden === 1 ? ' Runde' : ' Runden')
            + (doppelt ? ', doppelt' : '') + ' - laeuft');
    log('Simulation gestartet: ' + anzahl + ' Ghosts, ' + runden + ' Runden auf '
        + tiles.length + ' Kacheln.', 'info');
    simZeichnen();
  }

  // =====================================================================================
  // Der Takt
  // =====================================================================================
  // Ein Takt am Zeitgeber: rechnen und zeichnen. Getrennt von simSchritt(), damit ein
  // Prueflauf das Rennen ohne Zeitgeber und ohne Zeichnen durchfahren kann - im verborgenen
  // Browser-Bereich werden Zeitgeber auf 1 Hz gedrosselt, und eine Pruefung, die daran
  // haengt, prueft die Fensterlage.
  function simTakt() {
    const st = simState;
    if (!st) return;
    simSchritt();
    simZeichnen();
    if (st.fertig >= st.autos.length) { simStop('Rennen beendet'); return; }
    if (st.uhr - st.beginn > SIM_ZEIT_MAX_MS) { simStop('Zeitgrenze erreicht'); }
  }

  // ---- Ein Rechenschritt ------------------------------------------------------------
  //
  // `msFest` ist die Rennzeit, die dieser Schritt bringen soll. Ohne Angabe wird die WIRKLICH
  // vergangene Wandzeit genommen, und das ist wichtiger als es aussieht: ein Browser drosselt
  // Zeitgeber in einem verborgenen Fenster auf 1 Hz. Mit einem festen Schritt von 45 ms je
  // Takt liefe das Rennen dann in Zeitlupe - gemessen 45 ms Rennzeit je Sekunde Wandzeit, das
  // Zwanzigfache zu langsam. Mit der gemessenen Wandzeit wird es dort nur RUCKELIG und nicht
  // langsam, und das ist der richtige Kompromiss: die Uhr des Rennens gehoert der Wanduhr.
  //
  // Gedeckelt auf 250 ms je Schritt, und dann in Teilschritten gerechnet: ein einziger
  // 250-ms-Sprung durch das Fahrzeugmodell waere grob, und ein Auto koennte eine halbe Kachel
  // ueberspringen. 60 ms je Teilschritt liegt in der Groessenordnung des echten Sendetakts.
  const SIM_TEIL_MAX_MS = 60;
  const SIM_SPRUNG_MAX_MS = 250;

  function simSchritt(msFest) {
    const st = simState;
    if (!st) return;
    const wand = Date.now();
    let roh = msFest;
    if (roh === undefined || roh === null) {
      roh = st.wandZuvor ? (wand - st.wandZuvor) : SIM_TAKT_MS;
    }
    st.wandZuvor = wand;
    const gesamt = Math.max(1, Math.min(SIM_SPRUNG_MAX_MS, roh)) * (st.doppelt ? 2 : 1);
    let rest = gesamt;
    while (rest > 0.5) {
      const schritt = Math.min(SIM_TEIL_MAX_MS, rest);
      rest -= schritt;
      simTeilschritt(schritt);
    }
  }

  function simTeilschritt(schritt) {
    const st = simState;
    if (!st) return;
    st.uhr += schritt;
    const dt = schritt / 1000;

    // ---- Die Uhr faelschen, aber nur fuer die Dauer der Ticks ------------------------
    //
    // ghostTick() rechnet seine Zeitschritte aus Date.now(); ohne diesen Griff waere dt in
    // einer Simulation mit eigener Uhr sinnlos. Der Griff ist SYNCHRON eingeklammert: die
    // echte Uhr steht wieder, bevor irgendein Zuhoerer, Zeitgeber oder Versprechen dran ist.
    // Alles andere wuerde einer ganzen Seite die Zeit verstellen.
    const echtNow = Date.now;
    Date.now = () => st.uhr;
    try {
      for (const a of st.autos) {
        // Das Auto hat gerade einen Code gelesen - es faehrt ja. Ohne diese Zeile schlaegt
        // der Abgangsmelder nach GHOST_OFFTRACK_MS zu.
        a.car.lastCodeAt = st.uhr;
        ghostTick(a.car);
      }
      // Der Querversatz gegen Rammen laeuft am echten Auto auf einem eigenen Zeitgeber. Der
      // greift hier nicht (er laeuft an der Wandzeit und sieht die Simulationsautos nur
      // zufaellig), also wird er hier ausdruecklich mitgetaktet - sonst faehrt das ganze
      // Feld auf einer Spur, und das waere ein anderes Rennen als das eingestellte.
      ghostAssignBias();
      // ---- Vom Gas zum Weg -----------------------------------------------------------
      for (const a of st.autos) {
        const g = a.car.ghost;
        if (!g || !g.engine) continue;
        const v = Math.abs(g.engine.state.speedKmh || 0);
        a.s += simEinheitenProSek(v) * dt;
        // Runde voll? Der Weg wird gekuerzt, und die Zeit dieser Runde festgehalten.
        while (a.s >= st.bahn.runde) {
          a.s -= st.bahn.runde;
          a.laps++;
          a.zeiten.push(st.uhr - a.rundenStart);
          a.rundenStart = st.uhr;
          if (a.laps >= st.runden) st.fertig++;
        }
        const ort = simOrtAus(st.bahn, a.s);
        a.kachel = ort.kachel;
        a.phase = ort.phase;
        // ---- Und zurueck ans Auto: Zaehler und Code --------------------------------
        //
        // GENAU WIE AM TEPPICH. Das Auto meldet, DASS es auf einer neuen Kachel ist (Byte 11
        // zaehlt weiter) und WELCHE Art sie hat (Byte 12). Mehr weiss es nicht, und mehr
        // bekommt der Ghost hier auch nicht - er muss sich wie sonst selbst ausrichten.
        if (a.kachelZuvor !== ort.kachel) {
          a.kachelZuvor = ort.kachel;
          a.zaehler = (a.zaehler + 1) & 0xff;
          a.car.tileCount = a.zaehler;
          a.car.tileAt = st.uhr;
          a.car.tileCode = st.tiles[ort.kachel].type;
        }
      }
    } finally {
      Date.now = echtNow;
    }
  }

  // Der Zustand fuer Prueflaeufe. Absichtlich schmal: Tempo, Weg, Runden - die Groessen, an
  // denen sich entscheidet, ob ein Rennen laeuft oder nur eine Uhr tickt.
  function simZustand() {
    const st = simState;
    if (!st) return null;
    return {
      uhrMs: st.uhr - st.beginn,
      runde: st.bahn.runde,
      fertig: st.fertig,
      autos: st.autos.map((a) => ({
        name: a.car.alias,
        kmh: a.car.ghost && a.car.ghost.engine ? a.car.ghost.engine.state.speedKmh : null,
        gas: a.car.ghost && a.car.ghost.engine ? a.car.ghost.engine.state.throttle : null,
        s: a.s, kachel: a.kachel, phase: a.phase, laps: a.laps,
        // Die angeforderte Querlage - die Groesse, die den Punkt auf der Karte seitlich
        // setzt. Sie gehoert in den Prueffzustand, weil "alle Punkte gehen an den Rand"
        // genau ueber sie zu messen ist.
        quer: a.car.ghost ? (a.car.ghost.querSoll || 0) : 0,
        zeiten: a.zeiten.slice(),
        geparkt: !!a.car.parked,
        tileIndex: a.car.ghost ? a.car.ghost.tileIndex : null,
        code: a.car.tileCode,
      })),
    };
  }

  // =====================================================================================
  // Die Buehne
  // =====================================================================================
  //
  // EINMAL ZEICHNEN, DANN NUR PUNKTE BEWEGEN - dieselbe Aufteilung wie beim
  // Uebersichtsschirm, und aus demselben gemessenen Grund: renderTrackPreview() kostet rund
  // 94 ms, weil es Mittellinie, Normalen und die Ideallinie rechnet. Zwanzigmal je Sekunde
  // waere das der Faden, an dem der ganze Takt haengt. karteAutosSetzen() kostet 0,03 ms.
  function simZeichnen() {
    const st = simState;
    if (!st) return;
    const host = $('sim-karte');
    if (host) {
      const schluessel = st.tiles.length + ':' + (typeof trackToCode === 'function'
        ? trackToCode(st.tiles) : String(st.tiles.map((t) => t.type)));
      if (schluessel !== st.karteSchluessel) {
        const r = renderTrackPreview(st.tiles, null, { detailed: true, cars: [] });
        host.innerHTML = r.html;
        st.karteGeo = r.geo;
        st.karteSchluessel = schluessel;
      }
      const svg = host.firstElementChild;
      if (svg && st.karteGeo && typeof karteAutosSetzen === 'function') {
        karteAutosSetzen(svg, st.karteGeo, st.autos.map((a) => ({
          index: a.kachel || 0,
          phase: a.phase || 0,
          farbe: carColor(a.car).hex,
          kuerzel: a.car.alias,
          // Die ANGEFORDERTE Querlage, wie auf der echten Karte: die Schiene haelt das Auto,
          // gemessen wird sie nicht. Damit sieht man Spuren und Ueberholmanoever.
          quer: (a.car.ghost && a.car.ghost.querSoll) || 0,
        })));
      }
    }
    simTafelZeichnen();
  }

  // Die Zeittafel. Sortiert nach Rennstand - mehr Runden zuerst, bei gleicher Rundenzahl der
  // weiter vorne auf der Bahn. Dasselbe Kriterium wie im Uebersichtsschirm, damit die
  // Simulation nicht eine andere Reihenfolge zeigt als ein Rennen.
  function simTafelZeichnen() {
    const st = simState;
    const el = $('sim-tafel');
    if (!st || !el) return;
    const reihen = st.autos.slice().sort((x, y) =>
      (y.laps - x.laps) || ((y.s || 0) - (x.s || 0)));
    // Die schnellste Runde des ganzen Feldes, fuer die Hervorhebung.
    let beste = Infinity;
    for (const a of st.autos) for (const z of a.zeiten) if (z < beste) beste = z;
    const zeit = (ms) => (typeof formatLapTime === 'function'
      ? formatLapTime(ms) : (ms / 1000).toFixed(2) + ' s');
    let html = '<table><thead><tr><th>P</th><th>Auto</th><th>Rd</th>'
             + '<th>letzte</th><th>beste</th></tr></thead><tbody>';
    reihen.forEach((a, i) => {
      const letzte = a.zeiten.length ? a.zeiten[a.zeiten.length - 1] : null;
      const eigenBeste = a.zeiten.length ? Math.min.apply(null, a.zeiten) : null;
      html += '<tr' + (i === 0 ? ' class="sim-fuehrt"' : '') + '>'
            + '<td>' + (i + 1) + '</td>'
            + '<td><i style="background:' + carColor(a.car).hex + '"></i>' + a.car.alias + '</td>'
            + '<td>' + a.laps + '</td>'
            + '<td>' + (letzte === null ? '&ndash;' : zeit(letzte)) + '</td>'
            + '<td' + (eigenBeste !== null && eigenBeste === beste ? ' class="sim-best"' : '')
            + '>' + (eigenBeste === null ? '&ndash;' : zeit(eigenBeste)) + '</td>'
            + '</tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
  }

  // =====================================================================================
  // Ende
  // =====================================================================================
  function simStop(grund) {
    const st = simState;
    if (!st) return;
    simState = null;
    if (st.timer !== null) clearInterval(st.timer);
    // Die Autos ordentlich abmelden, DANN die Garage zuruecksetzen. Andersherum liefen die
    // Ghost-Zeitgeber der Simulationsautos weiter und schrieben in eine Garage, in der sie
    // nicht mehr stehen.
    for (const a of st.autos) {
      try { stopGhost(a.car); } catch (e) { /* ein Attrappenauto darf beim Abmelden zicken */ }
    }
    garage.splice(0, garage.length);
    for (const c of st.merkGarage) garage.push(c);
    if (typeof renderGarage === 'function') renderGarage();

    const stopKnopf = $('sim-stop');
    if (stopKnopf) stopKnopf.hidden = true;
    const startKnopf = $('sim-start');
    if (startKnopf) startKnopf.disabled = false;

    // Das Ergebnis STEHT STEHEN. Wer ein Rennen angesehen hat, will danach die Zeiten lesen
    // koennen - eine Tafel, die beim Zieleinlauf verschwindet, ist die Arbeit umsonst.
    const sieger = st.autos.slice().sort((x, y) =>
      (y.laps - x.laps) || ((y.s || 0) - (x.s || 0)))[0];
    simLage(grund + (sieger ? ' - vorn: ' + sieger.car.alias : ''));
    log('Simulation beendet (' + grund + ').', 'info');
  }

  // =====================================================================================
  // Verdrahtung
  // =====================================================================================
  if ($('sim-start')) $('sim-start').addEventListener('click', simStart);
  if ($('sim-stop')) $('sim-stop').addEventListener('click', () => simStop('abgebrochen'));
