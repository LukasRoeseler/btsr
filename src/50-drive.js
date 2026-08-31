  // =========================================================================
  // Fahren: Regler, Kalibrierung, Makros
  // =========================================================================
  // Die Instanz der Physik, die Regler aus dem Optionentab, der automatische
  // Kalibrierungslauf und die Aufnahme/Wiedergabe von Fahrten.


  const physEngine = new CarreraPhysicsEngine();
  let physLastTime = null;
  // AN als Standard, weil die Original-App es praktisch immer an hat und ein beleuchtetes
  // Auto auf dem Tisch besser zu sehen ist.
  //
  // NICHT weil der Streckensensor es braucht. Das stand hier eine Fassung lang, gestuetzt auf
  // eine Auszaehlung (Licht an: 11703 Codes in 40075 Paketen; Licht aus: 0 in 422), und es
  // ist widerlegt: in der Original-App wird die Strecke gelesen, ob das Licht an ist oder
  // aus. Die Korrelation war echt, aber nicht ursaechlich - 422 Pakete sind rund 20 Sekunden
  // und lagen am Sitzungsanfang, bevor etwas ueberfahren wurde.
  let headlightsOn = true;
  let raceLampHead = false;  // resolved headlight state, for the racing screen

  // Eine Stelle fuer die Leseart, zwei Bedienelemente darauf: der Schalter in den Optionen
  // und der Knopf im Cockpit. Zwei Orte mit eigener Logik waeren zwei Orte, die
  // auseinanderlaufen - der Knopf setzt deshalb den Schalter und nichts sonst.
  function applyScanMode() {
    const rail = $('setting-ontrack') ? $('setting-ontrack').checked : true;
    trackMode = rail ? 'on' : 'off';
    // Sofort in lightBits eintragen. Die Fahrschleife setzt es ohnehin jeden Takt neu
    // zusammen, aber bis dahin waere der Zustand widerspruechlich: trackMode schon
    // umgeschaltet, das gesendete Byte noch alt. Nur die zwei Modusbits werden angefasst,
    // Scheinwerfer und Bremslicht bleiben stehen - daher die Maske.
    lightBits = (lightBits & ~(TRACK_BIT_RAIL | TRACK_BIT_PRINT)) | trackModeBit();
    const b = $('race-act-scan');
    if (b) {
      b.textContent = rail ? 'Liest: Bahn' : 'Liest: Ausdruck';
      // Die Ausdruck-Stellung ist die ungewoehnliche und die, in der das Auto sich nicht
      // selbst haelt. Sie wird angeschrieben, damit man nicht versehentlich darin faehrt.
      b.classList.toggle('warn', !rail);
    }
    return rail;
  }

  $('setting-ontrack').addEventListener('change', () => {
    const rail = applyScanMode();
    // Kein 'err' mehr fuer die Ausdruck-Stellung: sie ist kein Fehler, sondern die einzige
    // Stellung, in der ein gedrucktes Muster ueberhaupt gelesen wird. Am 26.08. mit der
    // Original-App gemessen.
    log(rail
        ? 'Leseart: Kunststoffschiene (Byte 14 Bit 5). Das Auto haelt sich selbst auf der '
          + 'Bahn, liest aber keine gedruckten Muster.'
        : 'Leseart: gedruckte Muster (Byte 14 Bit 7). Nur hier werden Ausdrucke gelesen, '
          + 'dafuer haelt sich das Auto nicht selbst auf der Bahn.', 'info');
    showHudToast(rail ? 'LIEST BAHN' : 'LIEST AUSDRUCK');
  });

  if ($('race-act-scan')) {
    $('race-act-scan').addEventListener('click', () => {
      const sw = $('setting-ontrack');
      if (!sw) return;
      sw.checked = !sw.checked;
      sw.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  applyScanMode();

  $('phys-enable').addEventListener('change', (e) => {
    physicsEnabled = e.target.checked;
    physLastTime = null;
  });

  $('dash-head-toggle').addEventListener('change', (e) => {
    headlightsOn = e.target.checked;
    // Keine Warnung mehr: die Behauptung, ohne Licht werde nicht gelesen, war falsch.
  });

  // Die Gangzahl im Cockpit schaltet denselben Schalter, den die Optionen zeigen. Ueber
  // click() und nicht ueber physEngine.config: so bleibt der Schalter die einzige Wahrheit,
  // und alles, was an seinem change-Ereignis haengt (Speichern, Anzeige, Voreinstellungen),
  // laeuft mit. Zwei Orte fuer denselben Zustand waeren zwei Orte, die auseinanderlaufen.
  if ($('race-gear')) {
    $('race-gear').addEventListener('click', () => {
      const sw = $('setting-autoshift');
      if (!sw) return;
      sw.checked = !sw.checked;
      sw.dispatchEvent(new Event('change', { bubbles: true }));
      showHudToast(sw.checked ? 'AUTOMATIK' : 'MANUELL, I UND K ODER PAD');
    });
  }

  $('setting-autoshift').addEventListener('change', (e) => {
    physEngine.config.autoShift = e.target.checked;
    showHudToast(e.target.checked ? 'Automatikgetriebe' : 'Manuelles Getriebe');
  });

  // All three feed the launch model, so each one has to re-solve the calibration.
  $('setting-topspeed-kmh').addEventListener('input', (e) => {
    physEngine.config.topSpeedKmh = parseFloat(e.target.value);
    $('setting-topspeed-kmh-val').textContent = physEngine.config.topSpeedKmh.toFixed(1);
    physEngine.calibrateAccel();
    markDrivetrainChartsDirty();
  });

  // Der Regler steht in SEKUNDEN, weil die Physik damit rechnet und der Wert gegen eine
  // gemessene GT3-Reihe gefittet ist. Angezeigt wird trotzdem eine BESCHLEUNIGUNG in
  // Prozent, denn "weniger ist schneller" liest sich bei einem Regler, der neben
  // "Hoechstgeschwindigkeit" steht, unweigerlich als Fehler. Die Sekunden stehen zur
  // Kontrolle daneben - sie sind die Groesse, gegen die kalibriert wurde, und die will man
  // sehen koennen.
  const ACCEL_REF_S = 3.2;   // Bezugswert = 100 %
  function accelLabel(s) {
    return Math.round(ACCEL_REF_S / s * 100) + ' % ('
         + s.toFixed(1).replace('.', ',') + ' s auf 100)';
  }
  $('setting-zero-to-top').addEventListener('input', (e) => {
    physEngine.config.launchAnchorTimeS = parseFloat(e.target.value);
    $('setting-zero-to-top-val').textContent = accelLabel(physEngine.config.launchAnchorTimeS);
    physEngine.calibrateAccel();
    markDrivetrainChartsDirty();
  });
  $('setting-zero-to-top-val').textContent = accelLabel(+$('setting-zero-to-top').value);

  $('setting-coast-drag').addEventListener('input', (e) => {
    physEngine.config.coastDragPerS = parseFloat(e.target.value);
    $('setting-coast-drag-val').textContent = physEngine.config.coastDragPerS.toFixed(2);
    physEngine.calibrateAccel();
    markDrivetrainChartsDirty();
  });

  $('setting-vibration').addEventListener('change', (e) => { rumbleOn = e.target.checked; });

  // Der Regler steht in PROZENT vorn, die Physik rechnet mit einem Anteil.
  $('setting-brakebias').addEventListener('input', (e) => {
    const pct = parseInt(e.target.value, 10);
    physEngine.config.brakeBias = pct / 100;
    $('setting-brakebias-val').textContent = pct + '% vorn';
  });

  $('setting-fuel-drain').addEventListener('input', (e) => {
    fuelDrainPerSec = parseFloat(e.target.value);
    $('setting-fuel-drain-val').textContent = fuelDrainPerSec.toFixed(1);
  });

  // Der Regler laeuft ueber den INDEX dieser Liste, nicht ueber den Wert: ein
  // Bereichsregler hat eine feste Schrittweite, und 1 2 3 4 5 10 20 50 hat keine. Die
  // Liste steht hier und nicht im Markup, damit Regler und Anzeige nicht auseinanderlaufen.
  const CRASH_STEPS = [1, 2, 3, 4, 5, 10, 20, 50];
  $('setting-crash-count').addEventListener('input', (e) => {
    const i = Math.max(0, Math.min(CRASH_STEPS.length - 1, parseInt(e.target.value, 10)));
    crashesToTotal = CRASH_STEPS[i];
    $('setting-crash-count-val').textContent = crashesToTotal;
  });

  $('setting-crash-damage').addEventListener('change', (e) => {
    // Umgedreht gegenueber vorher: der Schalter hiess "Crashs ausschalten" und war damit
    // eine doppelte Negation - angehakt bedeutete "kein Schaden". Jetzt heisst er "Schaden"
    // und angehakt bedeutet, dass es welchen gibt. Standard an.
    crashDetectionEnabled = e.target.checked;
    // Der Zaehler "Crashs bis Schadensbalken voll" ist ohne Schadensmodell bedeutungslos.
    $('setting-crash-count').disabled = !e.target.checked;
    log('Schadensmodell ' + (e.target.checked ? 'an' : 'aus') + '.', 'info');
  });

  $('setting-repair-time').addEventListener('input', (e) => {
    pitFullRepairS = parseInt(e.target.value, 10);
    $('setting-repair-time-val').textContent = pitFullRepairS + ' s';
  });

  // Die kalibrierte Vorgabe fuer das Lenkansprechen. Sie ist der Bezug fuer die Anzeige,
  // damit dort 100 % steht, wo der Wert hingehoert - und nicht 200 %.
  const STEER_RESP_REF = 2.0;
  ['phys-steerresp', 'phys-accel'].forEach(id => {
    const input = $(id);
    const readout = $(id + '-val');
    const apply = () => {
      const v = parseFloat(input.value);
      readout.textContent = v.toFixed(2);
      if (id === 'phys-steerresp') {
        physEngine.config.steerResponse = v;
        // Bezug ist die kalibrierte Vorgabe 2.0, nicht der Rohwert. 200 % zu lesen, wo
        // die beste Einstellung liegt, laesst sie wie eine Uebertreibung aussehen.
        $('phys-steerresp-val').textContent = Math.round(v / STEER_RESP_REF * 100) + '%';
      }
      if (id === 'phys-accel') physEngine.config.accelerationFactor = v;
      markDrivetrainChartsDirty();
    };
    input.addEventListener('input', apply);
    apply();
  });

  // ---- Settings sliders matching the official app's Geschwindigkeit/Reifengrip/
  // Bremswirkung concepts, each backed by a real existing lever (no invented settings) ----
  // Beim Laden aus dem Markup gelesen statt hart gesetzt: der Wert stand auf 1 und passte
  // nur zufaellig zum value="1" im Dokument. Eine Aenderung dort waere stillschweigend
  // wirkungslos geblieben, bis jemand den Regler einmal anfasst.
  let topSpeedScale = parseFloat(($('setting-topspeed') || {}).value) || 1;
  const BASE_BRAKE = { base: physEngine.config.brakeDecelBase,
                       aero: physEngine.config.brakeDecelAero };

  $('setting-topspeed').addEventListener('input', (e) => {
    topSpeedScale = parseFloat(e.target.value);
    $('setting-topspeed-val').textContent = Math.round(topSpeedScale * 100) + '%';
  });

  $('setting-grip').addEventListener('input', (e) => {
    const grip = parseFloat(e.target.value);
    $('setting-grip-val').textContent = grip.toFixed(2);
    // Less grip = authority falls off sooner with speed. The old 0.7*(1-grip) collapsed to
    // 0.07 at the default grip, i.e. no falloff worth feeling — the sluggishness came from
    // the damping instead, which is gone. This keeps a real floor so the higher gears
    // actually go flatter, and grip still moves it.
    physEngine.config.speedSteerReduction = 0.20 + 0.30 * (1 - grip);
    // Steering RESPONSE is deliberately not touched here: that is the driver's trim on the
    // D-pad, not a property of the tyres.
  });

  $('setting-brakepower').addEventListener('input', (e) => {
    const mult = parseFloat(e.target.value);
    $('setting-brakepower-val').textContent = mult.toFixed(2);
    physEngine.config.brakeDecelBase = BASE_BRAKE.base * mult;
    physEngine.config.brakeDecelAero = BASE_BRAKE.aero * mult;
    markDrivetrainChartsDirty();
  });

  // ---- Constant-power-over-battery-life compensation ----
  // The motor gets weaker as the pack drains and we cannot add power, so the only way to
  // make the car feel the same all session is to hold it back while the battery is still
  // strong. Deliberately OFF by default because it costs peak speed. Both inputs to this
  // are approximations: the battery percentage comes from an uncalibrated two-point
  // estimate of one status byte, and we have no proof our throttle byte maps linearly to
  // motor RPM — so treat this as "feels more even", not as a measured correction.
  let batteryCompEnabled = false;
  let batteryCompReference = 0.5;

  $('setting-battery-comp').addEventListener('change', (e) => { batteryCompEnabled = e.target.checked; });
  $('setting-battery-ref').addEventListener('input', (e) => {
    batteryCompReference = parseFloat(e.target.value);
    $('setting-battery-ref-val').textContent = Math.round(batteryCompReference * 100) + '%';
  });

  function batteryCompensationScale() {
    if (!batteryCompEnabled || dashBattery === null) return 1;
    const currentFraction = Math.max(0.05, batteryPercent(dashBattery) / 100);
    return Math.max(0.2, Math.min(1, batteryCompReference / currentFraction));
  }


  // Racing screen. Reads only state that already exists and is fed from updateDashboard,
  // i.e. the exact same source as the cockpit — the two cannot drift apart.
  let wakeLock = null;
  async function keepScreenAwake(on) {
    try {
      if (on && !wakeLock && navigator.wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } else if (!on && wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch (e) { /* unsupported or refused — the screen just dims as usual */ }
  }

  // A real GT3's tank, so "fuel" reads as litres rather than an abstract percentage.
  // fuel itself STAYS a 0..100 internal quantity everywhere else (bar widths, fuelLoad,
  // massFactor) — only user-facing text is converted, at the point of display.
  const FUEL_TANK_LITERS = 110;
  function fuelLiters(pct) { return Math.round(Math.max(0, pct) / 100 * FUEL_TANK_LITERS); }

  // Fullscreen for the racing screen. Three things can fail independently and all three
  // are handled rather than assumed: the Fullscreen API (older iOS), the Orientation Lock
  // API (iOS Safari and desktop always refuse), and the user leaving fullscreen with the
  // system gesture instead of our button.
  function raceIsPortrait() { return window.innerHeight > window.innerWidth; }

  function syncRaceRotation() {
    const fs = document.body.classList.contains('race-fs');
    document.body.classList.toggle('race-turn', fs && raceIsPortrait());
  }

  async function enterRaceFullscreen() {
    const el = document.documentElement;
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } catch (e) { /* refused: we still lay out as if fullscreen */ }
    try {
      if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
    } catch (e) { /* refused on iOS and desktop; the CSS rotation covers it */ }
    document.body.classList.add('race-fs');
    syncRaceRotation();
    $('race-fs').hidden = true; $('race-fs-exit').hidden = false;
  }

  async function exitRaceFullscreen() {
    try {
      if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitFullscreenElement) document.webkitExitFullscreen();
    } catch (e) { /* already out */ }
    try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); }
    catch (e) { /* never locked */ }
    document.body.classList.remove('race-fs', 'race-turn');
    $('race-fs').hidden = false; $('race-fs-exit').hidden = true;
  }

  $('race-fs').addEventListener('click', enterRaceFullscreen);
  $('race-fs-exit').addEventListener('click', exitRaceFullscreen);
  // The buttons now live inside #race-dash, which the rotation transform also moves, so
  // they stay in the top-right corner of the ROTATED view rather than of the screen.
  window.addEventListener('resize', syncRaceRotation);
  // Leaving fullscreen by swipe or Escape must put the buttons back too.
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && document.body.classList.contains('race-fs')) {
      exitRaceFullscreen();
    }
  });

  // One place decides what the gear reads, so the racing screen and the driving tab can
  // never disagree. No "M" suffix: the mode is visible in the options, and a letter glued
  // to the gear number was noise on a display meant to be read at a glance.
  function gearLabel(st) {
    if (st.driveMode === 'reverse') return 'R';
    if (st.driveMode === 'neutral') return 'N';
    return String(st.currentGear + 1);
  }


  function updateRaceScreen(st, out) {
    const gearEl = $('race-gear');
    if (!gearEl) return;
    // Zahl und Kennzeichnung getrennt, weil die Zahl mittig bleiben muss. textContent auf
    // den Knopf zu schreiben wuerde beide Kindknoten loeschen.
    const nEl = $('race-gear-n');
    if (nEl) nEl.textContent = gearLabel(st);
    else gearEl.textContent = gearLabel(st);
    const mEl = $('race-gear-m');
    if (mEl) mEl.textContent = physEngine.config.autoShift ? '' : 'M';
    $('race-rpm').textContent = Math.round(st.rpm);
    // Shown as the real-world equivalent, at the cars' actual 1:50 scale. This comment used
    // to argue the opposite - "the scale is NOT 1/50" - on the grounds that the acceleration
    // and braking models were calibrated against a GT3 topping out at 285 km/h, so the factor
    // had to be 285/4. That reasoning had it backwards: it derived the scale from a chosen
    // top speed instead of deriving the top speed from the known scale. The cars are 1:50,
    // the measured ground speed at full throttle is about 5.9 km/h, so the dash reads
    // 5.9 x 50 = 295 km/h flat out. See the derivation at REAL_SCALE.
    $('race-speed').textContent = Math.round(Math.abs(st.speedKmh) * REAL_SCALE);

    // Shift LEDs. Green, then red, then BLUE for the last two. The blue pair above red,
    // not below it, is what real GT3 wheels use for "shift now", and it makes the strip
    // readable without counting lamps.
    const frac = Math.max(0, Math.min(1, st.rpmFrac));
    const lamps = $('race-shift').children;
    const n = lamps.length;
    for (let i = 0; i < n; i++) {
      const lit = frac >= (i + 1) / n;
      let col = '#12161f';
      if (lit) {
        if (i >= n - 2) col = '#3d8bff';
        else if (i >= n - 5) col = '#ff3b3b';
        else col = '#2ee06a';
      }
      lamps[i].style.background = col;
      lamps[i].style.boxShadow = lit
        ? 'inset 0 0 0 1px rgba(255,255,255,.25), 0 0 6px ' + col
        : 'inset 0 0 0 1px #262e3d';
    }
    // On the limiter the whole strip flashes blue, which no steady pattern can be mistaken
    // for.
    if (st.onLimiter && Math.floor(Date.now() / 90) % 2 === 0) {
      for (let i = 0; i < n; i++) {
        lamps[i].style.background = '#3d8bff';
        lamps[i].style.boxShadow = '0 0 8px #3d8bff';
      }
    }

    // ABS is a real flag in the model, so it earns a cell. Traction control does not exist
    // in this drivetrain and therefore gets no cell, rather than a permanent zero.
    $('race-abs').classList.toggle('active', st.absActive);

    // Headlight tell-tale. Reads the real state rather than sniffing the lamp's CSS
    // colour: there are two different "off" colours in this file (#3a4a6b and #444), so a
    // colour comparison silently matched the wrong one and the indicator never went out.
    // raceLampHead is whatever resolveLights() settled on, so a flash, the damage
    // flicker and the empty-tank blink all show up here too.
    $('race-light').classList.toggle('on', !!raceLampHead);

    $('race-fuel').textContent = fuelLiters(fuel) + ' l';
    $('race-fuel-bar').style.width = Math.max(0, fuel) + '%';
    $('race-fuel-bar').style.background = fuel < 20 ? '#ffb02e' : '#2ee06a';
    // Condition, not damage: full green at the start, and every crash takes a piece out.
    // A bar that GROWS as things get worse reads backwards at a glance. Every other bar on
    // this dash empties when something runs out, and this one now behaves the same way.
    // Internally `damage` still counts upward from 0; only the presentation is inverted, so
    // no crash, repair or pit-stop arithmetic had to be touched.
    const health = Math.max(0, Math.min(100, 100 - damage));
    $('race-dmg').textContent = Math.round(health) + '%';
    $('race-dmg-bar').style.width = health + '%';
    $('race-dmg-bar').style.background = health <= 20 ? '#ff5252'
                                       : (health <= 55 ? '#ffb02e' : '#2ee06a');
    $('race-batt').textContent = dashBattery === null ? '\u2013' : batteryPercent(dashBattery) + '%';

    const live = !!(device && device.gatt && device.gatt.connected);
    // race-conn und race-track sassen in der entfernten Kachel "Strecke". Der
    // Verbindungszustand steht jetzt in der Fusszeile des Schirms; die Zeilen bleiben
    // stehen, damit die Kachel ohne Suche wieder eingesetzt werden kann.
    setTxt('race-conn', live ? 'verbunden' : 'getrennt');
    const cn = $('race-conn');
    if (cn) cn.className = 'gt3-lbl ' + (live ? 'gt3-ok' : 'gt3-bad');
    // Weather icon plus the fitted tyres. The tyres matter more than the weather here:
    // they are what tells you whether the pit stop is still outstanding.
    const wet = weather === 'rain';
    $('race-wx-sun').style.display = wet ? 'none' : '';
    $('race-wx-rain').style.display = wet ? '' : 'none';
    $('race-wx-rain').style.color = wet ? '#5aa9ff' : '';
    // Die Textbeschriftung an der Wetterkachel ist entfernt, sie zeigt nur noch das
    // Symbol. Welche Reifen montiert sind, steht in der Reifenkachel.
    setTxt('race-tyres', tyres === 'wet' ? 'Regen' : 'Slicks');
    // G plot. Red is the simulation, green the car's own raw motion bytes — the two are
    // scaled independently on purpose: the real numbers are far noisier and much larger
    // relative to their range, so a shared scale would push one of them off the dial.
    const R = 42;
    $('race-g-sim').setAttribute('cx', (50 + Math.max(-1, Math.min(1, st.gLat)) * R).toFixed(1));
    $('race-g-sim').setAttribute('cy', (50 + Math.max(-1, Math.min(1, -st.gLong)) * R).toFixed(1));
    const gx = Math.max(-1, Math.min(1, gyroRaw.x / gyroRaw.span));
    const gy = Math.max(-1, Math.min(1, gyroRaw.y / gyroRaw.span));
    $('race-g-real').setAttribute('cx', (50 + gx * R).toFixed(1));
    $('race-g-real').setAttribute('cy', (50 + gy * R).toFixed(1));

    // Tyre gauge. The ring runs blue (cold) through green (working range) to red (too hot),
    // because those are the three states a driver actually has to act on. Grey when the
    // model is switched off, so the dial never implies a simulation that is not running.
    const ring = $('race-tyre-ring');
    if (physEngine.config.tyreEffect === 0) {
      ring.setAttribute('stroke', '#2a3346');
      $('race-tyre-temp').textContent = 'aus';
      $('race-tyre-wear').textContent = '';
    } else {
      const cfgT = physEngine.config;
      const t = st.tyreTempC;
      const warm = Math.max(0, Math.min(1, (t - cfgT.tyreAmbientC)
                                           / (cfgT.tyreOptimalC - cfgT.tyreAmbientC)));
      let col;
      if (t > cfgT.tyreOptimalC) {
        const over = Math.min(1, (t - cfgT.tyreOptimalC)
                                 / (cfgT.tyreOverheatC - cfgT.tyreOptimalC));
        col = `rgb(${Math.round(70 + 185 * over)}, ${Math.round(209 - 130 * over)}, ${Math.round(127 - 100 * over)})`;
      } else {
        col = `rgb(${Math.round(60 + 10 * warm)}, ${Math.round(140 + 69 * warm)}, ${Math.round(230 - 103 * warm)})`;
      }
      ring.setAttribute('stroke', col);
      $('race-tyre-temp').textContent = Math.round(t) + '\u00b0';
      $('race-tyre-wear').textContent = 'Abnutzung ' + Math.round(st.tyreWear * 100) + '%';
    }

    $('race-trim-accel').textContent = Math.round(physEngine.config.accelerationFactor * 100) + '%';
    $('race-trim-steer').textContent = Math.round(physEngine.config.steerResponse * 100) + '%';
    setTxt('race-track', dashOnMarker ? 'MUSTER' : 'auf Strecke');
    const tk = $('race-track');
    if (tk) tk.className = 'gt3-val sm ' + (dashOnMarker ? 'gt3-warn' : 'gt3-ok');

    // Pit banner replaces the shift bar while the pit lane is active — impossible to miss,
    // which the old small field was not.
    // The banner has its own full-width row at the bottom now, so it no longer has to hide
    // the shift lights to be seen: losing the rev display on entering the pit lane was a
    // bad trade for a warning.
    const pit = $('gt3-pit');
    if (pitState === 'off') {
      pit.classList.remove('on');
    } else {
      pit.classList.add('on');
      $('race-pit-text').textContent = pitState === 'limited'
        ? 'PIT LIMITER ENGAGED \u00b7 '
          + Math.round(PIT_SPEED_FACTOR * physEngine.config.topSpeedKmh * REAL_SCALE) + ' KM/H'
        : 'PIT STOP \u00b7 ' + ((Date.now() - (pitServiceStart || Date.now())) / 1000).toFixed(1) + 's'
          + ' \u00b7 TANK +' + fuelLiters(pitFuelGained) + 'l'
          + ' \u00b7 REP +' + Math.round(pitDamageRepaired) + '%';
    }

    if (raceState === 'finished' && racePartialMs !== null) {
      // Nach dem Ende steht hier die abgebrochene Runde, mit Klammer als Zeichen dafuer,
      // dass sie nicht zaehlt.
      $('race-lap-now').textContent = '(' + formatLapTime(racePartialMs) + ')';
      return;
    }
    $('race-lap-now').textContent = raceLapStart !== null
      ? formatLapTime(Date.now() - raceLapStart)
      : (dashLapStart !== null ? formatLapTime(Date.now() - dashLapStart) : '\u2013');
    const laps = raceLapTimes.length ? raceLapTimes : dashLapTimes.map((ms, i) => ({ lap: i + 1, ms }));
    const best = laps.length ? Math.min(...laps.map(l => l.ms)) : null;
    $('race-lap-best').textContent = best === null ? '\u2013' : formatLapTime(best);
    // Mode and remaining time/laps belong on the dash: that is where they are read.
    const modeEl = $('race-clock');
    if (modeEl && raceState !== 'racing') {
      modeEl.textContent = raceState === 'finished' ? 'beendet' : RACE_MODES[raceMode].label;
    }
    $('race-lap-last').textContent = laps.length
      ? formatLapTime(laps[laps.length - 1].ms) : '\u2013';
    $('race-lap-count').textContent = laps.length;
    $('race-lap-list').innerHTML = laps.slice().reverse().slice(0, 10).map(l =>
      `<li><span>${l.lap}</span><span${l.ms === best ? ' class="gt3-ok"' : ''}>${formatLapTime(l.ms)}</span></li>`
    ).join('');
  }

  function updateDashboard(out) {
    const st = physEngine.state;
    setTxt('dash-gear', gearLabel(physEngine.state));
    setTxt('dash-speed', Math.abs(st.speedKmh).toFixed(1));   // signed while reversing
    setTxt('dash-rpm', Math.round(st.rpm));
    updateRaceScreen(st, out);
    setTxt('dash-abs', physEngine.state.absActive ? 'AKTIV' : '-');
    const lamp = resolveLights(out.lights.head, out.lights.brake);
    setSty('dash-head', 'background', lamp.head ? '#f5e642' : '#444');
    setSty('dash-brake', 'background', lamp.brake ? 'var(--bad)' : '#444');
    raceLampHead = lamp.head;
  }

  // Advances the simulation and publishes its shaped output into physOutSteer/
  // physOutThrottle for controlHeartbeat() to transmit. Driven by the heartbeat itself
  // (NOT requestAnimationFrame) on purpose: rAF is paused by the browser whenever the
  // page isn't being composited (hidden/minimised/background tab). With rAF, physics
  // would freeze while the heartbeat happily kept re-sending the last throttle value —
  // i.e. the car would keep driving at whatever speed it had when you looked away.
  // Timer-driven, physics keeps decelerating normally instead.
  function physicsStep() {
    if (!physicsEnabled) { physLastTime = null; return; }
    const now = performance.now();
    const dt = physLastTime ? Math.min(0.25, (now - physLastTime) / 1000) : CONTROL_SEND_INTERVAL_MS / 1000;
    physLastTime = now;
    // Derated, not raw. Braking is left alone: brakes do not care how much fuel is left,
    // and a damaged car that cannot slow down would be the opposite of a limp mode.
    const rawThrottle = fuelDamageDerate(Math.max(0, throttleY));
    const rawBrake = Math.max(0, -throttleY);
    const out = physEngine.update({ steering: steerX, throttle: rawThrottle, brake: rawBrake,
                                    headlights: headlightsOn }, dt);
    updateDashboard(out);
    physOutSteer = out.servoAngle;
    physOutThrottle = out.motorPWM;
  }

  // Hier stand die Lenkung ueber den Neigungssensor des Telefons. Sie ist entfernt: mit
  // einem Controller in der Hand wird sie nie benutzt, und ohne Controller ist ein Telefon,
  // das man kippt, kein Lenkrad - der Weg ueber den Schieber auf dem Schirm war in jedem
  // Versuch praeziser. SRC.TILT bleibt in der Quellenliste stehen, die Schiedsstelle in
  // 30-input.js kennt sie generisch und braucht keine Pflege.
  //
  // Nicht zu verwechseln mit gyroRaw in 70-race.js: das sind die rohen Bewegungsbytes des
  // AUTOS aus dem Meldekanal, und die speisen weiterhin den gruenen Punkt im G-Diagramm.

  // ---- Automated calibration test run ----
  // Sends a fixed, short test matrix directly (bypassing the physics engine) and
  // correlates the notify channel's bytes 1-3 (candidate yaw/lateral-accel telemetry,
  // see memory) against each known commanded steer/throttle window. Kept deliberately
  // brief/low-power on the forward-motion steps so the whole run fits a small area.
  const CALIB_MATRIX = [
    { label: 'Neutral (Baseline)', steer: 0, throttle: 0, ms: 1000 },
    { label: 'Lenkung 25% rechts (Stand)', steer: 0.25, throttle: 0, ms: 600 },
    { label: 'Lenkung 50% rechts (Stand)', steer: 0.5, throttle: 0, ms: 600 },
    { label: 'Lenkung 75% rechts (Stand)', steer: 0.75, throttle: 0, ms: 600 },
    { label: 'Lenkung 100% rechts (Stand)', steer: 1.0, throttle: 0, ms: 600 },
    { label: 'Neutral', steer: 0, throttle: 0, ms: 500 },
    { label: 'Lenkung 25% links (Stand)', steer: -0.25, throttle: 0, ms: 600 },
    { label: 'Lenkung 50% links (Stand)', steer: -0.5, throttle: 0, ms: 600 },
    { label: 'Lenkung 75% links (Stand)', steer: -0.75, throttle: 0, ms: 600 },
    { label: 'Lenkung 100% links (Stand)', steer: -1.0, throttle: 0, ms: 600 },
    { label: 'Neutral', steer: 0, throttle: 0, ms: 500 },
    { label: 'Mini-Schub vorwärts, geradeaus', steer: 0, throttle: 0.15, ms: 700 },
    { label: 'Neutral', steer: 0, throttle: 0, ms: 500 },
    { label: 'Mini-Schub vorwärts + 50% rechts', steer: 0.5, throttle: 0.15, ms: 700 },
    { label: 'Neutral', steer: 0, throttle: 0, ms: 500 },
    { label: 'Mini-Schub vorwärts + 50% links', steer: -0.5, throttle: 0.15, ms: 700 },
    { label: 'Neutral', steer: 0, throttle: 0, ms: 500 },
    { label: 'Sanfte Bremse (30%)', steer: 0, throttle: -0.3, ms: 500 },
    { label: 'Neutral', steer: 0, throttle: 0, ms: 600 },
    { label: 'Gas-Vergleich: 15% (Ratter-Test)', steer: 0, throttle: 0.15, ms: 1000 },
    { label: 'Neutral', steer: 0, throttle: 0, ms: 500 },
    { label: 'Gas-Vergleich: 30% (Ratter-Test)', steer: 0, throttle: 0.30, ms: 1000 },
    { label: 'Neutral', steer: 0, throttle: 0, ms: 500 },
    { label: 'Gas-Vergleich: 50% (Ratter-Test)', steer: 0, throttle: 0.50, ms: 1000 },
    { label: 'Neutral', steer: 0, throttle: 0, ms: 600 },
    { label: 'Drehung auf der Stelle (Vollausschlag rechts, wenig Gas)', steer: 1.0, throttle: 0.15, ms: 2000 },
    { label: 'Neutral (Ende)', steer: 0, throttle: 0, ms: 800 },
  ];

  let calibRunning = false;
  let calibNotifyLog = [];
  let calibStepLog = [];

  function calibNotifyListener(e) {
    calibNotifyLog.push({ t: Date.now(), bytes: notifyBytes(e.target.value) });
  }

  async function ensureCalibNotifySubscribed() {
    const entry = charByUuid.get(NUS_TX);
    if (!entry) throw new Error('NUS TX nicht gefunden (verbunden?)');
    if (!entry._calibSubscribed) {
      await entry.char.startNotifications();
      entry.char.addEventListener('characteristicvaluechanged', calibNotifyListener);
      entry._calibSubscribed = true;
    }
  }

  function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  async function runCalibrationStep(step) {
    const tStart = Date.now();
    const endAt = tStart + step.ms;
    while (Date.now() < endAt && calibRunning) {
      await sendControlValue(step.steer, step.throttle);
      await sleep(45);
    }
    calibStepLog.push({ ...step, tStart, tEnd: Date.now() });
  }

  async function runCalibration() {
    const rxEntry = charByUuid.get(NUS_RX);
    if (!rxEntry) { alert('Nicht verbunden / NUS RX nicht gefunden.'); return; }
    try { await ensureCalibNotifySubscribed(); } catch (err) { alert(err.message); return; }

    calibRunning = true;
    calibNotifyLog = [];
    calibStepLog = [];
    $('calib-start').disabled = true;
    $('calib-stop').disabled = false;
    $('calib-results').innerHTML = '';

    for (const step of CALIB_MATRIX) {
      if (!calibRunning) break;
      $('calib-status').textContent = `Läuft: ${step.label}...`;
      await runCalibrationStep(step);
    }
    await sendControlValue(0, 0);

    $('calib-status').textContent = calibRunning ? 'Fertig.' : 'Abgebrochen.';
    calibRunning = false;
    $('calib-start').disabled = false;
    $('calib-stop').disabled = true;
    renderCalibResults();
  }

  function s8(b) { return b >= 128 ? b - 256 : b; }
  function meanOf(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN; }

  function renderCalibResults() {
    const rows = calibStepLog.map(step => {
      const samples = calibNotifyLog.filter(n => n.t >= step.tStart && n.t < step.tEnd);
      const b1 = samples.map(s => s8(s.bytes[1]));
      const b2 = samples.map(s => s.bytes[2]);
      const b3 = samples.map(s => s8(s.bytes[3]));
      return `<tr>
        <td>${step.label}</td><td>${step.steer}</td><td>${step.throttle}</td>
        <td>${samples.length}</td>
        <td>${meanOf(b1).toFixed(2)}</td><td>${meanOf(b2).toFixed(2)}</td><td>${meanOf(b3).toFixed(2)}</td>
      </tr>`;
    }).join('');
    $('calib-results').innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:12px;font-family:monospace">
        <thead><tr>
          <th style="text-align:left">Schritt</th><th>Lenkung</th><th>Gas</th><th>n</th>
          <th>Byte1 Ø</th><th>Byte2 Ø</th><th>Byte3 Ø</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  $('calib-start').onclick = runCalibration;
  $('calib-stop').onclick = () => { calibRunning = false; sendControlValue(0, 0); };

  // ---- Autonomous tab: record & playback ----
  const MACRO_STORE_KEY = 'carrera-hybrid-macros';
  let recording = false, playing = false;
  let macro = [];          // [{t, steer, throttle}]
  let recordStartTime = 0;
  let playTimers = [];

  function loadMacroStore() {
    try { return JSON.parse(localStorage.getItem(MACRO_STORE_KEY) || '{}'); }
    catch { return {}; }
  }
  function saveMacroStore(store) {
    localStorage.setItem(MACRO_STORE_KEY, JSON.stringify(store));
  }
  function refreshMacroList() {
    const store = loadMacroStore();
    const sel = $('macro-list');
    sel.innerHTML = '<option value="">-- gespeicherte Fahrten --</option>';
    Object.keys(store).forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = `${name} (${store[name].length} Schritte)`;
      sel.appendChild(opt);
    });
  }
  refreshMacroList();

  function playLog(msg) { $('play-log').textContent = msg; }

  $('btn-record').onclick = () => {
    if (playing) return;
    recording = !recording;
    $('btn-record').textContent = recording ? 'Aufnahme stoppen' : 'Aufnahme starten';
    $('btn-record').classList.toggle('primary', !recording);
    if (recording) {
      macro = [];
      recordStartTime = Date.now();
      $('record-status').textContent = 'nimmt auf…';
    } else {
      $('record-status').textContent = `bereit (${macro.length} Schritte aufgezeichnet)`;
    }
    $('btn-play').disabled = macro.length === 0 || recording;
  };

  $('btn-play').onclick = () => {
    if (recording || playing || macro.length === 0) return;
    playing = true;
    $('btn-play').disabled = true;
    $('btn-stop-play').disabled = false;
    runPlayback();
  };

  function runPlayback() {
    playTimers.forEach(clearTimeout);
    playTimers = [];
    const startedAt = Date.now();
    macro.forEach((step, i) => {
      const timer = setTimeout(() => {
        applySteerInput(SRC.MACRO, step.steer);
        applyThrottleInput(SRC.MACRO, step.throttle);
        playLog(`Schritt ${i + 1}/${macro.length}  t=${step.t}ms  steer=${step.steer.toFixed(2)}  throttle=${step.throttle.toFixed(2)}`);
        if (i === macro.length - 1) {
          if ($('chk-loop').checked && playing) {
            runPlayback();
          } else {
            stopPlayback();
          }
        }
      }, step.t);
      playTimers.push(timer);
    });
  }

  function stopPlayback() {
    playTimers.forEach(clearTimeout);
    playTimers = [];
    playing = false; // must be cleared BEFORE releasing, or playbackLocked blocks it
    $('btn-play').disabled = macro.length === 0;
    $('btn-stop-play').disabled = true;
    releaseInput(SRC.MACRO);
    playLog(playLog.lastMsg = 'Wiedergabe beendet.');
  }

  $('btn-stop-play').onclick = stopPlayback;

  $('btn-save-macro').onclick = () => {
    const name = $('macro-name').value.trim();
    if (!name) { alert('Bitte einen Namen für die Aufnahme eingeben.'); return; }
    if (macro.length === 0) { alert('Keine Aufnahme vorhanden.'); return; }
    const store = loadMacroStore();
    store[name] = macro;
    saveMacroStore(store);
    refreshMacroList();
    log(`Aufnahme "${name}" gespeichert (${macro.length} Schritte).`, 'info');
  };

  $('btn-load-macro').onclick = () => {
    const name = $('macro-list').value;
    if (!name) return;
    const store = loadMacroStore();
    if (!store[name]) return;
    macro = store[name];
    $('macro-name').value = name;
    $('record-status').textContent = `geladen: "${name}" (${macro.length} Schritte)`;
    $('btn-play').disabled = macro.length === 0 || recording;
  };

  $('btn-delete-macro').onclick = () => {
    const name = $('macro-list').value;
    if (!name) return;
    const store = loadMacroStore();
    delete store[name];
    saveMacroStore(store);
    refreshMacroList();
    log(`Aufnahme "${name}" gelöscht.`, 'info');
  };

  $('btn-export-macro').onclick = () => {
    if (macro.length === 0) { alert('Keine Aufnahme vorhanden.'); return; }
    const name = $('macro-name').value.trim() || 'aufnahme';
    const blob = new Blob([JSON.stringify(macro, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  $('btn-import-macro').onclick = () => $('macro-import').click();
  $('macro-import').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error('Ungültiges Format');
      macro = parsed;
      $('macro-name').value = file.name.replace(/\.json$/i, '');
      $('record-status').textContent = `importiert: ${macro.length} Schritte`;
      $('btn-play').disabled = macro.length === 0 || recording;
      log(`Aufnahme aus ${file.name} importiert (${macro.length} Schritte).`, 'info');
    } catch (err) {
      alert('Import fehlgeschlagen: ' + err.message);
    }
    e.target.value = '';
  };

  // ---- Protocol Lab: probe NUS RX/TX for the real command format ----
  const NUS_RX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
  const NUS_TX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
  let labBytes = [128, 128];
  let labContinuousTimer = null;
  let labSweepTimer = null;

  function labRenderBytes() {
    const len = parseInt($('lab-len').value, 10);
    while (labBytes.length < len) labBytes.push(0);
    labBytes.length = len;
    const container = $('lab-bytes');
    container.innerHTML = '';
    labBytes.forEach((val, i) => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px';
      wrap.innerHTML = `
        <label class="small" style="margin:0">Byte ${i}</label>
        <input type="range" min="0" max="255" value="${val}" style="width:100px" data-idx="${i}">
        <span class="muted" style="font-family:monospace;font-size:12px" data-idx-readout="${i}">${val} (0x${val.toString(16).padStart(2, '0')})</span>
      `;
      container.appendChild(wrap);
    });
    container.querySelectorAll('input[type=range]').forEach(input => {
      input.addEventListener('input', () => {
        labBytes[parseInt(input.dataset.idx, 10)] = parseInt(input.value, 10);
        labUpdatePreview();
      });
    });
    const sweepSel = $('lab-sweep-idx');
    sweepSel.innerHTML = '';
    labBytes.forEach((_, i) => {
      const opt = document.createElement('option');
      opt.value = i; opt.textContent = `Byte ${i}`;
      sweepSel.appendChild(opt);
    });
    labUpdatePreview();
  }

  function labUpdatePreview() {
    $('lab-preview').textContent = labBytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
    const container = $('lab-bytes');
    labBytes.forEach((val, i) => {
      const input = container.querySelector(`input[data-idx="${i}"]`);
      const readout = container.querySelector(`[data-idx-readout="${i}"]`);
      if (input && document.activeElement !== input) input.value = val;
      if (readout) readout.textContent = `${val} (0x${val.toString(16).padStart(2, '0')})`;
    });
  }

  function labLog(msg) {
    const el = $('lab-tx-log');
    const line = document.createElement('div');
    line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
  }

  async function labSend() {
    const entry = charByUuid.get(NUS_RX);
    if (!entry) { labLog('Keine NUS-RX-Characteristic gefunden (verbunden?).'); return; }
    const bytes = new Uint8Array(labBytes);
    try {
      if (entry.char.properties.writeWithoutResponse) await entry.char.writeValueWithoutResponse(bytes);
      else await entry.char.writeValueWithResponse(bytes);
      labLog(`SEND ${bufToHex(bytes)}`);
    } catch (err) {
      labLog('Fehler: ' + err.message);
    }
  }

  $('lab-len').addEventListener('change', labRenderBytes);
  $('lab-send').onclick = labSend;

  // Real sniffed idle/neutral command packet (20 bytes), confirmed authentic — safe to replay verbatim
  // since replaying identical bytes reproduces the same valid checksum without knowing the algorithm.
  // Byte offset 6 = throttle/brake (0xDF=idle, >0xDF=throttle, <0xDF=brake). Steering offset unknown.
  const KNOWN_IDLE_PACKET = [0xbf, 0x0f, 0x00, 0x08, 0x28, 0x00, 0xdf, 0x00, 0x86, 0x00, 0x00, 0x00, 0x00, 0xff, 0x02, 0x00, 0x00, 0x00, 0x00, 0xc1];
  $('lab-load-idle').onclick = () => {
    $('lab-len').value = '20';
    labBytes = KNOWN_IDLE_PACKET.slice();
    labRenderBytes();
    labLog('Bekanntes Idle-Paket geladen (20 Byte, Byte 6 = Gas/Bremse @ 0xDF=Leerlauf).');
  };

  $('lab-continuous').addEventListener('change', (e) => {
    if (e.target.checked) {
      const ms = Math.max(20, parseInt($('lab-interval').value, 10) || 100);
      labContinuousTimer = setInterval(labSend, ms);
    } else {
      clearInterval(labContinuousTimer);
      labContinuousTimer = null;
    }
  });

  $('lab-sweep-start').onclick = () => {
    const idx = parseInt($('lab-sweep-idx').value, 10);
    const speed = Math.max(5, parseInt($('lab-sweep-speed').value, 10) || 30);
    let val = 0;
    $('lab-sweep-start').disabled = true;
    $('lab-sweep-stop').disabled = false;
    labLog(`Sweep gestartet auf Byte ${idx}...`);
    labSweepTimer = setInterval(() => {
      labBytes[idx] = val;
      labUpdatePreview();
      labSend();
      val++;
      if (val > 255) {
        clearInterval(labSweepTimer);
        labSweepTimer = null;
        $('lab-sweep-start').disabled = false;
        $('lab-sweep-stop').disabled = true;
        labLog('Sweep beendet.');
      }
    }, speed);
  };
  $('lab-sweep-stop').onclick = () => {
    clearInterval(labSweepTimer);
    labSweepTimer = null;
    $('lab-sweep-start').disabled = false;
    $('lab-sweep-stop').disabled = true;
    labLog('Sweep gestoppt.');
  };

  async function labSubscribeTx() {
    const entry = charByUuid.get(NUS_TX);
    if (!entry) { labLog('Keine NUS-TX-Characteristic gefunden (verbunden?).'); return; }
    try {
      await entry.char.startNotifications();
      entry.char.addEventListener('characteristicvaluechanged', (e) => {
        labLog(`TX: ${bufToHex(e.target.value.buffer)}  |  ascii: ${bufToAscii(e.target.value.buffer)}`);
      });
      labLog('TX abonniert.');
      $('lab-subscribe').disabled = true;
      $('lab-subscribe').textContent = 'TX abonniert';
    } catch (err) {
      labLog('Notify-Fehler: ' + err.message);
    }
  }
  $('lab-subscribe').onclick = labSubscribeTx;

  labRenderBytes();

