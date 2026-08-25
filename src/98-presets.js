  // ============================== VOREINSTELLUNGEN ==============================
  // presetControls() sucht NUR in #tab-options. Die Karte verspricht "nicht die
  // Rennlaenge, nicht das Wetter, nicht die Strecke", und dieses Versprechen hing einmal
  // daran, dass es ausserhalb der Optionen zufaellig keine .opt-row gab.
  // At the end of the IIFE for the same reason as the two blocks above: it reads the
  // controls at load time to fill the exchange field.

  // Only the sliders that decide how the car FEELS. Race length, weather, track and the
  // ghost settings are deliberately absent: those describe the race, not the car, and a
  // preset that silently changed the race length would be a trap rather than a convenience.
  const PRESETS = {
    arcade: {
      label: 'Arcade',
      v: { 'setting-grip': 1.0, 'setting-brakepower': 1.4, 'setting-autoshift': true,
           'setting-zero-to-top': 2.6, 'setting-coast-drag': 0.6, 'setting-fuelweight': 0,
           'setting-tyres': 0, 'phys-steerresp': 2.4, 'phys-trailbrake': 1.0,
           // crash-count ist ein INDEX in [1,2,3,4,5,10,20,50]: 4 = fuenf Crashs.
           'setting-fuel-drain': 0, 'setting-crash-count': 4,
           'setting-crash-damage': false,
           'setting-repair-time': 4 },
    },
    pro: {
      label: 'Pro',
      v: { 'setting-grip': 0.85, 'setting-brakepower': 1.0, 'setting-autoshift': false,
           'setting-zero-to-top': 3.2, 'setting-coast-drag': 1.0, 'setting-fuelweight': 0.5,
           'setting-tyres': 0.5, 'phys-steerresp': 1.8, 'phys-trailbrake': 1.15,
           'setting-fuel-drain': 1.5, 'setting-crash-count': 2,
           'setting-crash-damage': true,
           'setting-repair-time': 10 },
    },
    real: {
      label: 'Realismus',
      v: { 'setting-grip': 0.72, 'setting-brakepower': 0.85, 'setting-autoshift': false,
           'setting-zero-to-top': 3.6, 'setting-coast-drag': 1.25, 'setting-fuelweight': 1.0,
           'setting-tyres': 1.0, 'phys-steerresp': 1.3, 'phys-trailbrake': 1.28,
           'setting-fuel-drain': 3.0, 'setting-crash-count': 0,
           'setting-crash-damage': true,
           'setting-repair-time': 20 },
    },
  };

  // Every control in an option row, found by walking the DOM rather than from a list. A
  // hand-kept list would silently omit whatever gets added next, and the omission would only
  // show up as a preset string that quietly drops a setting.
  function presetControls() {
    // NUR im Optionen-Tab suchen, nicht im ganzen Dokument.
    //
    // Die Karte verspricht ausdruecklich: "nicht die Rennlaenge, nicht das Wetter, nicht die
    // Strecke, denn die gehoeren zum Rennen und nicht zum Auto." Dieses Versprechen hing
    // vorher daran, dass es ausserhalb der Optionen zufaellig keine .opt-row gab. Sobald die
    // Renneinstellungen dieselbe Zeilenform bekamen, zog eine Voreinstellung Rennlaenge,
    // Wetter und Pflichtstopps mit - messbar daran, dass der Ausgabetext von 861 auf 1015
    // Zeichen wuchs. Jetzt steht das Versprechen im Selektor und nicht im Zufall.
    return [...document.querySelectorAll('#tab-options .opt-row input[id], '
                                         + '#tab-options .opt-row select[id]')];
  }

  function presetRead() {
    const out = {};
    for (const el of presetControls()) {
      out[el.id] = el.type === 'checkbox' ? el.checked
                 : el.type === 'range' ? +el.value : el.value;
    }
    return out;
  }

  // Setting .value does not run the app's handlers, so both events are dispatched: 'input'
  // for the live readouts and 'change' for the ones that only commit on release. Sending
  // both to everything is harmless and beats guessing which control listens for which.
  function presetSet(id, val) {
    const el = document.getElementById(id);
    if (!el) return false;
    if (el.type === 'checkbox') {
      if (el.checked === !!val) return true;
      el.checked = !!val;
    } else {
      if (String(el.value) === String(val)) return true;
      el.value = val;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function presetSay(t) { $('preset-status').textContent = t; }

  function applyPreset(key) {
    const p = PRESETS[key];
    if (!p) return;
    let n = 0;
    const missing = [];
    for (const [id, val] of Object.entries(p.v)) {
      if (presetSet(id, val)) n++; else missing.push(id);
    }
    presetSay(p.label + ': ' + n + ' Regler gesetzt'
              + (missing.length ? ', nicht gefunden: ' + missing.join(', ') : ''));
    $('preset-json').value = JSON.stringify(presetRead());
  }

  $('preset-arcade').addEventListener('click', () => applyPreset('arcade'));
  $('preset-pro').addEventListener('click', () => applyPreset('pro'));
  $('preset-real').addEventListener('click', () => applyPreset('real'));

  $('preset-export').addEventListener('click', () => {
    $('preset-json').value = JSON.stringify(presetRead());
    presetSay(presetControls().length + ' Regler hineingeschrieben, jetzt kopieren.');
  });

  $('preset-import').addEventListener('click', () => {
    const raw = $('preset-json').value.trim();
    if (!raw) { presetSay('Da steht nichts.'); return; }
    let cfg;
    try { cfg = JSON.parse(raw); } catch (e) { presetSay('Das ist kein JSON.'); return; }
    if (!cfg || typeof cfg !== 'object') { presetSay('Das ist keine Abstimmung.'); return; }
    // Checked against the controls, not trusted: this arrives by copy and paste, and a value
    // outside a slider's range sets the slider to its limit without saying so - which reads
    // as "it worked" when it did not.
    const bad = [], unknown = [];
    for (const [id, val] of Object.entries(cfg)) {
      const el = document.getElementById(id);
      if (!el) { unknown.push(id); continue; }
      if (el.type === 'checkbox') continue;
      if (el.tagName === 'SELECT') {
        if (![].some.call(el.options, o => o.value === val)) bad.push(id + '=' + val);
      } else {
        const v = +val;
        if (!isFinite(v) || v < +el.min || v > +el.max) bad.push(id + '=' + val);
      }
    }
    if (bad.length) { presetSay('Unbrauchbare Werte: ' + bad.join(', ')); return; }
    let n = 0;
    for (const [id, val] of Object.entries(cfg)) if (presetSet(id, val)) n++;
    presetSay(n + ' Regler gesetzt'
              + (unknown.length ? ', ' + unknown.length + ' unbekannt \u00fcbergangen' : ''));
  });

  $('preset-json').value = JSON.stringify(presetRead());

})();
