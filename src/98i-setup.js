  // ============================== SETUP JE AUTO (v1.4.33, WIP) ==============================
  //
  // BESTELLT: "In Garage einen Setup-Button, mit dem sich dann ein neues Fenster oeffnet fuer das
  // jeweilige Auto: Reifentyp und Tankmenge (jeweils mit Angabe, wie viele Runden sie auf der aktuellen
  // Strecke halten [wenn Carrera-Strecke im Editor ist]); auch auf Standard setzen. Wenn im Rennen
  // (z. B. Multiplayer) Fahrgefuehl festgelegt ist, dann auch Setup vereinheitlichen."
  //
  // WAS ES IST: je Spielerauto (Spieler 1-3) eine Startmischung und eine Startfuellung, gemerkt je
  // Geraet (wie Rolle, Farbe, Selbstlenkung) unter chc.setup.v1 - das Praefix chc. nimmt die Sicherung
  // (98b-sicherung.js) von selbst mit. Ohne eigenes Setup bleibt alles wie bisher: der Tank kommt aus der
  // Renneinstellung "Starttank" (raceFuelStartL), die Reifen bleiben, was montiert ist.
  //
  // WANN ES WIRKT: einmal je Fahrt-/Rennstart, in startRaceCountdown() direkt nach
  // raceStartZuruecksetzen() (70-race.js) - also nicht im 45-ms-Takt.
  //
  // VEREINHEITLICHT: Ist das Fahrgefuehl fuer alle vorgegeben (WLAN-Rennen mit erzwungenen
  // Renneinstellungen, Challenge, Meisterschaft mit festem Fahrgefuehl), faehrt jeder mit dem
  // Standard-Setup: Tank aus der Renneinstellung (im WLAN-Rennen die des Hosts, plan.tank) und die
  // Standardmischung (mittel, bei Regenstart Regen). Das Fenster zeigt dann "Fuer dieses Rennen
  // vorgegeben" und sperrt die Regler.
  //
  // DIE RUNDENANGABEN rechnen mit den Formeln, die auch im Rennen gelten, und erfinden nichts neu:
  //   Runde    chGoldFormel(chGeoGold(...)) aus 72-challenges.js: die an echten Zeiten kalibrierte
  //            "gute Runde" der Editor-Strecke (nur wenn sie geschlossen ist).
  //   Tank     fuelTankTick(): Stand - |Gas| x dt x fuelDrainPerSec. Bei 85 % Gas (die Annahme von
  //            reifenStintProbe, 93-testbench.js) haelt eine Fuellung p % also p / (Verbrauch x 0,85) s.
  //   Reifen   der Verschleiss aus physicsStep (40-physics.js) - nicht nachgebaut, sondern GEFAHREN: ein
  //            eigener Motor mit der Abstimmung dieses Spielers (also seinem Fahrgefuehl) und der Mischung
  //            (mischungAnwenden, wie applySurface im Rennen) faehrt den Stint von reifenStintProbe (85 % Gas,
  //            wechselnder Einschlag, kalt gestartet), bis der Satz abgefahren ist. Kein Faktor-Dreisatz:
  //            abgenutzte Reifen greifen schlechter und arbeiten dann weniger, der Verlauf ist nicht linear.
  //   Runden   abgerundet: Sekunden / Rundenzeit.

  const SETUP_STORE = 'chc.setup.v1';
  const SETUP_GAS = 0.85;              // wie reifenStintProbe: zuegige Fahrt
  const SETUP_TANK_SCHRITT = 5;        // Liter je Schritt am Regler
  const SETUP_TANK_MIN = 5;
  let setupFensterAuto = null;         // das Auto, dessen Fenster offen ist
  let setupLaufVorgabe = null;         // Grund der Vereinheitlichung im laufenden Rennen
  const setupRateCache = {};

  function setupAlle() {
    try { return JSON.parse(localStorage.getItem(SETUP_STORE) || '{}') || {}; } catch (e) { return {}; }
  }
  function setupSchluessel(car) { return car && car.device ? String(car.device.id) : null; }
  // Das eigene Setup eines Autos: { mix, tankL } (beides optional) oder null.
  function setupVon(car) {
    const k = setupSchluessel(car);
    if (!k) return null;
    const e = setupAlle()[k];
    if (!e) return null;
    const s = {};
    if (MISCHUNG_FOLGE.indexOf(e.mix) >= 0) s.mix = e.mix;
    if (Number.isFinite(e.tankL)) s.tankL = Math.max(SETUP_TANK_MIN, Math.min(FUEL_TANK_LITERS, e.tankL));
    return (s.mix || s.tankL) ? s : null;
  }
  function setupSpeichern(car, s) {
    const k = setupSchluessel(car);
    if (!k) return;
    const alle = setupAlle();
    if (s && (s.mix || s.tankL)) alle[k] = { mix: s.mix || null, tankL: Number.isFinite(s.tankL) ? s.tankL : null };
    else delete alle[k];
    try { localStorage.setItem(SETUP_STORE, JSON.stringify(alle)); } catch (e) { /* voll/privat */ }
    if (typeof lageZeichnen === 'function') lageZeichnen();
  }
  function setupStandard(car) { setupSpeichern(car, null); }

  // Welcher Spieler faehrt dieses Auto laut Garagenrolle (1-3), sonst 0.
  function setupSpielerNr(car) {
    if (!car) return 0;
    if (car.role === 'player') return 1;
    const m = /^player([2-9])$/.exec(car.role || '');
    return m ? Number(m[1]) : 0;
  }
  function setupStandardMix() { return raceWxStart === 'rain' ? 'regen' : 'mittel'; }
  // Die montierte Mischung eines Spielers (Standard ohne eigenes Setup: sie bleibt).
  function setupMontiert(nr) {
    if (nr <= 1) return tyres;
    const z = zusatzPlatz(nr);
    return (z && z.reifen) || 'mittel';
  }

  // ---- Ist das Setup fuer dieses Rennen vorgegeben? ------------------------------------
  // plan: der Startplan eines WLAN-Rennens (startRaceCountdown). Ohne plan (Fenster in der Garage)
  // gilt der Grund des laufenden Rennens weiter.
  function setupVorgabeGrund(plan) {
    if (plan && plan.preset) return 'mp';
    if (typeof challengeLaeuft === 'function' && challengeLaeuft()) return 'challenge';
    if (typeof meisterMpPreset === 'function') {
      try { if (meisterMpPreset()) return 'meister'; } catch (e) { /* ohne Meisterschaft */ }
    }
    if (!plan && setupLaufVorgabe && ['countdown', 'racing', 'finishing'].indexOf(raceState) >= 0) return setupLaufVorgabe;
    return null;
  }
  function setupGrundText(g) {
    return g === 'mp' ? t('WLAN-Rennen') : g === 'challenge' ? t('Challenge') : g === 'meister' ? t('Meisterschaft') : '';
  }

  // ---- Wirkung beim Start ----------------------------------------------------------------
  // Aus startRaceCountdown() (70-race.js), nach raceStartZuruecksetzen(): der Tank ist dort fuer alle auf
  // die Renneinstellung gesetzt; hier ueberschreibt das Setup je Auto. Rueckgabe fuer den Selbsttest.
  function setupRennstart(plan) {
    const grund = setupVorgabeGrund(plan || null);
    setupLaufVorgabe = grund;
    const out = { grund, spieler: [] };
    const plaetze = [{ nr: 1, car: typeof playerCar !== 'undefined' ? playerCar : null }];
    if (typeof zusatzAktiv === 'function') zusatzAktiv().forEach((z) => plaetze.push({ nr: z.nr, car: z.car }));
    let surface = false;
    for (const p of plaetze) {
      if (!p.car) continue;
      let mix = null, tankL = null;
      if (grund) mix = setupStandardMix();
      else {
        const s = setupVon(p.car);
        if (!s) continue;
        mix = s.mix || null;
        tankL = s.tankL || null;
      }
      if (mix) mix = mischungErlaubt(mix);
      if (tankL) {
        const pct = Math.max(0, Math.min(100, tankL / FUEL_TANK_LITERS * 100));
        if (p.nr === 1) fuel = pct; else tankFuellenVon(zusatzPlatz(p.nr), pct);
      }
      if (mix) {
        if (p.nr === 1) { if (tyres !== mix) { tyres = mix; surface = true; } }
        else {
          const z = zusatzPlatz(p.nr);
          if (z.reifen !== mix) {
            z.reifen = mix;
            if (p.nr === 2) surface = true;
            else mischungAnwenden(z.motor, mix, wxRainLevel() * wxRainLevel());
          }
          z.mischungWunsch = null;
        }
        if (p.nr === 1) mischungWunsch = null;
      }
      out.spieler.push({ nr: p.nr, mix, tankL });
    }
    if (surface) applySurface();
    if (grund) log('Setup: fuer dieses Rennen vorgegeben (' + grund + '), alle mit Standard.', 'info');
    else if (out.spieler.length) {
      log('Setup je Auto: ' + out.spieler.map((s) => 'P' + s.nr + (s.mix ? ' ' + s.mix : '')
        + (s.tankL ? ' ' + s.tankL + ' l' : '')).join(', '), 'info');
    }
    return out;
  }

  // ---- Rundenangaben ----------------------------------------------------------------------
  // Rundenzeit (s) der geschlossenen Editor-Strecke, sonst null.
  function setupRundeS(tiles) {
    const tl = tiles || currentTrackTiles;
    if (!tl || tl.length < 3) return null;
    let zu = false;
    try { zu = !!trackSchluss(trackCenterline(tl)).closed; } catch (e) { zu = false; }
    if (!zu) return null;
    let ms = 0;
    try { ms = chGoldFormel(chGeoGold({ code: trackToCode(tl, 0) })); } catch (e) { ms = 0; }
    return ms > 0 ? ms / 1000 : null;
  }
  // Sekunden, bis ein frischer Satz der Mischung mix abgefahren ist (Mittel aller vier Raeder = 1), mit der
  // Abstimmung des Spielers nr gefahren. 0 = Reifensimulation aus. Gedeckelt bei SETUP_REIFEN_MAX_S (dann
  // mehr: true). Gemessen: weich 58 s, mittel 139 s, hart 1170 s Fahrt kosten zusammen unter 0,1 s Rechnung,
  // und das Ergebnis wird je Abstimmung und Mischung gemerkt.
  const SETUP_REIFEN_MAX_S = 3600;
  function setupReifenSek(nr, mix) {
    const motor = motorVon(nr || 1);
    const cfg = motor && motor.config;
    if (!cfg || !(cfg.tyreEffect > 0) || !(cfg.tyreWearRate > 0)) return { sek: 0 };
    const nass = raceWxStart === 'rain' ? 1 : 0;
    const json = JSON.stringify(cfg);
    const k = nr + '|' + mix + '|' + nass + '|' + mischungStaerke();
    if (setupRateCache[k] && setupRateCache[k].json === json) return setupRateCache[k].erg;
    const e = new CarreraPhysicsEngine();
    e.spieler = nr;
    Object.assign(e.config, JSON.parse(json));
    // Griff, Aufschwimmen und Verschleissfaktor der Mischung wie im Rennen (applySurface).
    mischungAnwenden(e, mix, nass);
    const st = e.state;
    for (let i = 0; i < 4; i++) { st.tyreWear4[i] = 0; st.tyreTemp4[i] = e.config.tyreAmbientC; }
    st.tyreWear = 0; st.tyreWearL = 0; st.tyreWearR = 0; st.tyreTempC = e.config.tyreAmbientC;
    st.speedKmh = 0; st.virtualSpeed = 0; st.driveMode = 'forward';
    st.fuelLoad = 1;
    const dt = CONTROL_SEND_INTERVAL_MS / 1000;
    let tSec = 0;
    while (tSec < SETUP_REIFEN_MAX_S && st.tyreWear < 0.999) {
      e.update({ steering: Math.sin(tSec * 1.1) * 0.55, throttle: SETUP_GAS, brake: 0, headlights: false }, dt);
      tSec += dt;
    }
    const erg = { sek: tSec, mehr: st.tyreWear < 0.999 };
    setupRateCache[k] = { json, erg };
    return erg;
  }
  // { reifen, tank }: je { runden, sek } oder { aus: true } (Simulation aus); runden null = keine Strecke.
  function setupRunden(nr, mix, tankL, rundeS) {
    const runde = rundeS === undefined ? setupRundeS() : rundeS;
    const out = { rundeS: runde, reifen: null, tank: null };
    const r = setupReifenSek(nr, mix);
    if (!(r.sek > 0)) out.reifen = { aus: true };
    else out.reifen = { sek: r.sek, mehr: r.mehr, runden: runde ? Math.floor(r.sek / runde) : null };
    if (!(fuelDrainPerSec > 0)) out.tank = { aus: true };
    else {
      const sek = (tankL / FUEL_TANK_LITERS * 100) / (fuelDrainPerSec * SETUP_GAS);
      out.tank = { sek, runden: runde ? Math.floor(sek / runde) : null };
    }
    return out;
  }
  function setupRundenText(x) {
    if (!x || x.aus) return t('Simulation aus');
    if (x.runden === null || x.runden === undefined) return '';
    return t(x.mehr ? 'über {n} Runden' : 'ca. {n} Runden').replace('{n}', x.runden);
  }
  function setupZahl(x, n) {
    const s = x.toFixed(n);
    return lang === 'en' ? s : s.replace('.', ',');
  }

  // ---- Das Fenster --------------------------------------------------------------------------
  const setupStil = document.createElement('style');
  setupStil.textContent = `
    .setup-fenster .k-pause-dialog { width: min(560px, 94vw); max-height: 94vh; overflow-y: auto; box-sizing: border-box; }
    .setup-fenster .setup-kopf { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
    .setup-fenster .setup-kopf .wip-tag { font-size: 9px; }
    .setup-fenster .setup-strecke { margin: 0 0 4px; font-size: 13px; }
    .setup-fenster .setup-vorgabe { margin: 0 0 4px; padding: 4px 10px; font-size: 13px; border-left: 3px solid var(--warn);
      background: rgba(255,180,0,.08); color: #f3d9a0; }
    .setup-fenster .setup-vorgabe[hidden] { display: none; }
    .setup-fenster .gk-zeile { font-size: 15px; }
    .setup-fenster .gk-zeile .gk-l { letter-spacing: .08em; text-transform: uppercase; font-size: 13px; }
    .setup-fenster .gk-w > b { width: auto; min-width: 9em; text-align: center; }
    .setup-fenster .gk-w > button { font-size: 17px; }
    .setup-fenster .setup-wert-r { display: block; font-size: 12px; font-weight: 600; color: var(--muted); letter-spacing: .04em; }
    .setup-fenster .setup-misch { display: inline-block; width: .8em; height: .8em; border-radius: 50%; margin-right: 6px;
      vertical-align: -1px; border: 1px solid rgba(255,255,255,.5); }
    .setup-fenster .setup-tank-regler { grid-column: 1 / -1; width: 100%; margin: 2px 0 4px; accent-color: var(--k-blau); }
    .setup-fenster .opt-row.menu-nav-sel { outline: 2px solid #fff; outline-offset: -2px; }
    .setup-fenster.gesperrt .gk-zeile { opacity: .55; }
    .setup-fenster .setup-knoepfe { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
    .gar-a-setup .wip-tag { margin-left: 6px; font-size: 9px; vertical-align: 1px; }
    @media (max-height: 420px) {
      .setup-fenster .k-pause-dialog { padding: 8px 14px 10px; gap: 2px; }
      .setup-fenster .k-pause-dialog h2 { font-size: 15px; margin: 0; }
      .setup-fenster .setup-strecke, .setup-fenster .setup-vorgabe { font-size: 12px; margin: 0; }
      .setup-fenster .k-pause-dialog button { padding: 6px 12px; font-size: 14px; }
      .setup-fenster .gk-zeile { padding: 1px 4px; }
      .setup-fenster .setup-knoepfe { flex-direction: row; }
      .setup-fenster .setup-knoepfe .opt-row { flex: 1; }
      .setup-fenster .setup-knoepfe button { width: 100%; }
    }
  `;
  document.head.appendChild(setupStil);
  const setupFenster = document.createElement('div');
  setupFenster.className = 'k-pause setup-fenster';
  setupFenster.id = 'setup-fenster';
  setupFenster.hidden = true;
  setupFenster.setAttribute('data-i18n-skip', '');
  setupFenster.setAttribute('role', 'dialog');
  setupFenster.setAttribute('aria-modal', 'true');
  setupFenster.innerHTML = '<div class="k-pause-dialog" id="setup-dialog"></div>';
  document.body.appendChild(setupFenster);
  // Ein Tipp neben das Fenster schliesst es (wie Kreis/Esc).
  setupFenster.addEventListener('click', (e) => { if (e.target === setupFenster) setupSchliessen(); });

  function setupFensterOffen() { return !setupFenster.hidden; }
  function setupOeffnen(car) {
    if (!car || !setupSpielerNr(car)) return false;
    setupFensterAuto = car;
    setupFenster.hidden = false;
    setupZeichnen();
    if (typeof menuNavEnsureContext === 'function') {
      menuNavEnsureContext();
      menuNavIndex = 0; menuNavGezeigt = true; menuNavArmed = false;
      menuNavRender();
    }
    return true;
  }
  function setupSchliessen() {
    if (setupFenster.hidden) return false;
    setupFenster.hidden = true;
    setupFensterAuto = null;
    if (typeof renderGarage === 'function') renderGarage();
    if (typeof menuNavEnsureContext === 'function') { menuNavEnsureContext(); menuNavRender(); }
    return true;
  }

  // Eine Wertzeile im Stil der Garage (garWertZeile), dazu die Erklaerung als <small> in .opt-label.
  function setupWertZeile(klasse, titel, erkl, wertHtml, zurueck, vor) {
    const z = garWertZeile(titel, '', zurueck, vor);
    z.classList.add(klasse);
    const l = z.querySelector('.gk-l');
    l.classList.add('opt-label');
    const sm = document.createElement('small');
    sm.textContent = erkl;
    l.appendChild(sm);
    z.querySelector('b').innerHTML = wertHtml;
    return z;
  }

  function setupZeichnen() {
    const car = setupFensterAuto;
    const d = $('setup-dialog');
    if (!car || !d) return;
    if (garage.indexOf(car) < 0 || !setupSpielerNr(car)) { setupSchliessen(); return; }
    const nr = setupSpielerNr(car);
    const grund = setupVorgabeGrund(null);
    const eigen = setupVon(car) || {};
    const montiert = setupMontiert(nr);
    const mix = grund ? setupStandardMix() : (eigen.mix || montiert);
    const tankL = grund ? raceFuelStartL : (eigen.tankL || raceFuelStartL);
    const rundeS = setupRundeS();
    const rd = setupRunden(nr, mix, tankL, rundeS);
    const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    setupFenster.classList.toggle('gesperrt', !!grund);
    d.innerHTML = '';
    const h = document.createElement('h2');
    h.className = 'setup-kopf';
    h.innerHTML = esc(t('Setup')) + ' &middot; <span>' + esc(car.alias || car.tag || garageLabel(car)) + '</span>'
      + ' <span class="wip-tag">WIP</span>';
    d.appendChild(h);
    const p = document.createElement('p');
    p.className = 'muted setup-strecke';
    const tiles = currentTrackTiles || [];
    p.textContent = rundeS
      ? t('Strecke im Editor: {m} m, gute Runde ca. {s} s').replace('{m}', setupZahl(trackLaengeM(tiles), 2))
        .replace('{s}', setupZahl(rundeS, 1))
      : t('Ohne geschlossene Carrera-Strecke im Editor keine Rundenangabe.');
    d.appendChild(p);
    const v = document.createElement('p');
    v.className = 'setup-vorgabe';
    v.hidden = !grund && !(typeof mp !== 'undefined' && mp.an);
    v.textContent = grund
      ? t('Für dieses Rennen vorgegeben') + ' (' + setupGrundText(grund) + '): ' + t('alle fahren mit Standard.')
      : t('Im WLAN-Rennen mit erzwungenen Renneinstellungen fahren alle mit Standard.');
    d.appendChild(v);
    const std = (eigenWert) => (grund || !eigenWert ? ' &middot; ' + esc(t('Standard')) : '');
    // Reifentyp
    const mixWahl = (dd) => {
      if (setupVorgabeGrund(null)) return;
      const jetzt = (setupVon(car) || {}).mix || setupMontiert(nr);
      const i = MISCHUNG_FOLGE.indexOf(jetzt);
      const neu = MISCHUNG_FOLGE[((i < 0 ? 1 : i) + dd + MISCHUNG_FOLGE.length) % MISCHUNG_FOLGE.length];
      setupSpeichern(car, Object.assign({}, setupVon(car) || {}, { mix: neu }));
      setupZeichnen();
    };
    const rText = setupRundenText(rd.reifen);
    const zr = setupWertZeile('setup-reifen', t('Reifentyp'),
      t('Mischung beim nächsten Start. Die Rundenzahl gilt, bis der Satz abgefahren ist: gerechnet mit dem Verschleißmodell und dem Fahrgefühl dieses Autos bei zügiger Fahrt (85 % Gas) und einer guten Runde auf der Editor-Strecke. Standard: was montiert ist (bei vorgegebenem Setup mittel, bei Regenstart Regen).'),
      '<i class="setup-misch" style="background:' + mischungFarbe(mix) + '"></i>' + esc(mischungName(mix)) + std(eigen.mix)
        + (rText ? '<span class="setup-wert-r">' + esc(rText) + '</span>' : ''),
      () => mixWahl(-1), () => mixWahl(1));
    zr.dataset.mix = mix;
    d.appendChild(zr);
    // Starttank
    const tankSetzen = (l) => {
      if (setupVorgabeGrund(null)) return;
      const w = Math.max(SETUP_TANK_MIN, Math.min(FUEL_TANK_LITERS, Math.round(l / SETUP_TANK_SCHRITT) * SETUP_TANK_SCHRITT));
      setupSpeichern(car, Object.assign({}, setupVon(car) || {}, { tankL: w }));
      setupZeichnen();
    };
    const tText = setupRundenText(rd.tank);
    const zt = setupWertZeile('setup-tank', t('Starttank'),
      t('Füllung beim nächsten Start, in Schritten von 5 l. Die Rundenzahl rechnet mit dem Verbrauchsregler aus den Optionen bei 85 % Gas und einer guten Runde auf der Editor-Strecke. Standard: der Starttank aus den Renneinstellungen.'),
      esc(tankL + ' l (' + Math.round(tankL / FUEL_TANK_LITERS * 100) + ' %)') + std(eigen.tankL)
        + (tText ? '<span class="setup-wert-r">' + esc(tText) + '</span>' : ''),
      () => tankSetzen(tankL - SETUP_TANK_SCHRITT), () => tankSetzen(tankL + SETUP_TANK_SCHRITT));
    zt.dataset.tank = String(tankL);
    // Der sichtbare Regler kommt VOR das versteckte Steuerkreuzfeld: menuNavControlFor() nimmt den ersten
    // Regler der Zeile, links/rechts verstellt dann 5 l, gehalten 25 l.
    const rg = document.createElement('input');
    rg.type = 'range'; rg.className = 'setup-tank-regler';
    rg.min = String(SETUP_TANK_MIN); rg.max = String(FUEL_TANK_LITERS); rg.step = String(SETUP_TANK_SCHRITT);
    rg.value = String(tankL);
    rg.setAttribute('data-preset-skip', '');
    rg.setAttribute('aria-label', t('Starttank'));
    rg.disabled = !!grund;
    rg.addEventListener('change', () => tankSetzen(+rg.value));
    rg.addEventListener('input', () => {
      const b = zt.querySelector('.gk-w > b');
      if (b && b.firstChild) b.firstChild.textContent = rg.value + ' l (' + Math.round(+rg.value / FUEL_TANK_LITERS * 100) + ' %)';
    });
    zt.insertBefore(rg, zt.querySelector('.gk-pad'));
    d.appendChild(zt);
    if (grund) d.querySelectorAll('.gk-zeile .gk-w button').forEach((b) => { b.disabled = true; });
    // Knoepfe
    const kn = document.createElement('div');
    kn.className = 'setup-knoepfe';
    const knopf = (act, text, fn, primary) => {
      const z = document.createElement('div');
      z.className = 'opt-row opt-breit';
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.act = act;
      if (primary) b.className = 'primary';
      b.textContent = text;
      b.onclick = fn;
      z.appendChild(b);
      kn.appendChild(z);
      return b;
    };
    const sb = knopf('setup-standard', t('Standard'), () => {
      setupStandard(car);
      showHudToast(t('Setup auf Standard'));
      setupZeichnen();
    });
    sb.disabled = !!grund || !setupVon(car);
    knopf('setup-zu', t('Schließen'), () => setupSchliessen(), true);
    d.appendChild(kn);
    if (typeof optInfoEinrichten === 'function') optInfoEinrichten();
    if (typeof menuNavRender === 'function' && setupFensterOffen()) { menuNavEnsureContext(); menuNavRender(); }
  }

  // Der Knopf in der Garage (rechte Haelfte, unter "Blinken"), nur fuer Spielerautos.
  function setupGarageZeile(car) {
    if (!setupSpielerNr(car)) return null;
    const z = document.createElement('div');
    z.className = 'opt-row opt-breit gar-a-aktion gar-a-setup';
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.act = 'setup';
    const s = setupVon(car);
    const was = s ? [s.mix ? mischungName(s.mix) : null, s.tankL ? s.tankL + ' l' : null].filter(Boolean).join(' · ') : '';
    b.innerHTML = '';
    b.appendChild(document.createTextNode(t('Setup') + (was ? ' · ' + was : '')));
    const w = document.createElement('span');
    w.className = 'wip-tag';
    w.textContent = 'WIP';
    b.appendChild(w);
    b.onclick = (e) => { e.stopPropagation(); setupOeffnen(car); };
    z.appendChild(b);
    return z;
  }
  i18nOnLangChange(() => { if (setupFensterOffen()) setupZeichnen(); });

  // ---- Selbsttests (v1.4.33) ------------------------------------------------------------------
  // Hier und nicht in 95-selftest.js: stAdd() steht dort und ist zur Ladezeit dieser Datei laengst da.
  // Jeder Test sichert die Setup-Ablage und den Spielzustand und stellt beides danach wieder her.
  function setupTestRahmen(fn) {
    let roh = null;
    try { roh = localStorage.getItem(SETUP_STORE); } catch (e) { roh = null; }
    const merk = { auf: garAufAuto, virt: garVirtuellAuf, tiles: currentTrackTiles, rs: raceState,
                   pc: playerCar, pc2: playerCar2, zs: zweiSpieler, fuel, tyres, tyres2,
                   t2: tankZwei.stand, wunsch: mischungWunsch, lauf: setupLaufVorgabe, ch: chLauf,
                   drain: fuelDrainPerSec, wx: raceWxStart };
    const probe = [['player', 'p1'], ['player2', 'p2'], ['ghost', 'npc']].map(([role, id], i) => ({ role,
      device: { id: 'probe-setup-' + id, name: 'Probe' }, alias: 'Setup ' + id, colorId: ['rot', 'blau', 'gelb'][i],
      sim: false, testSenke: [], probe: true }));
    const f = [];
    try {
      try { localStorage.removeItem(SETUP_STORE); } catch (e) { /* privat */ }
      probe.forEach((c) => garage.push(c));
      return fn(f, probe);
    } catch (e) {
      f.push('Fehler: ' + e.message);
      return { ok: false, mass: f.join(' | ') };
    } finally {
      setupFenster.hidden = true; setupFensterAuto = null;
      for (let i = garage.length - 1; i >= 0; i--) if (probe.includes(garage[i])) garage.splice(i, 1);
      garAufAuto = merk.auf; garVirtuellAuf = merk.virt; currentTrackTiles = merk.tiles; raceState = merk.rs;
      playerCar = merk.pc; playerCar2 = merk.pc2; zweiSpieler = merk.zs; fuel = merk.fuel;
      tyres2 = merk.tyres2; tankZwei.stand = merk.t2; mischungWunsch = merk.wunsch; setupLaufVorgabe = merk.lauf;
      chLauf = merk.ch; fuelDrainPerSec = merk.drain; raceWxStart = merk.wx;
      tyres = merk.tyres;
      applySurface();
      try { if (roh === null) localStorage.removeItem(SETUP_STORE); else localStorage.setItem(SETUP_STORE, roh); } catch (e) { /* privat */ }
      renderGarage();
      if (typeof menuNavEnsureContext === 'function') menuNavEnsureContext();
    }
  }
  const setupErgebnis = (f, ok) => ({ ok: !f.length, mass: f.length ? f.join(' | ') : ok });

  stAdd('Setup v1.4.33: Knopf je Spielerauto mit WIP, nicht bei NPCs', () => setupTestRahmen((f, probe) => {
    probe.forEach((car) => {
      garAufAuto = car; garVirtuellAuf = false; renderGarage();
      const b = $('gar-list').querySelector('.gar-a-rechts [data-act="setup"]');
      const spieler = car.role !== 'ghost';
      if (spieler && !b) f.push(car.role + ': kein Setup-Knopf');
      if (spieler && b && !b.querySelector('.wip-tag')) f.push(car.role + ': Knopf ohne WIP');
      if (!spieler && b) f.push('NPC hat einen Setup-Knopf');
      if (spieler && b) {
        const blink = $('gar-list').querySelector('.gar-a-rechts .gar-a-blinken');
        if (!blink || blink.nextElementSibling !== b.closest('.opt-row')) f.push(car.role + ': Setup nicht direkt unter Blinken');
      }
    });
    return setupErgebnis(f, 'Spieler 1 und 2 mit Knopf (WIP), NPC ohne');
  }));

  stAdd('Setup v1.4.33: Fenster oeffnet und schliesst mit Klick, Steuerkreuz und Kreis', () => setupTestRahmen((f, probe) => {
    const car = probe[0];
    const merkTab = kAktiverTab();
    try {
      showTab('garage');
      garAufAuto = car; garVirtuellAuf = false; renderGarage();
      $('gar-list').querySelector('[data-act="setup"]').click();
      if (!setupFensterOffen()) f.push('Klick oeffnet nicht');
      if (menuNavContainer() !== $('setup-fenster')) f.push('Steuerkreuz bleibt in der Garage');
      const rows = menuNavRows();
      const art = rows.map((r) => (r.el.classList.contains('setup-reifen') ? 'reifen' : r.el.classList.contains('setup-tank') ? 'tank'
        : (r.control.dataset && r.control.dataset.act) || '?'));
      if (art.join(',') !== 'reifen,tank,setup-standard,setup-zu') f.push('Zeilen: ' + art.join(','));
      if (rows[1] && rows[1].control !== $('setup-fenster').querySelector('.setup-tank-regler')) f.push('Tankzeile verstellt nicht den Regler');
      // Rechts auf dem Reifentyp schaltet die Mischung weiter und merkt sie.
      menuNavIndex = 0; menuNavGezeigt = true; menuNavRender();
      const vorher = setupMontiert(1);
      menuNavSeitwaerts('right', true); menuNavAdjustGehalten('right', false);
      const s1 = setupVon(car);
      const soll = MISCHUNG_FOLGE[(MISCHUNG_FOLGE.indexOf(vorher) + 1) % MISCHUNG_FOLGE.length];
      if (!s1 || s1.mix !== soll) f.push('rechts auf Reifentyp -> ' + (s1 && s1.mix) + ' statt ' + soll);
      // Links auf dem Tank: 5 l weniger.
      menuNavIndex = 1; menuNavRender();
      menuNavSeitwaerts('left', true); menuNavAdjustGehalten('left', false);
      const s2 = setupVon(car);
      if (!s2 || s2.tankL !== raceFuelStartL - SETUP_TANK_SCHRITT) f.push('links auf Tank -> ' + (s2 && s2.tankL) + ' l');
      // Kreis schliesst und bleibt in der Garage.
      if (!konsoleZurueck() || setupFensterOffen()) f.push('Kreis schliesst nicht');
      if (kAktiverTab() !== 'garage') f.push('Kreis verlaesst die Garage');
      // X auf "Schliessen".
      setupOeffnen(car);
      const zu = menuNavRows().findIndex((r) => r.control.dataset && r.control.dataset.act === 'setup-zu');
      menuNavIndex = zu; menuNavRender(); menuNavActivate();
      if (setupFensterOffen()) f.push('X auf Schliessen schliesst nicht');
      if (menuNavContainer() === $('setup-fenster')) f.push('Steuerkreuz bleibt im geschlossenen Fenster');
    } finally {
      showTab(merkTab);
    }
    return setupErgebnis(f, 'Klick, links/rechts, X und Kreis');
  }));

  stAdd('Setup v1.4.33: Rundenangaben aus Streckenlaenge und Modell, ohne Strecke Hinweis', () => setupTestRahmen((f, probe) => {
    const merkEff = physEngine.config.tyreEffect;
    try {
      if (!(physEngine.config.tyreEffect > 0)) { physEngine.config.tyreEffect = 1; physEngine2Abgleichen(); }
      fuelDrainPerSec = 1;
      currentTrackTiles = codeToTrack('SGR4LGHG').tiles;
      const runde = setupRundeS();
      if (!(runde > 6.5 && runde < 8.5)) f.push('Runde SGR4LGHG ' + runde + ' s (Gold 7,3 s erwartet)');
      const voll = setupRunden(1, 'mittel', FUEL_TANK_LITERS, runde);
      const halb = setupRunden(1, 'mittel', FUEL_TANK_LITERS / 2, runde);
      const sollTank = 100 / (1 * SETUP_GAS);
      if (Math.abs(voll.tank.sek - sollTank) > 0.01) f.push('Tank ' + voll.tank.sek.toFixed(1) + ' s statt ' + sollTank.toFixed(1));
      if (voll.tank.runden !== Math.floor(sollTank / runde)) f.push('Tankrunden ' + voll.tank.runden);
      if (Math.abs(halb.tank.sek * 2 - voll.tank.sek) > 0.01) f.push('halber Tank nicht halbe Zeit');
      const r = MISCHUNG_FOLGE.map((m) => setupRunden(1, m, 50, runde).reifen.sek);
      if (!(r[0] < r[1] && r[1] < r[2])) f.push('weich/mittel/hart nicht aufsteigend: ' + r.map((x) => Math.round(x)).join('/'));
      // Gegenprobe mit dem Stint des Pruefstands (dieselbe Fahrt, aber kalt gestartet und bis abgefahren).
      const probeStint = OMEGA_TEST.reifenStintProbe({ tyreEffect: physEngine.config.tyreEffect, mix: mischungWert('mittel', 'verschleiss'), drain: 1, maxSekunden: 1500 });
      if (probeStint.reifenSek && Math.abs(r[1] / probeStint.reifenSek - 1) > 0.1) {
        f.push('mittel ' + Math.round(r[1]) + ' s gegen Stintprobe ' + probeStint.reifenSek + ' s');
      }
      const t0 = performance.now();
      Object.keys(setupRateCache).forEach((k) => { delete setupRateCache[k]; });
      MISCHUNG_FOLGE.forEach((m) => setupReifenSek(1, m));
      const ms = performance.now() - t0;
      if (ms > 400) f.push('Verschleissfahrt ' + Math.round(ms) + ' ms');
      // Fenster mit Strecke: Rundenangaben stehen da.
      setupOeffnen(probe[0]);
      const txt = $('setup-fenster').textContent;
      if (!/ca\. \d+ Runden|approx\. \d+ laps|aprox\. \d+ vueltas/.test(txt)) f.push('keine Rundenangabe im Fenster');
      // Ohne Strecke und mit offener Strecke: keine Zahl, sondern der Hinweis.
      for (const code of [null, 'SG3']) {
        currentTrackTiles = code ? codeToTrack(code).tiles : [];
        if (setupRundeS() !== null) f.push((code || 'leer') + ': Runde trotz fehlender Strecke');
        setupZeichnen();
        const tx = $('setup-fenster').textContent;
        if (tx.indexOf(t('Ohne geschlossene Carrera-Strecke im Editor keine Rundenangabe.')) < 0) f.push((code || 'leer') + ': kein Hinweis');
        if (/ca\. \d+ Runden/.test(tx)) f.push((code || 'leer') + ': Rundenzahl ohne Strecke');
      }
      return setupErgebnis(f, 'Runde ' + (runde || 0).toFixed(2) + ' s, Tank voll ' + voll.tank.runden + ' Rd., Reifen '
        + MISCHUNG_FOLGE.map((m, i) => m + ' ' + Math.floor(r[i] / runde)).join('/') + ' Rd., Stintprobe mittel '
        + probeStint.reifenSek + ' s gegen ' + Math.round(r[1]) + ' s, Verschleissfahrt ' + Math.round(ms) + ' ms');
    } finally {
      physEngine.config.tyreEffect = merkEff; physEngine2Abgleichen();
    }
  }));

  stAdd('Setup v1.4.33: Standard setzt zurueck, Speicherung je Auto in der Sicherung', () => setupTestRahmen((f, probe) => {
    setupSpeichern(probe[0], { mix: 'weich', tankL: 55 });
    setupSpeichern(probe[1], { mix: 'hart' });
    let roh = {};
    try { roh = JSON.parse(localStorage.getItem(SETUP_STORE) || '{}'); } catch (e) { roh = {}; }
    if (!roh['probe-setup-p1'] || roh['probe-setup-p1'].tankL !== 55) f.push('Auto 1 nicht gespeichert');
    if (!roh['probe-setup-p2'] || roh['probe-setup-p2'].mix !== 'hart') f.push('Auto 2 nicht gespeichert');
    if (sicherungSchluessel().indexOf(SETUP_STORE) < 0) f.push('Sicherung erfasst ' + SETUP_STORE + ' nicht');
    setupOeffnen(probe[0]);
    const sb = $('setup-fenster').querySelector('[data-act="setup-standard"]');
    if (!sb || sb.disabled) f.push('Standard-Knopf fehlt oder gesperrt');
    else sb.click();
    if (setupVon(probe[0])) f.push('Standard setzt nicht zurueck');
    if (!setupVon(probe[1])) f.push('Standard loescht auch das andere Auto');
    const sb2 = $('setup-fenster').querySelector('[data-act="setup-standard"]');
    if (!sb2 || !sb2.disabled) f.push('Standard-Knopf ohne eigenes Setup nicht gesperrt');
    const tz = $('setup-fenster').querySelector('.setup-tank');
    if (!tz || +tz.dataset.tank !== raceFuelStartL) f.push('Tank nach Standard ' + (tz && tz.dataset.tank) + ' statt Renneinstellung');
    return setupErgebnis(f, 'je Geraet in ' + SETUP_STORE + ', Standard nur fuer dieses Auto');
  }));

  stAdd('Setup v1.4.33: wirkt beim Start je Auto, ohne Setup wie bisher', () => setupTestRahmen((f, probe) => {
    if (String(startRaceCountdown).indexOf('setupRennstart(mpPlan)') < 0) f.push('Rennstart ruft setupRennstart nicht');
    playerCar = probe[0]; playerCar2 = probe[1]; zweiSpieler = true;
    chLauf = null; setupLaufVorgabe = null;
    setupSpeichern(probe[0], { mix: 'weich', tankL: 55 });
    setupSpeichern(probe[1], { mix: 'hart', tankL: 33 });
    fuel = 100; tankZwei.stand = 100; tyres = 'mittel'; tyres2 = 'mittel';
    let r = setupRennstart(null);
    if (r.grund) f.push('vorgegeben ohne Grund: ' + r.grund);
    if (Math.abs(fuel - 50) > 0.01) f.push('P1 Tank ' + fuel.toFixed(1) + ' % statt 50');
    if (tyres !== 'weich') f.push('P1 Reifen ' + tyres);
    if (Math.abs(tankZwei.stand - 30) > 0.01) f.push('P2 Tank ' + tankZwei.stand.toFixed(1) + ' % statt 30');
    if (tyres2 !== 'hart') f.push('P2 Reifen ' + tyres2);
    if (Math.abs(physEngine2.config.tyreWearMix - mischungWert('hart', 'verschleiss')) > 1e-9) f.push('P2-Motor rechnet nicht mit hart');
    // Ohne eigenes Setup: nichts angefasst.
    setupStandard(probe[0]); setupStandard(probe[1]);
    fuel = 80; tankZwei.stand = 70; tyres = 'hart'; tyres2 = 'regen';
    r = setupRennstart(null);
    if (fuel !== 80 || tankZwei.stand !== 70 || tyres !== 'hart' || tyres2 !== 'regen') f.push('ohne Setup veraendert: '
      + [fuel, tankZwei.stand, tyres, tyres2].join('/'));
    return setupErgebnis(f, 'P1 weich 55 l, P2 hart 33 l; ohne Setup unveraendert');
  }));

  stAdd('Setup v1.4.33: Vereinheitlichung bei festgelegtem Fahrgefuehl, Fenster gesperrt', () => setupTestRahmen((f, probe) => {
    playerCar = probe[0]; playerCar2 = probe[1]; zweiSpieler = true;
    chLauf = null; setupLaufVorgabe = null; raceWxStart = 'dry';
    setupSpeichern(probe[0], { mix: 'weich', tankL: 20 });
    setupSpeichern(probe[1], { mix: 'hart', tankL: 20 });
    fuel = 100; tankZwei.stand = 100; tyres = 'weich'; tyres2 = 'regen';
    // WLAN-Rennen mit erzwungenem Fahrgefuehl.
    let r = setupRennstart({ preset: 'pro', tank: 110 });
    if (r.grund !== 'mp') f.push('WLAN mit Preset nicht vereinheitlicht');
    if (tyres !== 'mittel' || tyres2 !== 'mittel') f.push('Reifen ' + tyres + '/' + tyres2 + ' statt Standard mittel');
    if (fuel !== 100 || tankZwei.stand !== 100) f.push('Tank vom eigenen Setup ueberschrieben');
    // Ohne erzwungenes Preset gilt wieder das eigene.
    r = setupRennstart({ tank: 110 });
    if (r.grund || tyres !== 'weich') f.push('WLAN ohne Preset trotzdem vereinheitlicht');
    // Challenge: Fenster gesperrt, mit Hinweis, Regler wirkungslos.
    chLauf = { id: 'probe' };
    raceWxStart = 'rain';
    if (setupVorgabeGrund(null) !== 'challenge') f.push('Challenge nicht erkannt');
    setupOeffnen(probe[0]);
    const fe = $('setup-fenster');
    if (!fe.classList.contains('gesperrt')) f.push('Fenster nicht gesperrt');
    if (fe.textContent.indexOf(t('Für dieses Rennen vorgegeben')) < 0) f.push('kein Hinweis "vorgegeben"');
    if (fe.querySelector('.setup-reifen').dataset.mix !== 'regen') f.push('Standard bei Regenstart nicht Regen');
    if (!fe.querySelector('.setup-tank-regler').disabled) f.push('Tankregler frei');
    if (![...fe.querySelectorAll('.gk-zeile .gk-w button')].every((b) => b.disabled)) f.push('Pfeile frei');
    menuNavIndex = 0; menuNavGezeigt = true; menuNavRender();
    menuNavSeitwaerts('right', true); menuNavAdjustGehalten('right', false);
    if ((setupVon(probe[0]) || {}).mix !== 'weich') f.push('gesperrter Reifentyp liess sich verstellen');
    r = setupRennstart(null);
    if (r.grund !== 'challenge' || tyres !== 'regen') f.push('Challenge-Start: ' + r.grund + ' ' + tyres);
    return setupErgebnis(f, 'WLAN-Preset und Challenge: alle Standard, Fenster gesperrt');
  }));
