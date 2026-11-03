  // ====================================================================================
  // CHALLENGES-STARTSEITE: Community-Vorschau und Laden beim Oeffnen (v1.3.58)
  // ====================================================================================
  //
  // BESTELLT: "Strukturiere die Challenges um: Wenn ich auf den Tab klicke, fange an, die Zeiten
  // zu laden mit Lade-Symbol (drehendes Streckenteil) unten links (ohne WIP-Label). Aendere
  // 'Community-Bestzeiten' zu 'Community Challenges' und 'Community-Strecken' zu 'Alle Strecken'.
  // Der Community-Tab [soll] ganz oben stehen (vor woechentlichen Challenges) und Network ganz
  // unten. Fuege eine Vorschau der jeweils meistgefahrenen Strecke beider Typen ein und einen
  // Button 'Alle anzeigen', der dann zu dem existierenden Listenmenue fuehrt. Die Vorschau sollte
  // wie die anderen Dauerrennen etc. Vorschauen die Anzahl Spieler haben, aber auch ein
  // Schwierigkeits-Label (z. B. Pacejka)."
  //
  // MEISTGEFAHREN = meiste verschiedene Fahrer (Geraete), bei Gleichstand meiste Laeufe.
  // SCHWIERIGKEIT = Fahrgefuehl: bei einer Community Challenge die vorgeschriebene Abstimmung
  // (tr.preset), bei einer Strecke aus "Alle Strecken" das Fahrgefuehl mit den meisten Fahrern
  // (je Fahrgefuehl vom Server), bei Gleichstand das der schnelleren Bestzeit.
  //
  // Geladen wird beim Oeffnen des Tabs (10-ble-explorer.js) im Hintergrund, mit denselben
  // Zwischenspeichern wie die Listen (2 bzw. 5 Minuten) und nie waehrend Countdown/Rennen
  // (chNetzErlaubt). Die Ladeanzeige ist die drehende Gerade aus 59-lade.js, unten links.

  // ---- Auswahl: reine Rechnungen (Selbsttest) ----
  function chVorschauChallengeWahl(data) {
    let best = null;
    for (const tr of (data && data.tracks) || []) {
      const sp = communitySpieler(data, tr.id), lf = (data.times[tr.id] || []).length;
      if (!best || sp > best.spieler || (sp === best.spieler && lf > best.laeufe)) best = { tr, spieler: sp, laeufe: lf };
    }
    return best;
  }
  function chVorschauStreckeLaeufe(s) {
    if (+s.laeufe > 0) return +s.laeufe;
    if (s.nurLokal) { const l = skLokalAlle()[s.strecke]; return Array.isArray(l) ? l.length : 0; }
    return 0;
  }
  function chVorschauStreckeWahl(liste) {
    let best = null;
    for (const s of liste || []) {
      const sp = +s.fahrer || 0, lf = chVorschauStreckeLaeufe(s);
      if (!best || sp > best.spieler || (sp === best.spieler && lf > best.laeufe)) best = { s, spieler: sp, laeufe: lf };
    }
    return best;
  }
  // Das haeufigste Fahrgefuehl einer Strecke (meiste Fahrer), bei Gleichstand das der schnelleren
  // Bestzeit; ohne Angaben je Fahrgefuehl das der Bestzeit.
  function chVorschauFahrgefuehl(s) {
    const je = s && s.je && typeof s.je === 'object' ? s.je : null;
    let best = null;
    if (je) {
      Object.keys(je).forEach((fg) => {
        const e = je[fg] || {};
        const n = +e.fahrer || 0, ms = +e.beste_ms || Infinity;
        if (!best || n > best.n || (n === best.n && ms < best.ms)) best = { fg, n, ms };
      });
    }
    if (best) return skFgGueltig(best.fg);
    const bz = skListenBestzeit(s || {}, skFgAktuell());
    return bz ? skFgGueltig(bz.fg) : 'unbekannt';
  }

  // ---- Zeichnen ----
  function chVorschauMini(tiles) {
    if (!tiles || tiles.length < 3) return '';
    const merk = trackRotationDeg;
    trackRotationDeg = 0;
    try { return renderTrackPreview(tiles, null, {}).html; } catch (e) { return ''; } finally { trackRotationDeg = merk; }
  }
  function chVorschauSpielerText(sp, lf) {
    return (sp === 1 ? t('1 Spieler') : t('{n} Spieler').replace('{n}', sp))
      + ' · ' + (lf === 1 ? t('1 Ergebnis') : t('{n} Ergebnisse').replace('{n}', lf));
  }
  // Eine Karte fuellen. z: { laedt, leer, tiles, name, info, label, spieler, laeufe, oeffnen }
  function chVorschauKarte(karte, z) {
    if (!karte) return;
    const mini = karte.querySelector('.ch-mini');
    const name = karte.querySelector('.ch-k-name');
    const info = karte.querySelector('.ch-k-info');
    const woche = karte.querySelector('.ch-k-woche');
    const anzahl = karte.querySelector('.ch-k-anzahl');
    karte.classList.toggle('ch-v-leer', !!(z.leer || z.laedt));
    karte.classList.toggle('ch-v-laedt', !!z.laedt);
    if (z.laedt) {
      mini.innerHTML = typeof ladeAnimationHtml === 'function' ? ladeAnimationHtml('') : '';
      name.textContent = t('Lädt …');
      info.textContent = '';
      woche.textContent = '';
      anzahl.textContent = '';
      anzahl.hidden = true;
    } else if (z.leer) {
      mini.innerHTML = '';
      name.textContent = z.name;
      info.textContent = '';
      woche.textContent = z.info || '';
      anzahl.textContent = '';
      anzahl.hidden = true;
    } else {
      const html = chVorschauMini(z.tiles);
      if (mini.dataset.code !== z.code || !mini.firstChild || mini.querySelector('.lade-dreh')) { mini.innerHTML = html; mini.dataset.code = z.code; }
      name.textContent = z.name;
      info.textContent = z.info || '';
      woche.innerHTML = '';
      const l = document.createElement('span');
      l.className = 'ch-v-label';
      l.textContent = z.label;
      woche.appendChild(l);
      anzahl.hidden = false;
      anzahl.textContent = chVorschauSpielerText(z.spieler, z.laeufe);
    }
    karte.setAttribute('aria-label', (z.laedt ? t('Lädt …') : z.name) + (z.leer || z.laedt ? '' : ', ' + z.label + ', '
      + chVorschauSpielerText(z.spieler, z.laeufe)));
    karte.onclick = z.oeffnen;
  }
  function chVorschauZeichnen() {
    const kc = $('ch-v-challenge'), ks = $('ch-v-strecke');
    if (!kc && !ks) return;
    // (a) meistgefahrene Community Challenge
    const data = communitySicht();
    const c = chVorschauChallengeWahl(data);
    if (c) {
      const tr = c.tr;
      const p = codeToTrack(tr.code);
      const best = communityBesteZeit(data, tr.id);
      chVorschauKarte(kc, { tiles: p ? p.tiles : null, code: tr.code, name: tr.id + ' · ' + tr.name,
        info: best ? t('Bestzeit') + ' ' + chZeit(best) : t('Noch keine Zeit'),
        label: communityPresetName(tr.preset), spieler: c.spieler, laeufe: c.laeufe,
        oeffnen: () => challengeSeiteZeigen(tr.id) });
    } else {
      chVorschauKarte(kc, { laedt: communityHolt && !communityOnline, leer: true,
        name: t('Noch keine Community Challenge'), info: t('Unter „Alle anzeigen“ kannst du deine Strecke einreichen.'),
        oeffnen: () => showSubpage('ch-community') });
    }
    // (b) meistgefahrene Strecke aus "Alle Strecken"
    if (typeof skCacheLaden === 'function') skCacheLaden();
    const liste = skCommunityGefiltert(skOnline.liste, skEigeneStrecken());
    const s = chVorschauStreckeWahl(liste);
    if (s) {
      const p = codeToTrack(s.s.strecke);
      const fg = chVorschauFahrgefuehl(s.s);
      const bz = skListenBestzeit(s.s, fg);
      chVorschauKarte(ks, { tiles: p ? p.tiles : null, code: s.s.strecke, name: s.s.name || s.s.strecke,
        info: bz ? t('Bestzeit') + ' ' + chZeit(bz.ms) : t('Noch keine Zeit'),
        label: skFgName(fg), spieler: s.spieler, laeufe: s.laeufe, oeffnen: () => skDetailOeffnen(s.s) });
    } else {
      chVorschauKarte(ks, { laedt: skOnline.listeLaedt && !skOnline.liste, leer: true,
        name: t('Noch keine Strecke mit Zeiten'), info: t('Fahr ein Rennen auf deiner Strecke, dann erscheint sie hier.'),
        oeffnen: () => showSubpage('ch-strecken') });
    }
  }

  // ---- Laden beim Oeffnen des Tabs ----
  // Rueckgabe: ein Promise, das nach beiden Abrufen (oder sofort, wenn nichts zu holen ist) erfuellt ist.
  function chVorschauLaden() {
    const jobs = [];
    if (chNetzErlaubt()) {
      if (communityUrl() && !communityHolt && (!communityOnline || Date.now() - communityOnlineAt > 120000)) {
        jobs.push(ladeAnzeigeMit('ch-community', communityHolen(false)));
      }
      if (typeof skCacheLaden === 'function') skCacheLaden();
      if (skUrl() && !skOnline.listeLaedt && (!skOnline.liste || Date.now() - skOnline.listeAt > SK_LISTE_MS)) {
        jobs.push(ladeAnzeigeMit('ch-strecken', skListeHolen(false)));
      }
    }
    chVorschauZeichnen();
    return Promise.all(jobs.map((j) => Promise.resolve(j).catch(() => null))).then(() => { chVorschauZeichnen(); });
  }
  setTimeout(() => { try { chVorschauZeichnen(); } catch (e) { /* noch nicht bereit */ } }, 0);
  if (typeof i18nOnLangChange === 'function') i18nOnLangChange(() => { try { chVorschauZeichnen(); } catch (e) { /* egal */ } });
