  // ====================================================================================
  // ONLINE-STRECKENZEITEN (v1.3.15, WIP): Bestzeit und beste 3 Runden fuer JEDE Strecke
  // ====================================================================================
  //
  // BESTELLT: "Ich moechte die Moeglichkeit, Statistiken (wie bei Challenges, also Bestzeiten
  // und beste 3 Runden) fuer jede eingegebene Strecke abzurufen. In den Optionen soll es
  // Online-Optionen geben, darin wie im Challenges-Menue der Name und Option, dass Zeiten online
  // synchronisierbar werden. Standardmaessig aus. Es soll ein Pop-up-Menue kommen, wenn zum
  // ersten Mal eine Strecke im Editor erstellt wurde, mit Frage, ob die Zeiten online gespeichert
  // werden sollen, und sagen, dass der Name und die Strecke dann oeffentlich gespeichert werden.
  // Fuege im Challenges-Menue ein Menue ein, wo alle Strecken, zu denen mehr als 3 verschiedene
  // Leute eine Zeit gefahren haben, aufgelistet werden. Ich will meine lokal gespeicherten Zeiten
  // auch mit den Online-Zeiten [sehen], wenn ich meine nicht online teile."
  //
  // DER SCHLUESSEL EINER STRECKE ist bestzeitSchluessel(tiles) aus 70-race.js, also derselbe wie
  // fuer die lokalen Time-Attack-Bestzeiten:
  //   - Streckencode OHNE Drehung (trackToCode(tiles, 0)). Die Drehung ist nur die Lage der Karte
  //     auf dem Bildschirm, die Bahn auf dem Boden ist dieselbe.
  //   - Von Code und Code der RUECKWAERTS gefahrenen Schleife (chSpiegelTiles: Reihenfolge
  //     umkehren, links/rechts tauschen) gilt der kleinere. Das ist dieselbe Bahn in die andere
  //     Richtung: gleiche Laenge, gleiche Teile, und die Teilepruefung der Challenges
  //     (chRundePruefen) erkennt sie ohnehin als dieselbe. Ein echtes Spiegelbild (nur links und
  //     rechts tauschen) ist dagegen eine andere Bahn und bekommt einen anderen Schluessel.
  //   - Die Lage von Start/Ziel bleibt Teil des Codes: es ist ein echtes Teil der Bahn.
  // Das Apps Script rechnet denselben Schluessel aus dem Code nach (stSchluessel), damit auch ein
  // falsch normalisierter Eintrag in der richtigen Liste landet.
  //
  // LATENZ: Im Rennen wird je Runde und je gelesenem Teil nur ein Wert an ein Feld gehaengt
  // (skRunde, skTeilGelesen). Pruefen, Speichern und Senden laufen erst nach dem Rennen
  // (skSitzungEnde -> setTimeout), Abrufe nur beim Oeffnen einer Ansicht, mit Zwischenspeicher.
  const SK_STORE = 'omegasim-strecken-zeiten';
  const SK_OPT_STORE = 'omegasim-strecken-online';
  const SK_CACHE_STORE = 'omegasim-strecken-cache';
  const SK_MIN_FAHRER = 4;                 // "mehr als 3 verschiedene Leute"
  const SK_LISTE_MS = 5 * 60000;           // Community-Strecken hoechstens alle 5 min holen
  const SK_ZEITEN_MS = 2 * 60000;          // Zeiten einer Strecke hoechstens alle 2 min

  // ---- Einstellungen: Schalter (Standard AUS) und die einmalige Frage ----
  function skOpt() {
    const o = chLesen(SK_OPT_STORE, {});
    return { sync: !!(o && o.sync === true), gefragt: !!(o && o.gefragt === true) };
  }
  function skOptSetzen(teil) {
    chSchreiben(SK_OPT_STORE, Object.assign(skOpt(), teil));
    skOptZeichnen();
  }
  function skSyncAn() { return skOpt().sync; }
  function skUrl() { const o = chOnline(); return o && o.url ? o.url : ''; }
  function skSchluessel(tiles) { return bestzeitSchluessel(tiles); }
  // Ein Name: derselbe Wert wie der Name der Challenges-Bestenliste (CH_ONLINE_STORE).
  function skNameSetzen(name) {
    const o = chOnline();
    o.fahrer = String(name || '').trim().slice(0, 16);
    chSchreiben(CH_ONLINE_STORE, o);
    ['ch-fahrer', 'ch-name', 'on-fahrer'].forEach((id) => { const el = $(id); if (el && document.activeElement !== el) el.value = o.fahrer; });
  }
  function skOptZeichnen() {
    const n = $('on-fahrer'), s = $('on-sync');
    if (n && document.activeElement !== n) n.value = chOnline().fahrer || '';
    if (s) s.checked = skSyncAn();
  }
  // BESTELLT: beim ersten Speichern einer Strecke im Editor einmal fragen. Ja schaltet das
  // Synchronisieren ein, Nein laesst es aus; gefragt wird nur einmal (gemerkt). Rueckgabe true,
  // wenn die Frage gezeigt wurde.
  function skErsteStreckeFrage() {
    const o = skOpt();
    if (o.gefragt) return false;
    chSchreiben(SK_OPT_STORE, Object.assign(o, { gefragt: true }));
    if (o.sync) return false;
    konsoleFrage(t('Zeiten online speichern?'),
      t('Zeiten zu dieser Strecke online speichern? Dann werden dein Name und die Strecke öffentlich gespeichert.')
        + '\n' + t('Ändern kannst du das jederzeit unter Optionen > Online.'),
      [[t('Ja, online speichern'), () => {
         const feld = $('k-frage-eingabe-feld');
         const name = ((feld ? feld.value : '') || kFrageWert || '').trim();
         if (name) skNameSetzen(name);
         skOptSetzen({ sync: true });
         showHudToast(t('Zeiten werden online gespeichert'));
       }],
       [t('Nein, nur lokal'), () => skOptZeichnen()]], true, null,
      { label: t('Name in der Bestenliste'), wert: chOnline().fahrer || '' });
    return true;
  }

  // ---- Aufzeichnen im Rennen (nur Felder fuellen) ----
  let skLauf = null;          // { tiles, runden: [{ ms, gelesen, ungueltig }] }
  let skGelesen = [];         // gelesene Teile seit der letzten Ueberfahrt
  function skTeilGelesen(code) {
    if (raceState !== 'racing' && raceState !== 'finishing') { if (skGelesen.length) skGelesen = []; return; }
    if (skGelesen.length < 400 && !isStartCode(code)) skGelesen.push(code);
  }
  // Aus playerLapCrossed(): Runde i (ab 0) ist gezaehlt, ms ihre Zeit, ungueltig = die
  // Rennmaschine selbst wertet sie nicht (unter der Mindestzeit).
  function skRunde(i, ms, ungueltig) {
    if (typeof challengeLaeuft === 'function' && challengeLaeuft()) { skLauf = null; skGelesen = []; return; }
    if (i === 0 || !skLauf) {
      const tiles = (typeof currentTrackTiles !== 'undefined' && currentTrackTiles) || [];
      skLauf = tiles.length >= 3 ? { tiles: tiles.slice(), runden: [] } : null;
    }
    const gelesen = skGelesen;
    skGelesen = [];
    if (!skLauf || skLauf.runden.length >= 200) return;
    skLauf.runden.push({ ms: Math.round(ms), gelesen, ungueltig: !!ungueltig });
  }
  // Aus finishRace() (nicht bei Challenges, die haben ihre eigenen Listen).
  function skSitzungEnde() {
    const lauf = skLauf;
    skLauf = null; skGelesen = [];
    if (!lauf || !lauf.runden.length) return;
    setTimeout(() => { try { skAuswerten(lauf); } catch (e) { log('Streckenzeiten: ' + e.message, 'warn'); } }, 1500);
  }
  // Dieselben Pruefungen wie die Challenges: Mindestrundenzeit aus der Laenge (chMinRundeMs) und
  // 90 % der Teile erkannt (chRundePruefen). Ungueltige Runden bleiben als 0 in der Folge stehen,
  // damit die 3er-Serie nur wirklich aufeinanderfolgende gueltige Runden zusammenzaehlt
  // (chDreierBeste verwirft jede Gruppe mit einer Runde unter der Mindestzeit).
  function skAuswerten(lauf) {
    const tiles = lauf.tiles;
    const def = { code: trackToCode(tiles, 0), runden: 1 };
    const minMs = chMinRundeMs(def);
    let quote = 1;
    const runden = lauf.runden.map((r) => {
      if (r.ungueltig || !(r.ms >= minMs)) return 0;
      const pr = chRundePruefen(def, r.gelesen || []);
      if (!pr.ok) return 0;
      quote = Math.min(quote, pr.quote);
      return r.ms;
    });
    const gueltig = runden.filter((x) => x > 0);
    if (!gueltig.length) return null;
    const o = chOnline();
    const teilen = skSyncAn() && !!o.url;
    const e = { zeit: Math.min(...gueltig), runden, datum: Date.now(), fahrer: o.fahrer || '',
      auto: (typeof playerCar !== 'undefined' && playerCar) ? garageLabel(playerCar) : '', geraet: chGeraet(),
      quote: Math.round(quote * 100) / 100, geteilt: teilen };
    const key = skSchluessel(tiles);
    skLokalSpeichern(key, e);
    if (teilen) skHochladen(key, e, o);
    if (skSeiteOffen('edit')) skEditorZeichnen();
    return { key, eintrag: e, gesendet: teilen };
  }

  // ---- Lokale Zeiten ----
  function skLokalAlle() {
    const d = chLesen(SK_STORE, {});
    return d && typeof d === 'object' && !Array.isArray(d) ? d : {};
  }
  function skLokalSpeichern(key, e) {
    const alle = skLokalAlle();
    alle[key] = (Array.isArray(alle[key]) ? alle[key] : []).concat([e]).sort((a, b) => a.zeit - b.zeit).slice(0, 30);
    const keys = Object.keys(alle);
    if (keys.length > 200) {
      const neu = (k) => Math.max(0, ...alle[k].map((x) => x.datum || 0));
      keys.sort((a, b) => neu(b) - neu(a)).slice(200).forEach((k) => { delete alle[k]; });
    }
    chSchreiben(SK_STORE, alle);
  }
  // Eigene Zeiten dieser Strecke: die neue Ablage plus die Time-Attack-Bestzeiten
  // (omegasim-bestzeiten, gleicher Schluessel), die es schon vorher gab.
  function skLokal(key) {
    const eig = (skLokalAlle()[key] || []).map((z) => ({ zeit_ms: +z.zeit, fahrer: z.fahrer || '', auto: z.auto || '',
      geraet: z.geraet || chGeraet(), runden_ms: Array.isArray(z.runden) ? z.runden.map(Number) : [], quelle: 'lokal' }));
    const bz = (typeof bestzeitLesen === 'function' ? bestzeitLesen() : {})[key];
    if (bz && bz.fahrer) {
      Object.values(bz.fahrer).forEach((f) => {
        if (f && f.beste > 0) eig.push({ zeit_ms: +f.beste, fahrer: chOnline().fahrer || '', auto: f.name || '',
          geraet: chGeraet(), runden_ms: [], quelle: 'lokal' });
      });
    }
    return eig;
  }

  // ---- Senden: ueber die Warteschlange der Challenges (CH_AUSGANG, offline-fest) ----
  function skStreckenName(key) {
    try {
      const store = loadTrackStore();
      for (const name of Object.keys(store)) {
        const tl = migrateTiles((store[name].tiles || []).slice());
        if (tl.length >= 3 && skSchluessel(tl) === key) return name.slice(0, 32);
      }
    } catch (e) { /* ohne Namen */ }
    return '';
  }
  function skHochladen(key, e, o) {
    const p = codeToTrack(key);
    const eintrag = { art: 'strecke-zeit', strecke: key, teile: p ? p.tiles.length : 0, zeit_ms: Math.round(e.zeit),
      runden_ms: e.runden.map(Math.round), fahrer: e.fahrer, auto: String(e.auto || '').slice(0, 40), geraet: e.geraet,
      quote: e.quote, streckenname: skStreckenName(key), version: ($('app-version') || {}).textContent || '' };
    eintrag.nr = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    eintrag.url = o.url;
    chAusgangSchreiben(chAusgangLesen().concat([eintrag]));
    chAusgangZeichnen();
    if (!chNetzErlaubt()) { chSpaeter(); return; }
    chAusgangSenden();
  }
  // Aus chEintragSenden, wenn das Sheet eine Streckenzeit bestaetigt hat.
  function skNachUpload(key) {
    const z = skOnline.zeiten[key];
    if (z) z.at = 0;
    if (skSeiteOffen('edit')) skEditorZeichnen();
    if (skSeiteOffen('ch-sk') && skDetail && skDetail.strecke === key) skDetailZeichnen();
  }

  // ---- Online lesen (auch mit Schalter AUS: Lesen schickt nichts Persoenliches) ----
  const skOnline = { liste: null, listeAt: 0, listeLaedt: false, listeFehler: false, zeiten: {} };
  let skCacheGeladen = false;
  function skCacheLaden() {
    if (skCacheGeladen) return;
    skCacheGeladen = true;
    const c = chLesen(SK_CACHE_STORE, null);
    if (!c || typeof c !== 'object') return;
    if (Array.isArray(c.liste) && !skOnline.liste) { skOnline.liste = c.liste; skOnline.listeAt = 0; }
    if (c.zeiten && typeof c.zeiten === 'object') {
      Object.keys(c.zeiten).forEach((k) => {
        const z = c.zeiten[k];
        if (!skOnline.zeiten[k] && z && Array.isArray(z.zeiten)) skOnline.zeiten[k] = { zeiten: z.zeiten, at: 0, stand: z.stand || 0 };
      });
    }
  }
  function skCacheSchreiben() {
    const keys = Object.keys(skOnline.zeiten).filter((k) => Array.isArray(skOnline.zeiten[k].zeiten))
      .sort((a, b) => (skOnline.zeiten[b].stand || 0) - (skOnline.zeiten[a].stand || 0)).slice(0, 30);
    const zeiten = {};
    keys.forEach((k) => { zeiten[k] = { zeiten: skOnline.zeiten[k].zeiten.slice(0, 100), stand: skOnline.zeiten[k].stand || 0 }; });
    try { localStorage.setItem(SK_CACHE_STORE, JSON.stringify({ liste: skOnline.liste, zeiten })); } catch (e) { /* voll */ }
  }
  function skGet(query) {
    const url = skUrl();
    if (!url) return Promise.reject(new Error('keine Adresse'));
    const holen = () => fetch(url + (url.indexOf('?') >= 0 ? '&' : '?') + query, { cache: 'no-store' }).then((r) => r.json());
    // Einmal wiederholen: dieselbe sporadische 404 der Google-Echo-Seite wie bei den Challenges.
    return holen().catch(() => new Promise((ok) => setTimeout(ok, 1200)).then(holen));
  }
  // Community-Strecken: ?strecken=1 -> { ok, strecken: [{ strecke, name, fahrer, beste_ms, beste_fahrer, laeufe }] }
  function skListeHolen(frisch) {
    skCacheLaden();
    if (!skUrl() || skOnline.listeLaedt || !chNetzErlaubt()) return Promise.resolve(skOnline.liste);
    if (!frisch && skOnline.liste && Date.now() - skOnline.listeAt < SK_LISTE_MS) return Promise.resolve(skOnline.liste);
    skOnline.listeLaedt = true;
    return skGet('strecken=1').then((j) => {
      if (!j || !j.ok || !Array.isArray(j.strecken)) throw new Error((j && j.fehler) || 'keine Antwort');
      skOnline.liste = j.strecken; skOnline.listeFehler = false;
      skCacheSchreiben();
    }).catch(() => { skOnline.listeFehler = true; })
      .then(() => { skOnline.listeLaedt = false; skOnline.listeAt = Date.now(); return skOnline.liste; });
  }
  // Zeiten einer Strecke: ?strecke=<code> -> { ok, strecke, anzahl, zeiten: [...] }
  function skZeitenHolen(key, frisch) {
    skCacheLaden();
    const z = skOnline.zeiten[key] || (skOnline.zeiten[key] = { zeiten: null, at: 0 });
    if (!skUrl() || z.laedt || !chNetzErlaubt()) return Promise.resolve(z);
    if (!frisch && z.zeiten && Date.now() - z.at < SK_ZEITEN_MS) return Promise.resolve(z);
    z.laedt = true;
    return skGet('strecke=' + encodeURIComponent(key)).then((j) => {
      if (!j || !j.ok || !Array.isArray(j.zeiten)) throw new Error((j && j.fehler) || 'keine Antwort');
      z.zeiten = j.zeiten; z.fehler = false; z.stand = Date.now(); z.anzahl = j.anzahl || j.zeiten.length;
      skCacheSchreiben();
    }).catch(() => { z.fehler = true; })
      .then(() => { z.laedt = false; z.at = Date.now(); return z; });
  }

  // ---- Zusammenfuehren: online + lokal in EINER Liste ----
  function skAlleZeiten(key) {
    const on = skOnline.zeiten[key];
    const online = on && Array.isArray(on.zeiten) ? on.zeiten.map((z) => ({ zeit_ms: +z.zeit_ms, fahrer: String(z.fahrer || ''),
      auto: String(z.auto || ''), geraet: String(z.geraet || ''),
      runden_ms: Array.isArray(z.runden_ms) ? z.runden_ms.map(Number) : [], quelle: 'online' })) : [];
    const da = (z) => online.some((x) => x.geraet === z.geraet && Math.abs(x.zeit_ms - z.zeit_ms) < 2);
    const lokal = skLokal(key).filter((z) => !da(z));
    return { eintraege: online.concat(lokal).filter((z) => z.zeit_ms > 0), online: !!(on && Array.isArray(on.zeiten)),
             laedt: !!(on && on.laedt), fehler: !!(on && on.fehler), stand: on ? on.stand : 0 };
  }
  // Je Fahrer (Geraet) die beste Runde, schnellste zuerst.
  function skBestzeiten(eintraege) {
    const beste = new Map();
    eintraege.forEach((z, i) => {
      const wer = z.geraet || ('?' + z.fahrer + '_' + i);
      if (!beste.has(wer) || z.zeit_ms < beste.get(wer).zeit_ms) beste.set(wer, z);
    });
    return [...beste.values()].sort((a, b) => a.zeit_ms - b.zeit_ms);
  }
  // Je Fahrer die beste Summe aus drei aufeinanderfolgenden gueltigen Runden.
  function skDreier(eintraege, minMs) {
    const beste = new Map();
    eintraege.forEach((z, i) => {
      const b = chDreierBeste(z.runden_ms, minMs);
      if (b === null) return;
      const wer = z.geraet || ('?' + z.fahrer + '_' + i);
      if (!beste.has(wer) || b < beste.get(wer).best) beste.set(wer, Object.assign({}, z, { best: b }));
    });
    return [...beste.values()].sort((a, b) => a.best - b.best);
  }
  // Community-Strecken: nur mit MEHR als 3 verschiedenen Fahrern (auch wenn der Server mehr
  // schickt), meiste Fahrer zuerst, dann die schnellere Bestzeit.
  function skCommunityGefiltert(liste) {
    return (Array.isArray(liste) ? liste : [])
      .filter((s) => s && typeof s.strecke === 'string' && (+s.fahrer || 0) >= SK_MIN_FAHRER && codeToTrack(s.strecke))
      .sort((a, b) => ((+b.fahrer || 0) - (+a.fahrer || 0)) || ((+a.beste_ms || 0) - (+b.beste_ms || 0)));
  }

  // ---- Anzeige ----
  function skSeiteOffen(key) { const p = $('sub-' + key); return !!(p && p.classList.contains('on')); }
  function skZelle(tr, txt, kl) {
    const td = document.createElement('td');
    td.textContent = txt;
    td.setAttribute('data-i18n-skip', '');
    if (kl) td.className = kl;
    tr.appendChild(td);
    return td;
  }
  function skWer(z) { return (z.fahrer || t('ohne Namen')) + (z.auto ? ' · ' + z.auto : ''); }
  function skMarke(td, z) {
    if (z.quelle !== 'lokal') return;
    const m = document.createElement('span');
    m.className = 'sk-lokal';
    m.textContent = t('nur lokal');
    td.appendChild(document.createTextNode(' '));
    td.appendChild(m);
  }
  // Zeichnet Status, Bestzeiten und beste 3 Runden einer Strecke in `host`.
  function skZeichnen(host, key) {
    if (!host) return;
    const p = codeToTrack(key);
    const minMs = p ? chMinRundeMs({ code: key, runden: 1 }) : 0;
    const a = skAlleZeiten(key);
    host.innerHTML = '';
    const st = document.createElement('p');
    st.className = 'muted sk-status';
    st.setAttribute('data-i18n-skip', '');
    const lokalN = a.eintraege.filter((z) => z.quelle === 'lokal').length;
    st.textContent = (!skUrl() ? t('Nur auf diesem Gerät (keine Online-Adresse eingestellt).')
      : a.laedt && !a.online ? t('Lade Bestenliste …')
      : a.online ? t('Online-Bestenliste') + ': ' + (a.eintraege.length - lokalN) + ' ' + t('Zeiten')
        + (a.stand ? ' · ' + t('Stand') + ' ' + new Date(a.stand).toLocaleTimeString(lang === 'en' ? 'en-GB' : lang === 'es' ? 'es-ES' : 'de-DE', { hour: '2-digit', minute: '2-digit' }) : '')
      : a.fehler ? t('Online-Bestenliste nicht erreichbar, hier stehen deine eigenen Zeiten.')
      : t('Lade Bestenliste …'))
      + (lokalN ? ' · ' + t('nur lokal') + ': ' + lokalN : '')
      + (skSyncAn() ? '' : ' · ' + t('Deine Zeiten werden nicht geteilt.'));
    host.appendChild(st);
    const ich = chGeraet();
    const tabelle = (kopf, zeilen, leer) => {
      const h = document.createElement('h3');
      h.className = 'ch-zweite';
      h.textContent = kopf;
      host.appendChild(h);
      const tb = document.createElement('table');
      tb.className = 'ch-tabelle';
      const body = document.createElement('tbody');
      tb.appendChild(body);
      host.appendChild(tb);
      if (!zeilen.length) {
        const tr = document.createElement('tr');
        const td = skZelle(tr, leer, 'muted');
        td.colSpan = 4;
        body.appendChild(tr);
      }
      return body;
    };
    const best = skBestzeiten(a.eintraege);
    const b1 = tabelle(t('Bestzeit'), best, t('Noch keine Zeit auf dieser Strecke.'));
    best.slice(0, 30).forEach((z, i) => {
      const tr = document.createElement('tr');
      if (z.geraet === ich) tr.className = 'du';
      skZelle(tr, String(i + 1));
      skMarke(skZelle(tr, skWer(z)), z);
      skZelle(tr, chZeit(z.zeit_ms));
      skZelle(tr, i ? '+' + chZahl((z.zeit_ms - best[0].zeit_ms) / 1000, 3) : '–');
      b1.appendChild(tr);
    });
    const drei = skDreier(a.eintraege, minMs);
    const b3 = tabelle(t('Beste 3 Runden'), drei, t('Noch keine 3er-Serie'));
    drei.slice(0, 30).forEach((z, i) => {
      const tr = document.createElement('tr');
      if (z.geraet === ich) tr.className = 'du';
      skZelle(tr, String(i + 1));
      skMarke(skZelle(tr, skWer(z)), z);
      skZelle(tr, chZeit(Math.round(z.best / 3)));
      skZelle(tr, i ? '+' + chZahl((z.best - drei[0].best) / 3000, 3) : '–');
      b3.appendChild(tr);
    });
    const hw = document.createElement('p');
    hw.className = 'muted ch-stats';
    hw.textContent = t('Durchschnitt der drei schnellsten aufeinanderfolgenden Runden.');
    host.appendChild(hw);
  }
  // Im Editor: die Zeiten der Strecke, die gerade im Editor ist.
  function skEditorZeichnen() {
    const host = $('sk-editor-inhalt');
    if (!host) return;
    const tiles = (typeof currentTrackTiles !== 'undefined' && currentTrackTiles) || [];
    if (tiles.length < 3) {
      host.innerHTML = '';
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = t('Keine Strecke im Editor. Scanne oder baue zuerst eine Strecke.');
      host.appendChild(p);
      return;
    }
    const key = skSchluessel(tiles);
    skZeichnen(host, key);
    const z = skOnline.zeiten[key];
    if (skUrl() && !(z && z.laedt) && !(z && z.zeiten && Date.now() - z.at < SK_ZEITEN_MS)) {
      skZeitenHolen(key, false).then(() => { if (skSeiteOffen('edit')) skZeichnen($('sk-editor-inhalt'), key); });
    }
  }
  // Challenges > Community-Strecken
  function skListeZeichnen() {
    const host = $('sk-liste-bereich');
    if (!host) return;
    skCacheLaden();
    if (skUrl() && !skOnline.listeLaedt && Date.now() - skOnline.listeAt > SK_LISTE_MS) {
      skListeHolen(false).then(() => { if (skSeiteOffen('ch-strecken')) skListeZeichnen(); });
    }
    const liste = skCommunityGefiltert(skOnline.liste);
    host.innerHTML = '';
    const st = document.createElement('p');
    st.className = 'muted community-stand';
    st.setAttribute('data-i18n-skip', '');
    st.textContent = !skUrl() ? t('Nur auf diesem Gerät (keine Online-Adresse eingestellt).')
      : skOnline.listeLaedt && !skOnline.liste ? t('Lade die gemeinsame Liste …')
      : skOnline.listeFehler && !skOnline.liste ? t('Gemeinsame Liste nicht erreichbar.')
      : t('Strecken mit mehr als drei Fahrern: {n}').replace('{n}', liste.length);
    host.appendChild(st);
    if (!liste.length) {
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = t('Noch keine Strecke mit mehr als drei Fahrern. Schalte unter Optionen > Online das Synchronisieren ein, damit deine Strecken hier erscheinen können.');
      host.appendChild(p);
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'community-liste';
    liste.forEach((s) => {
      const row = document.createElement('div');
      row.className = 'community-zeile';
      const auf = document.createElement('button');
      auf.type = 'button';
      auf.className = 'community-oeffnen';
      auf.setAttribute('aria-label', t('Strecke öffnen') + ': ' + (s.name || s.strecke));
      auf.onclick = () => skDetailOeffnen(s);
      const mini = document.createElement('span');
      mini.className = 'community-mini';
      mini.setAttribute('aria-hidden', 'true');
      try {
        const p = codeToTrack(s.strecke);
        if (p) { const merk = trackRotationDeg; trackRotationDeg = 0; try { mini.innerHTML = renderTrackPreview(p.tiles, null, {}).html; } finally { trackRotationDeg = merk; } }
      } catch (e) { /* ohne Bild */ }
      auf.appendChild(mini);
      const tx = document.createElement('div');
      tx.className = 'community-text';
      const b = document.createElement('b');
      b.setAttribute('data-i18n-skip', '');
      b.textContent = s.name ? s.name + ' · ' + s.strecke : s.strecke;
      const em = document.createElement('em');
      em.setAttribute('data-i18n-skip', '');
      em.textContent = t('{n} Fahrer').replace('{n}', +s.fahrer || 0)
        + (s.beste_ms ? ' · ' + t('Bestzeit') + ' ' + chZeit(+s.beste_ms) + (s.beste_fahrer ? ' (' + s.beste_fahrer + ')' : '') : '');
      tx.appendChild(b); tx.appendChild(em);
      auf.appendChild(tx);
      row.appendChild(auf);
      wrap.appendChild(row);
    });
    host.appendChild(wrap);
  }
  // Eine Strecke aus der Liste: Karte, Zeiten, In den Editor laden.
  let skDetail = null;
  function skDetailOeffnen(s) {
    skDetail = s;
    showSubpage('ch-sk');
  }
  function skDetailZeichnen() {
    if (!skDetail) { showSubpage('ch-strecken'); return; }
    const key = skDetail.strecke;
    const p = codeToTrack(key);
    if ($('sk-titel')) $('sk-titel').textContent = skDetail.name || key;
    const karte = $('sk-karte');
    if (karte) {
      karte.innerHTML = '';
      try {
        if (p) { const merk = trackRotationDeg; trackRotationDeg = 0; try { karte.innerHTML = renderTrackPreview(p.tiles, null, { detailed: true, cars: [] }).html; } finally { trackRotationDeg = merk; } }
      } catch (e) { /* ohne Bild */ }
    }
    if ($('sk-fakten')) {
      $('sk-fakten').textContent = (skDetail.name ? skDetail.name + ' · ' : '') + t('Code') + ' ' + key + (p ? ' · ' + t('Länge') + ' ' + chZahl(trackLaengeM(p.tiles), 2) + ' m · '
        + p.tiles.length + ' ' + t('Teile') : '') + ' · ' + t('{n} Fahrer').replace('{n}', +skDetail.fahrer || 0);
    }
    skZeichnen($('sk-detail-inhalt'), key);
    const z = skOnline.zeiten[key];
    if (skUrl() && !(z && z.laedt) && !(z && z.zeiten && Date.now() - z.at < SK_ZEITEN_MS)) {
      skZeitenHolen(key, false).then(() => { if (skSeiteOffen('ch-sk') && skDetail && skDetail.strecke === key) skZeichnen($('sk-detail-inhalt'), key); });
    }
  }
  function skInEditorLaden() {
    if (!skDetail) return false;
    if (kRennenLaeuft()) { showHudToast(t('Erst das laufende Rennen beenden')); return false; }
    const p = codeToTrack(skDetail.strecke);
    if (!p) return false;
    currentTrackTiles = p.tiles;
    trackRotationDeg = 0;
    const rv = $('track-rotation-val');
    if (rv) rv.textContent = '0°';
    if ($('track-name')) $('track-name').value = skDetail.name || '';
    refreshTrackPreview();
    showHudToast(t('Strecke in den Editor geladen'));
    showTab('track');
    showSubpage('edit');
    return true;
  }

  // ---- Verdrahtung ----
  if ($('on-fahrer')) $('on-fahrer').addEventListener('change', () => skNameSetzen($('on-fahrer').value));
  if ($('on-sync')) $('on-sync').addEventListener('change', () => skOptSetzen({ sync: !!$('on-sync').checked, gefragt: true }));
  if ($('sk-zurueck')) $('sk-zurueck').addEventListener('click', () => showSubpage('ch-strecken'));
  if ($('sk-laden')) $('sk-laden').addEventListener('click', skInEditorLaden);
  if ($('sk-editor-auffrischen')) {
    $('sk-editor-auffrischen').addEventListener('click', () => {
      const tiles = currentTrackTiles || [];
      if (tiles.length < 3) { skEditorZeichnen(); return; }
      const key = skSchluessel(tiles);
      skZeitenHolen(key, true).then(() => skEditorZeichnen());
      skEditorZeichnen();
    });
  }
  skOptZeichnen();
