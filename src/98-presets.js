  // ============================== VOREINSTELLUNGEN ==============================
  // presetControls() sucht NUR in #tab-options. Die Karte verspricht "nicht die
  // Rennlaenge, nicht das Wetter, nicht die Strecke", und dieses Versprechen hing einmal
  // daran, dass es ausserhalb der Optionen zufaellig keine .opt-row gab.
  // At the end of the IIFE for the same reason as the two blocks above: it reads the
  // controls at load time to fill the exchange field.

  // Only the sliders that decide how the car FEELS. Race length, weather, track and the
  // ghost settings are deliberately absent: those describe the race, not the car, and a
  // preset that silently changed the race length would be a trap rather than a convenience.
  // Jede Voreinstellung traegt ihren eigenen Erklaertext, und der Text steht HIER und
  // nicht im Markup: er beschreibt die Werte darunter, und zwei Orte fuer eine Aussage
  // laufen auseinander, sobald jemand einen Wert nachzieht.
  //
  // Die drei Kernwerte in jedem Text sind mit Absicht immer dieselben - Schaltung,
  // Beschleunigung, Reifenverschleiß - damit man die fuenf nebeneinander lesen kann.
  const PRESETS = {
    arcade: {
      label: 'Arcade',
      kurz: 'Der ursprüngliche Sim-Modus',
      text: 'Automatik, 2,6 s auf 100, voller Grip, kein Reifenverschleiß und kein '
          + 'Tankgewicht. Verzeihende Bremse, weiche Lenkung. Zum Fahren ohne Nachdenken.',
      v: { 'setting-grip': 1.0, 'setting-brakepower': 1.4, 'setting-autoshift': true,
           'setting-zero-to-top': 2.6, 'setting-coast-drag': 0.6, 'setting-fuelweight': 0,
           'setting-tyres': 0, 'phys-steerresp': 2.4, 'setting-brakebias': 58,
           // crash-count ist ein INDEX in [1,2,3,4,5,10,20,50]: 4 = fuenf Crashs.
           'setting-fuel-drain': 0, 'setting-crash-count': 4,
           'setting-crash-damage': false,
           'setting-repair-time': 4 },
    },
    pro: {
      label: 'Pro',
      kurz: 'Halb so weit zwischen Arcade und GT3',
      text: 'Von Hand schalten, 3,2 s auf 100, Reifen und Tankgewicht wirken zur Hälfte. '
          + 'Schärfere Lenkung als Arcade, aber noch Reserve in der Bremse.',
      v: { 'setting-grip': 0.85, 'setting-brakepower': 1.0, 'setting-autoshift': false,
           'setting-zero-to-top': 3.2, 'setting-coast-drag': 1.0, 'setting-fuelweight': 0.5,
           'setting-tyres': 0.5, 'phys-steerresp': 1.8, 'setting-brakebias': 60,
           'setting-fuel-drain': 1.5, 'setting-crash-count': 2,
           'setting-crash-damage': true,
           'setting-repair-time': 10 },
    },
    gt3: {
      label: 'GT3',
      kurz: 'An einem echten GT3 kalibriert',
      text: 'Von Hand schalten, 3,2 s auf 100 (die gemessene Reihe, gegen die die Physik '
          + 'gefittet ist), voller Reifenverschleiß und volles Tankgewicht. Wenig Grip, '
          + 'schwache Bremse, langes Ausrollen. Ein Fahrfehler kostet hier Zeit.',
      v: { 'setting-grip': 0.72, 'setting-brakepower': 0.85, 'setting-autoshift': false,
           'setting-zero-to-top': 3.2, 'setting-coast-drag': 1.25, 'setting-fuelweight': 1.0,
           'setting-tyres': 2.0, 'phys-steerresp': 1.3, 'setting-brakebias': 62,
           'setting-fuel-drain': 3.0, 'setting-crash-count': 5,
           'setting-crash-damage': true,
           'setting-repair-time': 20 },
    },
    gt4: {
      label: 'GT4',
      kurz: 'Weniger Leistung, mehr Reserve',
      text: 'Von Hand schalten, 4,4 s auf 100, Reifenverschleiß und Tankgewicht wie GT3, '
          + 'aber mehr Grip und eine gutmütigere Bremse. Die Klasse darunter fährt sich '
          + 'nicht leichter, weil sie mehr verzeiht, sondern weil sie langsamer ist.',
      v: { 'setting-grip': 0.82, 'setting-brakepower': 1.0, 'setting-autoshift': false,
           'setting-zero-to-top': 4.4, 'setting-coast-drag': 1.15, 'setting-fuelweight': 1.0,
           'setting-tyres': 1.5, 'phys-steerresp': 1.5, 'setting-brakebias': 61,
           'setting-fuel-drain': 2.2, 'setting-crash-count': 5,
           'setting-crash-damage': true,
           'setting-repair-time': 16 },
    },
    f1: {
      label: 'F1',
      kurz: 'Das schärfste, was das Modell hergibt',
      text: 'Von Hand schalten, 2,4 s auf 100, stärkster Reifenverschleiß, volles '
          + 'Tankgewicht, empfindlichste Lenkung und die kürzeste Bremse. Das Ausrollen '
          + 'ist kurz, weil der Luftwiderstand hier die größte Einzelkraft ist.',
      v: { 'setting-grip': 0.95, 'setting-brakepower': 1.45, 'setting-autoshift': false,
           'setting-zero-to-top': 2.4, 'setting-coast-drag': 1.6, 'setting-fuelweight': 1.0,
           'setting-tyres': 2.0, 'phys-steerresp': 1.05, 'setting-brakebias': 66,
           'setting-fuel-drain': 4.5, 'setting-crash-count': 3,
           'setting-crash-damage': true,
           'setting-repair-time': 24 },
    },
  };
  // Bis v0.4 hiess GT3 "real". Aeltere exportierte Abstimmungen und der Knopf im
  // Garagenschirm duerfen den alten Namen weiter benutzen.
  const PRESET_ALIAS = { real: 'gt3', realismus: 'gt3' };

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
    const p = PRESETS[key] || PRESETS[PRESET_ALIAS[key]];
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

  // Die Knoepfe werden aus PRESETS GEBAUT statt einzeln gebunden. Vorher standen drei
  // Zeilen im Markup und drei im Skript, und ein vierter Eintrag haette an beiden Stellen
  // nachgetragen werden muessen - genau die Art Doppelpflege, die man beim fuenften
  // vergisst.
  function renderPresetButtons(host, klein) {
    if (!host) return;
    host.innerHTML = '';
    for (const [key, p] of Object.entries(PRESETS)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.id = klein ? '' : 'preset-' + key;
      b.textContent = p.label;
      b.title = p.kurz + ' \u2013 ' + p.text;
      b.addEventListener('click', () => applyPreset(key));
      host.appendChild(b);
    }
  }
  renderPresetButtons($('preset-buttons'), false);

  // Fuer den Fahrmodus-Knopf im Cockpit. Ueber das Fenster, weil 50-drive.js VOR dieser
  // Datei gebaut wird und applyPreset dort zur Deklarationszeit noch nicht existiert - zur
  // Laufzeit schon. Genau dieser Unterschied hat in dieser Datei fuenf Ladeabbrueche
  // gekostet, deshalb steht er als Kommentar an beiden Enden.
  window.__applyPreset = applyPreset;
  window.__presetKeys = () => Object.keys(PRESETS);
  window.__presetLabel = (k) => (PRESETS[k] || {}).label || k;

  // Die Erklaertexte, aus denselben Objekten. Sie stehen unter den Knoepfen statt in einem
  // Tooltip, weil die Wahl zwischen fuenf Abstimmungen genau der Moment ist, in dem man
  // wissen will, was sie unterscheidet - und ein Tooltip auf dem Telefon nicht erscheint.
  (function presetLegende() {
    const host = $('preset-legend');
    if (!host) return;
    host.innerHTML = Object.values(PRESETS).map(p =>
      '<div class="preset-leg"><b>' + p.label + '</b> <span class="muted">' + p.kurz
      + '</span><small>' + p.text + '</small></div>').join('');
  })();

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
      // phys-trailbrake gab es bis v0.3. Es wird bewusst NICHT auf setting-brakebias
      // umgerechnet: ein Bonus auf die Lenkgrenze und ein Anteil der Bremskraft sind
      // verschiedene Groessen, und eine erfundene Umrechnung waere schlimmer als ein
      // ehrliches "uebergangen".
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

  // ---- Eigene Abstimmungen auf diesem Geraet ------------------------------------------
  // Strecken und Motoren haben ihre eigene Ablage schon (carrera-hybrid-tracks,
  // chc.motorwerkstatt.v1); die Abstimmung war das einzige, was nur ueber den Textkasten
  // ging - also kopieren, irgendwo hinlegen, wiederfinden.
  const PRESET_STORE = 'chc.presets.v1';

  function presetStoreRead() {
    try { return JSON.parse(localStorage.getItem(PRESET_STORE) || '{}') || {}; }
    catch { return {}; }
  }
  function presetStoreWrite(o) {
    try { localStorage.setItem(PRESET_STORE, JSON.stringify(o)); }
    catch (e) { presetSay('Konnte nicht ablegen: ' + e.message); }
  }
  function presetStoreList() {
    const sel = $('preset-store-list');
    if (!sel) return;
    const namen = Object.keys(presetStoreRead()).sort();
    sel.innerHTML = '<option value="">\u2013 abgelegt \u2013</option>'
      + namen.map(n => '<option>' + n.replace(/</g, '&lt;') + '</option>').join('');
  }

  if ($('preset-store-save')) {
    $('preset-store-save').addEventListener('click', () => {
      const name = $('preset-store-name').value.trim();
      if (!name) { presetSay('Erst einen Namen eingeben.'); return; }
      const o = presetStoreRead();
      const neu = !(name in o);
      o[name] = presetRead();
      presetStoreWrite(o);
      presetStoreList();
      $('preset-store-list').value = name;
      presetSay('"' + name + '" ' + (neu ? 'abgelegt' : 'überschrieben')
                + ', ' + Object.keys(o[name]).length + ' Regler.');
    });

    $('preset-store-load').addEventListener('click', () => {
      const name = $('preset-store-list').value;
      if (!name) { presetSay('Nichts ausgewählt.'); return; }
      const cfg = presetStoreRead()[name];
      if (!cfg) { presetSay('"' + name + '" ist nicht mehr da.'); return; }
      // Ueber den Textkasten und den vorhandenen Uebernehmen-Knopf: dessen Pruefung faengt
      // Werte ab, die es in dieser Fassung nicht mehr gibt oder die ausserhalb eines
      // Reglerbereichs liegen. Ein Speicherstand aus einer aelteren Fassung ist genau der
      // Fall, fuer den die Pruefung gebaut wurde - sie hier zu umgehen waere absurd.
      $('preset-json').value = JSON.stringify(cfg);
      $('preset-import').click();
      $('preset-store-name').value = name;
    });

    $('preset-store-del').addEventListener('click', () => {
      const name = $('preset-store-list').value;
      if (!name) { presetSay('Nichts ausgewählt.'); return; }
      const o = presetStoreRead();
      delete o[name];
      presetStoreWrite(o);
      presetStoreList();
      presetSay('"' + name + '" gelöscht.');
    });

    presetStoreList();
  }

  // ---- Die Knopfleiste in der Garage --------------------------------------------------
  // Sie ruft applyPreset(), also DIESELBE Funktion wie in den Optionen. presetSet() feuert
  // 'input' und 'change' mit bubbles, damit ziehen die Regler drueben von selbst nach -
  // es gibt keinen zweiten Zustand, der auseinanderlaufen koennte.
  renderPresetButtons($('gar-preset-buttons'), true);

  // Sichtbar nur, wenn ein Auto gesteuert wird. renderGarage() ruft das mit; ausserdem
  // einmal beim Laden, damit die Leiste nicht sichtbar startet.
  function updateGaragePresetRow() {
    const host = $('gar-preset');
    if (!host) return;
    const fahrer = typeof playerCar !== 'undefined' && playerCar
                   && garage.some(c => c === playerCar && c.role === 'player');
    host.style.display = fahrer ? '' : 'none';
  }
  window.__updateGaragePresetRow = updateGaragePresetRow;
  updateGaragePresetRow();

})();
