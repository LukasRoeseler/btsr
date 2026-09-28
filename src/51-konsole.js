
  // ============================ KONSOLE: MENUE IM ACC-STIL (WIP) ======================
  //
  // BESTELLT: "menüführung soll stark wie assetto corsa competizione aussehen. Alles folgende
  // mit PS5 tastenlayout: kacheln, dpad richtungen zum wählen, x bestätigen, kreis zurück,
  // schultertasten zum tab wechseln." Titelbildschirm, Hauptmenue (Fahren, Mehrspieler,
  // Optionen; klein Info, Patchnotes, Entwickler), und ein Fahren-Schirm mit drei Spalten
  // Auto / Rennoptionen / Strecke und darunter "Rennen starten". Vorher als Mock-up gebaut
  // (mockup/menue.html) und vom Nutzer abgenommen, mit einer Aenderung: "Der Optionen-Tab
  // schickt mich direkt in ein weiteres Menü. Ich will dort erst die Teilmenüs zum
  // Draufklicken" - die Optionen oeffnen deshalb ihre Kachelseite, nicht die erste Liste.
  //
  // DIE MECHANIK DARUNTER BLEIBT: showTab() und showSubpage() (10-ble-explorer.js), die
  // Zeilenliste von menuNav (50b-menu-nav.js) und jede Element-id. Diese Schicht legt
  // Kopfzeile, Pfad, Reiterleiste (L1/R1), Rueckweg (Kreis) mit Stapel, Beschreibung und
  // Fussleiste darueber und baut die neuen Schirme (#tab-home als Titel, #tab-fahren) sowie
  // das Cockpit-Menue (#k-pause, Options 1 s halten) und den Frage-Dialog (#k-frage).
  //
  // KEIN HAUPTMENUE MEHR. BESTELLT: "Tabs nach ganz oben und 'Hauptmenü' Zurückpfeil wegtun,
  // zur Landing page muss ich nicht zurück, dafür kann ich die App gerne neu starten; dann
  // wie vorher: Oben links nur logo und rechts daneben alle tabs". Der Titel fuehrt direkt
  // nach FAHREN; die Ebene 1 ist die Wurzel, Kreis tut dort nichts.
  //
  // BEIM LADEN NICHTS AUSFUEHREN, was spaetere Dateien braucht: garage, currentTrackTiles,
  // raceState stehen als const/let weiter unten und liegen hier noch in der temporalen
  // Todeszone - ein Zugriff wuerfe und naehme die ganze IIFE mit. Deshalb nur Funktionen und
  // Ereignisse; gestartet wird per setTimeout(konsoleStart, 0) am Ende dieser Datei.

  const K_EBENE1 = ['fahren', 'mp', 'options', 'info', 'misc'];
  const K_NAME = {
    home: 'Titel', fahren: 'Fahren', garage: 'Garage', race: 'Cockpit',
    options: 'Optionen', control: 'Renneinstellungen', track: 'Strecke', mp: 'Mehrspieler',
    info: 'Info', misc: 'Entwickler', doc: 'Doku', school: 'Programmierschule',
    dev: 'BLE-Werkbank', selftest: 'Selbsttest', probe: 'Code-Sonde', numtrain: 'Zahlensysteme',
    record: 'Aufnahme-Modus',
  };
  // Zu welchem Reiter der Ebene 1 eine tiefe Seite gehoert: der Reiter bleibt hervorgehoben,
  // und Kreis fuehrt dorthin, wenn der Stapel leer ist.
  const K_ELTERN = {
    garage: 'fahren', control: 'fahren', track: 'fahren',
    doc: 'misc', school: 'misc', dev: 'misc', selftest: 'misc', probe: 'misc',
    numtrain: 'misc', record: 'misc',
  };
  const K_BILD = {
    home: 'titel', fahren: 'fahren', garage: 'garage', control: 'rennen',
    mp: 'mehrspieler', options: 'optionen', info: 'garage', misc: 'mehrspieler',
  };

  let kStapel = [];
  let kZurueckLaeuft = false;
  let kPauseOffen = false;
  let kFrageOffen = false;
  let kLetzterTab = 'home';

  function kAktiverTab() {
    const t = document.querySelector('.tabpage.active');
    return t ? t.id.replace(/^tab-/, '') : '';
  }
  // MENUE statt FAHREN: ueberall ausser im Cockpit, und im Cockpit, solange dessen Menue
  // offen ist. Daran haengt, ob Kreuz/Kreis/Quadrat/L1/R1/Options Menue- oder Fahrtasten sind.
  function konsoleMenue() { return kAktiverTab() !== 'race' || kPauseOffen || kFrageOffen; }
  function konsolePauseOffen() { return kPauseOffen; }
  function konsoleFrageOffen() { return kFrageOffen; }
  function konsoleDev() {
    const cb = $('setting-dev');
    return !!(cb && cb.checked) || /[?&]dev\b/.test(location.search);
  }

  // ---- Wechsel verfolgen: aus dem .tab-btn-Klick gerufen (10-ble-explorer.js) --------
  function konsoleNachTab(neu, alt) {
    // Die Ebene 1 ist die Wurzel: wer dort ankommt, hat keinen Rueckweg mehr (Kreis tut
    // dort nichts), also auch keinen Stapel. Der Titel kommt nie auf den Stapel.
    if (K_EBENE1.includes(neu)) kStapel = [];
    else if (!kZurueckLaeuft && alt && alt !== neu && alt !== 'home') {
      kStapel.push(alt);
      if (kStapel.length > 40) kStapel.shift();
    }
    kLetzterTab = neu;
    if (neu !== 'race' && kPauseOffen) konsolePauseZu();
    // Nach dem Umschalten zeichnen, nicht davor: der neue Tab ist erst danach .active.
    setTimeout(() => {
      konsoleZeichnen();
      // Auf dem Fahren-Schirm ist die Auswahl von Anfang an sichtbar: AUTO ohne Auto und
      // RENNEN STARTEN mit Auto.
      if (neu === 'fahren') {
        menuNavEnsureContext();
        if (!menuNavGezeigt) konsoleFokusAuf(playerCar ? 'fa-start' : 'fa-auto');
      }
    }, 0);
  }
  function konsoleNachSubpage(key) {
    // Mehrspieler: Beitreten, Status und Rangliste gehoeren zu beiden Wegen (PC und App) und
    // wandern in die Unterseite, die gerade aufgeht - sofort, damit die Zeilenliste von
    // menuNav sie schon beim ersten Druck sieht.
    const mpg = $('mp-gemeinsam');
    const platz = key && document.querySelector('#sub-' + key + ' .mp-platz');
    if (mpg && platz && mpg.parentNode !== platz) platz.appendChild(mpg);
    setTimeout(konsoleZeichnen, 0);
  }

  function konsoleZeige(tab, sub) {
    showTab(tab);
    if (sub) showSubpage(sub);
    window.scrollTo(0, 0);
    document.body.scrollTop = 0;
  }

  // KREIS / Esc: eine Ebene zurueck. Erst was offen ist (Info-Fenster, Cockpit-Menue,
  // Unterseite), dann der Stapel, zuletzt die Eltern-Ebene.
  function konsoleZurueck() {
    if (typeof optInfoOffen === 'function' && optInfoOffen()) { optInfoSchliessen(); return true; }
    if (kFrageOffen) { konsoleFrageZu(); return true; }
    const lb = $('lb-wrap');
    if (lb && lb.classList.contains('on') && $('lb-close')) { $('lb-close').click(); return true; }
    if (kPauseOffen) { konsolePauseZu(); return true; }
    const tab = kAktiverTab();
    if (document.querySelector('.tabpage.active .subpage.on')) { showSubpage(''); return true; }
    if (tab === 'home' || K_EBENE1.includes(tab)) return false;
    let ziel = null;
    while (kStapel.length && !ziel) {
      const z = kStapel.pop();
      if (z !== tab && z !== 'home') ziel = z;
    }
    if (!ziel) ziel = K_ELTERN[tab] || 'fahren';
    kZurueckLaeuft = true;
    try { showTab(ziel); } finally { kZurueckLaeuft = false; }
    menuNavTonAbwaehlen();
    return true;
  }

  // ---- Reiterleisten (L1/R1) --------------------------------------------------------
  //
  // OBEN, neben dem Logo, immer die Ebene 1. Darunter, nur wenn es sie gibt, eine flache
  // zweite Leiste mit der inneren Ebene: in einer offenen Unterseite ihre Geschwister (die
  // Optionen-Kategorien, die Mehrspieler-Wege), in der BLE-Werkbank ihre Unterreiter, in den
  // Renneinstellungen die drei Karten. Die Schultertasten wirken auf die innerste.
  function konsoleReiter() { return konsoleReiterInnen() || konsoleReiterEbene1(); }
  function konsoleReiterInnen() {
    const tab = kAktiverTab();
    const tp = document.querySelector('.tabpage.active');
    if (!tp || tab === 'home' || tab === 'race') return null;
    const offen = tp.querySelector('.subpage.on');
    if (offen) {
      const kacheln = [...tp.querySelectorAll('.subpage-home .misc-tile.subpage-open')]
        .filter((k) => !k.hidden);
      if (kacheln.length >= 2) {
        return kacheln.map((k) => ({
          text: (k.querySelector('b') || k).textContent.trim(),
          an: k.dataset.sub === offen.id.replace(/^sub-/, ''),
          wahl: () => { showSubpage(k.dataset.sub); },
        }));
      }
      return null;
    }
    if (tab === 'dev') {
      return [...document.querySelectorAll('#tab-dev .subtab-btn')].map((b) => ({
        text: b.textContent.trim(), an: b.classList.contains('active'), wahl: () => b.click(),
      }));
    }
    if (tab === 'control') {
      const karten = [['race-card', 'Einstellungen'], ['race-results', 'Ergebnisse'], ['sess-card', 'Sitzungen']]
        .filter(([id]) => $(id));
      return karten.map(([id, text], i) => ({
        text: t(text), an: i === (konsoleReiter.renn || 0),
        wahl: () => {
          konsoleReiter.renn = i;
          const el = $(id);
          if (el && !el.hidden) el.scrollIntoView({ block: 'start' });
          konsoleZeichnen();
        },
      }));
    }
    return null;
  }
  // Die Ebene 1 ist die Wurzel: ein Wechsel dort leert den Stapel (konsoleNachTab). Auf einer
  // tiefen Seite (Garage, Strecke, Doku, ...) bleibt ihr Reiter hervorgehoben. Ein Klick auf
  // den schon gewaehlten Reiter schliesst eine offene Unterseite - fuer Maus und Touch der
  // Weg zurueck zu den Kacheln, jetzt wo der Zurueckpfeil oben fehlt.
  function konsoleReiterEbene1() {
    const tab = kAktiverTab();
    if (!tab || tab === 'home' || tab === 'race') return null;
    let wurzel = tab;
    while (K_ELTERN[wurzel]) wurzel = K_ELTERN[wurzel];
    return K_EBENE1.filter((x) => x !== 'misc' || konsoleDev()).map((x) => ({
      text: t(K_NAME[x]), an: x === wurzel,
      wahl: () => {
        if (x === tab) {
          if (document.querySelector('.tabpage.active .subpage.on')) showSubpage('');
          return;
        }
        konsoleZeige(x);
      },
    }));
  }
  function konsoleReiterSchritt(d) {
    const r = konsoleReiter();
    if (!r || !r.length) return false;
    let i = r.findIndex((x) => x.an);
    if (i < 0) i = d > 0 ? -1 : 0;
    r[((i + d) % r.length + r.length) % r.length].wahl();
    menuNavTonBewegen();
    return true;
  }

  // ---- Quadrat: schneller Wechsel auf Kacheln mit data-quad --------------------------
  function konsoleQuadrat() {
    const zeile = menuNavRows()[menuNavIndex];
    const el = zeile && zeile.el;
    const q = el && el.dataset ? el.dataset.quad : null;
    if (!q) return false;
    if (q === 'renntyp') {
      const s = $('race-mode');
      s.selectedIndex = (s.selectedIndex + 1) % s.options.length;
      s.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (q === 'bahn') {
      const cb = $('setting-ontrack');
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (q === 'profil') {
      if ($('race-act-mode')) $('race-act-mode').click();
    } else if (q === 'haerte') {
      const r = $('ghost-hardness');
      if (r) {
        const min = +r.min || 0, max = +r.max || 1;
        const stufe = (max - min) / 4;
        let v = +r.value + stufe;
        if (v > max + 1e-9) v = min;
        r.value = String(Math.round(v * 1000) / 1000);
        r.dispatchEvent(new Event('input', { bubbles: true }));
        r.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    menuNavTonVerstellen();
    konsoleFahrenZeichnen();
    return true;
  }

  // ---- Titel: jede Taste fuehrt nach FAHREN ------------------------------------------
  // BESTELLT: "Standardmäßig komme ich danach in den Tab, der 'FAHREN' heißt."
  function konsoleTitelWeiter() {
    if (kAktiverTab() !== 'home') return false;
    kStapel = [];
    konsoleZeige('fahren');
    return true;
  }

  // ---- Fahren: Start und Auto --------------------------------------------------------
  async function konsoleAuto() {
    if (!playerCar && !garage.some((c) => c.device)) {
      const lage = await garageConnect({ stumm: true });
      konsoleFahrenZeichnen();
      if (lage) {
        konsoleFrage(t('Bluetooth nicht bereit'), t(bluetoothLageText(lage)),
          [[t('Nochmal verbinden'), () => konsoleAuto()], [t('Schließen'), null]]);
        return;
      }
      // Nach dem Verbinden auf RENNEN STARTEN, wie bestellt: wenige Klicks bis zum Fahren.
      if (playerCar) konsoleFokusAuf('fa-start');
      return;
    }
    konsoleZeige('garage');
  }
  // VERBINDEN: immer die Bluetooth-Auswahl, auch wenn schon Autos da sind (das naechste wird
  // Ghost). Eine nicht bereite Bluetooth-Lage kommt in denselben Dialog wie bei AUTO.
  async function konsoleVerbinden() {
    const vorher = kAutos().length;
    const lage = await garageConnect({ stumm: true });
    konsoleFahrenZeichnen();
    if (lage) {
      konsoleFrage(t('Bluetooth nicht bereit'), t(bluetoothLageText(lage)),
        [[t('Nochmal verbinden'), () => konsoleVerbinden()], [t('Schließen'), null]]);
      return;
    }
    if (kAutos().length > vorher) konsoleFokusAuf('fa-start');
  }
  // RENNEN STARTEN: fehlt das Auto, erst die Bluetooth-Auswahl, dann ins Cockpit und die
  // Startampel. Freies Training startet genauso (die Ampel gibt den Beginn der Sitzung).
  //
  // TROTZDEM STARTEN. BESTELLT: "erlaube mir zum Debuggen auch auf Starten zu drücken, wenn
  // kein Auto verbunden ist. Aktuell kommt 'Bluetooth Adapter ist aus...'. Das ist ok, aber
  // ich will eine Option 'trotzdem starten', damit ich dann sehen kann, ob das Cockpit da ist
  // und noch gut funktioniert." Statt alert() ein Dialog, der mit dem Pad bedienbar ist.
  async function konsoleLosfahren(ohneAuto) {
    if (!playerCar && !ohneAuto) {
      const lage = await garageConnect({ stumm: true });
      if (!playerCar) {
        konsoleFahrenZeichnen();
        const grund = lage ? t(bluetoothLageText(lage)) : t('Die Bluetooth-Auswahl wurde ohne Auto geschlossen.');
        konsoleFrage(t('Kein Auto verbunden'),
          grund + '\n\n' + t('Zum Ausprobieren geht es trotzdem ins Cockpit: Anzeigen, Menüs, Ampel und Ton laufen, an ein Auto wird nichts gesendet.'),
          [[t('Trotzdem starten'), () => konsoleLosfahren(true)],
           [t('Nochmal verbinden'), () => konsoleLosfahren()],
           [t('Abbrechen'), null]], true);
        return;
      }
    }
    showTab('race');
    if (raceState === 'idle' || raceState === 'finished') toggleRace();
  }

  // ---- Frage-Dialog (#k-frage): wie das Cockpit-Menue, mit dem Pad bedienbar ----------
  // knoepfe: [[Text, Funktion oder null], ...]; der erste ist vorgewaehlt.
  function konsoleFrage(titel, text, knoepfe, wip) {
    const d = $('k-frage');
    if (!d) return;
    $('k-frage-titel').textContent = titel;
    if (wip) {
      const w = document.createElement('span');
      w.className = 'wip-tag';
      w.textContent = t('experimentell');
      $('k-frage-titel').appendChild(document.createTextNode(' '));
      $('k-frage-titel').appendChild(w);
    }
    $('k-frage-text').textContent = text || '';
    const host = $('k-frage-knoepfe');
    host.innerHTML = '';
    knoepfe.forEach(([tx, fn]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = tx;
      b.addEventListener('click', () => { konsoleFrageZu(); if (fn) fn(); });
      host.appendChild(b);
    });
    kFrageOffen = true;
    d.hidden = false;
    menuNavEnsureContext();
    menuNavIndex = 0; menuNavGezeigt = true;
    menuNavRender();
    konsoleZeichnen();
  }
  function konsoleFrageZu() {
    const d = $('k-frage');
    kFrageOffen = false;
    if (d) d.hidden = true;
    // Leeren: der Text bliebe sonst unsichtbar im Dokument stehen, nach einem Sprachwechsel
    // in der alten Sprache (der Sprachtest hat ihn gefunden).
    ['k-frage-titel', 'k-frage-text', 'k-frage-knoepfe'].forEach((id) => { if ($(id)) $(id).textContent = ''; });
    document.querySelectorAll('.menu-nav-sel').forEach((el) => el.classList.remove('menu-nav-sel'));
    menuNavEnsureContext();
    if (kAktiverTab() === 'fahren') konsoleFokusAuf(playerCar ? 'fa-start' : 'fa-auto');
    konsoleZeichnen();
  }

  // ---- Rechter Stick: Bildlauf (aus pollGamepad) --------------------------------------
  // BESTELLT: "rechter Stick soll scrollen können". Vorher stand dort document.body.scrollTop
  // - im Standardmodus rollt der body aber nicht, das Dokument tut es (scrollingElement), und
  // der Stick blieb wirkungslos. Jetzt: zuerst ein offener Dialog, dann die Seite. Die
  // Bruchteile werden gesammelt, sonst verschluckt das Runden auf ganze Pixel einen leicht
  // geneigten Stick.
  let kRollRest = 0;
  function konsoleBildlauf(dy) {
    kRollRest += dy;
    const ganz = Math.trunc(kRollRest);
    if (!ganz) return false;
    kRollRest -= ganz;
    const ziele = [
      kFrageOffen && document.querySelector('#k-frage .k-pause-dialog'),
      kPauseOffen && document.querySelector('#k-pause .k-pause-dialog'),
      document.scrollingElement, document.body,
    ];
    for (const el of ziele) {
      if (!el) continue;
      const vor = el.scrollTop;
      el.scrollTop = vor + ganz;
      if (el.scrollTop !== vor) return true;
    }
    return false;
  }
  function konsoleFokusAuf(id) {
    const rows = menuNavRows();
    const i = rows.findIndex((r) => r.el.id === id);
    if (i >= 0) { menuNavIndex = i; menuNavGezeigt = true; menuNavRender(); }
  }

  // ---- Cockpit-Menue (Options 1 s halten, Esc, Knopf ☰) --------------------------------
  function konsolePauseAuf() {
    const p = $('k-pause');
    if (!p) return;
    kPauseOffen = true;
    p.hidden = false;
    menuNavEnsureContext();
    menuNavIndex = 0; menuNavGezeigt = true;
    menuNavRender();
    menuNavTonAnwaehlen();
    konsoleZeichnen();
  }
  function konsolePauseZu() {
    const p = $('k-pause');
    kPauseOffen = false;
    if (p) p.hidden = true;
    document.querySelectorAll('.menu-nav-sel').forEach((el) => el.classList.remove('menu-nav-sel'));
    konsoleZeichnen();
  }
  function konsolePauseWahl(was) {
    konsolePauseZu();
    if (was === 'weiter') return;
    if (was === 'box') { requestPitStop(); return; }
    if (was === 'uebersicht') {
      const i = COCKPIT_SCREENS.findIndex((s) => s.id === 'uebersicht');
      if (i >= 0) cockpitScreenSet(i);
      return;
    }
    if (was === 'abbrechen') {
      if (raceState === 'racing' || raceState === 'countdown' || raceState === 'finishing') requestRaceStop();
      return;
    }
    if (document.body.classList.contains('race-fs')) exitRaceFullscreen();
    if (was === 'optionen') konsoleZeige('options');
    else if (was === 'fahren') konsoleZeige('fahren');
  }

  // ---- Zeichnen: Kopf, Reiter, Beschreibung, Fuss, Hintergrund -----------------------
  function konsoleZeichnen() {
    const tab = kAktiverTab();
    document.body.classList.toggle('k-titel-an', tab === 'home');
    // Der Fahren-Schirm fuellt genau den Bildschirm (CSS: body.k-kacheln).
    document.body.classList.toggle('k-kacheln', tab === 'fahren');
    // Hintergrund
    const bg = $('k-bg');
    if (bg) {
      let name = K_BILD[tab] || 'mehrspieler';
      if (tab === 'track') name = ($('setting-ontrack') || {}).checked ? 'strecke-bahn' : 'strecke-frei';
      const url = 'url(img/' + name + '-bg.jpg)';
      if (bg.dataset.bild !== name) { bg.style.backgroundImage = url; bg.dataset.bild = name; }
    }
    // Status
    const st = $('k-status');
    if (st) {
      let n = 0;
      try { n = garage.filter((c) => c.device).length; } catch (e) { n = 0; }
      st.textContent = '';
      const a = document.createElement('span');
      a.className = n ? 'k-an' : '';
      a.textContent = n ? '● ' + n + ' ' + t(n === 1 ? 'Auto' : 'Autos') : '○ ' + t('kein Auto');
      st.appendChild(a);
      // Kein Etikett "Neues Menü" mehr daneben - BESTELLT: "Mach das 'Neues Menü' Label oben
      // rechts weg". Als WIP gekennzeichnet bleibt das Menue in den Patchnotes.
    }
    // Reiter: oben die Ebene 1, darunter die innere Leiste, falls es eine gibt.
    const r1 = konsoleReiterEbene1();
    const r2 = konsoleReiterInnen();
    const fuell = (leiste, host, r) => {
      if (!leiste) return;
      leiste.hidden = !r;
      if (!r || !host) return;
      host.innerHTML = '';
      r.forEach((x) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = x.text;
        if (x.an) b.className = 'an';
        b.addEventListener('click', () => x.wahl());
        host.appendChild(b);
      });
    };
    fuell($('k-leiste'), $('k-reiter'), r1);
    fuell($('k-leiste2'), $('k-reiter2'), r2);
    document.body.classList.toggle('k-innen', !!r2);
    // Immer, nicht nur auf dem Fahren-Schirm: sonst stuenden seine Kacheln nach einem
    // Sprachwechsel anderswo noch in der alten Sprache da ("Härte 50 %" im Englischen).
    konsoleFahrenZeichnen();
    if (tab === 'track') konsoleStreckeModus();
  }

  // Keine Beschreibungszeile und keine Fussleiste mit Tastenbelegung mehr. BESTELLT: "Nimm den
  // Footer mit den Tastenbelegungen weg und auch oben das L1 und R1. Entferne auch den Tipp
  // unten". Die Tasten bleiben dieselben, nur ihre Anzeige entfaellt.

  // ---- Fahren: die Info-Zeilen aus dem echten Zustand ---------------------------------
  function kZeilen(host, paare) {
    if (!host) return;
    host.innerHTML = '';
    for (const [l, w] of paare) {
      const a = document.createElement('span'); a.className = 'k-l'; a.textContent = l;
      const b = document.createElement('span'); b.className = 'k-w';
      if (w instanceof Node) b.appendChild(w); else b.textContent = w;
      host.appendChild(a); host.appendChild(b);
    }
  }
  function kAutos() {
    try { return garage.filter((c) => c.device); } catch (e) { return []; }
  }
  const K_ROLLE = { player: 'Steuern', player2: 'Spieler 2', ghost: 'Ghost', none: 'Aus' };
  function kPunkt(farbe, text) {
    const s = document.createElement('span');
    const p = document.createElement('i'); p.className = 'k-punkt'; p.style.background = farbe;
    s.appendChild(p); s.appendChild(document.createTextNode(text));
    return s;
  }
  function kTeile() {
    try { return currentTrackTiles.length; } catch (e) { return 0; }
  }
  function kCode() {
    try { return currentTrackTiles.length > 1 ? trackToCode(currentTrackTiles) : ''; } catch (e) { return ''; }
  }

  function konsoleFahrenZeichnen() {
    if (!$('fa-auto')) return;
    const autos = kAutos();
    $('fa-auto-titel').textContent = autos.length ? autos.length + ' ' + t('verbunden') : t('Autos verbinden');
    kZeilen($('fa-auto-info'), autos.length
      ? autos.map((c) => [kPunkt(carColor(c).hex, garageLabel(c)), t(K_ROLLE[c.role] || c.role)])
      : [[t('Status'), t('nicht verbunden')], ['✕', t('Bluetooth-Auswahl öffnen')]]);
    const rm = $('race-mode');
    const modus = rm.selectedOptions[0] ? rm.selectedOptions[0].textContent : '';
    $('fa-renn-titel').textContent = modus;
    const wx = $('race-wx-start');
    kZeilen($('fa-renn-info'), [
      [($('race-limit-label') || {}).textContent || t('Dauer'), ($('race-limit') || {}).value || '–'],
      [t('Wetter'), wx && wx.selectedOptions[0] ? wx.selectedOptions[0].textContent : '–'],
      [t('Pflichtboxenstopps'), ($('race-pit-required') || {}).value || '0'],
    ]);
    const bahn = ($('setting-ontrack') || {}).checked;
    $('fa-strecke-titel').textContent = bahn ? t('Auf der Bahn') : t('Frei');
    const bild = $('fa-strecke-bild');
    if (bild) bild.style.backgroundImage = 'url(img/' + (bahn ? 'strecke-bahn' : 'strecke-frei') + '.jpg)';
    kZeilen($('fa-strecke-info'), bahn
      ? [[t('Teile'), String(kTeile())], ['Code', kCode() || '–']]
      : [[t('Modus'), t('Ausdruck, ohne Bahn')]]);
    ['fa-scan', 'fa-laden'].forEach((id) => { if ($(id)) $(id).hidden = !bahn; });
    if ($('fa-druck')) $('fa-druck').hidden = bahn;
    $('fa-profil-titel').textContent = ($('race-act-mode-txt') || {}).textContent || '–';
    const h = $('ghost-hardness');
    $('fa-gegner-titel').textContent = t('Härte') + ' ' + (h ? Math.round(100 * (+h.value - (+h.min || 0)) / ((+h.max || 1) - (+h.min || 0))) : 0) + ' %';
    const training = rm.value === 'practice';
    $('fa-start-titel').textContent = training ? t('Training starten') : t('Rennen starten');
    $('fa-start-unter').textContent = modus + ' · ' + (bahn ? t('auf der Bahn') : t('frei'));
  }

  // Strecke: auf der Bahn Scan/Editor/Laden, frei Druckvorlagen/Editor.
  function konsoleStreckeModus() {
    const bahn = ($('setting-ontrack') || {}).checked;
    document.querySelectorAll('#sub-home-track [data-modus]').forEach((k) => {
      k.hidden = k.dataset.modus !== (bahn ? 'bahn' : 'frei');
    });
  }

  // ---- Gamepad: Titel und Options halten (aus pollGamepad, 90-ghosts.js) -------------
  const kPadVorher = [];
  let kOptionsSeit = 0, kOptionsGefeuert = false;
  let kTitelSperre = false;   // nach dem Titel: warten, bis alle Tasten losgelassen sind

  // Steuerkreuz im Menue: erster Druck sofort, gehalten nach 350 ms alle 120 ms - wie im
  // Mock-up. Fuer Einstellungszeilen hat menuNavAdjustGehalten() seine eigene Uhr.
  const kWdh = {};
  function konsoleWdh(dir, gedrueckt) {
    const jetzt = performance.now();
    const z = kWdh[dir] || (kWdh[dir] = { an: false, seit: 0, letzt: 0 });
    if (!gedrueckt) { z.an = false; return false; }
    if (!z.an) { z.an = true; z.seit = jetzt; z.letzt = jetzt; return true; }
    if (jetzt - z.seit > 350 && jetzt - z.letzt > 120) { z.letzt = jetzt; return true; }
    return false;
  }
  // Gibt true zurueck, wenn der Titel die Tasten verbraucht hat - dann tut pollGamepad in
  // diesem Takt sonst nichts (kein Hochschalten mit Kreis auf dem Titelbildschirm).
  function konsolePadTitel(pad) {
    let neu = false;
    for (let i = 0; i < pad.buttons.length; i++) {
      const n = !!(pad.buttons[i] && pad.buttons[i].pressed);
      if (n && !kPadVorher[i]) neu = i;
      kPadVorher[i] = n;
    }
    if (kTitelSperre) {
      if (kPadVorher.some(Boolean)) return true;
      kTitelSperre = false;
      return false;
    }
    if (kAktiverTab() !== 'home') return false;
    if (neu === 14 || neu === 15 || neu === 4 || neu === 5) { setLang(lang === 'de' ? 'en' : 'de'); return true; }
    // Die Trigger (6/7) sind Gas und Bremse und zaehlen nicht als "Taste".
    if (neu !== false && neu !== 6 && neu !== 7) { konsoleTitelWeiter(); kTitelSperre = true; return true; }
    return true;
  }
  // Options: kurz = Boxenstopp (beim LOSLASSEN, damit Halten unterscheidbar ist), 1 s
  // halten = Cockpit-Menue. Ausserhalb des Cockpits tut die Taste nichts.
  function konsoleOptionsTaste(gedrueckt) {
    const jetzt = performance.now();
    const imCockpit = kAktiverTab() === 'race';
    if (gedrueckt && !konsoleOptionsTaste.vorher) { kOptionsSeit = jetzt; kOptionsGefeuert = false; }
    if (gedrueckt && imCockpit && !kPauseOffen && !kOptionsGefeuert && jetzt - kOptionsSeit >= 1000) {
      kOptionsGefeuert = true;
      konsolePauseAuf();
    }
    if (!gedrueckt && konsoleOptionsTaste.vorher && imCockpit && !kOptionsGefeuert && !kPauseOffen) {
      requestPitStop();
    }
    konsoleOptionsTaste.vorher = gedrueckt;
  }

  // ---- Tastatur ----------------------------------------------------------------------
  // IM ERFASSUNGSLAUF (capture), damit der Titel jede Taste bekommt, bevor die Fahrtasten
  // sie sehen, und damit Esc/Q/E/Leertaste in Menues nicht zusaetzlich fahren.
  window.addEventListener('keydown', (e) => {
    const k = (e.key || '').toLowerCase();
    if (e.target && e.target.closest && e.target.closest('input[type="text"], input[type="number"], textarea, select')) return;
    if (kAktiverTab() === 'home' && !e.ctrlKey && !e.altKey && !e.metaKey && k !== 'tab' && k !== 'shift') {
      e.preventDefault(); e.stopImmediatePropagation();
      if (k === 'arrowleft' || k === 'arrowright') setLang(lang === 'de' ? 'en' : 'de');
      else konsoleTitelWeiter();
      return;
    }
    if (kAktiverTab() === 'race' && !kPauseOffen && k === 'escape' && !document.body.classList.contains('track-fs')) {
      e.preventDefault(); e.stopImmediatePropagation();
      konsolePauseAuf();
      return;
    }
    if (!konsoleMenue() || e.repeat) return;
    if (document.body.classList.contains('track-fs')) return;
    if (k === 'escape' || k === 'backspace') {
      if (konsoleZurueck()) { e.preventDefault(); e.stopImmediatePropagation(); }
    } else if (k === 'q' || k === 'e') {
      if (konsoleReiterSchritt(k === 'q' ? -1 : 1)) { e.preventDefault(); e.stopImmediatePropagation(); }
    } else if (k === ' ') {
      if (konsoleQuadrat()) { e.preventDefault(); e.stopImmediatePropagation(); }
    }
  }, true);

  // ---- Klicks ------------------------------------------------------------------------
  document.addEventListener('click', (e) => {
    // Titel: ein Klick irgendwo (ausser auf Sprache, Links, Knoepfe) fuehrt weiter.
    if (kAktiverTab() === 'home' && e.target.closest('#tab-home')
        && !e.target.closest('#lang-toggle, a, button, .app-update')) {
      konsoleTitelWeiter();
      return;
    }
    const k = e.target.closest('[data-k-sub]');
    if (k) { setTimeout(() => showSubpage(k.dataset.kSub), 0); }
    const sc = e.target.closest('[data-k-scroll]');
    if (sc) setTimeout(() => konsoleHinScrollen(sc.dataset.kScroll), 30);
  });

  // Zu einem Element auf der offenen Seite springen und die Zeile darum anwaehlen - fuer
  // "Strecke laden", das im Editor bei den gespeicherten Strecken landet (dort wird eine
  // Strecke auch gespeichert, deshalb keine zweite Liste).
  function konsoleHinScrollen(id) {
    const el = $(id);
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    const rows = menuNavRows();
    const i = rows.findIndex((r) => r.el === el || r.el.contains(el));
    if (i >= 0) { menuNavIndex = i; menuNavGezeigt = true; menuNavRender(); }
  }

  function konsoleEinrichten() {
    const kn = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
    kn('fa-auto', (e) => { if (!e.target.closest('.k-knopf')) konsoleAuto(); });
    kn('fa-verbinden', () => { konsoleVerbinden(); });
    kn('fa-garage', () => konsoleZeige('garage'));
    kn('fa-start', () => { konsoleLosfahren(); });
    kn('fa-renn', () => konsoleZeige('control'));
    kn('fa-strecke', (e) => { if (!e.target.closest('.k-knopf')) konsoleZeige('track'); });
    kn('fa-scan', () => konsoleZeige('track', 'scan'));
    kn('fa-editor', () => konsoleZeige('track', 'edit'));
    kn('fa-laden', () => { konsoleZeige('track', 'edit'); setTimeout(() => konsoleHinScrollen('track-list'), 30); });
    kn('fa-druck', () => konsoleZeige('track', 'print'));
    kn('fa-profil', () => konsoleZeige('options', 'opt-feel'));
    kn('fa-gegner', () => konsoleZeige('options', 'opt-ghosts'));
    kn('race-menue', () => konsolePauseAuf());
    document.querySelectorAll('#k-pause [data-pause]').forEach((b) => {
      b.addEventListener('click', () => konsolePauseWahl(b.dataset.pause));
    });
    for (const id of ['race-mode', 'setting-ontrack', 'ghost-hardness', 'race-limit', 'race-wx-start', 'setting-dev']) {
      const el = $(id);
      if (el) el.addEventListener('change', () => setTimeout(konsoleZeichnen, 0));
    }
    // SOFORT und nicht verzoegert: setLang() ruft diese Neuzeichner VOR dem Uebersetzen der
    // Textknoten, und Pfad/Status/Fussleiste sind zusammengesetzt - verzoegert stuenden sie
    // im englischen Modus einen Takt lang deutsch da (der Sprachtest hat "HAUPTMENÜ" gefunden).
    if (typeof i18nOnLangChange === 'function') i18nOnLangChange(konsoleZeichnen);
    // Der Status (Autos) und die Fahren-Kacheln aendern sich auch ohne Tab-Wechsel.
    setInterval(() => {
      const tab = kAktiverTab();
      if (tab === 'fahren') konsoleZeichnen();
    }, 1500);
    // Der gemeinsame Mehrspieler-Block steht zuerst beim Weg ueber den PC.
    const mpg = $('mp-gemeinsam'), platz = document.querySelector('#sub-mp-pc .mp-platz');
    if (mpg && platz) platz.appendChild(mpg);
    konsoleZeichnen();
  }
  setTimeout(konsoleEinrichten, 0);

