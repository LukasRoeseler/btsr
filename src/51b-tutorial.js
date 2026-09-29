  // ============================ TUTORIAL (experimentell) ================================
  //
  // BESTELLT: "To the title screen, also add a tutorial button. When I click it, it leads me
  // through the steps and teases some of the capabilities of the app."
  //
  // Eine Bildfolge auf den ECHTEN Schirmen: je Schritt ein Scheinwerfer auf das Element, um
  // das es geht (der Rest abgedunkelt), und eine Karte mit Bild, Titel und zwei Saetzen.
  // Bedienbar wie jedes Menue: die Karte ist ein menuNav-Container (50b-menu-nav.js), Kreuz
  // waehlt (vorgewaehlt: Weiter), Kreis geht einen Schritt zurueck, auf dem ersten schliesst
  // er. Startet nie von selbst - nur ueber den Knopf, Dreieck oder T auf dem Titel.
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

  let kTourOffen = false;
  let kTourSchritt = 0;
  function konsoleTourOffen() { return kTourOffen; }

  function konsoleTourStart() {
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
    if (fertig || kAktiverTab() !== 'fahren') konsoleZeige('fahren');
    setTimeout(() => { menuNavEnsureContext(); konsoleFokusAuf('fa-auto'); }, 0);
  }
  function konsoleTourWeiter() {
    if (kTourSchritt >= K_TOUR.length - 1) { konsoleTourZu(true); return; }
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
    const s = K_TOUR[kTourSchritt];
    if (!s) return;
    if (s.tab && kAktiverTab() !== s.tab) {
      kZurueckLaeuft = true;
      try { konsoleZeige(s.tab); } finally { kZurueckLaeuft = false; }
    }
    $('k-tour-schritt').textContent = (kTourSchritt + 1) + ' / ' + K_TOUR.length;
    $('k-tour-titel').textContent = t(s.titel);
    $('k-tour-text').textContent = t(s.text);
    $('k-tour-bild').src = 'img/' + s.bild + '.jpg';
    $('k-tour-zurueck').hidden = kTourSchritt === 0;
    $('k-tour-weiter').textContent = kTourSchritt === K_TOUR.length - 1 ? t('Los geht\'s') + ' ▶' : t('Weiter') + ' ▶';
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
    const s = K_TOUR[kTourSchritt];
    const spot = $('k-tour-spot'), karte = $('k-tour-karte'), d = $('k-tour');
    const r = kTourRechteck(s.ziel);
    d.classList.toggle('ohne-spot', !r);
    spot.hidden = !r;
    // Die Karte dorthin, wo das Ziel NICHT ist: darunter oder darueber, wenn dort Platz
    // ist, sonst daneben (eine hohe Kachel am Telefon laesst oben und unten nichts frei -
    // gesehen: die Karte lag ueber dem Knopf "Verbinden" der Kachel AUTOS).
    karte.classList.remove('oben', 'unten', 'links', 'rechts');
    if (!r) { karte.classList.add('unten'); return; }
    const rand = 4;
    spot.style.left = (r.l - rand) + 'px';
    spot.style.top = (r.o - rand) + 'px';
    spot.style.width = (r.r - r.l + 2 * rand) + 'px';
    spot.style.height = (r.u - r.o + 2 * rand) + 'px';
    const h = karte.offsetHeight + 16;
    if (innerHeight - r.u >= h) karte.classList.add('unten');
    else if (r.o >= h) karte.classList.add('oben');
    else karte.classList.add(r.l > innerWidth - r.r ? 'links' : 'rechts');
  }

  (() => {
    const kn = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
    kn('k-tutorial-start', (e) => { e.stopPropagation(); konsoleTourStart(); });
    kn('k-tour-weiter', () => konsoleTourWeiter());
    kn('k-tour-zurueck', () => konsoleTourZurueck());
    kn('k-tour-ende', () => konsoleTourZu(false));
    window.addEventListener('resize', () => { if (kTourOffen) konsoleTourSpot(); });
  })();
