  // ============================ TUTORIAL (experimentell) ================================
  //
  // BESTELLT: "To the title screen, also add a tutorial button. When I click it, it leads me
  // through the steps and teases some of the capabilities of the app."
  //
  // Eine Bildfolge auf den ECHTEN Schirmen: je Schritt ein Scheinwerfer auf das Element, um
  // das es geht (der Rest abgedunkelt), und eine Karte mit Bild, Titel und zwei Saetzen.
  // Bedienbar wie jedes Menue: die Karte ist ein menuNav-Container (50b-menu-nav.js), Kreuz
  // waehlt (vorgewaehlt: Weiter), Kreis geht einen Schritt zurueck, auf dem ersten schliesst
  // er. Startet nie von selbst - nur ueber den Knopf, Dreieck oder T auf dem Titel (die
  // Steuerung: Kreis oder S).
  //
  // Der erste Schritt steht schon auf FAHREN und nicht auf dem Titel: auf dem Titel
  // verbraucht konsolePadTitel() jede Taste, dort gaebe es kein Weiter.

  const K_TOUR = [
    { tab: 'fahren', ziel: null, bild: 'titel', titel: 'Willkommen bei OmegaSim',
      text: 'OmegaSim steuert deine Carrera-Hybrid-Autos per Bluetooth – mit echter Fahrphysik, Motorsound aus einer Motorsimulation und einem Cockpit wie im Rennsimulator. In einer Minute siehst du die wichtigsten Stellen.' },
    { tab: 'fahren', ziel: ['#fa-auto'], bild: 'auto', titel: 'Autos verbinden',
      text: 'Hier verbindest du dein Auto per Bluetooth. Das erste steuerst du selbst, jedes weitere fährt als Ghost mit eigener Linie und eigenem Charakter gegen dich – Namen, Farben und Rollen gibt es in der Garage.' },
    { tab: 'fahren', ziel: ['#fa-strecke'], bild: 'strecke-frei', titel: 'Deine Strecke',
      text: 'Auf der Bahn liest das Auto die Schiene: scanne deine Strecke oder baue sie im Editor nach. Ohne Bahn druckst du Vorlagen aus und lädst ein Foto deiner Strecke hoch, das dann im Cockpit erscheint.' },
    { tab: 'fahren', ziel: ['#fa-renn'], bild: 'rennen', titel: 'Rennoptionen',
      text: 'Freies Training, Qualifying, Rennen über Runden oder Endurance – mit wechselndem Wetter, Pflichtboxenstopps, Tank und Reifenverschleiß.' },
    { tab: 'fahren', ziel: ['#fa-profil', '#fa-motor'], bild: 'optionen', titel: 'Fahrgefühl und Motorsound',
      text: 'Links die Abstimmung, rechts der Motor: vom Porsche-Boxer bis zum V12 kommt jeder Klang aus einer Motorsimulation. Die Physik rechnet Gänge und Reibkreis, im Modus Pacejka sogar Reifen am Limit.' },
    { tab: 'fahren', ziel: ['#fa-start'], bild: 'start', titel: 'Losfahren',
      text: 'Ein Druck, und die Startampel läuft. Im Cockpit: Kreuz tippen für den Boxenstopp, halten für die gelbe Flagge, Options bringt dich ins Menü und wieder zurück.' },
    { tab: 'fahren', ziel: null, bild: 'garage', titel: 'Boxenstopp als Minigame',
      text: 'Beim Stopp erscheinen nacheinander zehn Tasten in der Mitte. Drück Quadrat oder Kreis rechtzeitig, und die Crew ist bis zu doppelt so schnell fertig.' },
    { tab: 'mp', ziel: ['#k-reiter button:nth-child(2)', '#sub-home-mp .misc-grid'], bild: 'mehrspieler', titel: 'Mehrspieler und Info-Screen',
      text: 'Mehrere Telefone, eine gemeinsame Rangliste – Host ist ein PC oder ein Telefon mit der App. Ein Tablet am Rand zeigt als Info-Screen Strecke, Autos und Zeiten.' },
    { tab: 'fahren', ziel: ['#fa-auto'], bild: 'fahren', titel: "Los geht's",
      text: 'Verbinde jetzt dein erstes Auto. Das Tutorial findest du jederzeit wieder auf dem Titelbildschirm.' },
  ];

  // DIE STEUERUNG (v0.8.26). BESTELLT: "neben dem Tutorial-Button noch einen Button zur
  // Steuerung. Erklaere dabei, dass es nur mit Gamepad funktioniert, zeige die Tasten und am
  // Ende, wo man das Bild vom Controller mit allen Tasten sieht und die Belegung aendern
  // kann." Statt eines Fotos zeigt die Karte die Taste selbst (taste). Die Belegung ist die ab
  // Werk (BIND_DEFAULTS in 90-ghosts.js); wer umbelegt, sieht seine im letzten Schritt.
  const K_STEUERUNG = [
    { tab: 'fahren', ziel: null, bild: 'optionen', titel: 'Steuerung mit dem Controller',
      text: 'Diese Führung gilt nur mit einem Gamepad – PS5, PS4 oder Xbox, per USB oder Bluetooth. Ohne Controller fährst du mit Tastatur oder Touch, und die Tasten hier gelten dann nicht.' },
    { tab: 'fahren', ziel: null, taste: 'L2 · R2', titel: 'Gas, Bremse, Lenkung',
      text: 'R2 gibt Gas, L2 bremst, der linke Stick lenkt. Fahren geht auch im Menü – zum Ausprobieren von Einstellungen.' },
    { tab: 'fahren', ziel: null, taste: '✕', titel: 'Kreuz',
      text: 'Im Menü: bestätigen. Im Cockpit: tippen für den Boxenstopp, eine Sekunde halten für die gelbe Flagge.' },
    { tab: 'fahren', ziel: null, taste: '○ □', titel: 'Kreis und Quadrat',
      text: 'Im Cockpit schalten sie: Kreis hoch, Quadrat runter. Im Menü geht Kreis eine Ebene zurück, Quadrat wechselt den Wert auf einer Kachel. Beim Boxen-Minigame sind sie die Spieltasten.' },
    { tab: 'fahren', ziel: null, taste: '△', titel: 'Dreieck',
      text: 'Im Cockpit schaltet es das Licht. In den Optionen öffnet es die Erklärung einer Zeile, auf dem Titel das Tutorial.' },
    { tab: 'fahren', ziel: ['#k-leiste'], taste: 'L1 · R1', titel: 'Schultertasten',
      text: 'Im Menü wechseln sie die Reiter. Im Cockpit wählen sie für den nächsten Boxenstopp Reifen (L1) und Tankmenge (R1) vor.' },
    { tab: 'fahren', ziel: null, taste: '✥', titel: 'Steuerkreuz und rechter Stick',
      text: 'Das Steuerkreuz wählt im Menü Kacheln und Zeilen und blättert im Cockpit die Schirme. Der rechte Stick rollt lange Seiten, R3 gibt Lichthupe.' },
    { tab: 'fahren', ziel: null, taste: 'OPTIONS', titel: 'Options, Share und L3',
      text: 'Options springt vom Cockpit ins Fahren-Menü und wieder zurück. Share schaltet zwischen Bahn und Ausdruck, L3 das Vollbild.' },
    { tab: 'options', sub: 'opt-pad', ziel: ['#pad-zoom'], bild: 'optionen', titel: 'Alle Tasten und die Belegung',
      text: 'Hier siehst du den Controller mit allen Tasten. Darüber kannst du jede Funktion neu zuweisen: „Neu zuweisen“ drücken, dann die Taste am Controller.' },
  ];
  // Wo eine Fuehrung endet: das Tutorial auf Fahren, die Steuerung dort, wo sie hinfuehrt.
  const K_TOUR_ENDE = new Map([[K_TOUR, 'fahren'], [K_STEUERUNG, 'bleiben']]);

  let kTourOffen = false;
  let kTourSchritt = 0;
  let kTourListe = K_TOUR;
  function konsoleTourOffen() { return kTourOffen; }

  function konsoleTourStart(liste) {
    kTourListe = Array.isArray(liste) ? liste : K_TOUR;
    kTourOffen = true;
    kTourSchritt = 0;
    const d = $('k-tour');
    if (d) d.hidden = false;
    konsoleTourZeigen();
  }
  function konsoleTourZu(fertig) {
    kTourOffen = false;
    const d = $('k-tour');
    if (d) d.hidden = true;
    document.querySelectorAll('.menu-nav-sel').forEach((el) => el.classList.remove('menu-nav-sel'));
    menuNavEnsureContext();
    if (fertig && K_TOUR_ENDE.get(kTourListe) === 'bleiben') return;
    if (fertig || kAktiverTab() !== 'fahren') konsoleZeige('fahren');
    setTimeout(() => { menuNavEnsureContext(); konsoleFokusAuf('fa-auto'); }, 0);
  }
  function konsoleTourWeiter() {
    if (kTourSchritt >= kTourListe.length - 1) { konsoleTourZu(true); return; }
    kTourSchritt++;
    konsoleTourZeigen();
  }
  function konsoleTourZurueck() {
    if (kTourSchritt <= 0) { konsoleTourZu(false); return; }
    kTourSchritt--;
    konsoleTourZeigen();
  }

  // Das Rechteck um alle Ziele eines Schritts; null, wenn keines sichtbar ist.
  function kTourRechteck(ziele) {
    let r = null;
    for (const sel of ziele || []) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      r = r ? { l: Math.min(r.l, b.left), o: Math.min(r.o, b.top), r: Math.max(r.r, b.right), u: Math.max(r.u, b.bottom) }
            : { l: b.left, o: b.top, r: b.right, u: b.bottom };
    }
    return r;
  }

  function konsoleTourZeigen() {
    const s = kTourListe[kTourSchritt];
    if (!s) return;
    const offen = document.querySelector('.tabpage.active .subpage.on');
    const subJetzt = offen ? offen.id.replace(/^sub-/, '') : '';
    if ((s.tab && kAktiverTab() !== s.tab) || (s.sub || '') !== subJetzt) {
      kZurueckLaeuft = true;
      try { konsoleZeige(s.tab || kAktiverTab(), s.sub || ''); } finally { kZurueckLaeuft = false; }
    }
    $('k-tour-schritt').textContent = (kTourSchritt + 1) + ' / ' + kTourListe.length;
    $('k-tour-titel').textContent = t(s.titel);
    $('k-tour-text').textContent = t(s.text);
    // Eine Taste statt eines Bildes (Steuerung), sonst das Foto.
    $('k-tour-taste').hidden = !s.taste;
    $('k-tour-taste').textContent = s.taste || '';
    $('k-tour-bild').hidden = !!s.taste;
    if (!s.taste) $('k-tour-bild').src = 'img/' + s.bild + '.jpg';
    $('k-tour-zurueck').hidden = kTourSchritt === 0;
    const letzter = kTourSchritt === kTourListe.length - 1;
    $('k-tour-weiter').textContent = letzter
      ? (K_TOUR_ENDE.get(kTourListe) === 'bleiben' ? t('Fertig') : t('Los geht\'s')) + ' ▶' : t('Weiter') + ' ▶';
    // Erst malen lassen, dann messen: der Schirm ist eben erst gewechselt.
    setTimeout(konsoleTourSpot, 30);
    menuNavEnsureContext();
    const rows = menuNavRows();
    const iw = rows.findIndex((r) => r.el.id === 'k-tour-weiter');
    menuNavIndex = iw >= 0 ? iw : 0;
    menuNavGezeigt = true;
    menuNavRender();
  }

  function konsoleTourSpot() {
    if (!kTourOffen) return;
    const s = kTourListe[kTourSchritt];
    const spot = $('k-tour-spot'), karte = $('k-tour-karte'), d = $('k-tour');
    // Ein Ziel weiter unten auf einer langen Seite erst in die Sicht holen.
    const erstes = s.ziel && document.querySelector(s.ziel[0]);
    if (erstes) {
      const b = erstes.getBoundingClientRect();
      if (b.height && (b.bottom > innerHeight || b.top < 0)) erstes.scrollIntoView({ block: 'center' });
    }
    const r = kTourRechteck(s.ziel);
    d.classList.toggle('ohne-spot', !r);
    spot.hidden = !r;
    // Die Karte dorthin, wo das Ziel NICHT ist: darunter oder darueber, wenn dort Platz
    // ist, sonst daneben (eine hohe Kachel am Telefon laesst oben und unten nichts frei -
    // gesehen: die Karte lag ueber dem Knopf "Verbinden" der Kachel AUTOS).
    karte.classList.remove('oben', 'unten', 'links', 'rechts');
    // NIE UNTER DIE KOPFZEILE (gemeldet: "Boxen mit Text verschwinden unter der Navibar
    // ganz oben, bei Nr. 5 und 6"): oben beginnt die Karte unter dem Kopf.
    const kopf = $('k-kopf');
    const kopfUnten = kopf && kopf.offsetParent !== null ? kopf.getBoundingClientRect().bottom : 0;
    karte.style.top = '';
    if (!r) { karte.classList.add('unten'); return; }
    const rand = 4;
    spot.style.left = (r.l - rand) + 'px';
    spot.style.top = (r.o - rand) + 'px';
    spot.style.width = (r.r - r.l + 2 * rand) + 'px';
    spot.style.height = (r.u - r.o + 2 * rand) + 'px';
    const h = karte.offsetHeight + 16;
    if (innerHeight - r.u >= h) karte.classList.add('unten');
    else if (r.o - kopfUnten >= h) { karte.classList.add('oben'); karte.style.top = (kopfUnten + 6) + 'px'; }
    else karte.classList.add(r.l > innerWidth - r.r ? 'links' : 'rechts');
  }

  (() => {
    const kn = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
    kn('k-tutorial-start', (e) => { e.stopPropagation(); konsoleTourStart(K_TOUR); });
    kn('k-steuerung-start', (e) => { e.stopPropagation(); konsoleTourStart(K_STEUERUNG); });
    kn('k-tour-weiter', () => konsoleTourWeiter());
    kn('k-tour-zurueck', () => konsoleTourZurueck());
    kn('k-tour-ende', () => konsoleTourZu(false));
    window.addEventListener('resize', () => { if (kTourOffen) konsoleTourSpot(); });
  })();
