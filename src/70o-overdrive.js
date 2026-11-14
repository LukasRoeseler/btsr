  // ====================================================================================
  // OMEGA OVERDRIVE (WIP)
  // ====================================================================================
  // Arcade-Rennmodus im Stil von Mario Kart, nur auf der Bahn (trackMode === 'on'). Das
  // Fahrgefuehl wird fuer die Dauer des Rennens ueberschrieben: Arcade-Lenkung, reduziertes
  // Tempo (~100 km/h), schneller Antritt, optional Selbstlenken. Dazu Nitro auf Kreis
  // (Anzeige wie ein Tank, laedt sich in einer Rundenzeit auf) und Power-ups, die beim
  // Ueberfahren der Start/Ziel-Linie zugewiesen werden. Schaden bleibt, aber ohne
  // Boxenstopp: ein kaputtes Auto faehrt 3 s langsam und repariert sich danach selbst.
  //
  // WICHTIG: Der Modus laeuft mit dem ECHTEN Auto auf der Bahn. Die Funktionen hier sind
  // Funktionsdeklarationen in derselben IIFE, also von frueheren Dateien (70-race.js,
  // 50-drive.js, 90-ghosts.js) zur Laufzeit aufrufbar - nur die Top-Level-Variablen dieses
  // Moduls stehen erst ab dieser Datei (temporale Todeszone beachten: Aufrufe nur zur
  // Laufzeit, nie beim Laden).

  // ---- Zustand ----
  // Je Spieler ein eigener Zustand (Platz 1, 2, 3). Die Werte, die nur von der Strecke
  // abhaengen (Tankgroesse, Rundenzeit) sind global, weil alle Spieler dieselbe Strecke
  // fahren. odAktiv ist global: das Rennen laeuft fuer alle gleich.
  let odAktiv = false;             // Overdrive-Rennen laeuft gerade
  let odNitroMax = 1;              // Tankkapazitaet in Sekunden Boost (aus der Strecke)
  let odLapTimeS = 60;             // geschaetzte Rundenzeit in Sekunden (Ladezeit des Tanks)
  let odSelbstlenken = false;      // Option: Auto haelt sich selbst auf der Bahn
  let odVorherKonfig = null;       // gespeicherte physEngine.config fuer die Ruecknahme
  let odVorherSetupVmax = 1;       // gespeicherter setupVmax (Motorkennfeld/Heckfluegel)
  let odVorherFahrhilfe = null;    // gespeicherte fahrhilfeModus fuer die Ruecknahme
  let odVorherCarFahrhilfe = null; // gespeichertes playerCar.fahrhilfe fuer die Ruecknahme
  let odVorherSound = null;        // gespeichertes soundProfile fuer die Ruecknahme
  let odVorherLicht = null;        // gespeicherter headlightsOn fuer die Ruecknahme
  let odTankBar = null, odTankStand = null, odTankBox = null, odPuBox = null, odPuIco = null, odPuTxt = null;
  const OD_POWERUPS = ['destroyer', 'superboost', 'gewitter', 'emp'];
  const OD_BOOST_F = 1.45;         // Deckel-Multiplikator beim Boost
  const OD_KAPUTT_F = 0.35;        // Deckel-Multiplikator im 3-s-Langsam-Modus
  const odZustand = {};            // nr -> { nitro, boostBis, boostAn, powerup, ... }
  function odZ(nr) {
    const n = nr || 1;
    if (!odZustand[n]) odZustand[n] = {
      nitro: 0, boostBis: 0, boostAn: false, powerup: null, powerupBis: 0,
      superboostBis: 0, gewitterBis: 0, empAn: false, kaputtBis: 0, kaputt: false, letzterTakt: 0,
    };
    return odZustand[n];
  }

  function overdriveAktiv() {
    // Nur waehrend eines LAUFENDEN Overdrive-Rennens sind Kreis/Dreieck umbelegt. Sobald der
    // Modus nur gewaehlt ist (Menues), bleiben die Tasten wie gewohnt: Kreis = zurueck,
    // Dreieck = Licht/Info. Das war der Fehler: overdriveAktiv() meldete schon die AUSWAHL.
    return odAktiv;
  }
  // Ob die Selbstlenk-Option (oder die globale Fahrhilfe) das Auto von selbst lenken laesst.
  function overdriveSelbstlenkt() {
    if (!odAktiv) return false;
    if (odSelbstlenken) return true;
    try { return fahrhilfeModusVon(playerCar) === 'voll'; } catch (e) { return false; }
  }

  // Selbstlenk-Kasten (nur im Overdrive-Modus sichtbar). Aus dem Markup lesen und in
  // odSelbstlenken uebernehmen; wirkt wie die globale Fahrhilfe auf 'voll'.
  function overdriveSelbstlenkInit() {
    const cb = document.getElementById('od-selbstlenken');
    if (!cb) return;
    odSelbstlenken = cb.checked;
    cb.addEventListener('change', (e) => {
      odSelbstlenken = !!e.target.checked;
      showHudToast('Selbstlenken ' + (odSelbstlenken ? 'an' : 'aus'));
    });
  }

  // ---- Start / Ende des Rennens ----
  function overdriveRennenStart() {
    odAktiv = true;
    // Tankgroesse: 0,1 s Boost je Bahnteil, also 1 s bei 10 Teilen.
    const n = (typeof currentTrackTiles !== 'undefined' && currentTrackTiles) ? currentTrackTiles.length : 10;
    odNitroMax = Math.max(0.1, 0.1 * n);
    // Geschaetzte Rundenzeit aus der Streckenlaenge bei ~65 km/h Mittel. Sie bestimmt die
    // Ladezeit: voller Tank in genau einer Runde.
    try {
      const m = (typeof trackLaengeM === 'function' && currentTrackTiles) ? trackLaengeM(currentTrackTiles) : 0;
      odLapTimeS = m > 0 ? m / (65 / 3.6) : Math.max(20, n * 4);
    } catch (e) { odLapTimeS = Math.max(20, n * 4); }
    // Je Spieler den Zustand zuruecksetzen - auch die Nachlade-Uhr (letzterTakt), sonst
    // springt der Tank im zweiten Rennen sofort auf voll (das dt waere die Pause dazwischen).
    for (const nr of [1, 2, 3]) {
      const z = odZ(nr);
      z.nitro = 0; z.boostBis = 0; z.boostAn = false; z.powerup = null; z.powerupBis = 0;
      z.superboostBis = 0; z.gewitterBis = 0; z.empAn = false; z.kaputtBis = 0; z.kaputt = false;
      z.letzterTakt = 0;
    }
    // Selbstlenken: die Fahrhilfe auf 'voll' stellen (Auto haelt sich selbst auf der Bahn).
    // Die Ruecknahme passiert in overdriveRennenEnde, zusammen mit dem Fahrgefuehl. WICHTIG:
    // fahrhilfeModusVon() liest VORRANGIG car.fahrhilfe - hat das Auto in der Garage eine
    // eigene Fahrhilfe, muss auch die umgestellt werden, sonst bleibt das Selbstlenken wirkungslos.
    odVorherFahrhilfe = (typeof fahrhilfeModus !== 'undefined') ? fahrhilfeModus : null;
    odVorherCarFahrhilfe = (typeof playerCar !== 'undefined' && playerCar) ? playerCar.fahrhilfe : null;
    if (odSelbstlenken) {
      try { fahrhilfeModus = 'voll'; } catch (e) { /* */ }
      try { if (typeof playerCar !== 'undefined' && playerCar) playerCar.fahrhilfe = 'voll'; } catch (e) { /* */ }
    }
    // Fahrgefuehl ueberschreiben und die alten Werte merken.
    if (typeof physEngine !== 'undefined') {
      const c = physEngine.config;
      odVorherKonfig = {
        topSpeedKmh: c.topSpeedKmh, accelerationFactor: c.accelerationFactor,
        steerResponse: c.steerResponse, steerExpo: c.steerExpo, speedSteerReduction: c.speedSteerReduction,
        autoShift: c.autoShift,
      };
      odVorherSetupVmax = (typeof physEngine.state !== 'undefined' && physEngine.state.setupVmax) || 1;
      // ~100 km/h als Anzeige (TACHO_SCALE ~68,1), damit der Tacho auch wirklich 100 zeigt.
      c.topSpeedKmh = 100 / TACHO_SCALE;
      c.accelerationFactor = 1.7;               // schneller Antritt
      c.steerResponse = 3.6;                    // arcade: direkter
      c.steerExpo = 1.0;
      c.speedSteerReduction = 0.12;             // bleibt auch bei Tempo lenkbar
      physEngine.config.autoShift = true;       // ohne Gangschaltung
    }
    // Lustiger Arcade-Motorsound (siehe SOUND_PROFILES.fun in 80-sound.js).
    odVorherSound = (typeof soundProfile !== 'undefined') ? soundProfile : null;
    try { if (typeof SOUND_PROFILES !== 'undefined' && engineOsc) {
      soundProfile = SOUND_PROFILES.fun;
      engineOsc.type = soundProfile.wave;
    } } catch (e) { /* */ }
    // Licht ist in Overdrive immer an (Dreieck aktiviert stattdessen das Power-up).
    odVorherLicht = (typeof headlightsOn !== 'undefined') ? headlightsOn : null;
    try { headlightsOn = true; } catch (e) { /* */ }
    overdriveHudZeigen(true);
    showHudToast('Omega Overdrive: Nitro auf Kreis, Power-up auf Dreieck');
  }

  function overdriveRennenEnde() {
    odAktiv = false;
    for (const nr of [1, 2, 3]) {
      const z = odZ(nr);
      z.boostAn = false; z.powerup = null; z.superboostBis = 0; z.gewitterBis = 0;
      z.empAn = false; z.kaputt = false; z.letzterTakt = 0;
    }
    // Selbstlenken zuruecknehmen.
    if (odVorherFahrhilfe !== null) { try { fahrhilfeModus = odVorherFahrhilfe; } catch (e) { /* */ } }
    if (odVorherCarFahrhilfe !== null) { try { if (typeof playerCar !== 'undefined' && playerCar) playerCar.fahrhilfe = odVorherCarFahrhilfe; } catch (e) { /* */ } }
    odVorherFahrhilfe = null; odVorherCarFahrhilfe = null;
    // Fahrgefuehl zuruecknehmen - auch die Tempo-Obergrenze (setupVmax) aus dem Setup. Ohne
    // das bliebe 1,45 stehen, wenn das Rennen mitten im Boost endet.
    if (odVorherKonfig && typeof physEngine !== 'undefined') {
      const c = physEngine.config;
      Object.assign(c, odVorherKonfig);
      if (typeof physEngine.state !== 'undefined') physEngine.state.setupVmax = odVorherSetupVmax;
      odVorherKonfig = null;
    }
    // Motorsound zuruecknehmen.
    if (odVorherSound !== null) { try { soundProfile = odVorherSound; if (engineOsc) engineOsc.type = soundProfile.wave; } catch (e) { /* */ } }
    odVorherSound = null;
    // Licht zuruecknehmen.
    if (odVorherLicht !== null) { try { headlightsOn = odVorherLicht; } catch (e) { /* */ } }
    odVorherLicht = null;
    overdriveHudZeigen(false);
  }

  // ---- Fahrphysik-Takt (aus physicsStep) ----
  // Wird vor physEngine.update() gerufen. Rueckgabewert: null. Overdrive greift NICHT ins
  // Gas ein - es hebt oder senkt nur die Tempo-Obergrenze (setupVmax). So bleiben die
  // Sicherungen aus 1.4.47 bis 1.4.53 wirksam: kein Gas neben der Bahn, Autopilot unter
  // Gelb, Fruehstart-Sperre, totes Auto im Derby. Der Boost wirkt, indem er die Decke
  // anhebt - wer Gas gibt, wird schneller, wer nicht, bleibt langsam.
  function overdrivePhysik(jetzt, nr) {
    if (!odAktiv) return null;
    const n = nr || 1;
    const z = odZ(n);
    if (!z.letzterTakt) z.letzterTakt = jetzt;
    const dt = Math.max(0, (jetzt - z.letzterTakt) / 1000);
    z.letzterTakt = jetzt;
    const st = (n >= 2 && typeof zusatzPlatz === 'function' && zusatzPlatz(n))
      ? zusatzPlatz(n).motor.state : physEngine.state;
    const schaden = (n >= 2 && typeof zusatzPlatz === 'function' && zusatzPlatz(n))
      ? zusatzPlatz(n).schaden.wert : damage;

    // Nitro nachladen (voller Tank in einer Rundenzeit), solange nicht geboostet wird.
    if (!z.boostAn) z.nitro = Math.min(odNitroMax, z.nitro + (odNitroMax / odLapTimeS) * dt);

    const jetztZeit = rennZeitJetzt();
    // Boost laeuft noch? Superboost hebt die Zeitgrenze auf.
    if (z.boostBis > 0) {
      if (z.boostBis <= jetztZeit && z.superboostBis <= jetztZeit) { z.boostAn = false; z.boostBis = 0; }
    }

    // Power-up-Timer und Effekte ablaufen lassen (vor den Rueckgaben, damit sie auch beim
    // Boost getaktet werden).
    if (z.powerupBis > 0 && z.powerupBis <= jetztZeit) { z.powerupBis = 0; z.powerup = null; }
    if (z.superboostBis > 0 && z.superboostBis <= jetztZeit) z.superboostBis = 0;
    if (z.gewitterBis > 0 && z.gewitterBis <= jetztZeit) z.gewitterBis = 0;

    // Eigenes Auto kaputt: 3 s langsam, danach automatisch repariert.
    // Schaden bleibt also, aber ohne Boxenstopp - wer auf 100 % kommt, faehrt 3 s langsam
    // und wird dann von selbst wieder heil gesetzt.
    if (!z.kaputt && typeof schaden === 'number' && schaden >= 100) {
      z.kaputt = true;
      z.kaputtBis = jetztZeit + 3000;
      showHudToast('Kaputt – 3 s langsam');
    }
    // Die Decke setzen: Boost hebt sie an, Kaputt senkt sie, sonst der Setup-Wert.
    const basis = odVorherSetupVmax || 1;
    if (z.kaputt) {
      if (jetztZeit >= z.kaputtBis) {
        z.kaputt = false;
        if (n >= 2 && typeof zusatzPlatz === 'function' && zusatzPlatz(n)) zusatzPlatz(n).schaden.wert = 0;
        else damage = 0;
        if (typeof updateDamageFuelUI === 'function') updateDamageFuelUI();
        showHudToast('Repariert – weiter!');
      } else {
        st.setupVmax = basis * OD_KAPUTT_F;
      }
    } else if (z.boostAn && (z.boostBis > jetztZeit || z.superboostBis > jetztZeit)) {
      st.setupVmax = basis * OD_BOOST_F;
    } else {
      st.setupVmax = basis;
    }

    overdriveHudMalen(n);
    return null;
  }

  // ---- Nitro (Kreis) ----
  function overdriveBoostTaste(nr) {
    if (!odAktiv) return false;
    const z = odZ(nr || 1);
    const jetztZeit = rennZeitJetzt();
    // Unbegrenzt waehrend des Superboost-Fensters.
    if (z.superboostBis > jetztZeit) { z.boostAn = true; z.boostBis = jetztZeit + 60000; return true; }
    if (z.nitro > 0.01) {
      // Der Tank ist ein Vorrat an Boost-Sekunden (max 0,1 s je Bahnteil). Ein Druck
      // gibt bis zu 1 s Boost, verbraucht aber nur so viel, wie der Tank hergibt.
      const dauer = Math.min(1, z.nitro);
      z.boostAn = true;
      z.boostBis = jetztZeit + dauer * 1000;
      z.nitro = Math.max(0, z.nitro - dauer);
      return true;
    }
    showHudToast('Nitro leer');
    return true;
  }

  // ---- Power-up aktivieren (Dreieck) ----
  function overdrivePowerupTaste(nr) {
    const z = odZ(nr || 1);
    if (!odAktiv || !z.powerup) return false;
    const jetztZeit = rennZeitJetzt();
    const pu = z.powerup;
    if (pu === 'destroyer') {
      z.powerupBis = jetztZeit + 5000;
      z.powerup = null;
      showHudToast('Destroyer aktiv: 5 s rammen ohne Schaden');
    } else if (pu === 'superboost') {
      z.superboostBis = jetztZeit + 5000;
      z.powerup = null;
      showHudToast('Superboost: 5 s unbegrenzter Nitro');
    } else if (pu === 'gewitter') {
      z.gewitterBis = jetztZeit + 5000;
      z.powerup = null;
      showHudToast('Gewitter: alle werden langsamer (5 s)');
    } else if (pu === 'emp') {
      z.empAn = true;
      z.powerup = null;
      overdriveEmp();
      showHudToast('EMP-Blaster ausgeloest');
    }
    return true;
  }

  // ---- Power-up beim Ueberfahren der Start/Ziel-Linie zuweisen ----
  function overdriveLap(nr) {
    if (!odAktiv) return;
    const z = odZ(nr || 1);
    if (z.powerup) return;                     // schon eins gehalten
    z.powerup = OD_POWERUPS[Math.floor(Math.random() * OD_POWERUPS.length)];
    overdriveBling();
    showHudToast('Power-up: ' + t(odPowerupLabel(z.powerup)));
    overdriveHudMalen(nr || 1);
  }

  function odPowerupLabel(pu) {
    return { destroyer: 'Destroyer', superboost: 'Superboost', gewitter: 'Gewitter', emp: 'EMP-Blaster' }[pu] || pu;
  }

  // ---- EMP: Autos auf demselben Streckenteil (davor/dahinter/mit) kurz stehen lassen ----
  // Der eigene Streckenteil ist ein INDEX in [0, nTiles), kein Zaehler. playerCar.tileCount
  // ist ein Zaehler, der beim Durchfahren weiterlaeuft - modulo nTiles wird daraus die
  // aktuelle Kachel. So bleibt der Blaster ein Naeheffekt, ohne den Rest zu treffen.
  function overdriveEmp() {
    const nTiles = (currentTrackTiles && currentTrackTiles.length) || 1;
    const pTile = (typeof playerCar !== 'undefined' && playerCar && typeof playerCar.tileCount === 'number')
      ? playerCar.tileCount % nTiles : -1;
    if (pTile < 0) return;
    // "vor/hinter/mit mir": der eigene Streckenteil und die beiden Nachbarn (Rundkurs, also
    // modulo). So bleibt der Blaster ein Naeheffekt, ohne den Rest des Feldes zu treffen.
    const ziel = new Set([pTile, (pTile + 1) % nTiles, (pTile - 1 + nTiles) % nTiles]);
    for (const c of (typeof garage !== 'undefined' ? garage : [])) {
      if (!c || !c.ghost || !c.ghost.running) continue;
      const g = c.ghost;
      if (g.tileIndex === null || g.tileIndex === undefined) continue;
      if (ziel.has(((g.tileIndex % nTiles) + nTiles) % nTiles)) {
        g.odStoppBis = rennZeitJetzt() + 2500;
      }
    }
  }

  // ---- Effekt auf ein Ghost-Zieltempo (aus ghostTick) ----
  // Rueckgabewert: angepasstes Zieltempo, oder das unveraenderte.
  // Gewitter und EMP sind je SPIELER aktiv; ein Effekt eines beliebigen Spielers gilt fuer
  // alle Geister (ausser den Spieler selbst). Der kaputt-Zustand haengt am Ghost.
  function overdriveGhostZiel(car, target) {
    if (!odAktiv || !car || !car.ghost) return target;
    const g = car.ghost;
    const jetztZeit = rennZeitJetzt();
    // Kaputt (Destroyer-Treffer): 3 s langsam.
    if (g.odKaputtBis && g.odKaputtBis > jetztZeit) return target * 0.3;
    // EMP: stehen bleiben.
    if (g.odStoppBis && g.odStoppBis > jetztZeit) return 0;
    // Gewitter: alle ausser dem Spieler langsamer. Jeder aktive Spieler-Effekt zaehlt.
    for (const nr of [1, 2, 3]) {
      const z = odZ(nr);
      if (z.gewitterBis > jetztZeit && car !== playerCar) return target * 0.35;
    }
    return target;
  }

  // ---- Destroyer: beim Rammen kein Schaden, Ziel komplett kaputt ----
  function overdriveDestroyer(wer) {
    if (!odAktiv) return false;
    const z = odZ(1);
    if (z.powerupBis <= rennZeitJetzt()) return false;
    // Nur den Spieler schuetzen.
    if (wer && wer >= 2) return false;
    return true;
  }
  function overdriveDestroyerTreffer() {
    // Das anvisierte (naechste) Ghost-Auto kaputt machen: 3 s langsam. Die Distanz wird
    // ueber den STECKENTEIL (Index 0..nTiles) gemessen, nicht ueber den tileCount-Zaehler.
    // Nur wenn wirklich ein Gegner in der Naehe ist (gleicher oder benachbarter Teil),
    // wird getroffen - ein Crash ohne Gegner (Bande) trifft niemanden.
    const nTiles = (currentTrackTiles && currentTrackTiles.length) || 1;
    const pTile = (typeof playerCar !== 'undefined' && playerCar && typeof playerCar.tileCount === 'number')
      ? playerCar.tileCount % nTiles : -1;
    if (pTile < 0) return;
    let best = null, bestD = Infinity;
    for (const c of (typeof garage !== 'undefined' ? garage : [])) {
      if (!c || !c.ghost || !c.ghost.running) continue;
      if (c === playerCar) continue;
      const gi = c.ghost.tileIndex;
      if (gi === null || gi === undefined) continue;
      // Kreisrunde Distanz: 0 = derselbe Teil, nTiles-1 und 1 sind beide Nachbarn.
      const gt = ((gi % nTiles) + nTiles) % nTiles;
      let d = Math.abs(gt - pTile);
      d = Math.min(d, nTiles - d);
      if (d < bestD) { bestD = d; best = c; }
    }
    if (best && bestD <= 2) {
      best.ghost.odKaputtBis = rennZeitJetzt() + 3000;
      showHudToast('Destroyer: ' + (best.name || 'Auto') + ' kaputt');
    }
  }

  // ---- Lichter: waehrend Boost schnell blinken, Kaputt/Effekte signalisieren ----
  function overdriveLampen(head, brake, nr) {
    if (!odAktiv) return null;
    const z = odZ(nr || 1);
    const jetztZeit = rennZeitJetzt();
    // Boost: schnelles Blinken.
    if (z.boostAn && (z.boostBis > jetztZeit || z.superboostBis > jetztZeit)) {
      const an = Math.floor(jetztZeit / 120) % 2 === 0;
      return { head: an, brake: an };
    }
    // Gewitter: Licht kurz aus, damit man den Effekt sieht.
    if (z.gewitterBis > jetztZeit) {
      const an = Math.floor(jetztZeit / 500) % 2 === 0;
      return { head: an, brake };
    }
    // Destroyer: schnelles Blinken beider.
    if (z.powerupBis > jetztZeit && z.powerup === null && overdriveDestroyerAktiv(nr || 1)) {
      const an = Math.floor(jetztZeit / 200) % 2 === 0;
      return { head: an, brake: an };
    }
    return null;
  }
  function overdriveDestroyerAktiv(nr) {
    const z = odZ(nr || 1);
    return z.powerupBis > rennZeitJetzt() && z.powerup === null;
  }

  // ---- Lichthupe: immer Pups ----
  // Ein Pups aus zwei kurzen, tiefen, rauen Toenen (Arcade-Witz, keine Simulation). Es gibt
  // keine Aufnahme dafuer, also wird er hier mit dem WebAudio-Oszillator gebaut: ein
  // Saegezahn, der schnell im Grundton wackelt, klingt nach einem "Bratzeln" statt nach
  // einer Hupe.
  function overdriveFart() {
    if (!odAktiv) return false;
    if (typeof audioCtx === 'undefined' || !audioCtx || !soundEnabled) return false;
    try {
      const t0 = audioCtx.currentTime;
      // Zwei nacheinander: ein kurzes tiefes "b...", eine Pause, dann ein laengeres "bbb".
      for (const [off, dur, freq] of [[0, 0.12, 95], [0.16, 0.22, 78]]) {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, t0 + off);
        // Der Ton "zittert" - das macht das Pups-Geraeusch (oder das eines laufenden
        // Verbrennungsmotors im Leerlauf, desselben Tricks bedient sich der Motor).
        osc.frequency.linearRampToValueAtTime(freq * 0.7, t0 + off + dur);
        g.gain.setValueAtTime(0.0001, t0 + off);
        g.gain.exponentialRampToValueAtTime(0.28, t0 + off + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + off + dur);
        osc.connect(g).connect(audioCtx.destination);
        osc.start(t0 + off);
        osc.stop(t0 + off + dur + 0.02);
      }
      return true;
    } catch (e) { return false; }
  }

  // ---- Bling-Bling (Power-up) ----
  function overdriveBling() {
    playTone(1046, 0.09, 'square', 0.16);
    setTimeout(() => playTone(1568, 0.14, 'square', 0.16), 70);
  }

  // ---- HUD ----
  function overdriveHudZeigen(an) {
    const hud = document.getElementById('od-hud');
    if (hud) hud.hidden = !an;
    if (an) {
      odTankBox = document.getElementById('od-tank');
      odTankStand = document.getElementById('od-tank-stand');
      odTankBar = document.getElementById('od-tank-bar');
      odPuBox = document.getElementById('od-pu');
      odPuIco = document.getElementById('od-pu-ico');
      odPuTxt = document.getElementById('od-pu-txt');
    }
  }
  function overdriveHudMalen(nr) {
    if (!odAktiv) return;
    const z = odZ(nr || 1);
    if (!odTankBar) overdriveHudZeigen(true);
    const proz = odNitroMax > 0 ? Math.round(z.nitro / odNitroMax * 100) : 0;
    if (odTankBar) odTankBar.style.width = Math.max(0, Math.min(100, proz)) + '%';
    if (odTankStand) odTankStand.textContent = (z.boostAn ? 'Boost' : 'Nitro') + ' ' + proz + '%';
    const hud = document.getElementById('od-hud');
    if (hud) hud.classList.toggle('boost', z.boostAn);
    if (odPuBox) {
      if (z.powerup) {
        odPuBox.hidden = false;
        const sym = { destroyer: '\u25C6', superboost: '\u25B2', gewitter: '\u2602', emp: '\u25C8' }[z.powerup] || '\u25C6';
        if (odPuIco) odPuIco.textContent = sym;
        if (odPuTxt) odPuTxt.textContent = odPowerupLabel(z.powerup);
      } else {
        odPuBox.hidden = true;
      }
    }
  }

  // Beim Laden: Selbstlenk-Kasten einmal verdrahten. Das Markup steht vor dem Skript,
  // also ist das Element vorhanden. Die Verarbeitung ist defensiv, falls das Markup sich
  // aendert (z. B. bei einem Umzug des Kastens in eine andere Seite).
  try { overdriveSelbstlenkInit(); } catch (e) { /* */ }
