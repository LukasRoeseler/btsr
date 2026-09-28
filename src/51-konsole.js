
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
  // Fussleiste darueber und baut die drei neuen Schirme (#tab-home als Titel, #tab-haupt,
  // #tab-fahren) sowie das Cockpit-Menue (#k-pause, Options 1 s halten).
  //
  // BEIM LADEN NICHTS AUSFUEHREN, was spaetere Dateien braucht: garage, currentTrackTiles,
  // raceState stehen als const/let weiter unten und liegen hier noch in der temporalen
  // Todeszone - ein Zugriff wuerfe und naehme die ganze IIFE mit. Deshalb nur Funktionen und
  // Ereignisse; gestartet wird per setTimeout(konsoleStart, 0) am Ende dieser Datei.

  const K_EBENE1 = ['fahren', 'mp', 'options', 'info', 'misc'];
  const K_NAME = {
    home: 'Titel', haupt: 'Hauptmenü', fahren: 'Fahren', garage: 'Garage', race: 'Cockpit',
    options: 'Optionen', control: 'Renneinstellungen', track: 'Strecke', mp: 'Mehrspieler',
    info: 'Info', misc: 'Entwickler', doc: 'Doku', school: 'Programmierschule',
    dev: 'BLE-Werkbank', selftest: 'Selbsttest', probe: 'Code-Sonde', numtrain: 'Zahlensysteme',
    record: 'Aufnahme-Modus',
  };
  // Der Pfad in der Kopfzeile: woher man kommt. Der Stapel sagt, wohin Kreis fuehrt; das
  // hier ist nur die Anzeige, damit man weiss, wo man steht.
  const K_ELTERN = {
    fahren: 'haupt', mp: 'haupt', options: 'haupt', info: 'haupt', misc: 'haupt',
    garage: 'fahren', control: 'fahren', track: 'fahren',
    doc: 'misc', school: 'misc', dev: 'misc', selftest: 'misc', probe: 'misc',
    numtrain: 'misc', record: 'misc',
  };
  const K_BILD = {
    home: 'titel', haupt: 'haupt', fahren: 'fahren', garage: 'garage', control: 'rennen',
    mp: 'mehrspieler', options: 'optionen', info: 'garage', misc: 'mehrspieler',
  };

  let kStapel = [];
  let kZurueckLaeuft = false;
  let kEingabe = 'maus';            // 'pad' | 'tasten' | 'maus' - fuer die Tastensymbole
  let kPauseOffen = false;
  let kLetzterTab = 'home';

  function kAktiverTab() {
    const t = document.querySelector('.tabpage.active');
    return t ? t.id.replace(/^tab-/, '') : '';
  }
  // MENUE statt FAHREN: ueberall ausser im Cockpit, und im Cockpit, solange dessen Menue
  // offen ist. Daran haengt, ob Kreuz/Kreis/Quadrat/L1/R1/Options Menue- oder Fahrtasten sind.
  function konsoleMenue() { return kAktiverTab() !== 'race' || kPauseOffen; }
  function konsolePauseOffen() { return kPauseOffen; }
  function konsoleDev() {
    const cb = $('setting-dev');
    return !!(cb && cb.checked) || /[?&]dev\b/.test(location.search);
  }

  // ---- Wechsel verfolgen: aus dem .tab-btn-Klick gerufen (10-ble-explorer.js) --------
  function konsoleNachTab(neu, alt) {
    if (!kZurueckLaeuft && alt && alt !== neu) {
      kStapel.push(alt);
      if (kStapel.length > 40) kStapel.shift();
    }
    kLetzterTab = neu;
    if (neu !== 'race' && kPauseOffen) konsolePauseZu();
    // Nach dem Umschalten zeichnen, nicht davor: der neue Tab ist erst danach .active.
    setTimeout(() => {
      konsoleZeichnen();
      // Auf den Kachelschirmen des ACC-Menues ist die Auswahl von Anfang an sichtbar: FAHREN
      // im Hauptmenue, im Fahren-Schirm AUTO ohne Auto und RENNEN STARTEN mit Auto.
      if (neu === 'haupt' || neu === 'fahren') {
        menuNavEnsureContext();
        if (!menuNavGezeigt) {
          const ziel = neu === 'haupt' ? 'haupt-fahren' : (playerCar ? 'fa-start' : 'fa-auto');
          konsoleFokusAuf(ziel);
        }
      }
    }, 0);
  }
  function konsoleNachSubpage() { setTimeout(konsoleZeichnen, 0); }

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
    const lb = $('lb-wrap');
    if (lb && lb.classList.contains('on') && $('lb-close')) { $('lb-close').click(); return true; }
    if (kPauseOffen) { konsolePauseZu(); return true; }
    const tab = kAktiverTab();
    if (document.querySelector('.tabpage.active .subpage.on')) { showSubpage(''); return true; }
    if (tab === 'home') return false;
    let ziel = null;
    while (kStapel.length && !ziel) {
      const z = kStapel.pop();
      if (z !== tab) ziel = z;
    }
    if (!ziel) ziel = K_ELTERN[tab] || (tab === 'haupt' ? 'home' : 'haupt');
    kZurueckLaeuft = true;
    try { showTab(ziel); } finally { kZurueckLaeuft = false; }
    menuNavTonAbwaehlen();
    return true;
  }

  // ---- Reiterleiste (L1/R1) ---------------------------------------------------------
  //
  // Die INNERSTE Ebene bekommt die Schultertasten: in einer offenen Optionen-Kategorie die
  // Kategorien, in der BLE-Werkbank ihre Unterreiter, in den Renneinstellungen die drei
  // Karten, auf Ebene 1 die fuenf Hauptbereiche.
  function konsoleReiter() {
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
    if (tab === 'haupt' || K_EBENE1.includes(tab)) {
      // Reiterwechsel auf Ebene 1 ERSETZT den Schirm und legt nichts auf den Stapel: Kreis
      // fuehrt von jedem der Hauptbereiche direkt ins Hauptmenue, nicht durch alle Reiter,
      // die man unterwegs angesehen hat.
      return K_EBENE1.filter((x) => x !== 'misc' || konsoleDev()).map((x) => ({
        text: t(K_NAME[x]), an: x === tab,
        wahl: () => {
          if (x === tab) return;
          const vomHaupt = tab === 'haupt';
          kZurueckLaeuft = !vomHaupt;
          try { konsoleZeige(x); } finally { kZurueckLaeuft = false; }
        },
      }));
    }
    return null;
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

  // ---- Titel: jede Taste fuehrt ins Hauptmenue ---------------------------------------
  function konsoleTitelWeiter() {
    if (kAktiverTab() !== 'home') return false;
    konsoleZeige('haupt');
    return true;
  }

  // ---- Fahren: Start und Auto --------------------------------------------------------
  async function konsoleAuto() {
    if (!playerCar && !garage.some((c) => c.device)) {
      await garageConnect();
      konsoleFahrenZeichnen();
      // Nach dem Verbinden auf RENNEN STARTEN, wie bestellt: wenige Klicks bis zum Fahren.
      if (playerCar) konsoleFokusAuf('fa-start');
      return;
    }
    konsoleZeige('garage');
  }
  // RENNEN STARTEN: fehlt das Auto, erst die Bluetooth-Auswahl, dann ins Cockpit und die
  // Startampel. Freies Training startet genauso (die Ampel gibt den Beginn der Sitzung).
  async function konsoleLosfahren() {
    if (!playerCar) {
      await garageConnect();
      if (!playerCar) { konsoleFahrenZeichnen(); return; }
    }
    showTab('race');
    if (raceState === 'idle' || raceState === 'finished') toggleRace();
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
    else if (was === 'haupt') konsoleZeige('haupt');
  }

  // ---- Zeichnen: Kopf, Reiter, Beschreibung, Fuss, Hintergrund -----------------------
  function konsoleZeichnen() {
    const tab = kAktiverTab();
    document.body.classList.toggle('k-titel-an', tab === 'home');
    // Die zwei Kachelschirme fuellen genau den Bildschirm (CSS: body.k-kacheln).
    document.body.classList.toggle('k-kacheln', tab === 'haupt' || tab === 'fahren');
    // Hintergrund
    const bg = $('k-bg');
    if (bg) {
      let name = K_BILD[tab] || 'mehrspieler';
      if (tab === 'track') name = ($('setting-ontrack') || {}).checked ? 'strecke-bahn' : 'strecke-frei';
      const url = 'url(img/' + name + '-bg.jpg)';
      if (bg.dataset.bild !== name) { bg.style.backgroundImage = url; bg.dataset.bild = name; }
    }
    // Pfad
    const pfad = [];
    for (let x = tab; x && pfad.length < 4; x = K_ELTERN[x]) pfad.unshift(t(K_NAME[x] || x));
    const offen = document.querySelector('.tabpage.active .subpage.on h2');
    if (offen) pfad.push(offen.textContent.replace(/\s+/g, ' ').trim());
    const pEl = $('k-pfad');
    if (pEl) {
      pEl.innerHTML = '';
      pfad.forEach((p, i) => {
        const s = document.createElement(i === pfad.length - 1 ? 'b' : 'span');
        // Grossbuchstaben macht das CSS (.k-pfad): der Text selbst bleibt der Woerterbuch-
        // schluessel, falls ihn der Textknoten-Uebersetzer spaeter noch einmal sieht.
        s.textContent = (i ? ' / ' : '') + p;
        pEl.appendChild(s);
      });
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
      const w = document.createElement('span');
      w.className = 'wip-tag';
      w.textContent = t('Neues Menü');
      st.appendChild(w);
    }
    // Reiter
    const leiste = $('k-leiste');
    const r = konsoleReiter();
    if (leiste) {
      leiste.hidden = !r;
      const innen = $('k-reiter');
      if (r && innen) {
        innen.innerHTML = '';
        r.forEach((x) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = x.text;
          if (x.an) b.className = 'an';
          b.addEventListener('click', () => x.wahl());
          innen.appendChild(b);
        });
      }
    }
    // Entwickler ein-/ausblenden
    const dev = konsoleDev();
    if ($('haupt-dev')) $('haupt-dev').hidden = !dev;
    if (tab === 'haupt') konsoleHauptZeichnen();
    if (tab === 'fahren') konsoleFahrenZeichnen();
    if (tab === 'track') konsoleStreckeModus();
    konsoleFussZeichnen();
  }

  // Beschreibung und Fussleiste haengen am Fokus; menuNavRender() ruft das hier.
  function konsoleFokus(row) {
    const b = $('k-beschr');
    if (!b) return;
    let titel = '', text = '';
    const el = row && row.el;
    if (el) {
      if (el.dataset && el.dataset.d) { text = t(el.dataset.d); titel = ((el.querySelector('.k-kk, b') || el).textContent || '').trim(); }
      else if (el.classList.contains('misc-tile')) {
        titel = (el.querySelector('b') || el).textContent.trim();
        text = ((el.querySelector('span') || {}).textContent || '').trim();
      } else if (el.classList.contains('opt-row')) {
        const lab = el.querySelector('.opt-label');
        const sm = lab && lab.querySelector('small');
        titel = lab ? (lab.firstChild && lab.firstChild.textContent || '').trim() : '';
        text = sm ? sm.textContent.replace(/\s+/g, ' ').trim() : '';
      }
    }
    b.innerHTML = '';
    b.hidden = !text;
    if (text) {
      const tb = document.createElement('b');
      tb.textContent = titel.toUpperCase();
      b.appendChild(tb);
      b.appendChild(document.createTextNode(' · ' + text));
    }
    konsoleFussZeichnen(row);
  }

  function konsoleSymbol(n) {
    if (kEingabe !== 'pad') {
      const tt = { ok: 'Enter', zurueck: 'Esc', nav: '← ↑ ↓ →', l1: 'Q', r1: 'E', quad: t('Leer'), drei: 'O', lr: '← →' }[n];
      return '<span class="k-taste">' + tt + '</span>';
    }
    const s = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">';
    if (n === 'ok') return s + '<circle cx="12" cy="12" r="10.5"/><path d="M7.5 7.5l9 9M16.5 7.5l-9 9" stroke="#7fb2ff" stroke-width="2.2"/></svg>';
    if (n === 'zurueck') return s + '<circle cx="12" cy="12" r="10.5"/><circle cx="12" cy="12" r="5" stroke="#ff6b7a" stroke-width="2.2"/></svg>';
    if (n === 'quad') return s + '<circle cx="12" cy="12" r="10.5"/><rect x="7" y="7" width="10" height="10" stroke="#ff8ad8" stroke-width="2.2"/></svg>';
    if (n === 'drei') return s + '<circle cx="12" cy="12" r="10.5"/><path d="M12 6.5l6 10.5H6z" stroke="#3ddc84" stroke-width="2.2"/></svg>';
    if (n === 'nav' || n === 'lr') return s + '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/></svg>';
    return '<span class="k-taste">' + n.toUpperCase() + '</span>';
  }
  function konsoleFussZeichnen(rowArg) {
    const f = $('k-fuss');
    if (!f) return;
    const row = rowArg || (menuNavRows()[menuNavIndex]);
    const teile = [[konsoleSymbol('ok'), t('Bestätigen')], [konsoleSymbol('zurueck'), t('Zurück')],
      [konsoleSymbol('nav'), t('Navigieren')]];
    if (row && (row.kind === 'range' || row.kind === 'select' || row.kind === 'toggle')) teile.push([konsoleSymbol('lr'), t('Wert ändern')]);
    if (row && row.el && row.el.dataset && row.el.dataset.quad) teile.push([konsoleSymbol('quad'), t('Wechseln')]);
    if (row && row.el && row.el.querySelector && row.el.querySelector('.opt-info-btn')) teile.push([konsoleSymbol('drei'), t('Info')]);
    if (konsoleReiter()) teile.push([konsoleSymbol('l1') + konsoleSymbol('r1'), t('Reiter')]);
    f.innerHTML = teile.map(([g, tx]) => '<span class="k-h">' + g + '<span>' + tx + '</span></span>').join('');
  }

  // ---- Hauptmenue und Fahren: die Info-Zeilen aus dem echten Zustand ------------------
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

  function konsoleHauptZeichnen() {
    const autos = kAutos();
    const bahn = ($('setting-ontrack') || {}).checked;
    let beste = '–';
    try { if (dashLapTimes.length) beste = (Math.min.apply(null, dashLapTimes) / 1000).toFixed(2).replace('.', ',') + ' s'; } catch (e) { /* noch nichts */ }
    kZeilen($('haupt-fahren-info'), [
      [t('Auto'), autos.length ? autos.map((c) => garageLabel(c)).join(' · ') : t('keines')],
      [t('Strecke'), (bahn ? t('Bahn') : t('Frei')) + ' · ' + kTeile() + ' ' + t('Teile')],
      [t('Bestzeit'), beste],
    ]);
    let host = '–';
    try { host = mp.an ? mp.host.replace(/^https?:\/\//, '') : t('nicht verbunden'); } catch (e) { /* ohne Mehrspieler */ }
    kZeilen($('haupt-mp-info'), [['Host', host]]);
    kZeilen($('haupt-opt-info'), [[t('Abstimmung'), ($('race-act-mode-txt') || {}).textContent || '–'],
      [t('Steuerungsmodus'), (($('phys-mode') || {}).selectedOptions || [{}])[0].textContent || '–']]);
  }

  function konsoleFahrenZeichnen() {
    if (!$('fa-auto')) return;
    const autos = kAutos();
    $('fa-auto-titel').textContent = autos.length ? autos.length + ' ' + t('verbunden') : t('Auto verbinden');
    kZeilen($('fa-auto-info'), autos.length
      ? autos.map((c) => [kPunkt(carColor(c).hex, garageLabel(c)), t(K_ROLLE[c.role] || c.role)])
      : [[t('Status'), t('nicht verbunden')], ['✕', t('Bluetooth-Auswahl öffnen')]]);
    $('fa-auto').dataset.d = autos.length
      ? 'Öffnet die Garage: Rollen, Namen, Farben, Ghost-Tempo, weitere Autos.'
      : 'Öffnet sofort die Bluetooth-Auswahl. Das erste Auto steuerst du, weitere werden Ghosts.';
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

  // ---- Eingabegeraet merken (fuer die Tastensymbole) ---------------------------------
  function konsoleEingabe(art) {
    if (kEingabe === art) return;
    kEingabe = art;
    konsoleFussZeichnen();
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
    if (neu !== false) konsoleEingabe('pad');
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
    konsoleEingabe('tasten');
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
  window.addEventListener('mousedown', () => konsoleEingabe('maus'), { passive: true, capture: true });
  window.addEventListener('touchstart', () => konsoleEingabe('maus'), { passive: true, capture: true });

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
    kn('fa-auto', () => { konsoleAuto(); });
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
    kn('k-zurueck', () => konsoleZurueck());
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
      if (tab === 'fahren' || tab === 'haupt') konsoleZeichnen();
    }, 1500);
    konsoleZeichnen();
  }
  setTimeout(konsoleEinrichten, 0);

